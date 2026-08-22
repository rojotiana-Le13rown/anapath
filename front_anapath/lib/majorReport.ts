/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rapport hebdomadaire officiel du major (modèle CHU — document Word
 * « ANAPATH DU 20 AU 26 AVRIL 2026 »). Seuls les 2 premiers volets sont repris :
 *   - VOLET ACTIVITÉ (tableau 1) : lignes par type d'examen, colonnes auto
 *     (PEC = examens pris en charge, RÉSULTATS EN COURS) + colonnes laissées
 *     vides (le major remplit : EXTERNE, HOSP, DÉMUNI, POSITIFS, RECETTE DAAF).
 *   - PRISE EN CHARGE (tableau 2) : un patient par ligne, colonnes auto
 *     (NOM, ÂGE, SEXE, DATE DE RÉCEPTION), le reste vide pour le major.
 */

import { PENDING_STATUSES } from './statusLabels';
import { escapeHtml, renderHtmlToPdf } from './pdfUtils';

export interface MajorRequest {
  anapathId?: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  patientInfo?: {
    nomComplet?: string | null;
    nom?: string | null;
    prenom?: string | null;
    sexe?: string | null;
    age?: number | null;
    dateNaissance?: string | null;
  } | null;
}

/** Lignes fixes du tableau 1 — chaque ligne référence les types du système. */
export const ACTIVITE_ROWS: { label: string; types: string[] }[] = [
  { label: 'Prélèvements biopsiques', types: ['BIOPSIE'] },
  { label: 'FVC (Frottis Cervico - Vaginal)', types: ['FCV_PAP'] },
  { label: 'Cytoponction', types: ['CYT0PONCTION'] },
  { label: 'Examens Anatomo - pathologiques', types: ['POS', 'POC', 'EXTEMPORANE_STAT'] },
  { label: 'Prélèvements autres liquides que LCR', types: ['LIQUIDE'] },
  // Lignes manuelles : le major note dedans, le système les laisse vides.
  { label: 'Analyse non disponible', types: [] },
  { label: 'Résultats non satisfaisant', types: [] },
];

export const ACTIVITE_HEADERS = [
  "TYPES D'EXAMENS",
  'NOMBRE EXTERNE',
  'NOMBRE HOSP',
  'PEC',
  'DÉMUNI',
  'RÉSULTATS POSITIFS OU PATHOLOGIQUES',
  'RÉSULTATS EN COURS',
  'RECETTE DAAF',
];

export const PRISE_EN_CHARGE_HEADERS = [
  'SERVICE',
  'N°/NOMBRE',
  'NOM ET PRÉNOMS',
  'Age(ans)',
  'Sexe',
  'DATE DE RÉCEPTION',
  'EXAMEN',
  'RÉSULTATS PATHOLOGIQUES',
  'RÉSULTATS EN COURS',
  'OBSERVATION',
];

export interface Tableau1Row {
  label: string;
  pec: number; // auto : examens pris en charge (toutes les demandes acceptées)
  enCours: number; // auto : statuts non clôturés
  // Colonnes vides (le major remplit) :
  externe: string;
  hosp: string;
  demuni: string;
  positifs: string;
  recette: string;
}

export interface Tableau2Row {
  service: string;
  numero: string;
  nom: string;
  age: string;
  sexe: string;
  dateReception: string;
  examen: string;
  resultatsPathologiques: string;
  resultatsEnCours: string;
  observation: string;
}

function isEnCours(statut: string): boolean {
  return PENDING_STATUSES.includes(statut);
}

function formatSexe(sexe?: string | null): string {
  if (sexe === 'MALE' || sexe === 'M' || sexe === 'Homme') return 'M';
  if (sexe === 'FEMALE' || sexe === 'F' || sexe === 'Femme') return 'F';
  return '';
}

function calcAgeFromDate(d: string): number {
  const b = new Date(d), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() - b.getMonth() < 0
    || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return '';
  }
}

/** Libellé du type d'examen tel qu'affiché dans le modèle CHU (tableaux 1 et 2). */
export function getExamenLabel(typeExamen: string): string {
  const row = ACTIVITE_ROWS.find((r) => r.types.includes(typeExamen));
  return row?.label ?? typeExamen.replace(/_/g, ' ');
}

/** Construit les lignes du tableau 1 pour une période donnée. */
export function buildTableau1(requests: MajorRequest[]): Tableau1Row[] {
  return ACTIVITE_ROWS.map((row) => {
    const match = requests.filter(
      (r) => row.types.length === 0 || row.types.includes(r.typeExamen),
    );
    return {
      label: row.label,
      pec: row.types.length === 0 ? 0 : match.length,
      enCours: row.types.length === 0 ? 0 : match.filter((r) => isEnCours(r.statut)).length,
      externe: '',
      hosp: '',
      demuni: '',
      positifs: '',
      recette: '',
    };
  });
}

