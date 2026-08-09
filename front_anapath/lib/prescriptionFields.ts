type Raw = Record<string, any>;

/** Données cliniques d'une prescription, sans le JSON brut dans metadata.rawData. */
export interface PrescriptionLike {
  prelevement?: {
    site?: string;
    description?: string;
    clinicalData?: {
      treatmentType?: string;
      suspicion?: string;
      clinicalNotes?: string;
    };
  } | null;
  metadata?: Record<string, any> | null;
}

export function rawDataOf(request: PrescriptionLike): Raw {
  const md = (request.metadata ?? {}) as Record<string, any>;
  const raw = (md.rawData ?? md.data ?? {}) as unknown;
  return raw && typeof raw === 'object' ? (raw as Raw) : {};
}

export function detailsOf(raw: Raw): Raw {
  const details = raw.details;
  return details && typeof details === 'object' ? (details as Raw) : {};
}

/** Lit une valeur dans rawData.details puis rawData (champs plats). */
function pickValue(raw: Raw, details: Raw, keys: string[]): string {
  for (const key of keys) {
    const value = details[key] ?? raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** Renseignements cliniques : libellé lisible depuis les données brutes de la prescription. */
export function getClinicalNotes(request: PrescriptionLike): string {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  return pickValue(raw, details, ['renseignementsCliniques', 'renseign', 'note', 'bioNote']);
}

/** Suspicion diagnostique : libellé lisible depuis les données brutes de la prescription. */
export function getSuspicion(request: PrescriptionLike): string {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  return pickValue(raw, details, ['suspicion', 'bioSuspicion']);
}

/** Type de traitement (rarement renseigné) : champ de la prescription, jamais le JSON brut. */
export function getTreatmentType(request: PrescriptionLike): string {
  return request.prelevement?.clinicalData?.treatmentType ?? '';
}

/** Valeur arbitraire dans rawData.details puis rawData (champs plats), repli booléen/nombre. */
export function val(request: PrescriptionLike, keys: string[]): string {
  const raw = rawDataOf(request);
  const details = detailsOf(raw);
  return pickValue(raw, details, keys);
}
