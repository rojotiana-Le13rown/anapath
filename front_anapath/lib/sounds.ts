// Sons de notification — générés via Web Audio API.
// Conçus pour être distincts ET agréables : ondes sinusoïdales / triangulaires,
// intervalles musicaux (accords majeurs), enveloppes douces (attaque courte,
// décroissance exponentielle) et volume maîtrisé pour éviter l'écrêtage.
// EXCEPTION : le son STAT (examen très urgent) est volontairement assourdissant,
// joué à 200 % du volume maximal de l'appareil pour forcer l'attention.

type WaveType = OscillatorType;

interface Note {
  freq: number;
  start: number; // secondes, relatif à 0
  dur: number; // secondes
  type?: WaveType;
  vol?: number; // 0..1
}

// Contexte audio partagé : le navigateur limite le nombre d'AudioContext actifs,
// on en réutilise donc un seul pour toute l'application.
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (sharedCtx) {
    if (sharedCtx.state === 'closed') sharedCtx = null;
    else return sharedCtx;
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    sharedCtx = Ctx ? new Ctx() : null;
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

function playSequence(notes: Note[], masterVol = 0.8): void {
  const ctx = getContext();
  if (!ctx || ctx.state === 'suspended') {
    if (ctx) void ctx.resume();
  }
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.value = masterVol;
  master.connect(ctx.destination);

  const t0 = ctx.currentTime;
  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    osc.connect(g);
    g.connect(master);

    const at = t0 + n.start;
    const vol = n.vol ?? 0.5;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + n.dur);

    osc.start(at);
    osc.stop(at + n.dur + 0.03);
  });
}

/** Urgence NORMALE — double carillon doux, style « ding-dong » discret. */
function playNormale(): void {
  playSequence(
    [
      { freq: 659.25, start: 0, dur: 0.55, type: 'sine', vol: 0.38 },
      { freq: 880.0, start: 0.22, dur: 0.8, type: 'sine', vol: 0.42 },
    ],
    0.8,
  );
}

/** Urgence URGENTE — arpège ascendant en tierces (do-mi-sol), alerte claire mais mélodique. */
function playUrgente(): void {
  playSequence(
    [
      { freq: 523.25, start: 0, dur: 0.22, type: 'triangle', vol: 0.5 },
      { freq: 659.25, start: 0.18, dur: 0.22, type: 'triangle', vol: 0.5 },
      { freq: 783.99, start: 0.36, dur: 0.5, type: 'triangle', vol: 0.55 },
    ],
    0.85,
  );
}

/**
 * Urgence STAT — sirène d'urgence assourdissante.
 * Volontairement « à fond » : ondes dent de scie aiguës, saturation (vol 0.9)
 * et amplification à 200 % du volume maximal de l'appareil (masterVol = 2.0,
 * ce qui provoque un écrêtage sonore qui perce immédiatement l'attention).
 */
function playStat(): void {
  playSequence(
    [
      { freq: 880.0, start: 0, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 1174.66, start: 0.2, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 880.0, start: 0.4, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 1174.66, start: 0.6, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 880.0, start: 0.8, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 1174.66, start: 1.0, dur: 0.2, type: 'sawtooth', vol: 0.9 },
      { freq: 880.0, start: 1.2, dur: 0.25, type: 'sawtooth', vol: 0.95 },
      { freq: 1174.66, start: 1.45, dur: 0.45, type: 'sawtooth', vol: 0.95 },
    ],
    2.0, // 200 % du volume maximal de l'appareil
  );
}

/** Notification de rapport — carillon ascendant en accords (do-mi-sol-do), « ta-da » valorisant. */
export function playReportSound(): void {
  playSequence(
    [
      { freq: 523.25, start: 0, dur: 0.5, type: 'sine', vol: 0.42 },
      { freq: 659.25, start: 0.15, dur: 0.5, type: 'sine', vol: 0.42 },
      { freq: 783.99, start: 0.3, dur: 0.5, type: 'sine', vol: 0.42 },
      { freq: 1046.5, start: 0.45, dur: 0.95, type: 'sine', vol: 0.48 },
    ],
    0.85,
  );
}

/** Alerte extemporané (25 min) — pulsations insistantes mais musicales (la/fa). */
export function playExtemporaneAlarm(): void {
  const notes: Note[] = [880, 698.46, 880, 698.46, 880, 698.46, 880].map(
    (freq, i) => ({
      freq,
      start: i * 0.22,
      dur: 0.2,
      type: 'triangle' as WaveType,
      vol: 0.55,
    }),
  );
  notes.push({ freq: 1046.5, start: 1.5, dur: 0.6, type: 'sine', vol: 0.5 });
  playSequence(notes, 0.9);
}

/**
 * Son générique — pour les notifications qui ne référencent AUCUN examen
 * (rapport hebdomadaire, nouvelle prescription en attente, rappel, etc.).
 * Volontairement distinct du carillon NORMALE des examens : un simple « pop »
 * doux et discret, en une seule note, pour ne pas être confondu avec le son
 * d'un examen dont l'urgence est normale.
 */
export function playGenericSound(): void {
  playSequence(
    [{ freq: 523.25, start: 0, dur: 0.35, type: 'sine', vol: 0.3 }],
    0.8,
  );
}

/** Joue le son correspondant au niveau d'urgence (NORMALE / URGENTE / STAT). */
export function playUrgenceSound(urgence: string): void {
  const u = (urgence ?? '').toUpperCase();
  if (u === 'STAT' || u.includes('TRES')) return playStat();
  if (u === 'URGENTE' || u.includes('URGENT')) return playUrgente();
  return playNormale();
}

/** Précharge/réveille le contexte audio (permet le son dès la première interaction). */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}
