'use client';

import { useState } from 'react';
import { getTypeLabel } from '@/lib/generatePDF';
import { statusLabel, statusColors } from '@/lib/statusLabels';
import { formatDate } from '@/lib/dateFormat';
import FloatingModal from '@/components/FloatingModal';

export interface HistoriqueEntry {
  id: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  anapathId?: string;
  /** Compte-rendu de l'examen terminé (champs plats ou objet resultat). */
  resultatDetails?: string;
  resultatConclusion?: string;
  observationDetails?: string;
  resultat?: { details?: string; conclusion?: string } | null;
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
  const [detail, setDetail] = useState<HistoriqueEntry | null>(null);

  const termines = entries.filter((e) => e.statut === 'VALIDE' || e.statut === 'ARCHIVE');
  if (termines.length === 0) return null;

  const sorted = [...termines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const detailsOf = (e: HistoriqueEntry): string =>
    (e.resultat?.details ?? e.resultatDetails ?? e.observationDetails ?? '').trim();
  const conclusionOf = (e: HistoriqueEntry): string =>
    (e.resultat?.conclusion ?? e.resultatConclusion ?? '').trim();

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
        <FloatingModal
          open
          onClose={() => setOpen(false)}
          icon="history"
          title="Historique des examens"
          maxWidthPx={512}
          heightPct={0.8}
          bodyClassName="p-4 space-y-2"
        >
          {sorted.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setDetail(entry)}
              title="Voir le compte-rendu de cet examen"
              className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/20 hover:bg-surface-container hover:border-primary/30 transition-colors"
            >
              <div>
                <p className="font-medium text-on-surface text-sm">{getTypeLabel(entry.typeExamen)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.createdAt)}</p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${statusColors[entry.statut] || 'bg-gray-100 text-gray-700'}`}>
                {statusLabel(entry.statut)}
              </span>
            </button>
          ))}
        </FloatingModal>
      )}

      {open && detail && (
        <FloatingModal
          open
          onClose={() => setDetail(null)}
          zIndex={60}
          icon="description"
          closeIcon="arrow_back"
          title={getTypeLabel(detail.typeExamen)}
          subtitle={`${detail.anapathId ? `${detail.anapathId} — ` : ''}${formatDate(detail.createdAt)}`}
          maxWidthPx={576}
          heightPct={0.85}
          headerClassName="bg-gradient-to-r from-[#00478d] to-[#00284d]"
          bodyClassName="p-5 space-y-4 text-sm"
        >
          {detailsOf(detail) ? (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Résultats</p>
              <p className="text-on-surface whitespace-pre-wrap break-words">{detailsOf(detail)}</p>
            </div>
          ) : (
            <p className="text-slate-400 italic">Aucun détail enregistré pour cet examen.</p>
          )}
          {conclusionOf(detail) && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Conclusion</p>
              <p className="text-on-surface whitespace-pre-wrap break-words">{conclusionOf(detail)}</p>
            </div>
          )}
        </FloatingModal>
      )}
    </>
  );
}
