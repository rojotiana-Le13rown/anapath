export type UrgenceLevel = 'STAT' | 'URGENTE' | 'NORMALE';

const URGENCE_PRIORITY: Record<UrgenceLevel, number> = {
  STAT: 0,
  URGENTE: 1,
  NORMALE: 2,
};

interface UrgenceAware {
  metadata?: Record<string, unknown> | null;
  isExtemporane?: boolean;
  createdAt?: string;
}

/** Degré d'urgence d'une demande : `metadata.urgence` fait foi, avec repli sur `isExtemporane` (STAT). */
export function getUrgenceLevel(req: UrgenceAware): UrgenceLevel {
  const raw = (req.metadata?.urgence as string | undefined)?.toUpperCase();
  if (raw === 'STAT' || raw === 'TRES_URGENT') return 'STAT';
  if (raw === 'URGENTE' || raw === 'URGENT') return 'URGENTE';
  if (raw === 'NORMALE' || raw === 'NORMAL') return 'NORMALE';
  return req.isExtemporane ? 'STAT' : 'NORMALE';
}

/** Trie par degré d'urgence (STAT > URGENTE > NORMALE), puis par heure d'arrivée (la plus ancienne d'abord). */
export function sortByUrgencyThenArrival<T extends UrgenceAware>(requests: T[]): T[] {
  return [...requests].sort((a, b) => {
    const pa = URGENCE_PRIORITY[getUrgenceLevel(a)];
    const pb = URGENCE_PRIORITY[getUrgenceLevel(b)];
    if (pa !== pb) return pa - pb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}
