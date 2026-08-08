'use client';

import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import { formatDateLong } from '@/lib/dateFormat';

interface PrescriptionRequest {
  typeExamen: string;
  createdAt: string;
  patientId: string;
  prelevement?: {
    site?: string;
    description?: string;
    clinicalData?: { treatmentType?: string; suspicion?: string; clinicalNotes?: string };
  } | null;
  metadata?: Record<string, unknown> | null;
}

interface PrescriptionDetailsProps {
  request: PrescriptionRequest;
  patient: PatientInfo | null;
  patientLoading?: boolean;
  historiqueButton?: React.ReactNode;
}

type Raw = Record<string, any>;

function rawDataOf(request: PrescriptionRequest): Raw {
  const md = (request.metadata ?? {}) as Record<string, any>;
  const raw = (md.rawData ?? md.data ?? {}) as unknown;
  return raw && typeof raw === 'object' ? (raw as Raw) : {};
}

function detailsOf(raw: Raw): Raw {
  const details = raw.details;
  return details && typeof details === 'object' ? (details as Raw) : {};
}

/** Lit une valeur dans rawData.details puis rawData (champs plats), jamais le JSON brut. */
function val(request: PrescriptionRequest, keys: string[]): string {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  for (const key of keys) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  }
  return '';
}

/** Lit dans details puis plats, avec repli booléen/nombre. */
function pickValue(raw: Raw, details: Raw, keys: string[]): string {
  for (const key of keys) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** Motif lisible : description déjà lisible, sinon composition depuis les données brutes. */
function motif(request: PrescriptionRequest): string {
  const description = request.prelevement?.description;
  if (description && !description.startsWith('{')) return description;
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  const primary = pickValue(raw, details, ['renseignementsCliniques', 'renseign', 'note', 'bioNote']);
  if (primary) return primary;
  const composed = [
    pickValue(raw, details, ['bioNature', 'nature']),
    pickValue(raw, details, ['bioOrgane', 'organe']),
    pickValue(raw, details, ['bioSuspicion', 'suspicion']),
    pickValue(raw, details, ['bioAtcd', 'atcd']),
    pickValue(raw, details, ['bioExamAnt', 'examAnt']),
    pickValue(raw, details, ['bioResAnt', 'resAnt']),
  ].filter((part) => part.length > 0);
  return composed.join(' — ') || 'Non renseigné';
}

function display(value: string): string {
  return value || '—';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low rounded-lg p-3">
      <label className="text-xs text-slate-400 block">{label}</label>
      <p className="font-medium text-on-surface">{display(value)}</p>
    </div>
  );
}

