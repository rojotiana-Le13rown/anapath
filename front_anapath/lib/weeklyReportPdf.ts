import {
  getMondayOfWeek,
  formatWeekLabel,
  isDateInWeek,
  getDailyVolumeForWeek,
} from './weekUtils';
import { statusLabels } from './statusLabels';
import { getServiceDisplayName } from './serviceDisplay';
import { getTypeLabel } from './generatePDF';
import { generateReportPDF, type ReportPdfData } from './reportPDF';

export interface WeeklyReportRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  validatedAt: string | null;
  episodeId?: string | null;
}

function computeCoreStats(data: WeeklyReportRequest[]): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  tatMoyen: number;
} {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  data.forEach((req) => {
    byType[req.typeExamen] = (byType[req.typeExamen] || 0) + 1;
    byStatus[req.statut] = (byStatus[req.statut] || 0) + 1;
  });

  const validatedRequests = data.filter(
    (req) => req.validatedAt && req.statut === 'VALIDE',
  );
  let tatMoyen = 0;
  if (validatedRequests.length > 0) {
    const totalDays = validatedRequests.reduce((sum, req) => {
      const created = new Date(req.createdAt);
      const validated = new Date(req.validatedAt!);
      return sum + (validated.getTime() - created.getTime()) / (1000 * 3600 * 24);
    }, 0);
    tatMoyen = totalDays / validatedRequests.length;
  }

  return { total: data.length, byType, byStatus, tatMoyen };
}

/** Génère et télécharge automatiquement le PDF du rapport hebdomadaire (semaine en cours). */
export async function generateWeeklyReportPDF(
  requests: WeeklyReportRequest[],
): Promise<void> {
  const weekStart = getMondayOfWeek(new Date());
  const weeklyRequests = requests
    .filter((req) => isDateInWeek(req.createdAt, weekStart))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const weeklyValidated = weeklyRequests.filter((r) => r.statut === 'VALIDE');
  const weeklyPending = weeklyRequests.filter(
    (r) => r.statut === 'CREEE' || r.statut === 'EN_ATTENTE' || r.statut === 'EN_COURS',
  );
  let weeklyAvgDelay = 0;
  if (weeklyValidated.length > 0) {
    const totalDays = weeklyValidated.reduce((sum, req) => {
      if (!req.validatedAt) return sum;
      const created = new Date(req.createdAt);
      const validated = new Date(req.validatedAt);
      return sum + (validated.getTime() - created.getTime()) / (1000 * 3600 * 24);
    }, 0);
    weeklyAvgDelay = totalDays / weeklyValidated.length;
  }

  const weeklyLabel = formatWeekLabel(weekStart);
  const mapToReportRow = (req: WeeklyReportRequest) => ({
    anapathId: req.anapathId,
    patientId: req.patientId,
    typeExamen: req.typeExamen,
    typeLabel: getTypeLabel(req.typeExamen),
    statut: req.statut,
    statutLabel: statusLabels[req.statut] || req.statut,
    prescriber: getServiceDisplayName({ episodeId: req.episodeId }),
    createdAt: req.createdAt,
  });

  const data: ReportPdfData = {
    period: 'week',
    periodLabel: `Rapport hebdomadaire : semaine du ${weeklyLabel}`,
    stats: { ...computeCoreStats(requests), monthlyData: [] },
    filteredMonthlyData: [],
    weekly: {
      weekLabel: weeklyLabel,
      total: weeklyRequests.length,
      validated: weeklyValidated.length,
      pending: weeklyPending.length,
      avgDelay: weeklyAvgDelay,
      dailyVolume: getDailyVolumeForWeek(weeklyRequests, weekStart),
      requests: weeklyRequests.map(mapToReportRow),
    },
    allRequests: requests.map(mapToReportRow),
    weeklyOnly: true,
  };

  await generateReportPDF(data);
}
