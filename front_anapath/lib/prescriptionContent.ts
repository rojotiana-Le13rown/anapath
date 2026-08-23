import { rawDataOf, detailsOf, type PrescriptionLike } from '@/lib/prescriptionFields';

/**
 * Affichage du contenu d'une prescription, type d'examen par type d'examen.
 *
 * Source de vérité : le formulaire réel du service Prescription
 * (orl_front/src/features/prescription/components/para/AnapathForm.tsx).
 * Les groupes, libellés et l'ordre reproduisent EXACTEMENT ses sections
 * (« Notes & clinique », « Antécédents », « Prélèvement », « Intervention en
 * cours », « Question & planification »…) ; aucune clé hors formulaire du type
 * n'est affichée — notamment la pollution inter-onglets du formulaire ORL qui
 * partage un seul objet formData entre tous les types d'examen.
 */

export interface ContentField {
  /** Clés sources, testées dans l'ordre (details préfixé d'abord, puis plat hérité). */
  keys: string[];
  /** Libellé affiché (formulaire du service Prescription). */
  label: string;
  /** Formater la valeur en jj/mm/aaaa si elle est au format ISO (AAAA-MM-JJ). */
  date?: boolean;
  /** Clés du champ de précision (ex. « Préciser le fixateur ») : quand la valeur
   *  principale vaut « Autre », on affiche la valeur saisie dans ce champ. */
  otherKeys?: string[];
}

export type ContentBlock =
  | { type: 'field'; field: ContentField }
  | { type: 'group'; label: string; fields: ContentField[] };

export interface FieldEntry {
  /** Présent pour les sous-groupes (ex. EXAMEN PAP TEST ANTERIEUR). */
  group?: string;
  label: string;
  value: string;
}

