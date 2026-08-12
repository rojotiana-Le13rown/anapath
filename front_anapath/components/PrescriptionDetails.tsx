'use client';

import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import { formatDateLong } from '@/lib/dateFormat';
import {
  getClinicalNotes,
  getSuspicion,
  getTreatmentType,
  rawDataOf,
  detailsOf,
  val,
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

/** Motif lisible : description déjà lisible, sinon composition depuis les données brutes. */
function motif(request: PrescriptionRequest): string {
  const description = request.prelevement?.description;
  if (description && !description.startsWith('{')) return description;
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  const primary = getClinicalNotes(request);
  if (primary) return primary;
  const composed = [
    raw.details?.bioNature ?? raw.bioNature,
    raw.details?.bioOrgane ?? raw.bioOrgane,
    raw.details?.bioSuspicion ?? raw.bioSuspicion,
    raw.details?.bioAtcd ?? raw.bioAtcd,
    raw.details?.bioExamAnt ?? raw.bioExamAnt,
    raw.details?.bioResAnt ?? raw.bioResAnt,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
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

/** Champs cliniques par type d'examen : libellés et ordre exacts du service Prescription.
 *  Clés de lecture : préfixées (fcv, cyto, liq, bio, ext) puis champs plats du DTO. */
const TYPE_FIELDS: Record<string, { label: string; keys: string[] }[]> = {
  FCV_PAP: [
    { label: 'GPA', keys: ['fcvGPA', 'gpa'] },
    { label: 'DDR', keys: ['fcvDDR', 'ddr'] },
    { label: 'Ménopause', keys: ['fcvMeno', 'menopause'] },
    { label: 'Ménarche', keys: ['fcvMenarche', 'menarche'] },
    { label: 'Rapports', keys: ['fcvRapport', 'rapport'] },
    { label: 'Contraception', keys: ['fcvContraception', 'contraception'] },
    { label: 'Traitement', keys: ['fcvTraitement', 'traitement'] },
    { label: 'ATCD', keys: ['fcvAtcd', 'atcd'] },
    { label: 'Méthode', keys: ['fcvMethode', 'methode'] },
    { label: 'État du col', keys: ['etat_col'] },
    { label: 'Résultat du dernier frottis / PAP', keys: ['papResultat', 'fcvPapRes', 'papRes'] },
    { label: 'Date PAP', keys: ['fcvPapDate', 'papDate'] },
    { label: 'Nb PAP', keys: ['fcvPapNb', 'papNb'] },
    { label: 'Lieu PAP', keys: ['fcvPapLieu', 'papLieu'] },
    { label: 'Note', keys: ['fcvNote'] },
  ],
  CYT0PONCTION: [
    { label: 'Organe', keys: ['cytoOrgane', 'organe'] },
    { label: 'Siège', keys: ['cytoSiege', 'siege'] },
    { label: 'Fixateur', keys: ['cytoFix', 'fixateur'] },
    { label: 'Fixateur (autre)', keys: ['cytoFixAutre', 'fixateurAutre'] },
    { label: 'Note', keys: ['cytoNotes'] },
  ],
  LIQUIDE: [
    { label: 'Nature du liquide', keys: ['liqNat', 'type_liquide', 'nature', 'bioNature'] },
    { label: 'Unité', keys: ['liqUnite', 'unite'] },
    { label: 'Volume (ml)', keys: ['liqVolume', 'volume'] },
    { label: 'Nature (autre)', keys: ['liqNatAutre', 'natureAutre'] },
    { label: 'Note', keys: ['liqNotes'] },
  ],
  BIOPSIE: [
    { label: 'Organe', keys: ['bioOrgane', 'organe'] },
    { label: 'Localisation', keys: ['bioLocalisation', 'localisation'] },
    { label: 'Nature', keys: ['bioNature', 'nature'] },
    { label: 'Nature (autre)', keys: ['bioNatureAutre', 'natureAutre'] },
    { label: 'Examen antérieur', keys: ['bioExamAnt', 'examAnt'] },
    { label: 'Résultat antérieur', keys: ['bioResAnt', 'resAnt'] },
    { label: 'GPA', keys: ['bioGPA', 'gpa'] },
    { label: 'DDR', keys: ['bioDDR', 'ddr'] },
    { label: 'Ménopause', keys: ['bioMeno', 'menopause'] },
    { label: 'ATCD', keys: ['bioAtcd', 'atcd'] },
    { label: 'Date prélèvement', keys: ['bioDatePrelev', 'datePrelev'] },
    { label: 'Fixateur', keys: ['bioFixateur', 'fixateur'] },
    { label: 'Suspicion', keys: ['bioSuspicion', 'suspicion'] },
    { label: 'Prélèvement fait à', keys: ['bioFaitA', 'faitA'] },
    { label: 'Prélèvement fait le', keys: ['bioFaitLe', 'faitLe'] },
    { label: 'Note', keys: ['bioNote'] },
  ],
  POS: [
    { label: 'Organe', keys: ['bioOrgane', 'organe'] },
    { label: 'Localisation', keys: ['bioLocalisation', 'localisation'] },
    { label: 'Nature', keys: ['bioNature', 'nature'] },
    { label: 'Nature (autre)', keys: ['bioNatureAutre', 'natureAutre'] },
    { label: 'Examen antérieur', keys: ['bioExamAnt', 'examAnt'] },
    { label: 'Résultat antérieur', keys: ['bioResAnt', 'resAnt'] },
    { label: 'GPA', keys: ['bioGPA', 'gpa'] },
    { label: 'DDR', keys: ['bioDDR', 'ddr'] },
    { label: 'Ménopause', keys: ['bioMeno', 'menopause'] },
    { label: 'ATCD', keys: ['bioAtcd', 'atcd'] },
    { label: 'Date prélèvement', keys: ['bioDatePrelev', 'datePrelev'] },
    { label: 'Fixateur', keys: ['bioFixateur', 'fixateur'] },
    { label: 'Suspicion', keys: ['bioSuspicion', 'suspicion'] },
    { label: 'Prélèvement fait à', keys: ['bioFaitA', 'faitA'] },
    { label: 'Prélèvement fait le', keys: ['bioFaitLe', 'faitLe'] },
    { label: 'Note', keys: ['bioNote'] },
  ],
  POC: [
    { label: 'Organe', keys: ['bioOrgane', 'organe'] },
    { label: 'Localisation', keys: ['bioLocalisation', 'localisation'] },
    { label: 'Nature', keys: ['bioNature', 'nature'] },
    { label: 'Nature (autre)', keys: ['bioNatureAutre', 'natureAutre'] },
    { label: 'Examen antérieur', keys: ['bioExamAnt', 'examAnt'] },
    { label: 'Résultat antérieur', keys: ['bioResAnt', 'resAnt'] },
    { label: 'GPA', keys: ['bioGPA', 'gpa'] },
    { label: 'DDR', keys: ['bioDDR', 'ddr'] },
    { label: 'Ménopause', keys: ['bioMeno', 'menopause'] },
    { label: 'ATCD', keys: ['bioAtcd', 'atcd'] },
    { label: 'Date prélèvement', keys: ['bioDatePrelev', 'datePrelev'] },
    { label: 'Fixateur', keys: ['bioFixateur', 'fixateur'] },
    { label: 'Suspicion', keys: ['bioSuspicion', 'suspicion'] },
    { label: 'Prélèvement fait à', keys: ['bioFaitA', 'faitA'] },
    { label: 'Prélèvement fait le', keys: ['bioFaitLe', 'faitLe'] },
    { label: 'Note', keys: ['bioNote'] },
  ],
  EXTEMPORANE_STAT: [
    { label: 'Chirurgien', keys: ['extChirurgien', 'chirurgien'] },
    { label: 'Intervention', keys: ['extIntervention', 'intervention'] },
    { label: 'Organe', keys: ['extOrgane', 'organe'] },
    { label: 'Question posée', keys: ['extQuestion', 'question'] },
    { label: 'Date prévue', keys: ['extDatePrevue', 'datePrevue'] },
    { label: 'Heure', keys: ['extHeure', 'heure'] },
    { label: 'Nature du prélèvement', keys: ['extNature', 'nature'] },
    { label: 'Urgence chirurgicale', keys: ['urgence_chirurgicale'] },
    { label: 'Note', keys: ['extNote'] },
  ],
};

function clinicalFields(request: PrescriptionRequest): { label: string; value: string }[] {
  return (TYPE_FIELDS[request.typeExamen] ?? [])
    .map((field) => ({ label: field.label, value: val(request, field.keys) }))
    .filter((field) => field.value !== '');
}

/** Détails d'une prescription (identité patient, type d'examen, motif, infos cliniques par type). */
export default function PrescriptionDetails({ request, patient, patientLoading, historiqueButton }: PrescriptionDetailsProps) {
  const suspicion = getSuspicion(request);
  const clinicalNotes = getClinicalNotes(request);

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
              <p className="font-medium text-on-surface">{getTreatmentType(request) || '—'}</p>
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

            {clinicalFields(request).length > 0 && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {clinicalFields(request).map((field) => (
                  <Field key={field.label} label={field.label} value={field.value} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
