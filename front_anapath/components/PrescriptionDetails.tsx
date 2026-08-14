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
const TYPE_FIELDS: Record<string, { label: string; keys: string[] }[]> = {};

function clinicalFields(request: PrescriptionRequest): { label: string; value: string }[] {
  return (TYPE_FIELDS[request.typeExamen] ?? [])
    .map((field) => ({ label: field.label, value: val(request, field.keys) }))
    .filter((field) => field.value !== '');
}

/** Format jj/mm/aaaa : accepte les dates ISO, "yyyy-mm-dd" et déjà formatées. */
function formatDateFR(value: string): string {
  const v = value.trim();
  if (!v) return '';
  const ddmmyyyy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[1]}/${ddmmyyyy[2]}/${ddmmyyyy[3]}`;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(v);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  return v;
}

/** Sélection radio : option exacte (insensible à la casse) contenue dans la valeur, sinon ''. */
function selectedOption(value: string, options: string[]): string {
  const v = value.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? '';
}

interface FormFieldSpec {
  label?: string;
  required?: boolean;
  type?: 'text' | 'textarea' | 'date' | 'radio' | 'select';
  keys?: string[];
  placeholder?: string;
  helper?: string;
  options?: string[];
  radioLayout?: 'row' | 'grid';
  when?: (request: PrescriptionRequest) => boolean;
  group?: { title?: string; fields: FormFieldSpec[] };
}

/** Détail FCV / Pap test : libellés, ordre, placeholders et types exacts du formulaire du service Prescription. */
const FCV_SECTIONS: { title: string; fields: FormFieldSpec[] }[] = [
  {
    title: 'Notes & clinique',
    fields: [
      {
        label: 'Renseignements cliniques',
        required: true,
        type: 'textarea',
        keys: ['renseignementsCliniques', 'renseign', 'note', 'bioNote'],
        placeholder: 'Contexte clinique, suspicion diagnostique...',
      },
      {
        label: 'Note complémentaire',
        type: 'textarea',
        keys: ['fcvNote', 'noteComplementaire', 'noteComplement'],
        placeholder: 'Signes cliniques, motif de la demande...',
      },
    ],
  },
  {
    title: 'Antécédents',
    fields: [
      { label: 'G P A', keys: ['fcvGPA', 'gpa'], placeholder: 'Ex : G3 P2 A1' },
      { label: 'DDR', type: 'date', keys: ['fcvDDR', 'ddr'], placeholder: 'jj/mm/aaaa' },
      { label: 'Ménopause', type: 'radio', options: ['OUI', 'NON'], keys: ['fcvMeno', 'menopause'] },
      { label: 'Âge de la ménarche', keys: ['fcvMenarche', 'menarche'], placeholder: 'Âge (ans)' },
      { label: 'Âge du 1er rapport sexuel', keys: ['fcvRapport', 'rapport'], placeholder: 'Âge (ans)' },
      { label: 'Contraception', keys: ['fcvContraception', 'contraception'], placeholder: 'Méthode, durée...' },
      { label: 'Traitement en cours', keys: ['fcvTraitement', 'traitement'], placeholder: 'Médicaments, posologies' },
      {
        group: {
          title: 'Examens pap test antérieurs',
          fields: [
            { label: 'Lieu', keys: ['fcvPapLieu', 'papLieu'], placeholder: '—' },
            { label: 'Nombre de fois', keys: ['fcvPapNb', 'papNb'], placeholder: '—' },
            { label: 'date', type: 'date', keys: ['fcvPapDate', 'papDate'], placeholder: 'jj/mm/aaaa' },
            { label: 'Résultat', keys: ['papResultat', 'fcvPapRes', 'papRes'], placeholder: '—' },
          ],
        },
      },
      {
        label: 'Autres antécédents personnels et familiaux',
        type: 'textarea',
        keys: ['fcvAtcd', 'atcd'],
        placeholder: 'Précisez...',
      },
    ],
  },
];

/** Détail Cytoponction : libellés, ordre, placeholders et types exacts du formulaire du service Prescription. */
const CYTO_SECTIONS: { title: string; fields: FormFieldSpec[] }[] = [
  {
    title: 'Prélèvement',
    fields: [
      { label: 'Siège de la ponction', required: true, keys: ['cytoSiege', 'siege'], placeholder: 'Ex : sein gauche, creux axillaire...' },
      { label: 'Organe', required: true, keys: ['cytoOrgane', 'organe'], placeholder: 'Ex : thyroïde, ganglion, kyste...' },
      { label: 'Fixateur', type: 'radio', options: ['Cytofixe', 'Autre'], keys: ['cytoFix', 'fixateur'] },
      {
        label: 'Préciser le fixateur',
        keys: ['cytoFixAutre', 'fixateurAutre'],
        placeholder: 'Nom du fixateur utilisé...',
        when: (request) => selectedOption(val(request, ['cytoFix', 'fixateur']), ['Cytofixe', 'Autre']) === 'Autre',
      },
    ],
  },
  {
    title: 'Notes & clinique',
    fields: [
      {
        label: 'Renseignements cliniques',
        required: true,
        type: 'textarea',
        keys: ['renseignementsCliniques', 'renseign', 'note', 'bioNote'],
        placeholder: 'Contexte clinique, suspicion diagnostique...',
      },
      {
        label: 'Note complémentaire',
        type: 'textarea',
        keys: ['cytoNotes'],
        placeholder: 'Informations supplémentaires pour le pathologiste...',
      },
    ],
  },
];

/** Détail Liquide : libellés, ordre, placeholders et types exacts du formulaire du service Prescription (ordre inversé dans Notes & clinique). */
const LIQUID_SECTIONS: { title: string; fields: FormFieldSpec[] }[] = [
  {
    title: 'Nature du liquide',
    fields: [
      {
        label: 'Nature du liquide',
        required: true,
        type: 'radio',
        radioLayout: 'grid',
        options: ['Ascite', 'Pleural', 'Urinaire', 'Crachat', 'LCR', 'Autre'],
        keys: ['liqNat', 'type_liquide', 'nature', 'bioNature'],
      },
      {
        label: 'Préciser la nature du liquide',
        required: true,
        keys: ['liqNatAutre', 'natureAutre'],
        placeholder: 'Nature du liquide...',
        when: (request) =>
          selectedOption(val(request, ['liqNat', 'type_liquide', 'nature', 'bioNature']), [
            'Ascite',
            'Pleural',
            'Urinaire',
            'Crachat',
            'LCR',
            'Autre',
          ]) === 'Autre',
      },
    ],
  },
  {
    title: 'Notes & clinique',
    fields: [
      {
        label: 'Note complémentaire',
        type: 'textarea',
        keys: ['liqNotes'],
        placeholder: "Symptômes, antécédents, résultats d'imagerie, volume prélevé, aspect macroscopique...",
      },
      {
        label: 'Renseignements cliniques',
        required: true,
        type: 'textarea',
        keys: ['renseignementsCliniques', 'renseign', 'note', 'bioNote'],
        placeholder: 'Contexte clinique, suspicion diagnostique...',
      },
    ],
  },
];

/** Détail Biopsie / POC / POS : contenu identique pour les trois, libellés, ordre, placeholders et types exacts du formulaire du service Prescription. */
const BPS_SECTIONS: { title: string; fields: FormFieldSpec[] }[] = [
  {
    title: 'Prélèvement & notes',
    fields: [
      {
        group: {
          fields: [
            { label: 'Date du prélèvement', type: 'date', keys: ['bioDatePrelev', 'datePrelev'], placeholder: 'jj/mm/aaaa' },
            { label: 'Fixateur', type: 'select', keys: ['bioFixateur', 'fixateur'], placeholder: '— Sélectionner —' },
          ],
        },
      },
      {
        label: 'Organe(s) / site anatomique',
        required: true,
        keys: ['bioOrgane', 'organe', 'bioLocalisation', 'localisation'],
        placeholder: 'Ex : colon sigmoïde, sein droit, col utérin...',
      },
      {
        label: 'Nature du prélèvement',
        required: true,
        type: 'radio',
        radioLayout: 'grid',
        options: ['Biopsie', 'Exérèse', 'Curage ganglionnaire', 'Autre'],
        keys: ['bioNature', 'nature'],
      },
      {
        label: 'Suspicion diagnostique',
        type: 'textarea',
        keys: ['bioSuspicion', 'suspicion'],
        placeholder: 'Hypothèse(s) diagnostique(s)...',
      },
      {
        label: 'Renseignements cliniques',
        required: true,
        type: 'textarea',
        keys: ['renseignementsCliniques', 'renseign'],
        placeholder: 'Contexte clinique, suspicion diagnostique...',
      },
      {
        label: 'Note complémentaire',
        type: 'textarea',
        keys: ['bioNote', 'note'],
        placeholder: 'Informations supplémentaires pour le pathologiste...',
      },
    ],
  },
  {
    title: 'Antécédents',
    fields: [
      {
        group: {
          fields: [
            { label: 'Examen(s) antérieur(s)', keys: ['bioExamAnt', 'examAnt'], placeholder: "Type d'examen" },
            { label: 'Résultat(s)', keys: ['bioResAnt', 'resAnt'], placeholder: 'Résultat' },
          ],
        },
      },
      {
        group: {
          fields: [
            { label: 'G P A (si applicable)', keys: ['bioGPA', 'gpa'], placeholder: 'Ex : G3 P2 A1' },
            { label: 'DDR (si applicable)', type: 'date', keys: ['bioDDR', 'ddr'], placeholder: 'jj/mm/aaaa' },
          ],
        },
      },
      { label: 'Ménopause', type: 'radio', options: ['OUI', 'NON'], keys: ['bioMeno', 'menopause'] },
      {
        label: 'Autres antécédents personnels / familiaux',
        type: 'textarea',
        keys: ['bioAtcd', 'atcd'],
        placeholder: 'Précisez...',
      },
    ],
  },
];

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">{children}</label>
  );
}

function FormField({ field, request }: { field: FormFieldSpec; request: PrescriptionRequest }) {
  if (field.group) {
    return (
      <div>
        {field.group.title && <FormLabel>{field.group.title}</FormLabel>}
        <div className="grid grid-cols-2 gap-3">
          {field.group.fields.map((sub) => (
            <FormField key={sub.label} field={sub} request={request} />
          ))}
        </div>
      </div>
    );
  }

  if (field.when && !field.when(request)) return null;

  const rawValue = val(request, field.keys ?? []);
  const value = field.type === 'date' && rawValue ? formatDateFR(rawValue) : rawValue;

  if (field.type === 'radio') {
    const choice = selectedOption(value, field.options ?? []);
    const grid = field.radioLayout === 'grid';
    return (
      <div>
        <FormLabel>
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </FormLabel>
        <div className={`${grid ? 'grid grid-cols-2 gap-3' : 'flex gap-7'} pt-1`}>
          {(field.options ?? []).map((option) => (
            <span key={option} className="flex items-center gap-2 text-sm text-slate-700">
              <span
                className={`material-symbols-outlined text-lg ${choice === option ? 'text-primary' : 'text-slate-300'}`}
              >
                {choice === option ? 'radio_button_checked' : 'radio_button_unchecked'}
              </span>
              {option}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const textarea = field.type === 'textarea';
  const placeholder = field.placeholder ?? '—';
  return (
    <div>
      <FormLabel>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </FormLabel>
      <div className={`rounded-lg border border-outline-variant/40 bg-white px-3 py-2 ${textarea ? 'min-h-[70px]' : ''}`}>
        {value ? (
          <p className="text-sm font-medium text-on-surface leading-relaxed">{value}</p>
        ) : (
          <p className="text-sm text-slate-400 italic leading-relaxed">{placeholder}</p>
        )}
      </div>
      {field.helper && <p className="text-[11.5px] text-slate-400 italic leading-snug -mt-2">{field.helper}</p>}
    </div>
  );
}

type FormSection = { title: string; accent?: 'blue' | 'red'; fields: FormFieldSpec[] };

const ACCENT_CLASSES: Record<'blue' | 'red', { bar: string; text: string }> = {
  blue: { bar: 'bg-blue-600', text: 'text-blue-600' },
  red: { bar: 'bg-[#c0392b]', text: 'text-[#c0392b]' },
};

function FormSections({ sections, request }: { sections: FormSection[]; request: PrescriptionRequest }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {sections.map((section) => {
        const accent = ACCENT_CLASSES[section.accent ?? 'blue'];
        return (
          <div key={section.title}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-0.5 h-3.5 rounded ${accent.bar}`} />
              <h5 className={`text-xs font-bold ${accent.text} uppercase tracking-wider`}>{section.title}</h5>
            </div>
            <div className="space-y-5">
              {section.fields.map((field) => (
                <FormField key={field.label ?? field.group?.title} field={field} request={request} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Formulaire FCV / Pap test en lecture seule, tel que saisi côté service Prescription. */
function FcvDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={FCV_SECTIONS} request={request} />;
}

/** Formulaire Cytoponction en lecture seule, tel que saisi côté service Prescription. */
function CytoDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={CYTO_SECTIONS} request={request} />;
}

/** Formulaire Liquide en lecture seule, tel que saisi côté service Prescription. */
function LiquideDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={LIQUID_SECTIONS} request={request} />;
}

