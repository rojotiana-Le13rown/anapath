/* eslint-disable @typescript-eslint/no-explicit-any */

import { escapeHtml, renderHtmlToPdf } from './pdfUtils';

export async function generateWeeklyReportPDF(
  weekData: {
    lundi: string;
    dimanche: string;
    kpis: {
      total: number;
      valides: number;
      enAttente: number;
      delaiMoyen: string;
    };
    parJour: { jour: string; count: number }[];
    examens: any[];
  },
): Promise<void> {
  const joursRows = weekData.parJour.map((j) => `
    <tr>
      <td>${escapeHtml(j.jour)}</td>
      <td style="text-align:center;">${j.count}</td>
    </tr>`).join('');

  const examensRows = weekData.examens.map((e) => `
    <tr>
      <td>${escapeHtml(e.anapathId)}</td>
      <td>${escapeHtml(formatTypeExamen(e.typeExamen))}</td>
      <td>${escapeHtml(e.statutLabel ?? e.statut)}</td>
      <td>${escapeHtml(e.metadata?.prescripteurId ?? e.prescriber ?? '—')}</td>
      <td>${escapeHtml(new Date(e.createdAt).toLocaleDateString('fr-FR'))}</td>
    </tr>`).join('');

  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Times New Roman',Times,serif;
  font-size:11px;color:#000;width:794px;background:white;
}
.page{width:794px;padding:12px;}
h1{font-size:16px;text-align:center;margin-bottom:4px;}
h2{font-size:12px;text-align:center;color:#555;margin-bottom:16px;font-weight:normal;}
.kpi-grid{
  display:flex;justify-content:space-around;
  margin-bottom:16px;border:1px solid #ccc;padding:10px;
}
.kpi-item{text-align:center;}
.kpi-value{font-size:20px;font-weight:bold;color:#00478d;}
.kpi-label{font-size:9px;color:#666;text-transform:uppercase;}
table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;}
th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
th{background:#e8edf5;font-weight:bold;}
.section-title{
  font-size:12px;font-weight:bold;background:#1a3a5c;color:white;
  padding:4px 8px;margin-bottom:8px;
}
</style></head><body>
<div class="page">
  <h1>RAPPORT HEBDOMADAIRE D'ACTIVITÉ</h1>
  <h2>Semaine du ${escapeHtml(weekData.lundi)} au ${escapeHtml(weekData.dimanche)}
    — Service d'Anatomie Pathologique</h2>

  <div class="kpi-grid">
    <div class="kpi-item">
      <div class="kpi-value">${weekData.kpis.total}</div>
      <div class="kpi-label">Total examens</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-value">${weekData.kpis.valides}</div>
      <div class="kpi-label">Validés</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-value">${weekData.kpis.enAttente}</div>
      <div class="kpi-label">En attente</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-value">${escapeHtml(weekData.kpis.delaiMoyen)}</div>
      <div class="kpi-label">Délai moyen</div>
    </div>
  </div>

  <div class="section-title">Volume par jour</div>
  <table>
    <tr><th>Jour</th><th>Nombre d'examens</th></tr>
    ${joursRows}
  </table>

  <div class="section-title">Liste complète des examens de la semaine</div>
  <table>
    <tr>
      <th>ID PARA</th><th>Type</th>
      <th>Statut</th><th>Prescripteur</th><th>Date</th>
    </tr>
    ${examensRows || '<tr><td colspan="5" style="text-align:center;color:#999;">Aucun examen cette semaine</td></tr>'}
  </table>

  <div style="margin-top:16px;text-align:center;font-size:8px;color:#666;
    border-top:1px solid #ccc;padding-top:6px;">
    Document généré le ${escapeHtml(new Date().toLocaleString('fr-FR', { hour12: false }))}
    — Service d'Anatomie Pathologique — CHU Andrainjato
  </div>
</div>
</body></html>`;

  await renderHtmlToPdf(
    htmlContent,
    `Rapport-Hebdo-${weekData.lundi.replace(/\//g, '-')}.pdf`,
    1400,
  );
}

function formatTypeExamen(t: string): string {
  const m: Record<string, string> = {
    BIOPSIE: 'Biopsie', FCV_PAP: 'FCV / Pap test',
    CYT0PONCTION: 'Cytoponction', LIQUIDE: 'Liquide',
    POS: 'POS', POC: 'POC',
    EXTEMPORANE_STAT: 'Extemporané STAT',
  };
  return m[t] ?? t;
}
