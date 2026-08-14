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
  { type: 'field', field: { keys: ['bioFixateur', 'fixateur'], label: 'Fixateur' } },
  { type: 'field', field: { keys: ['bioOrgane', 'organe'], label: 'Organe(s) / site anatomique' } },
  { type: 'field', field: { keys: ['localisation'], label: 'Localisation' } },
  { type: 'field', field: { keys: ['bioNature', 'nature'], label: 'Nature du prélèvement' } },
  { type: 'field', field: { keys: ['bioNatureAutre'], label: 'Préciser la nature du prélèvement' } },
  { type: 'field', field: { keys: ['bioSuspicion', 'suspicion'], label: 'Suspicion diagnostique' } },
  { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
  { type: 'field', field: { keys: ['bioNote', 'note'], label: 'Note complémentaire' } },
  { type: 'field', field: { keys: ['bioExamAnt'], label: 'Examen(s) antérieur(s)' } },
  { type: 'field', field: { keys: ['bioResAnt'], label: 'Résultat(s)' } },
  { type: 'field', field: { keys: ['bioGPA'], label: 'GPA (si applicable)' } },
  { type: 'field', field: { keys: ['bioDDR'], label: 'DDR (si applicable)', date: true } },
  { type: 'field', field: { keys: ['bioMeno'], label: 'Ménopause' } },
  { type: 'field', field: { keys: ['bioAtcd'], label: 'Autres antécédents personnels / familiaux' } },
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
    { type: 'field', field: { keys: ['cytoSiege', 'siege'], label: 'Siège de la ponction' } },
    { type: 'field', field: { keys: ['cytoOrgane', 'organe'], label: 'Organe' } },
    { type: 'field', field: { keys: ['cytoFix', 'fixateur'], label: 'Fixateur' } },
    { type: 'field', field: { keys: ['cytoFixAutre'], label: 'Préciser le fixateur' } },
    { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
    { type: 'field', field: { keys: ['cytoNotes', 'note'], label: 'Note complémentaire' } },
  ],

  LIQUIDE: [
    { type: 'field', field: { keys: ['liqNat', 'type_liquide'], label: 'Nature du liquide' } },
    { type: 'field', field: { keys: ['liqNatAutre'], label: 'Préciser la nature du liquide' } },
    { type: 'field', field: { keys: ['volume'], label: 'Volume (ml)' } },
    { type: 'field', field: { keys: ['liqNotes', 'note'], label: 'Note complémentaire' } },
    { type: 'field', field: { keys: ['renseignementsCliniques'], label: 'Renseignements cliniques' } },
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
      const value = readValue(raw, details, block.field);
      if (value !== '') out.push({ label: block.field.label, value });
    }
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