/** Total du tableau 1 (somme des colonnes auto). */
export function tableau1Total(rows: Tableau1Row[]): { pec: number; enCours: number } {
  return rows.reduce(
    (acc, r) => ({ pec: acc.pec + r.pec, enCours: acc.enCours + r.enCours }),
    { pec: 0, enCours: 0 },
  );
}

/** Construit les lignes du tableau 2 (un patient/examen par ligne, trié par date). */
export function buildTableau2(requests: MajorRequest[]): Tableau2Row[] {
  return [...requests]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((r) => {
      const info = r.patientInfo ?? {};
      const nom = info.nomComplet
        || [info.nom, info.prenom].filter(Boolean).join(' ')
        || '';
      return {
        service: '',
        numero: '',
        nom,
        age: info.age != null
          ? String(info.age)
          : info.dateNaissance
            ? String(calcAgeFromDate(info.dateNaissance))
            : '',
        sexe: formatSexe(info.sexe),
        dateReception: formatDate(r.createdAt),
        examen: getExamenLabel(r.typeExamen),
        resultatsPathologiques: '',
        resultatsEnCours: '',
        observation: '',
      };
    });
}

/** Grille complète du tableau 1 (en-tête + lignes + TOTAL) pour Excel/PDF. */
export function tableau1Grid(rows: Tableau1Row[]): string[][] {
  const total = tableau1Total(rows);
  const grid = [ACTIVITE_HEADERS];
  rows.forEach((r) => {
    grid.push([
      r.label,
      r.externe,
      r.hosp,
      r.pec > 0 ? String(r.pec) : '',
      r.demuni,
      r.positifs,
      r.enCours > 0 ? String(r.enCours) : '',
      r.recette,
    ]);
  });
  grid.push([
    'TOTAL',
    '',
    '',
    total.pec > 0 ? String(total.pec) : '',
    '',
    '',
    total.enCours > 0 ? String(total.enCours) : '',
    '',
  ]);
  return grid;
}

/** Grille complète du tableau 2 (en-tête + lignes). */
export function tableau2Grid(rows: Tableau2Row[]): string[][] {
  const grid = [PRISE_EN_CHARGE_HEADERS];
  rows.forEach((r) => {
    grid.push([
      r.service,
      r.numero,
      r.nom,
      r.age,
      r.sexe,
      r.dateReception,
      r.examen,
      r.resultatsPathologiques,
      r.resultatsEnCours,
      r.observation,
    ]);
  });
  return grid;
}

/**
 * Exporte le rapport (2 tableaux) en fichier Excel (.xlsx), stylé comme le PDF
 * (titre, volets, en-têtes colorés, bordures) et entièrement modifiable ensuite.
 */
export async function exportMajorReportExcel(
  requests: MajorRequest[],
  periodeLabel: string,
): Promise<void> {
  const mod = await import('exceljs');
  const ExcelJS = (mod as any).default ?? mod;

  const t1 = buildTableau1(requests);
  const t2 = buildTableau2(requests);
  const total = tableau1Total(t1);

  const FONT = 'Times New Roman';
  const BORDER: any = {
    top: { style: 'thin', color: { argb: 'FF8C8C8C' } },
    left: { style: 'thin', color: { argb: 'FF8C8C8C' } },
    bottom: { style: 'thin', color: { argb: 'FF8C8C8C' } },
    right: { style: 'thin', color: { argb: 'FF8C8C8C' } },
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Service d’Anatomie et Cytologie Pathologiques';
  workbook.created = new Date();
  const ws = workbook.addWorksheet('Rapport hebdomadaire');

  [32, 13, 26, 9, 11, 21, 18, 14, 16, 20].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // Titre
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = 'RAPPORT HEBDOMADAIRE DU SERVICE ANATOMIE ET CYTOLOGIE PATHOLOGIQUES';
  title.font = { name: FONT, size: 14, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:H2');
  const sub = ws.getCell('A2');
  sub.value = 'CHU Andrainjato Fianarantsoa';
  sub.font = { name: FONT, size: 11 };
  sub.alignment = { horizontal: 'center' };

  ws.mergeCells('A3:H3');
  const dateCell = ws.getCell('A3');
  dateCell.value = `DATE : ${periodeLabel}`;
  dateCell.font = { name: FONT, size: 11, bold: true };
  dateCell.alignment = { horizontal: 'center' };

  /** Applique le style d'une ligne de grille (en-tête, données ou TOTAL). */
  const writeGrid = (
    grid: string[][],
    nbCols: number,
    centerCols: number[],
  ) => {
    grid.forEach((rowArr, idx) => {
      const row = ws.addRow(rowArr);
      const isHeader = idx === 0;
      const isTotal = idx === grid.length - 1;
      row.eachCell((cell: any) => {
        cell.border = BORDER;
        cell.font = { name: FONT, size: 10, bold: isHeader || isTotal };
        const col = cell.col;
        cell.alignment = {
          horizontal: centerCols.includes(col) ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        if (isHeader) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8EDF5' },
          };
        } else if (isTotal) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' },
          };
        }
      });
      row.height = isHeader ? 24 : 18;
    });
  };

  const sectionTitle = (text: string, nbCols: number) => {
    const r = ws.rowCount + 1;
    ws.mergeCells(r, 1, r, nbCols);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 12, bold: true };
    return r;
  };

  const mutedNote = (text: string, nbCols: number) => {
    const r = ws.rowCount + 1;
    ws.mergeCells(r, 1, r, nbCols);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 9, italic: true, color: { argb: 'FF808080' } };
    return r;
  };

  // ===== VOLET ACTIVITÉ =====
  sectionTitle('VOLET ACTIVITÉ', 8);
  writeGrid(tableau1Grid(t1), 8, [2, 3, 4, 5, 6, 7, 8]);
  // ===== PRISE EN CHARGE =====
  sectionTitle('PRISE EN CHARGE (PIVOT, ASSOCIATION MANAMPY…….)', 10);
  writeGrid(tableau2Grid(t2), 10, [2, 4, 5, 6]);

  // Pied de page (même mention que le PDF)
  const footRow = ws.rowCount + 2;
  ws.mergeCells(footRow, 1, footRow, 10);
  const foot = ws.getCell(footRow, 1);
  foot.value =
    `Document généré le ${new Date().toLocaleString('fr-FR', { hour12: false })}` +
    " — Service d'Anatomie et Cytologie Pathologiques — CHU Andrainjato";
  foot.font = { name: FONT, size: 8, color: { argb: 'FF808080' } };
  foot.alignment = { horizontal: 'center' };

  const safe = periodeLabel.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rapport-ANAPATH-${safe}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exporte le rapport (2 tableaux) en PDF (modèle CHU). */