/** Détails d'une prescription (identité patient, type d'examen, motif, infos cliniques par type). */
export default function PrescriptionDetails({ request, patient, patientLoading, historiqueButton }: PrescriptionDetailsProps) {
  const suspicion = val(request, ['suspicion', 'bioSuspicion']);
  const clinicalNotes = val(request, ['renseignementsCliniques', 'renseign', 'note', 'bioNote']);

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
                <p className="font-medium text-on-surface">
                  {request.typeExamen === 'FCV_PAP' && 'FCV / Pap test'}
                  {request.typeExamen === 'CYT0PONCTION' && 'Cytoponction'}
                  {request.typeExamen === 'LIQUIDE' && 'Liquide'}
                  {request.typeExamen === 'BIOPSIE' && 'Biopsie'}
                  {request.typeExamen === 'POS' && 'POS'}
                  {request.typeExamen === 'POC' && 'POC'}
                  {request.typeExamen === 'EXTEMPORANE_STAT' && 'Extemporané'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Date Prélèvement</p>
                <p className="font-medium text-on-surface">{formatDateLong(request.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Site de prélèvement</p>
                <p className="font-medium text-on-surface">{request.prelevement?.site || '-'}</p>
              </div>
            </div>
          </div>

          {/* Service demandeur / CHU / données cliniques renseignées par la Prescription */}
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
            <hr className="border-outline-variant/30 my-3" />

            <div className="mb-3">
              <p className="text-xs text-slate-400">Type de traitement</p>
              <p className="font-medium text-on-surface">{request.prelevement?.clinicalData?.treatmentType || '—'}</p>
            </div>
            <div className="mb-3">
              <p className="text-xs text-slate-400">Suspicion diagnostique</p>
              <p className="font-medium text-on-surface italic leading-relaxed">{display(suspicion)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Renseignements cliniques</p>
              <p className="font-medium text-on-surface italic leading-relaxed">{display(clinicalNotes)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {historiqueButton && (
            <div className="flex justify-end">
              {historiqueButton}
            </div>
          )}

          {/* Motif de prescription */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-sm">medical_services</span>
              Motif de prescription
            </label>
            <p className="text-base font-medium text-on-surface leading-relaxed">
              {motif(request)}
            </p>
          </div>

          {/* Détails spécifiques par type */}
          <div className="space-y-4">
            <div className="border-b border-outline-variant/30 pb-2">
              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Informations cliniques</h5>
            </div>

            {request.typeExamen === 'FCV_PAP' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="GPA" value={val(request, ['fcvGPA', 'gpa'])} />
                <Field label="DDR" value={val(request, ['fcvDDR', 'ddr'])} />
                <Field label="Ménopause" value={val(request, ['fcvMeno', 'menopause'])} />
                <Field label="Ménarche" value={val(request, ['fcvMenarche', 'menarche'])} />
                <Field label="Rapports" value={val(request, ['rapport'])} />
                <Field label="Contraception" value={val(request, ['contraception'])} />
                <Field label="Traitement" value={val(request, ['traitement'])} />
                <Field label="ATCD" value={val(request, ['bioAtcd', 'atcd'])} />
                <Field label="Méthode" value={val(request, ['methode'])} />
                <Field label="État du col" value={val(request, ['etat_col'])} />
                <Field label="Dernier PAP" value={val(request, ['papResultat', 'papRes'])} />
                <Field label="Date PAP" value={val(request, ['papDate'])} />
                <Field label="Nb PAP" value={val(request, ['papNb'])} />
                <Field label="Lieu PAP" value={val(request, ['papLieu'])} />
                <Field label="Notes" value={val(request, ['bioNote', 'note'])} />
              </div>
            )}

            {request.typeExamen === 'CYT0PONCTION' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Siège" value={val(request, ['siege'])} />
                <Field label="Organe" value={val(request, ['organe', 'bioOrgane'])} />
                <Field label="Fixateur" value={val(request, ['fixateur', 'bioFixateur'])} />
                <Field label="Fixateur (autre)" value={val(request, ['fixateurAutre'])} />
                <Field label="Notes" value={val(request, ['bioNote', 'note'])} />
              </div>
            )}

            {request.typeExamen === 'LIQUIDE' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Nature du liquide" value={val(request, ['type_liquide', 'nature', 'bioNature'])} />
                <Field label="Unité" value={val(request, ['unite'])} />
                <Field label="Volume (ml)" value={val(request, ['volume'])} />
                <Field label="Nature (autre)" value={val(request, ['natureAutre'])} />
                <Field label="Notes" value={val(request, ['bioNote', 'note'])} />
              </div>
            )}

            {(request.typeExamen === 'BIOPSIE' || request.typeExamen === 'POS' || request.typeExamen === 'POC') && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="GPA" value={val(request, ['bioGPA', 'gpa'])} />
                <Field label="DDR" value={val(request, ['bioDDR', 'ddr'])} />
                <Field label="ATCD" value={val(request, ['bioAtcd', 'atcd'])} />
                <Field label="Ménopause" value={val(request, ['bioMeno', 'menopause'])} />
                <Field label="Organe" value={val(request, ['bioOrgane', 'organe'])} />
                <Field label="Localisation" value={val(request, ['bioLocalisation', 'localisation'])} />
                <Field label="Nature" value={val(request, ['bioNature', 'nature'])} />
                <Field label="Nature (autre)" value={val(request, ['natureAutre'])} />
                <Field label="Fixateur" value={val(request, ['bioFixateur', 'fixateur'])} />
                <Field label="Suspicion" value={val(request, ['bioSuspicion', 'suspicion'])} />
                <Field label="Examen antérieur" value={val(request, ['bioExamAnt', 'examAnt'])} />
                <Field label="Résultat antérieur" value={val(request, ['bioResAnt', 'resAnt'])} />
                <Field label="Date prélèvement" value={val(request, ['bioDatePrelev', 'datePrelev'])} />
                <Field label="Prélèvement fait à" value={val(request, ['bioFaitA', 'faitA'])} />
                <Field label="Prélèvement fait le" value={val(request, ['bioFaitLe', 'faitLe'])} />
              </div>
            )}

            {request.typeExamen === 'EXTEMPORANE_STAT' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Chirurgien" value={val(request, ['chirurgien'])} />
                <Field label="Intervention" value={val(request, ['intervention'])} />
                <Field label="Organe" value={val(request, ['organe', 'bioOrgane'])} />
                <Field label="Nature" value={val(request, ['bioNature', 'nature'])} />
                <Field label="Question posée" value={val(request, ['question'])} />
                <Field label="Urgence chirurgicale" value={val(request, ['urgence_chirurgicale'])} />
                <Field label="Date prévue" value={val(request, ['extDatePrevue', 'datePrevue'])} />
                <Field label="Heure" value={val(request, ['heure'])} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
