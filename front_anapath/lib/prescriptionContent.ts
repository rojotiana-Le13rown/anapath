import { rawDataOf, detailsOf, type PrescriptionLike } from '@/lib/prescriptionFields';

/**
 * Affichage du contenu d'une prescription, type d'examen par type d'examen.
 *
 * L'ordre des champs reproduit EXACTEMENT l'ordre du formulaire du service
 * Prescription (HTML de référence). Les libellés sont ceux du formulaire.
 * Les valeurs sont celles réellement envoyées (Swagger / payloads réels) :
 * aucun libellé technique (fcv*, cyto*, bio*…) n'est affiché, aucune valeur
 * n'est inventée, aucune clé hors formulaire du type (ex. bioDatePrelev dans
 * une FCV) n'est montrée.
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
  { type: 'field', field: { keys: ['bioDatePrelev'], label: 'Date du prélèvement', date: true } },
  { type: 'field', field: { keys: ['bioFixateur', 'fixateur'], label: 'Fixateur', otherKeys: ['bioFixateurAutre'] } },
  { type: 'field', field: { keys: ['bioOrgane', 'organe'], label: 'Organe(s) / site anatomique' } },
  { type: 'field', field: { keys: ['localisation'], label: 'Localisation' } },
  { type: 'field', field: { keys: ['bioNature', 'nature'], label: 'Nature du prélèvement', otherKeys: ['bioNatureAutre'] } },
  { type: 'field', field: { keys: ['bioSuspicion', 'suspicion'], label: 'Suspicion diagnostique' } },
  { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
  { type: 'field', field: { keys: ['bioNote', 'note'], label: 'Note complémentaire' } },
  { type: 'field', field: { keys: ['bioExamAnt'], label: 'Examen(s) antérieur(s)' } },
  { type: 'field', field: { keys: ['bioResAnt'], label: 'Résultat(s)' } },
  { type: 'field', field: { keys: ['bioGPA'], label: 'GPA (si applicable)' } },
  { type: 'field', field: { keys: ['bioDDR'], label: 'DDR (si applicable)', date: true } },
  { type: 'field', field: { keys: ['bioMeno'], label: 'Ménopause' } },
  { type: 'field', field: { keys: ['bioAtcd'], label: 'Autres antécédents personnels / familiaux' } },
  { type: 'field', field: { keys: ['bioFaitLe', 'faitLe'], label: 'Fait le', date: true } },
];

const CONTENT_CONFIG: Record<string, ContentBlock[]> = {
  FCV_PAP: [
    { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
    { type: 'field', field: { keys: ['fcvNote', 'note'], label: 'Note complémentaire' } },
    { type: 'field', field: { keys: ['fcvGPA', 'gpa'], label: 'GPA' } },
    { type: 'field', field: { keys: ['fcvDDR', 'ddr'], label: 'DDR', date: true } },
    { type: 'field', field: { keys: ['fcvMeno'], label: 'MENOPAUSE' } },
    { type: 'field', field: { keys: ['fcvMenarche'], label: 'AGE DE LA MENARCHE' } },
    { type: 'field', field: { keys: ['fcvRapport'], label: 'Âge du 1er rapport sexuel' } },
    { type: 'field', field: { keys: ['fcvContra'], label: 'CONTRACEPTION' } },
    { type: 'field', field: { keys: ['fcvTtt'], label: 'TRAITEMENT EN COURS' } },
    { type: 'field', field: { keys: ['etat_col'], label: 'État du col' } },
    { type: 'field', field: { keys: ['service'], label: 'Service' } },
    { type: 'field', field: { keys: ['papResultat'], label: 'Résultat du dernier frottis / PAP' } },
    {
      type: 'group',
      label: 'EXAMEN PAP TEST ANTERIEUR',
      fields: [
        { keys: ['fcvPapLieu'], label: 'Lieu' },
        { keys: ['fcvPapNb'], label: 'Nombre de fois' },
        { keys: ['fcvPapDate'], label: 'Date', date: true },
        { keys: ['fcvPapRes'], label: 'Résultat' },
      ],
    },
    { type: 'field', field: { keys: ['fcvAtcd'], label: 'Autres antécédents personnels et familiaux' } },
  ],

  CYT0PONCTION: [
    {
      type: 'group',
      label: 'PRÉLÈVEMENT',
      fields: [
        { keys: ['cytoSiege', 'siege'], label: 'Siège de la ponction' },
        { keys: ['cytoOrgane', 'organe'], label: 'Organe' },
        { keys: ['cytoFix', 'fixateur'], label: 'Fixateur', otherKeys: ['cytoFixAutre'] },
        { keys: ['service'], label: 'Service' },
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
    { type: 'field', field: { keys: ['liqNat', 'type_liquide'], label: 'Nature du liquide', otherKeys: ['liqNatAutre'] } },
    { type: 'field', field: { keys: ['volume'], label: 'Volume (ml)' } },
    { type: 'field', field: { keys: ['bioDatePrelev'], label: 'Date du prélèvement', date: true } },
    { type: 'field', field: { keys: ['liqNotes', 'note'], label: 'Note complémentaire' } },
    { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
    { type: 'field', field: { keys: ['bioFaitLe', 'faitLe'], label: 'Fait le', date: true } },
  ],

  BIOPSIE: BIOPSIE_CONFIG,
  POS: BIOPSIE_CONFIG,
  POC: BIOPSIE_CONFIG,

  EXTEMPORANE_STAT: [
    { type: 'field', field: { keys: ['extChirurgien', 'chirurgien'], label: 'Chirurgien en salle' } },
    { type: 'field', field: { keys: ['extIntervention'], label: "Type d'intervention chirurgicale en cours" } },
    { type: 'field', field: { keys: ['extNature', 'nature'], label: 'Nature du prélèvement' } },
    { type: 'field', field: { keys: ['extOrgane', 'organe'], label: 'Organe / site anatomique prélevé' } },
    { type: 'field', field: { keys: ['urgence_chirurgicale'], label: 'Urgence chirurgicale' } },
    { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
    { type: 'field', field: { keys: ['extQuestion'], label: 'Question clinique posée au pathologiste' } },
    { type: 'field', field: { keys: ['extDatePrevue'], label: 'Date prévue', date: true } },
    { type: 'field', field: { keys: ['extHeure'], label: 'Heure' } },
    { type: 'field', field: { keys: ['bioFaitLe', 'faitLe'], label: 'Fait le', date: true } },
  ],
};

const GENERIC_CONFIG: ContentBlock[] = [
  { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
  { type: 'field', field: { keys: ['note'], label: 'Note complémentaire' } },
];

/** Clés techniques jamais affichées dans le bloc « champs supplémentaires ». */
const TECHNICAL_KEYS = new Set([
  'id', '_id', 'prescriptionId', 'demandeId', 'patientId', 'typeExamen',
  'statut', 'motifRefus', 'createdAt', 'updatedAt', 'renseignementsCliniques',
]);

