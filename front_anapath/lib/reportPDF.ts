import { formatDate, formatDateTime } from './dateFormat';
import { getTypeLabel } from './generatePDF';
import { escapeHtml, renderHtmlToPdf } from './pdfUtils';
import { PENDING_STATUSES } from './statusLabels';

export interface ReportPdfRequestRow {
  anapathId: string;
  patientId: string;
  typeExamen: string;
  typeLabel: string;
  statut: string;
  statutLabel: string;
  prescriber: string;
  createdAt: string;
}

export interface ReportPdfData {
  period: 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'custom';
  periodLabel: string;
  stats: {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    monthlyData: { month: string; count: number }[];
    tatMoyen: number;
  };
  weekly: {
    weekLabel: string;
    total: number;
    validated: number;
    pending: number;
    avgDelay: number;
    dailyVolume: { day: string; count: number }[];
    requests: ReportPdfRequestRow[];
  };
  allRequests: ReportPdfRequestRow[];
  weeklyOnly?: boolean;
  filteredMonthlyData?: { month: string; count: number }[];
}

function tableHtml(headers: string[], rows: string[][]): string {
  const head = headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('');
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Le rapport ne contient que l'essentiel : indicateurs clés, volume mensuel
// et répartition par type d'examen — pas de liste d'examens ni de sous-rapport
// hebdomadaire, pour rester court et lisible.
function buildReportHtml(data: ReportPdfData): string {
  const { stats, periodLabel, filteredMonthlyData } = data;
  const generatedAt = formatDateTime(new Date());
  const monthlyRows = (filteredMonthlyData ?? stats.monthlyData).map(
    (m) => [m.month, `${m.count}`],
  );

  const typeRows = Object.entries(stats.byType).map(([type, count]) => {
    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
    return [getTypeLabel(type), `${count}`, `${pct}%`];
  });

  const pending = PENDING_STATUSES.reduce(
    (sum, status) => sum + (stats.byStatus[status] || 0),
    0,
  );

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
body{font-family:'Times New Roman',Times,serif;font-size:11px;color:#000;width:794px;background:white;}
.page{width:794px;padding:12px;}
h1{font-size:16px;text-align:center;color:#00478d;} h2{font-size:12px;text-align:center;color:#555;font-weight:normal;margin-bottom:16px;}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10px;}
th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
th{background:#e8edf5;font-weight:bold;}
.section{background:#1a3a5c;color:white;padding:4px 8px;font-weight:bold;margin:14px 0 6px;font-size:12px;}
.kpi{display:flex;justify-content:space-around;border:1px solid #ccc;padding:10px;margin-bottom:14px;}
.kpi div{text-align:center;} .kpi .v{font-size:20px;font-weight:bold;color:#00478d;}
.kpi .l{font-size:9px;color:#666;text-transform:uppercase;}
.footer{margin-top:20px;font-size:8px;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:6px;}
</style></head><body><div class="page">
<h1>RAPPORT D'ACTIVITÉ — SERVICE D'ANATOMIE PATHOLOGIQUE</h1>
<h2>${escapeHtml(periodLabel)}</h2>

<div class="section">Indicateurs clés</div>
<div class="kpi">
  <div><div class="v">${stats.total}</div><div class="l">Total examens</div></div>
  <div><div class="v">${stats.byStatus['VALIDE'] || 0}</div><div class="l">Validés</div></div>
  <div><div class="v">${pending}</div><div class="l">En attente</div></div>
  <div><div class="v">${stats.tatMoyen.toFixed(1)} j</div><div class="l">Délai moyen</div></div>
</div>

<div class="section">Volume mensuel</div>
${tableHtml(['Mois', "Nombre d'examens"], monthlyRows)}

<div class="section">Répartition par type d'examen</div>
${tableHtml(["Type d'examen", 'Nombre', 'Pourcentage'], typeRows)}

<div class="footer">Document généré le ${escapeHtml(generatedAt)} — CHU Andrainjato — Service d'Anatomie Pathologique</div>
</div></body></html>`;
}

export async function generateReportPDF(data: ReportPdfData): Promise<void> {
  const html = buildReportHtml(data);
  const dateSlug = formatDate(new Date()).replace(/\//g, '-');
  const filename = `Rapport-Anapath-${dateSlug}.pdf`;
  await renderHtmlToPdf(html, filename, 1600);
}