/** Formulaire Biopsie en lecture seule, tel que saisi côté service Prescription. */
function BiopsieDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={BPS_SECTIONS} request={request} />;
}

/** Formulaire POS en lecture seule, tel que saisi côté service Prescription. */
function PosDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={BPS_SECTIONS} request={request} />;
}

/** Formulaire POC en lecture seule, tel que saisi côté service Prescription. */
function PocDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={BPS_SECTIONS} request={request} />;
}

/** Détail Extemporané : libellés, ordre, placeholders et types exacts du formulaire du service Prescription (accent rouge sur Question & planification). */
const EXT_SECTIONS: FormSection[] = [
  {
    title: 'Intervention en cours',
    fields: [
      { label: 'Chirurgien en salle', required: true, keys: ['extChirurgien', 'chirurgien'], placeholder: 'Dr. ________________' },
      {
        label: "Type d'intervention chirurgicale en cours",
        required: true,
        keys: ['extIntervention', 'intervention'],
        placeholder: 'Ex : Thyroïdectomie, résection tumorale côlon, mastectomie...',
      },
      { label: 'Nature du prélèvement', required: true, keys: ['extNature', 'nature'], placeholder: 'Ex : tissu frais, cytologique, etc.' },
      {
        label: 'Organe / site anatomique prélevé',
        required: true,
        keys: ['extOrgane', 'organe'],
        placeholder: 'Ex : sein gauche, thyroïde, ganglion sentinelle, marge de résection...',
      },
    ],
  },
  {
    title: 'Question & planification',
    accent: 'red',
    fields: [
      {
        label: 'Renseignements cliniques',
        required: true,
        type: 'textarea',
        keys: ['renseignementsCliniques', 'renseign', 'note', 'bioNote'],
        placeholder: 'Contexte clinique, suspicion diagnostique...',
      },
      {
        label: 'Question clinique posée au pathologiste',
        type: 'textarea',
        keys: ['extQuestion', 'question'],
        placeholder: 'Ex : Marge de résection saine ? Lésion bénigne ou maligne ? Ganglion envahi ? Continuer ou arrêter la résection ?',
        helper: "Le pathologiste limite sa réponse à ce qui guide le chirurgien en cours d'intervention (bénin/malin, marge saine/envahie).",
      },
    ],
  },
];

