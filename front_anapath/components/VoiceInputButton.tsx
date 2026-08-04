'use client';

import { useEffect, useRef, useState } from 'react';

interface VoiceInputButtonProps {
  /** Appelé avec chaque segment de texte reconnu (définitif) — à concaténer au champ ciblé. */
  onResult: (text: string) => void;
  className?: string;
}

// Silence entre deux segments dictés : 3s = fin de phrase (point), 5s = saut de ligne.
const SENTENCE_PAUSE_MS = 3000;
const PARAGRAPH_PAUSE_MS = 5000;

/** Bouton micro : dictée vocale en français via l'API navigateur (Chrome). Invisible si non supportée. */
export default function VoiceInputButton({ onResult, className = '' }: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // Suit l'intention de l'utilisateur (bouton cliqué), séparément de l'état
  // React `listening`, pour décider dans onend si on relance automatiquement.
  const listeningRef = useRef(false);
  const lastResultAtRef = useRef(0);

  useEffect(() => {
    const win = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      finalTranscript = finalTranscript.trim();
      if (!finalTranscript) return;

      const now = Date.now();
      const silence = lastResultAtRef.current ? now - lastResultAtRef.current : 0;
      lastResultAtRef.current = now;

      let separator = '';
      if (silence >= PARAGRAPH_PAUSE_MS) {
        separator = '\n\n';
      } else if (silence >= SENTENCE_PAUSE_MS) {
        separator = '. ';
      }

      onResult(separator ? `${separator}${finalTranscript}` : finalTranscript);
    };
    recognition.onend = () => {
      // En mode continu, certains navigateurs coupent la reconnaissance après
      // un silence prolongé (pause de 3s/5s comprise) : on la relance tant que
      // l'utilisateur n'a pas cliqué sur « Arrêter », pour ne perdre aucune
      // parole après une pause.
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          // déjà démarrée ou erreur transitoire : ignorer, un futur onend réessaiera.
        }
      } else {
        setListening(false);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      // « no-speech » se déclenche simplement après un silence — pas une vraie
      // erreur : onend va suivre et relancer si l'utilisateur écoute toujours.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      listeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setSupported(true);

    return () => {
      listeningRef.current = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      listeningRef.current = false;
      recognitionRef.current.stop();
      setListening(false);
    } else {
      listeningRef.current = true;
      lastResultAtRef.current = 0;
      recognitionRef.current.start();
      setListening(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? 'Arrêter la dictée' : 'Dicter (transcription vocale)'}
      className={`p-1.5 rounded-full transition-colors flex items-center gap-1 text-[11px] font-semibold ${
        listening ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      } ${className}`}
    >
      <span className={`material-symbols-outlined text-base ${listening ? 'animate-pulse' : ''}`}>
        {listening ? 'mic' : 'mic_none'}
      </span>
      {listening ? 'Écoute...' : 'Dicter'}
    </button>
  );
}
