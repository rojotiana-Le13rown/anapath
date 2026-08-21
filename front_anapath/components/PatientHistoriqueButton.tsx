'use client';

import { useState } from 'react';
import { getTypeLabel } from '@/lib/generatePDF';
import { statusLabel, statusColors } from '@/lib/statusLabels';
import { formatDate } from '@/lib/dateFormat';

export interface HistoriqueEntry {
  id: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
}

interface PatientHistoriqueButtonProps {
  entries: HistoriqueEntry[];
  className?: string;
}

/**
 * Bouton "Historique" — n'affiche que les examens déjà terminés (Validé /
 * Archivé) du patient, et n'apparaît que s'il y en a au moins un.
 */
export default function PatientHistoriqueButton({ entries, className = '' }: PatientHistoriqueButtonProps) {
  const [open, setOpen] = useState(false);

  const termines = entries.filter((e) => e.statut === 'VALIDE' || e.statut === 'ARCHIVE');
  if (termines.length === 0) return null;

  const sorted = [...termines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Voir les examens précédents de ce patient"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/10 text-secondary text-xs font-semibold hover:bg-secondary/20 transition-colors shrink-0 ${className}`}
      >
        <span className="material-symbols-outlined text-base">history</span>
        Historique ({termines.length})
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-[95vw] max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#00284d] to-[#00478d]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-white">history</span>
                <h3 className="font-bold text-lg text-white">Historique des examens</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Fermer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {sorted.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/20"
                >
                  <div>
                    <p className="font-medium text-on-surface text-sm">{getTypeLabel(entry.typeExamen)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.createdAt)}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${statusColors[entry.statut] || 'bg-gray-100 text-gray-700'}`}>
                    {statusLabel(entry.statut)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
