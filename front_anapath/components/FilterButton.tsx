'use client';

import { useEffect, useRef, useState } from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSection {
  key: string;
  label: string;
  placeholder: string;
  multiple?: boolean;
  options: FilterOption[];
  value: string[];
  onChange: (values: string[]) => void;
}

interface FilterButtonProps {
  sections: FilterSection[];
  /** Nombre de critères actifs affiché en badge (défaut : somme des valeurs sélectionnées). */
  activeCount?: number;
}

interface MultiSelectProps {
  placeholder: string;
  options: FilterOption[];
  value: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectDropdown({ placeholder, options, value, onChange }: MultiSelectProps) {
  const [listOpen, setListOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setListOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggleValue = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const summary =
    value.length === 0
      ? placeholder
      : `${value.length} sélectionné${value.length > 1 ? 's' : ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setListOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors hover:border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary ${
          listOpen ? 'border-primary ring-1 ring-primary' : 'border-outline-variant/30 bg-white'
        }`}
      >
        <span className={value.length === 0 ? 'text-slate-400' : 'text-slate-800'}>{summary}</span>
        <span className="material-symbols-outlined text-base text-slate-400">expand_more</span>
      </button>
      {listOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white rounded-lg shadow-lg border border-outline-variant/20 py-1 z-10">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggleValue(o.value)}
                className="accent-[#00478d]"
              />
              <span className="text-sm text-slate-700">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bouton "Filtrer" générique : ouvre un panneau de menus déroulants, se ferme au clic extérieur. */
export default function FilterButton({ sections, activeCount }: FilterButtonProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open) {
      const d: Record<string, string[]> = {};
      sections.forEach((s) => {
        d[s.key] = s.value;
      });
      setDraft(d);
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const effectiveCount =
    activeCount ?? sections.reduce((acc, s) => acc + s.value.length, 0);

  const setDraftValue = (key: string, values: string[]) =>
    setDraft((prev) => ({ ...prev, [key]: values }));

  const apply = () => {
    sections.forEach((s) => s.onChange(draft[s.key] ?? []));
    setOpen(false);
  };

  const resetAll = () => {
    const d: Record<string, string[]> = {};
    sections.forEach((s) => {
      d[s.key] = [];
      s.onChange([]);
    });
    setDraft(d);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        title="Filtrer"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
          effectiveCount > 0
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
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-lg border border-outline-variant/20 p-4 z-30">
          <div className="space-y-4">
            {sections.map((s) => (
              <div key={s.key}>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">{s.label}</p>
                {s.multiple ? (
                  <MultiSelectDropdown
                    placeholder={s.placeholder}
                    options={s.options}
                    value={draft[s.key] ?? []}
                    onChange={(v) => setDraftValue(s.key, v)}
                  />
                ) : (
                  <select
                    value={draft[s.key]?.[0] ?? ''}
                    onChange={(e) => setDraftValue(s.key, e.target.value ? [e.target.value] : [])}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  >
                    <option value="">{s.placeholder}</option>
                    {s.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={resetAll}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-container transition-colors"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
