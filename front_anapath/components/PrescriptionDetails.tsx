'use client';

import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import { formatDateLong } from '@/lib/dateFormat';
import {
  contentEntriesOf,
  siteOf,
  type FieldEntry,
} from '@/lib/prescriptionContent';
import { type PrescriptionLike } from '@/lib/prescriptionFields';

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

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="col-span-full mt-1">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-outline-variant/40 pb-1">
        {label}
      </p>
    </div>
  );
}

/** Contenu de la prescription affiché dans l'ordre du formulaire du service
 *  Prescription, avec les libellés du formulaire et les valeurs telles que reçues. */
function ContentFields({ entries }: { entries: FieldEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400 italic">Aucun champ reçu du service Prescription.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {entries.map((entry, index) =>
        entry.group ? (
          <GroupHeader key={`group-${entry.group}`} label={entry.group} />
        ) : (
          <Field key={index} label={entry.label} value={entry.value} />
        ),
      )}
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
              {siteOf(request) && (
                <div>
                  <p className="text-xs text-slate-400">Site de prélèvement</p>
                  <p className="font-medium text-on-surface">{siteOf(request)}</p>
                </div>
              )}
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

          {/* Contenu de la prescription, dans l'ordre du formulaire du service Prescription */}
          <ContentFields entries={contentEntriesOf(request)} />
        </div>
      </div>
    </div>
  );
}