export async function exportMajorReportPDF(
  requests: MajorRequest[],
  periodeLabel: string,
): Promise<void> {
  const t1 = buildTableau1(requests);
  const t2 = buildTableau2(requests);
  const total = tableau1Total(t1);

  const t1Rows = tableau1Grid(t1)
    .map((row, i) => {
      const isTotal = i === tableau1Grid(t1).length - 1;
      const cells = row
        .map((c) => `<td style="${isTotal ? 'font-weight:bold;' : ''}">${escapeHtml(c)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const t2Rows =
    t2
      .map((r) =>
        `<tr>${[
          r.service, r.numero, r.nom, r.age, r.sexe,
          r.dateReception, r.examen, r.resultatsPathologiques,
          r.resultatsEnCours, r.observation,
        ]
          .map((c) => `<td>${escapeHtml(c)}</td>`)
          .join('')}</tr>`)
      .join('') ||
    '<tr><td colspan="10" style="text-align:center;color:#999;">Aucun examen sur cette période</td></tr>';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Times New Roman',Times,serif;font-size:11px;color:#000;width:794px;background:white;}
.page{width:794px;padding:16px;}
h1{font-size:15px;text-align:center;margin-bottom:2px;}
h2{font-size:11px;text-align:center;color:#333;margin-bottom:2px;}
.date{font-size:11px;text-align:center;margin-bottom:14px;font-weight:bold;}
.section-title{font-size:12px;font-weight:bold;margin:14px 0 6px;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5px;}
th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top;}
th{background:#e8edf5;font-weight:bold;}
.muted{color:#999;font-size:8.5px;}
</style></head><body>
<div class="page">
  <h1>RAPPORT HEBDOMADAIRE DU SERVICE ANATOMIE ET CYTOLOGIE PATHOLOGIQUES</h1>
  <h2>CHU Andrainjato Fianarantsoa</h2>
  <div class="date">DATE : ${escapeHtml(periodeLabel)}</div>

  <div class="section-title">VOLET ACTIVITÉ</div>
  <table>
    <thead><tr>${ACTIVITE_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t1Rows}</tbody>
  </table>

  <div class="section-title">PRISE EN CHARGE (PIVOT, ASSOCIATION MANAMPY…….)</div>
  <table>
    <thead><tr>${PRISE_EN_CHARGE_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t2Rows}</tbody>
  </table>

  <div style="margin-top:16px;text-align:center;font-size:8px;color:#666;border-top:1px solid #ccc;padding-top:6px;">
    Document généré le ${escapeHtml(new Date().toLocaleString('fr-FR', { hour12: false }))}
    — Service d'Anatomie et Cytologie Pathologiques — CHU Andrainjato
  </div>
</div>
</body></html>`;

  const safe = periodeLabel.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
  await renderHtmlToPdf(html, `Rapport-ANAPATH-${safe}.pdf`, 1400);
}
