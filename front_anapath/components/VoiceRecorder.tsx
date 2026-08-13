/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { handleManualPause, buildFinalDisplay } from "@/lib/formatTranscript";

type Props = {
  onTranscriptChange?: (data: { final?: string; interim?: string }) => void;
  onFinalTranscript?: (text: string, meta?: { startsAfterPause?: boolean }) => void;
  onManualPause?: () => void;
  onAudio?: (blob: Blob) => void;
  lang?: string;
  exposeControls?: (controls: { start: () => void; stop: () => void; restart: () => void; pause: () => void; resume: () => void }) => void;
  hideTextArea?: boolean;
  statusIdleText?: string;
};

export default function VoiceRecorder({ onTranscriptChange, onFinalTranscript, onManualPause, onAudio, lang = "fr-FR", exposeControls, hideTextArea = false, statusIdleText = "Prêt" }: Props) {
  const [isSupported, setIsSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    return Boolean(SpeechRecognitionCtor) && Boolean(navigator.mediaDevices?.getUserMedia);
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("idle");
  const [duration, setDuration] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalSegmentsRef = useRef<string[]>([]);
  const finalBreaksRef = useRef<boolean[]>([]);
  const forceBreakBeforeNextFinalRef = useRef(false);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const start = async (continuePrevious = true) => {
    if (!isSupported) return;
    try {
      setStatus("permission-request");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // MediaRecorder
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        onAudio?.(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      // SpeechRecognition
      const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = true;

      // final segments tracker to avoid duplicates
      if (!continuePrevious) {
        finalSegmentsRef.current = [];
        finalBreaksRef.current = [];
        forceBreakBeforeNextFinalRef.current = false;
      } else if (finalSegmentsRef.current.length > 0) {
        // Reprise après pause ou arrêt avec du texte déjà présent : saut de ligne
        forceBreakBeforeNextFinalRef.current = true;
      }

      recognition.onresult = (event: any) => {
        let interim = "";
        const newFinals: Array<{ text: string; startsAfterPause: boolean }> = [];

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim() ?? "";
          if (res.isFinal) {
            const startsAfterPause = Boolean(forceBreakBeforeNextFinalRef.current);

            // push only if different from last pushed to avoid duplicates
            const last = finalSegmentsRef.current[finalSegmentsRef.current.length - 1];
            if (text && text !== last) {
              finalSegmentsRef.current.push(text);
              finalBreaksRef.current.push(startsAfterPause);
              newFinals.push({ text, startsAfterPause });
              forceBreakBeforeNextFinalRef.current = false;
            }
          } else {
            interim += text + " ";
          }
        }

        // build a formatted final display using breaks
        const finalCombined = buildFinalDisplay(finalSegmentsRef.current, finalBreaksRef.current);
        const display = (finalCombined + (interim.trim() ? " " + interim.trim() : "")).trim();
        setTranscript(display);
        onTranscriptChange?.({ final: finalCombined, interim });

        // emit only new final segments
        for (const seg of newFinals) {
          onFinalTranscript?.(seg.text, { startsAfterPause: seg.startsAfterPause });
        }
      };

      recognition.onerror = () => {
        setStatus("error");
      };

      recognition.onend = () => {
        // do not auto-append here; final segments already emitted in onresult
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        // Some browsers may throw if recognition is already started.
        // Ignore to avoid crashing the UI (start is idempotent for our use).
        console.warn("SpeechRecognition.start() ignored:", e);
      }

      setIsRecording(true);
      setIsPaused(false);
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      console.error(err);
    }
  };

  const pause = () => {
    if (!mediaRecorderRef.current || !recognitionRef.current) return;
    try {
      mediaRecorderRef.current.pause?.();
    } catch {}
    try {
      recognitionRef.current.stop();
    } catch {}
    setIsRecording(false);
    setIsPaused(true);
    setStatus("paused");
    setTranscript((prev) => {
      const next = handleManualPause(prev);
      setTimeout(() => onTranscriptChange?.({ final: next, interim: "" }), 0);
      return next;
    });
    onManualPause?.();
    forceBreakBeforeNextFinalRef.current = true;
  };

  const resume = () => {
    // resume recording and recognition
    start(true);
  };

  const stop = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    try {
      mediaRecorderRef.current?.stop();
    } catch {}
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setStatus("stopped");
    setDuration(0);
    forceBreakBeforeNextFinalRef.current = false;
  };

  const restart = () => {
    // clear transcript and chunks and start fresh
    setTranscript("");
    chunksRef.current = [];
    forceBreakBeforeNextFinalRef.current = false;
    start(false);
  };

  // expose controls to parent if requested
  useEffect(() => {
    if (!exposeControls) return;
    exposeControls({ start: () => start(true), stop: () => stop(), restart: () => restart(), pause: () => pause(), resume: () => resume() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposeControls]);

  if (!isSupported) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-slate-400">
        <span className="material-symbols-outlined text-sm">mic_off</span>
        Dictée vocale non supportée par ce navigateur — utilisez Chrome ou Edge.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              aria-label="microphone"
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-shadow ${isRecording ? "bg-rose-600 text-white shadow-lg" : "bg-blue-600 text-white shadow-md"}`}
              onClick={() => (isRecording ? pause() : start(true))}
              type="button"
            >
              <span className="material-symbols-outlined">{isRecording ? "pause" : "mic"}</span>
            </button>
            {/* visual indicator */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
              <span className={`h-2 w-1.5 rounded-sm bg-rose-500 ${isRecording ? "animate-pulse" : "opacity-30"}`} />
              <span className={`h-3 w-1.5 rounded-sm bg-rose-500 ${isRecording ? "animate-pulse delay-75" : "opacity-30"}`} />
              <span className={`h-4 w-1.5 rounded-sm bg-rose-500 ${isRecording ? "animate-pulse delay-150" : "opacity-30"}`} />
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">{status === "recording" ? "Enregistrement…" : status === "paused" ? "En pause" : status === "stopped" ? "Terminé" : status === "permission-request" ? "Demande d'accès micro" : status === "error" ? "Erreur" : statusIdleText}</div>
            <div className="text-xs text-slate-500">Durée : {new Date(duration * 1000).toISOString().substr(14, 5)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={restart} type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Recommencer</button>
          <button onClick={() => start(true)} type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Reprendre</button>
          <button onClick={stop} type="button" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Arrêter</button>
        </div>
      </div>

      {!hideTextArea && (
        <div className="mt-4">
          <textarea
            className="w-full min-h-[260px] sm:min-h-[340px] md:min-h-[420px] rounded-2xl border border-slate-200 p-4 sm:p-5 md:p-5 text-sm leading-5 overflow-auto"
            value={transcript}
            readOnly
          />
        </div>
      )}
    </div>
  );
}
