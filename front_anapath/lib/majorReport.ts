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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return '';
  }
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
        || r.anapathId
        || '—';
      return {
        service: '',
        numero: '',
        nom,
        age: info.age != null ? String(info.age) : '',
        sexe: formatSexe(info.sexe),
        dateReception: formatDate(r.createdAt),
        examen: '',
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

/** Exporte le rapport (2 tableaux) en fichier Excel (.xlsx). */
export async function exportMajorReportExcel(
  requests: MajorRequest[],
  periodeLabel: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws1 = XLSX.utils.aoa_to_sheet(tableau1Grid(buildTableau1(requests)));
  ws1['!cols'] = [
    { wch: 34 }, { wch: 14 }, { wch: 12 }, { wch: 6 },
    { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 12 },
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(tableau2Grid(buildTableau2(requests)));
  ws2['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 28 }, { wch: 9 },
    { wch: 6 }, { wch: 16 }, { wch: 26 }, { wch: 20 },
    { wch: 16 }, { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'VOLET ACTIVITÉ');
  XLSX.utils.book_append_sheet(wb, ws2, 'PRISE EN CHARGE');

  const safe = periodeLabel.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
  XLSX.writeFile(wb, `Rapport-ANAPATH-${safe}.xlsx`);
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
  <div class="muted">TOTAL (auto) : PEC = ${total.pec} · RÉSULTATS EN COURS = ${total.enCours}.
  Les colonnes vides (EXTERNE, HOSP, DÉMUNI, POSITIFS, RECETTE DAAF) sont à compléter par le major.</div>

  <div class="section-title">PRISE EN CHARGE (PIVOT, ASSOCIATION MANAMPY…….)</div>
  <table>
    <thead><tr>${PRISE_EN_CHARGE_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t2Rows}</tbody>
  </table>
  <div class="muted">Patients de la période. Colonnes vides à compléter par le major (SERVICE, N°/NOMBRE, EXAMEN, RÉSULTATS, OBSERVATION).</div>

  <div style="margin-top:16px;text-align:center;font-size:8px;color:#666;border-top:1px solid #ccc;padding-top:6px;">
    Document généré le ${escapeHtml(new Date().toLocaleString('fr-FR', { hour12: false }))}
    — Service d'Anatomie et Cytologie Pathologiques — CHU Andrainjato
  </div>
</div>
</body></html>`;

  const safe = periodeLabel.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
  await renderHtmlToPdf(html, `Rapport-ANAPATH-${safe}.pdf`, 1400);
}