/** Libellé lisible pour une clé technique : préfixes de type retirés
 *  (bioFaitLe → « Fait Le »), camelCase / snake_case → mots capitalisés. */
function humanizeKey(key: string): string {
  const stripped = key.replace(/^(bio|fcv|cyto|ext|liq|pap)(?=[A-Z])/, '');
  const words = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
        const value = readValue(raw, details, field);
        if (value !== '') groupFields.push({ label: field.label, value });
      }
      if (groupFields.length > 0) {
        out.push({ group: block.label, label: '', value: '' });
        out.push(...groupFields);
      }
    } else {
      let value = readValue(raw, details, block.field);
      if (value !== '') {
        // Sélect « Autre » : on affiche la valeur saisie dans le champ de précision.
        if (block.field.otherKeys && value.toLowerCase() === 'autre') {
          const other = readOtherValue(raw, details, block.field.otherKeys);
          if (other) value = other;
        }
        out.push({ label: block.field.label, value });
      }
    }
  }

  // Filet de sécurité : tout champ saisi non couvert par la configuration est
  // affiché aussi — aucune information saisie côté service Prescription n'est
  // perdue à l'écran.
  const covered = new Set<string>();
  for (const block of config) {
    if (block.type === 'field') {
      for (const key of block.field.keys) covered.add(key);
      for (const key of block.field.otherKeys ?? []) covered.add(key);
    } else {
      for (const field of block.fields) {
        for (const key of field.keys) covered.add(key);
      }
    }
  }
  const extras: { key: string; value: string }[] = [];
  const sources: Record<string, any>[] = [details, raw];
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (covered.has(key) || TECHNICAL_KEYS.has(key)) continue;
      if (typeof value === 'string' && value.trim()) {
        const v = value.trim();
        extras.push({ key, value: /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v });
      } else if (typeof value === 'boolean') {
        extras.push({ key, value: value ? 'Oui' : 'Non' });
      } else if (typeof value === 'number') {
        extras.push({ key, value: String(value) });
      }
    }
  }
  const seen = new Set<string>();
  for (const extra of extras) {
    if (seen.has(extra.key)) continue;
    seen.add(extra.key);
    out.push({ label: humanizeKey(extra.key), value: extra.value });
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

/** Site de prélèvement : valeur stockée par le backend, sinon dérivée du contenu reçu. */
export function siteOf(request: PrescriptionLike): string {
  if (request.prelevement?.site?.trim()) return request.prelevement.site.trim();
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  for (const key of ['cytoSiege', 'siege', 'bioOrgane', 'organe', 'extOrgane']) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