const BIOPSIE_CONFIG: ContentBlock[] = [
  {
    type: 'group',
    label: 'PRÉLÈVEMENT & NOTES',
    fields: [
      { keys: ['bioDatePrelev'], label: 'Date du prélèvement', date: true },
      { keys: ['bioFixateur', 'fixateur'], label: 'Fixateur', otherKeys: ['bioFixateurAutre'] },
      { keys: ['bioOrgane', 'organe'], label: 'Organe(s) / Site anatomique' },
      { keys: ['bioNature', 'nature'], label: 'Nature du prélèvement', otherKeys: ['bioNatureAutre'] },
      { keys: ['bioSuspicion', 'suspicion'], label: 'Suspicion diagnostique' },
      { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' },
      { keys: ['bioNote', 'note'], label: 'Note complémentaire' },
    ],
  },
  {
    type: 'group',
    label: 'ANTÉCÉDENTS',
    fields: [
      { keys: ['bioExamAnt'], label: 'Examen(s) antérieur(s)' },
      { keys: ['bioResAnt'], label: 'Résultat(s)' },
      { keys: ['bioGPA', 'gpa'], label: 'G P A (si applicable)' },
      { keys: ['bioDDR', 'ddr'], label: 'DDR (si applicable)', date: true },
      { keys: ['bioMeno'], label: 'Ménopause' },
      { keys: ['bioAtcd', 'atcd'], label: 'Autres antécédents personnels / familiaux' },
    ],
  },
];

const CONTENT_CONFIG: Record<string, ContentBlock[]> = {
  FCV_PAP: [
    {
      type: 'group',
      label: 'NOTES & CLINIQUE',
      fields: [
        { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' },
        { keys: ['fcvNote', 'note'], label: 'Note complémentaire' },
      ],
    },
    {
      type: 'group',
      label: 'ANTÉCÉDENTS',
      fields: [
        { keys: ['fcvGPA', 'gpa'], label: 'G P A' },
        { keys: ['fcvDDR', 'ddr'], label: 'DDR', date: true },
        { keys: ['fcvMeno'], label: 'Ménopause' },
        { keys: ['fcvMenarche'], label: 'Âge de la ménarche' },
        { keys: ['fcvRapport'], label: 'Âge du 1er rapport sexuel' },
        { keys: ['fcvContra'], label: 'Contraception' },
        { keys: ['fcvTtt'], label: 'Traitement en cours' },
      ],
    },
    {
      type: 'group',
      label: 'EXAMENS PAP TEST ANTÉRIEURS',
      fields: [
        { keys: ['fcvPapLieu'], label: 'Lieu' },
        { keys: ['fcvPapNb'], label: 'Nombre de fois' },
        { keys: ['fcvPapDate'], label: 'Date', date: true },
        { keys: ['fcvPapRes'], label: 'Résultat' },
      ],
    },
    { type: 'field', field: { keys: ['fcvAtcd', 'atcd'], label: 'Autres antécédents personnels et familiaux' } },
  ],

  CYT0PONCTION: [
    {
      type: 'group',
      label: 'PRÉLÈVEMENT',
      fields: [
        { keys: ['cytoSiege', 'siege'], label: 'Siège de la ponction' },
        { keys: ['cytoOrgane', 'organe'], label: 'Organe' },
        { keys: ['cytoFix', 'fixateur'], label: 'Fixateur', otherKeys: ['cytoFixAutre'] },
      ],
    },
    {
      type: 'group',
      label: 'NOTES & CLINIQUE',
      fields: [
        { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' },
        { keys: ['cytoNotes', 'note'], label: 'Note complémentaire' },
      ],
    },
  ],

  LIQUIDE: [
    {
      type: 'group',
      label: 'NATURE DU LIQUIDE',
      fields: [
        { keys: ['liqNat', 'type_liquide'], label: 'Nature du liquide', otherKeys: ['liqNatAutre'] },
      ],
    },
    {
      type: 'group',
      label: 'NOTES & CLINIQUE',
      fields: [
        { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' },
        { keys: ['liqNotes', 'note'], label: 'Note complémentaire' },
      ],
    },
  ],

  BIOPSIE: BIOPSIE_CONFIG,
  POS: BIOPSIE_CONFIG,
  POC: BIOPSIE_CONFIG,

  EXTEMPORANE_STAT: [
    {
      type: 'group',
      label: 'INTERVENTION EN COURS',
      fields: [
        { keys: ['extChirurgien', 'chirurgien'], label: 'Chirurgien en salle' },
        { keys: ['extIntervention'], label: "Type d'intervention chirurgicale en cours" },
        { keys: ['extNature', 'nature'], label: 'Nature du prélèvement' },
        { keys: ['extOrgane', 'organe'], label: 'Organe / Site anatomique prélevé' },
      ],
    },
    {
      type: 'group',
      label: 'QUESTION & PLANIFICATION',
      fields: [
        { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' },
        { keys: ['extQuestion'], label: 'Question clinique posée au pathologiste' },
        { keys: ['extHeure'], label: 'Heure' },
        { keys: ['extDatePrevue'], label: 'Date prévue', date: true },
      ],
    },
  ],
};

const GENERIC_CONFIG: ContentBlock[] = [
  { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
  { type: 'field', field: { keys: ['note'], label: 'Note complémentaire' } },
];

function typeOf(request: PrescriptionLike): string {
  return (request as { typeExamen?: string }).typeExamen ?? '';
}

function formatDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return value;
}

function readValue(raw: Record<string, any>, details: Record<string, any>, field: ContentField): string {
  for (const key of field.keys) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) {
      const v = value.trim();
      return field.date ? formatDate(v) : v;
    }
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function readOtherValue(raw: Record<string, any>, details: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Ajoute un champ affiché si renseigné ; sélect « Autre » remplacé par la
 *  valeur saisie dans le champ de précision (otherKeys). Utilisé pour les
 *  champs isolés comme pour ceux à l'intérieur d'un groupe. */
function pushField(out: FieldEntry[], raw: Record<string, any>, details: Record<string, any>, field: ContentField): void {
  let value = readValue(raw, details, field);
  if (value === '') return;
  if (field.otherKeys && value.toLowerCase() === 'autre') {
    const other = readOtherValue(raw, details, field.otherKeys);
    if (other) value = other;
  }
  out.push({ label: field.label, value });
}

/** Champs du contenu de la prescription, dans l'ordre du formulaire, libellés en clair. */
export function contentEntriesOf(request: PrescriptionLike): FieldEntry[] {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  const config = CONTENT_CONFIG[typeOf(request)] ?? GENERIC_CONFIG;
  const out: FieldEntry[] = [];

  for (const block of config) {
    if (block.type === 'group') {
      const groupFields: FieldEntry[] = [];
      for (const field of block.fields) {
        pushField(groupFields, raw, details, field);
      }
      if (groupFields.length > 0) {
        out.push({ group: block.label, label: '', value: '' });
        out.push(...groupFields);
      }
    } else {
      pushField(out, raw, details, block.field);
    }
  }

  // Renseignements cliniques portés par la prescription elle-même (champ de
  // niveau prescription du service Prescription) si la demande n'en porte pas.
  if (!out.some((e) => e.label === 'Renseignements cliniques')) {
    const renseg = String(
      (request.metadata?.renseignements as string) ?? '',
    ).trim();
    if (renseg) out.push({ label: 'Renseignements cliniques', value: renseg });
  }

  return out;
}

/** Site de prélèvement : valeur stockée par le backend, sinon dérivée du contenu
 *  reçu (nature du liquide pour un LIQUIDE, organe/siège sinon). Aucun site pour
 *  une FCV / Pap test : ce type n'a pas d'option de prélèvement. */
export function siteOf(request: PrescriptionLike): string {
  if (request.prelevement?.site?.trim()) return request.prelevement.site.trim();
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  const read = (...keys: string[]): string => {
    for (const key of keys) {
      const value = details[key] ?? raw[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  if (typeOf(request) === 'LIQUIDE') {
    const nature = read('liqNat', 'type_liquide');
    // Sélect « Autre » : la valeur de précision est la vraie nature.
    return nature.toLowerCase() === 'autre' ? read('liqNatAutre') || nature : nature;
  }
  return read('cytoSiege', 'siege', 'cytoOrgane', 'organe', 'bioOrgane', 'extOrgane');
}
