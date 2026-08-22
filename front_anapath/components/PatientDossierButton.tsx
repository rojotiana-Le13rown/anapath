'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { formatDateLong } from '@/lib/dateFormat';

/** Examen complémentaire enregistré par un service du CHU dans le dossier-patient. */
export interface DossierExamen {
  id?: string;
  examinationType?: string;
  titre?: string;
  description?: string;
  dateExamen?: string;
  resultats?: string;
  interpretation?: string;
  conclusion?: string;
  prescripteur?: string;
  laboratoire?: string;
  urgency?: string;
  isUrgent?: boolean;
}

interface PatientDossierButtonProps {
  patientId: string;
  chuId?: string;
  className?: string;
}

/**
 * Bouton "Dossier patient" — historique complet du patient dans tout le CHU :
 * tous les examens complémentaires enregistrés par l'ensemble des services
 * (chirurgie, anapath, imagerie…) via le service dossier-patient. Un examen
 * terminé s'ouvre pour afficher le compte-rendu complet.
 */
export default function PatientDossierButton({ patientId, chuId, className = '' }: PatientDossierButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [examens, setExamens] = useState<DossierExamen[] | null>(null);
  const [detail, setDetail] = useState<DossierExamen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || examens !== null || !patientId || !chuId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/anapath/patients/${encodeURIComponent(patientId)}/dossier-patient?chuId=${encodeURIComponent(chuId)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setExamens(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) {
          setExamens([]);
          setError('Dossier patient indisponible');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patientId, chuId, examens]);

  // Réinitialise à chaque ouverture pour rafraîchir les données.
  useEffect(() => {
    if (!open) {
      setExamens(null);
      setDetail(null);
      setError(null);
    }
  }, [open]);

  if (!patientId || !chuId) return null;

  const sorted = [...(examens ?? [])].sort(
    (a, b) => new Date(b.dateExamen ?? 0).getTime() - new Date(a.dateExamen ?? 0).getTime(),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Voir tous les examens de ce patient dans le CHU"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors shrink-0 ${className}`}
      >
        <span className="material-symbols-outlined text-base">folder_shared</span>
        Dossier patient{examens ? ` (${sorted.length})` : ''}
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
                <span className="material-symbols-outlined text-white">folder_shared</span>
                <h3 className="font-bold text-lg text-white">Dossier patient — CHU</h3>
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
              {loading && <p className="text-sm text-slate-400 italic">Chargement du dossier…</p>}
              {!loading && error && <p className="text-sm text-red-500">{error}</p>}
              {!loading && !error && sorted.length === 0 && (
                <p className="text-sm text-slate-400 italic">
                  Aucun examen enregistré par les services du CHU pour ce patient.
                </p>
              )}
              {!loading && !error && sorted.map((examen, index) => {
                const hasReport = Boolean((examen.resultats ?? '').trim() || (examen.conclusion ?? '').trim());
                return (
                  <button
                    key={examen.id ?? index}
                    type="button"
                    disabled={!hasReport}
                    onClick={() => setDetail(examen)}
                    className={`w-full text-left p-3 rounded-lg border border-outline-variant/20 ${
                      hasReport
                        ? 'bg-surface-container-low hover:bg-surface-container hover:border-primary/30 transition-colors'
                        : 'bg-surface-container-low opacity-70 cursor-default'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-on-surface text-sm truncate">
                          {examen.titre?.trim() || examen.examinationType || 'Examen'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDateLong(examen.dateExamen ?? '')}</p>
                      </div>
                      {hasReport ? (
                        <span className="material-symbols-outlined text-primary text-base shrink-0">description</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 shrink-0">
                          En cours
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {open && detail && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-xl w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#00478d] to-[#00284d]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-white">description</span>
                <div className="min-w-0">
                  <h3 className="font-bold text-white truncate">
                    {detail.titre?.trim() || detail.examinationType || 'Compte-rendu'}
                  </h3>
                  <p className="text-xs text-white/70">{formatDateLong(detail.dateExamen ?? '')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-white/70 hover:text-white transition-colors shrink-0 ml-2"
                aria-label="Retour"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-sm">
              {detail.prescripteur?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Prescripteur</p>
                  <p className="text-on-surface">{detail.prescripteur}</p>
                </div>
              )}
              {detail.laboratoire?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Laboratoire / Service</p>
                  <p className="text-on-surface">{detail.laboratoire}</p>
                </div>
              )}
              {detail.description?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Description</p>
                  <p className="text-on-surface whitespace-pre-wrap break-words">{detail.description}</p>
                </div>
              )}
              {detail.resultats?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Résultats</p>
                  <p className="text-on-surface whitespace-pre-wrap break-words">{detail.resultats}</p>
                </div>
              )}
              {detail.interpretation?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Interprétation</p>
                  <p className="text-on-surface whitespace-pre-wrap break-words">{detail.interpretation}</p>
                </div>
              )}
              {detail.conclusion?.trim() && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Conclusion</p>
                  <p className="text-on-surface whitespace-pre-wrap break-words">{detail.conclusion}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
