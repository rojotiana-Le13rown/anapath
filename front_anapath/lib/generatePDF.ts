/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  escapeHtml,
  loadImageAsBase64,
  renderHtmlToPdf,
} from './pdfUtils';
import { API_BASE } from './api';
import { getClinicalNotes, getSuspicion } from './prescriptionFields';

const FALLBACK_LOGO = '/assets/logo-chu.png';

/**
 * Logo du CHU de l'utilisateur connecté (dynamique, selon le CHU du token),
 * chargé via le proxy authentifié. Repli sur l'asset statique si indisponible.
 */
async function loadChuLogo(): Promise<string> {
  try {
    const res = await fetch('/api/session', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const logo: string | undefined = data?.chu?.logo;
      if (logo) {
        const b64 = await loadImageAsBase64(
          `${API_BASE}/anapath/files/${encodeURIComponent(logo)}`,
        );
        if (b64.startsWith('data:image')) return b64;
      }
    }
  } catch {
    // ignore -> fallback
  }
  return loadImageAsBase64(FALLBACK_LOGO);
}

const PERSONNEL = [
  { f: 'Chef de service', n: 'P. ANDRIAMAMPIONONA T. Francine' },
  { f: 'Chef de travaux', n: 'Dr LAZA Odilon' },
  { f: 'Spécialiste', n: 'Dr RAZAFIMAHEFA Joëlle' },
  { f: 'Interne qualifiant', n: '' },
  {
    f: 'Histotechnicien(ne)s',
    n: 'MILIARISOA Pergaudine, RAVONINTSALAMA Sarindra',
  },
  { f: 'Secrétaire', n: 'RAHERIMAMINIAINA Narison' },
  { f: "Personnel d'appui", n: 'RASOARIVONJY Nadia' },
];

