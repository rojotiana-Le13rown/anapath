'use client';

import { useEffect, useRef, useState } from 'react';

interface VoiceInputButtonProps {
  /** Appelé avec chaque segment de texte reconnu (définitif) — à concaténer au champ ciblé. */
  onResult: (text: string) => void;
  /** Appelé avec la transcription en direct (provisoire), ou `null` quand il n'y en a plus. */
  onInterim?: (text: string | null) => void;
  className?: string;
}

type Mode = 'idle' | 'listening' | 'paused';

// Silence avant la fin d'une phrase : 3s → le navigateur considère la phrase
// terminée et on ajoute ". " entre deux segments dictés d'affilée.
const SENTENCE_PAUSE_MS = 3000;

/** Bouton micro : dictée vocale en français via l'API navigateur (Chrome).
 *
 *  Cycle : Dicter → Écoute… (Pause) → Continuer (reprend une nouvelle ligne) → Pause…
 *  Chaque reprise après une pause démarre une nouvelle ligne : utile pour
 *  structurer un compte rendu en paragraphes, phrase par phrase. */
export default function VoiceInputButton({ onResult, onInterim, className = '' }: VoiceInputButtonProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // Suit l'intention de l'utilisateur (bouton cliqué), séparément de l'état React.
  const modeRef = useRef<Mode>('idle');
  const lastResultAtRef = useRef(0);
  // Une reprise après pause doit insérer un saut de ligne avant le prochain segment.
  const resumeNewLineRef = useRef(false);
  // Dernière transcription provisoire (affichée en direct) — conservée pour la
  // commiter au champ si l'utilisateur met en pause avant la fin de la phrase.
  const lastInterimRef = useRef('');

  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };

  // Committe au champ la transcription provisoire en cours (avec son éventuel
  // retour à la ligne), pour ne rien perdre quand on coupe la dictée.
  const commitInterim = () => {
    if (!lastInterimRef.current) return;
    const prefix = resumeNewLineRef.current ? '\n' : '';
    onResult(`${prefix}${lastInterimRef.current}`);
    lastInterimRef.current = '';
    resumeNewLineRef.current = false;
    onInterim?.(null);
  };

  useEffect(() => {
    const win = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      finalTranscript = finalTranscript.trim();

      if (finalTranscript) {
        const now = Date.now();
        const silence = lastResultAtRef.current ? now - lastResultAtRef.current : 0;
        lastResultAtRef.current = now;

        let prefix = '';
        if (resumeNewLineRef.current) {
          // Reprise après pause → retour à la ligne, puis on dicte les phrases suivantes.
          prefix = '\n';
          resumeNewLineRef.current = false;
        } else if (silence >= SENTENCE_PAUSE_MS) {
          // Petite pause naturelle → fin de phrase.
          prefix = '. ';
        }

        onResult(`${prefix}${finalTranscript}`);
      }

      // Transcription en direct : le parent l'affiche en plus du texte définitif,
      // pour voir les mots apparaître au fur et à mesure de la dictée.
      const interimTrimmed = interimTranscript.trim();
      lastInterimRef.current = interimTrimmed;
      if (onInterim) {
        if (interimTrimmed) {
          let prefix = '';
          if (resumeNewLineRef.current) {
            prefix = '\n';
          }
          onInterim(`${prefix}${interimTrimmed}`);
        } else {
          onInterim(null);
        }
      }
    };
    recognition.onend = () => {
      // En mode continu, certains navigateurs coupent la reconnaissance après
      // un silence prolongé : on la relance tant qu'on est en écoute. En pause,
      // on ne touche à rien (l'utilisateur verra « Continuer »).
      if (modeRef.current === 'listening') {
        try {
          recognition.start();
        } catch {
          // déjà démarrée ou erreur transitoire : ignorer, un futur onend réessaiera.
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      // « no-speech » se déclenche simplement après un silence — pas une vraie
      // erreur : onend va suivre et relancer si l'utilisateur écoute toujours.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setModeBoth('idle');
    };

    recognitionRef.current = recognition;
    setSupported(true);

    return () => {
      modeRef.current = 'idle';
      commitInterim();
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  const startListening = () => {
    if (!recognitionRef.current) return;
    resumeNewLineRef.current = false;
    lastResultAtRef.current = 0;
    setModeBoth('listening');
    try {
      recognitionRef.current.start();
    } catch {
      // déjà démarrée : ignorer
    }
  };

  const pause = () => {
    if (!recognitionRef.current) return;
    // On commite d'abord la transcription provisoire en cours, pour ne rien
    // perdre quand on coupe la reconnaissance au milieu d'une phrase.
    commitInterim();
    // On passe en pause AVANT stop() : onend verra le mode "paused" et ne
    // relancera rien.
    setModeBoth('paused');
    try {
      recognitionRef.current.stop();
    } catch {}
  };

  const resume = () => {
    if (!recognitionRef.current) return;
    resumeNewLineRef.current = true; // prochain segment → nouvelle ligne
    lastResultAtRef.current = 0;
    setModeBoth('listening');
    try {
      recognitionRef.current.start();
    } catch {}
  };

  const handleClick = () => {
    if (mode === 'listening') pause();
    else if (mode === 'paused') resume();
    else startListening();
  };

  const label =
    mode === 'listening' ? 'Pause'
    : mode === 'paused' ? 'Continuer'
    : 'Dicter';
  const icon =
    mode === 'listening' ? 'pause'
    : mode === 'paused' ? 'play_arrow'
    : 'mic_none';

  const tone =
    mode === 'listening'
      ? 'bg-red-600 text-white animate-pulse'
      : mode === 'paused'
      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
      : 'bg-slate-100 text-slate-500 hover:bg-slate-200';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        mode === 'listening'
          ? 'Pause : interrompre la dictée (reprise = nouvelle ligne)'
          : mode === 'paused'
          ? 'Continuer la dictée sur une nouvelle ligne'
          : 'Dicter (transcription vocale)'
      }
      className={`p-1.5 rounded-full transition-colors flex items-center gap-1 text-[11px] font-semibold ${tone} ${className}`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}
