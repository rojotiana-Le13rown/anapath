'use client';

import { useEffect, useRef, useState } from 'react';

interface FilterButtonProps {
  active?: boolean;
  /** Nombre de critères actifs affiché en badge sur le bouton. */
  count?: number;
  children: React.ReactNode;
}

/** Bouton "Filtrer" générique : ouvre un panneau de filtres au clic, se ferme au clic extérieur. */
export default function FilterButton({ active, count, children }: FilterButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const effectiveCount = count ?? (active ? 1 : 0);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filtrer"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
          active
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-600 border-outline-variant/20 hover:bg-slate-50'
        }`}
      >
        <span className="material-symbols-outlined text-base">filter_alt</span>
        Filtrer
        {effectiveCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 ml-0.5 inline-flex items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">
            {effectiveCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-lg border border-outline-variant/20 p-4 z-30">
          {children}
        </div>
      )}
    </div>
  );
}