export async function generatePDF(
  examen: any,
  patient: any,
): Promise<void> {
  const nomPatient = patient?.nomComplet
    ?? [patient?.nom, patient?.prenom].filter(Boolean).join(' ')
    ?? examen?.patientId ?? '—';
  const age = patient?.dateNaissance
    ? calcAge(patient.dateNaissance)
    : patient?.age ?? '—';
  const identifiant = examen?.patientId ?? '—';
  const typePrelevement = formatTypeExamen(examen?.typeExamen ?? '');
  const descPrelevement = examen?.prelevement?.description ?? '';
  const cd = examen?.prelevement?.clinicalData ?? {};
  const renseignementClinique = getClinicalNotes(examen)
    || cd.alertes
    || examen?.metadata?.alertes
    || (descPrelevement || '—');
  const suspicionDiagnostique = getSuspicion(examen) || cd.suspicion_diagnostique || '—';
  const prescripteur = examen?.metadata?.prescripteurNom
    ?? examen?.metadata?.prescripteurId ?? '—';
  const resultat = examen?.resultat?.details
    ?? examen?.resultatDetails ?? '';
  const conclusion = examen?.resultat?.conclusion
    ?? examen?.resultatConclusion ?? '';
  const diag = examen?.diagnosticCytoponction;
  const diagnosticHTML =
    diag?.sitePreleve || diag?.organe || diag?.fixation
      ? `
    <div style="border:1px solid #999;background:#eef7f7;padding:8px 10px;margin-bottom:10px;">
      <div class="box-title">DIAGNOSTIC ANTICIPÉ — CYTOPONCTION :</div>
      <div style="font-size:10.5px;line-height:1.5;">
        Site prélevé : <b>${escapeHtml(diag.sitePreleve ?? '—')}</b><br/>
        Organe concerné : <b>${escapeHtml(diag.organe ?? '—')}</b><br/>
        Fixation : <b>${escapeHtml(diag.fixation ?? '—')}</b>
      </div>
    </div>`
      : '';
  const signature = examen?.validatedBySignature ?? '';
  const numOrdre = examen?.validatedByUserId ?? '';
  const anapathId = examen?.anapathId ?? examen?.id ?? '—';
  const ippNumber = examen?.ippNumber ?? '';
  const dateAujourdhui = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const logoBase64 = await loadChuLogo();

  const personnelHTML = PERSONNEL.map((p) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:8.5px;font-style:italic;color:#333;
        text-transform:uppercase;letter-spacing:0.3px;">${p.f}</div>
      <div style="font-weight:bold;font-size:10px;color:#000;
        min-height:${p.n ? '14px' : '28px'};
        border-bottom:1px dotted #666;padding-bottom:2px;margin-top:2px;">
        ${p.n ? escapeHtml(p.n) : '&nbsp;'}
      </div>
    </div>`).join('');

  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Times New Roman',Times,serif;
  font-size:11px;color:#000;background:white;width:794px;
}
.page{width:794px;background:white;padding:8px 10px;}
.header{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:8px;
}
.logo-img{width:62px;height:62px;object-fit:contain;}
.header-center{text-align:center;flex:1;padding:0 8px;}
.republic{font-size:13px;letter-spacing:0.5px;}
.devise{font-size:10px;margin-top:2px;}
.titre-principal{
  text-align:center;font-size:13px;font-weight:bold;
  text-decoration:underline;margin:10px 0 12px;
  text-transform:uppercase;
}
.infos-patient{
  display:flex;justify-content:space-between;
  align-items:flex-start;margin-bottom:12px;position:relative;
}
.infos-left{flex:1;padding-right:12px;}
.infos-left p{font-size:11px;margin-bottom:5px;line-height:1.4;}
.underline-field{
  border-bottom:1px solid #000;display:inline-block;
  min-width:220px;padding-bottom:1px;
}
.prescripteur-box{font-size:11px;white-space:nowrap;padding-top:2px;}
.ref-box{
  width:90px;height:38px;border:1px solid #000;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:bold;text-align:center;padding:2px;
}
.body-cols{display:flex;gap:10px;align-items:stretch;}
.col-left{
  width:36%;min-height:420px;
  border:1.5px solid #5a7d3a;
  background:#c9c9c9;
  padding:8px 6px;
}
.col-left-title{
  text-align:center;font-size:9px;font-weight:bold;
  text-transform:uppercase;letter-spacing:0.4px;
  border-bottom:1.5px solid #444;padding-bottom:5px;
  margin-bottom:8px;color:#222;
}
.col-right{width:64%;}
.box-resultat-conclusion{
  border:1.5px solid #000;padding:8px 10px;
  background:white;min-height:420px;
}
.box-title{
  font-weight:bold;text-decoration:underline;
  font-size:11px;margin-bottom:6px;
}
.box-content{
  font-size:10.5px;white-space:pre-wrap;line-height:1.45;
}
.box-resultat-section{min-height:230px;margin-bottom:20px;}
.box-conclusion-section{min-height:110px;}
.footer-zone{margin-top:16px;display:flex;justify-content:flex-end;}
.date-signature{text-align:right;width:280px;}
.date-fait{font-size:10.5px;margin-bottom:28px;}
.signature-zone{
  height:48px;display:flex;align-items:flex-end;
  justify-content:center;font-size:10px;font-style:italic;
}
.signature-line{
  border-top:1px solid #000;padding-top:4px;
  font-size:9px;text-align:center;
}
</style></head><body>
<div class="page">
  <div class="header">
    <img src="${logoBase64}" class="logo-img" alt=""/>
    <div class="header-center">
      <div class="republic">REPOBLIKAN'I MADAGASIKARA</div>
      <div class="devise">Fitiavana – Tanindrazana - Fandrosoana</div>
    </div>
    <img src="${logoBase64}" class="logo-img" alt=""/>
  </div>

  <div class="titre-principal">
    Compte Rendu d'Examen Anatomo-Pathologique
  </div>

  <div class="infos-patient">
    <div class="infos-left">
      <p>Nom : <span class="underline-field">${escapeHtml(nomPatient)}</span></p>
      <p>Identifiant : <span class="underline-field">${escapeHtml(identifiant)}</span></p>
      <p>Age : <span class="underline-field" style="min-width:50px;">${escapeHtml(String(age))}</span> ans</p>
      <p>Type de prélèvement : <span class="underline-field">${escapeHtml(typePrelevement)}</span></p>
      <p>Renseignement clinique : <span class="underline-field">${escapeHtml(String(renseignementClinique))}</span></p>
      <p>Suspicion diagnostique : <span class="underline-field">${escapeHtml(String(suspicionDiagnostique))}</span></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px;">
      <div class="ref-box">${escapeHtml(String(ippNumber))}</div>
      <div class="prescripteur-box">Prescripteur : Dr ${escapeHtml(String(prescripteur))}</div>
    </div>
  </div>

  <div class="body-cols">
    <div class="col-left">
      <div class="col-left-title">
        Personnel du Service<br/>
        <span style="font-weight:normal;text-transform:none;
          font-size:8px;font-style:italic;">Anatomie Pathologique</span>
      </div>
      ${personnelHTML}
    </div>
    <div class="col-right">
      ${diagnosticHTML}
      <div class="box-resultat-conclusion">
        <div class="box-resultat-section">
          <div class="box-title">RESULTAT :</div>
          <div class="box-content">${escapeHtml(resultat)}</div>
        </div>
        <div class="box-conclusion-section">
          <div class="box-title">CONCLUSION :</div>
          <div class="box-content">${escapeHtml(conclusion)}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-zone">
    <div class="date-signature">
      <div class="date-fait">Fait à Fianarantsoa, le ${dateAujourdhui}</div>
      <div class="signature-zone">${signature ? escapeHtml(signature) : ''}</div>
      <div class="signature-line">
        Signature${numOrdre ? `<br/>N° Ordre : ${escapeHtml(numOrdre)}` : ''}
      </div>
    </div>
  </div>
</div>
</body></html>`;

  await renderHtmlToPdf(
    htmlContent,
    `CR-Anapath-${anapathId}.pdf`,
    1123,
  );
}

export function getTypeLabel(type: string): string {
  return formatTypeExamen(type);
}

function calcAge(d: string): number {
  const b = new Date(d), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() - b.getMonth() < 0
    || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

function formatTypeExamen(t: string): string {
  const m: Record<string, string> = {
    BIOPSIE: 'Biopsie tissulaire',
    FCV_PAP: 'Frottis cervico-vaginal / Pap test',
    CYT0PONCTION: 'Cytoponction',
    LIQUIDE: 'Liquide biologique',
    POS: 'Prélèvement Organique Standard',
    POC: 'Prélèvement Organique Complexe',
    EXTEMPORANE_STAT: 'Examen extemporané (STAT)',
  };
  return m[t] ?? t.replace(/_/g, ' ');
}