/** Formulaire Extemporané en lecture seule, tel que saisi côté service Prescription. */
function ExtemporaneDetails({ request }: { request: PrescriptionRequest }) {
  return <FormSections sections={EXT_SECTIONS} request={request} />;
}

/** Détail formulaire selon le type d'examen exact — jamais fusionné entre types. */
function formDetails(request: PrescriptionRequest): React.ReactNode {
  switch (request.typeExamen) {
    case 'FCV_PAP':
      return <FcvDetails request={request} />;
    case 'CYT0PONCTION':
      return <CytoDetails request={request} />;
    case 'LIQUIDE':
      return <LiquideDetails request={request} />;
    case 'BIOPSIE':
      return <BiopsieDetails request={request} />;
    case 'POS':
      return <PosDetails request={request} />;
    case 'POC':
      return <PocDetails request={request} />;
    case 'EXTEMPORANE_STAT':
      return <ExtemporaneDetails request={request} />;
    default:
      return null;
  }
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
            {!['BIOPSIE', 'POS', 'POC'].includes(request.typeExamen) && (
              <div className="mb-3">
                <p className="text-xs text-slate-400">Suspicion diagnostique</p>
                <p className="font-medium text-on-surface italic leading-relaxed">{display(suspicion)}</p>
              </div>
            )}
            {!['FCV_PAP', 'CYT0PONCTION', 'LIQUIDE', 'BIOPSIE', 'POS', 'POC', 'EXTEMPORANE_STAT'].includes(
              request.typeExamen,
            ) && (
              <div>
                <p className="text-xs text-slate-400">Renseignements cliniques</p>
                <p className="font-medium text-on-surface italic leading-relaxed">{display(clinicalNotes)}</p>
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
            {formDetails(request) ?? (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
