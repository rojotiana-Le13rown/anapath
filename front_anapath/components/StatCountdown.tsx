'use client';

import { useEffect, useState } from 'react';

/** Délai standard d'un examen STAT (très urgent) : 30 minutes. */
export const STAT_DELAY_MS = 30 * 60 * 1000;

interface StatCountdownProps {
  /** Instant d'arrivée de la demande (base du décompte de 30 min). */
  startTime?: string | null;
}

function formatMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function StatCountdown({ startTime }: StatCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number>(STAT_DELAY_MS);

  useEffect(() => {
    const start = new Date(startTime || Date.now());
    const deadline = start.getTime() + STAT_DELAY_MS;

    const update = () => {
      const remaining = deadline - Date.now();
      setTimeLeft((prev) => (prev <= 0 ? 0 : Math.max(0, remaining)));
    };

    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startTime]);

  const expired = timeLeft <= 0;
  const urgent = !expired && timeLeft <= 5 * 60 * 1000;
  const warning = !expired && !urgent && timeLeft <= 10 * 60 * 1000;

  const color = expired
    ? 'text-red-700'
    : urgent
    ? 'text-red-500'
    : warning
    ? 'text-orange-500'
    : 'text-emerald-600';

  return (
    <div className={`mt-0.5 font-mono text-[10px] font-bold tracking-wider ${color}`}>
      {expired ? (
        <span>⌛ Délai expiré</span>
      ) : (
        <span>
          ⏱ {formatMSS(timeLeft)}
          {urgent && ' — 5 min restantes'}
        </span>
      )}
    </div>
  );
}
