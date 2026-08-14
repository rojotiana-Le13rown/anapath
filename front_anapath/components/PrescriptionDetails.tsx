'use client';

import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import { formatDateLong } from '@/lib/dateFormat';
import {
  getClinicalNotes,
  rawDataOf,
  detailsOf,
  type PrescriptionLike,
} from '@/lib/prescriptionFields';

interface PrescriptionRequest extends PrescriptionLike {
  typeExamen: string;
  createdAt: string;
  patientId: string;
}

interface PrescriptionDetailsProps {
  request: PrescriptionRequest;
  patient: PatientInfo | null;
  patientLoading?: boolean;
  historiqueButton?: React.ReactNode;
}

/** Motif lisible : priorité aux renseignements cliniques réellement reçus (payload stocké),
 *  repli sur la description dérivée au moment de l'acceptation. */
function motif(request: PrescriptionRequest): string {
  const clinicalNotes = getClinicalNotes(request);
  if (clinicalNotes) return clinicalNotes;
  const description = request.prelevement?.description;
  if (description && !description.startsWith('{')) return description;
  return 'Non renseigné';
}

function display(value: string): string {
  return value || '—';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low rounded-lg p-3">
      <label className="text-xs text-slate-400 block">{label}</label>
      <p className="font-medium text-on-surface break-words">{display(value)}</p>
    </div>
  );
}

/** Affiche dynamiquement chaque champ réellement reçu du service Prescription
 *  (metadata.rawData et son bag details) — clé par clé, sans libellé en dur :
 *  l'affichage reflète exactement l'objet stocké, quel que soit le type d'examen. */
function StoredFields({ request }: { request: PrescriptionRequest }) {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  const entries: { key: string; value: string }[] = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'boolean') entries.push({ key, value: value ? 'Oui' : 'Non' });
    else if (typeof value === 'number') entries.push({ key, value: String(value) });
    else if (typeof value === 'string' && value.trim()) entries.push({ key, value: value.trim() });
  };
  for (const [key, value] of Object.entries(details)) add(key, value);
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'details') continue;
    add(key, value);
  }
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400 italic">Aucun champ reçu du service Prescription.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {entries.map((entry) => (
        <Field key={entry.key} label={entry.key} value={entry.value} />
      ))}
    </div>
  );
}

/** Détails d'une prescription : identité patient, provenance et champs reçus affichés dynamiquement. */
export default function PrescriptionDetails({ request, patient, patientLoading, historiqueButton }: PrescriptionDetailsProps) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary">description</span>
        <h4 className="text-lg font-bold text-primary">Détails de la prescription</h4>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <div className="bg-surface-container-low rounded-lg p-4 border border-outline-variant/30">
            <PatientIdentitySection examen={request} patient={patient} loading={patientLoading} />
            <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t border-outline-variant/30">
              <div>
                <p className="text-xs text-slate-400">Type d'examen</p>
                <p className="font-medium text-on-surface">{request.typeExamen}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Date de réception</p>
                <p className="font-medium text-on-surface">{formatDateLong(request.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Site de prélèvement</p>
                <p className="font-medium text-on-surface">{request.prelevement?.site || '—'}</p>
              </div>
            </div>
          </div>

          {/* Provenance de la prescription (métadonnées reçues) */}
          <div className="bg-white border border-outline-variant/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary">stethoscope</span>
              <div>
                <p className="text-xs text-slate-400">Service demandeur</p>
                <p className="font-medium text-on-surface">{(request.metadata?.serviceNom as string) ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-3">
              <span className="material-symbols-outlined text-secondary">local_hospital</span>
              <div>
                <p className="text-xs text-slate-400">CHU</p>
                <p className="font-medium text-on-surface">{(request.metadata?.chuNom as string) ?? '—'}</p>
              </div>
            </div>
            {(request.metadata?.nomMedecinPrescripteur as string) && (
              <div className="flex items-start gap-2 mt-3">
                <span className="material-symbols-outlined text-secondary">local_hospital</span>
                <div>
                  <p className="text-xs text-slate-400">Médecin prescripteur</p>
                  <p className="font-medium text-on-surface">{request.metadata?.nomMedecinPrescripteur as string}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {historiqueButton && (
            <div className="flex justify-end">
              {historiqueButton}
            </div>
          )}

          {/* Motif de prescription : résumé lisible des données reçues */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-sm">medical_services</span>
              Motif de prescription
            </label>
            <p className="text-base font-medium text-on-surface leading-relaxed">
              {motif(request)}
            </p>
          </div>

          {/* Champs reçus du service Prescription, affichés tels quels */}
          <div className="space-y-4">
            <div className="border-b border-outline-variant/30 pb-2">
              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Champs reçus du service Prescription</h5>
            </div>
            <StoredFields request={request} />
          </div>
        </div>
      </div>
    </div>
  );
}
