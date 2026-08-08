/**
 * Génère ANAPATH_DOCUMENTATION_COMPLETE.html
 * — Tous les codes source + explications en français par page/module
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'ANAPATH_DOCUMENTATION_COMPLETE.html');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', '.git', 'coverage', '.cursor', 'scripts',
]);
const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'anapath-code-export.html',
  'ANAPATH_DOCUMENTATION_COMPLETE.html',
]);
const INCLUDE_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.yaml', '.yml', '.md',
]);

/** Explications par fichier (clé = chemin relatif avec /) */
const DESCRIPTIONS = {
  // ── Racine ──────────────────────────────────────────────
  'README.md':
    'Documentation principale du monorepo : vue d\'ensemble, stack technique, structure et démarrage rapide.',
  'ARCHITECTURE.md':
    'Diagrammes Mermaid de l\'architecture système : modules backend, pages frontend, workflow des statuts, endpoints API.',
  'render.yaml':
    'Configuration de déploiement Render (backend + frontend, variables d\'environnement).',

  // ── Backend — point d'entrée ────────────────────────────
  'back_anapath/src/main.ts':
    'Point d\'entrée NestJS : CORS, pipes de validation UTF-8, préfixe /api, Swagger sur /api/docs.',
  'back_anapath/src/app.module.ts':
    'Module racine : charge TypeORM (PostgreSQL), ConfigModule et les modules Anapath, Notification, External.',
  'back_anapath/src/app.controller.ts':
    'Contrôleur racine minimal (health check).',
  'back_anapath/src/app.service.ts':
    'Service racine minimal.',

  // ── Backend — module Anapath ────────────────────────────
  'back_anapath/src/anapath/anapath.module.ts':
    'Module NestJS Anapath : enregistre entité, service, contrôleur et clients CHU/Accueil.',
  'back_anapath/src/anapath/anapath.controller.ts':
    'API REST principale : CRUD examens, notifications proxy, patient Accueil, validation. Routes statiques avant dynamiques.',
  'back_anapath/src/anapath/anapath.service.ts':
    'Logique métier : création ANP-XXXX, sauvegarde résultat/conclusion, validation SHA-256, toResponse() normalisé.',
  'back_anapath/src/anapath/entities/anapath-request.entity.ts':
    'Entité TypeORM anapath_requests : patientId, typeExamen, prelevement (JSON), resultatDetails, statut, validation.',
  'back_anapath/src/anapath/dto/create-anapath.dto.ts':
    'DTO création d\'une demande d\'examen (type, prélèvement, métadonnées).',
  'back_anapath/src/anapath/dto/update-anapath.dto.ts':
    'DTO mise à jour : resultatDetails, resultatConclusion, signature, numeroOrdre, hash, statut.',
  'back_anapath/src/anapath/dto/validate-anapath.dto.ts':
    'DTO validation numérique : signature électronique, n° ordre professionnel, hash optionnel.',

  // ── Backend — clients externes ──────────────────────────
  'back_anapath/src/common/clients/accueil.client.ts':
    'Client HTTP vers le service Accueil (Railway) : récupère identité patient (nom, âge, sexe) par patientId + chuId.',
  'back_anapath/src/common/clients/chu.client.ts':
    'Client HTTP vers le référentiel CHU : liste des CHU, services par CHU, infos service Anapath.',
  'back_anapath/src/common/clients/notification.client.ts':
    'Client HTTP vers le service de notifications prescription.',
  'back_anapath/src/common/interceptors/utf8.interceptor.ts':
    'Intercepteur global : force charset UTF-8 sur les réponses JSON.',
  'back_anapath/src/common/pipes/utf8.pipe.ts':
    'Pipe global : normalise l\'encodage UTF-8 des entrées.',

  // ── Backend — module External ───────────────────────────
  'back_anapath/src/external/external.module.ts':
    'Module réception des prescriptions externes (POST /api/external/anapath).',
  'back_anapath/src/external/external.controller.ts':
    'Endpoint d\'intégration : reçoit une prescription depuis le service Prescription et crée l\'examen Anapath.',
  'back_anapath/src/external/external.service.ts':
    'Service : mappe la prescription entrante, crée l\'examen, déclenche notification au laboratoire.',
  'back_anapath/src/external/dto/create-prescription-anapath.dto.ts':
    'DTO prescription entrante : patientId, typeExamen, urgence, métadonnées CHU/service.',

  // ── Backend — module Notification ─────────────────────────
  'back_anapath/src/notification/notification.module.ts':
    'Module notifications internes (réception et stockage local).',
  'back_anapath/src/notification/notification.controller.ts':
    'Endpoints POST/GET notifications internes au backend Anapath.',
  'back_anapath/src/notification/notification.service.ts':
    'Service : persistance et lecture des notifications en base PostgreSQL.',
  'back_anapath/src/notification/notification.entity.ts':
    'Entité notification : type, titre, message, priorité, metadata, lu/non lu.',
  'back_anapath/src/notification/map-service-notification.ts':
    'Mapper : convertit le format notification du service Prescription vers le format interne.',

  // ── Frontend — configuration ────────────────────────────
  'front_anapath/next.config.ts':
    'Config Next.js : proxy /api → backend Render (évite CORS en dev), outputFileTracingRoot.',
  'front_anapath/tailwind.config.ts':
    'Design tokens Tailwind : couleurs Material 3 (surface, primary, tertiary), polices.',
  'front_anapath/app/globals.css':
    'Styles globaux : variables CSS, grain overlay, thème clair/sombre.',
  'front_anapath/app/layout.tsx':
    'Layout racine : polices Inter/Manrope, ThemeProvider, SearchProvider, metadata PWA.',

  // ── Frontend — pages ────────────────────────────────────
  'front_anapath/app/page.tsx':
    'Page d\'accueil (/) : redirection automatique vers /dashboard.',
  'front_anapath/app/dashboard/page.tsx':
    'Tableau de bord : vue synthétique de toutes les demandes, KPI, filtre recherche global, liens rapides.',
  'front_anapath/app/worklist/page.tsx':
    'Liste de travail (worklist) : examens en attente/en cours, filtres pending/all, accès au détail par ligne.',
  'front_anapath/app/worklist/[id]/page.tsx':
    'Détail prescription : identité patient (Accueil), infos cliniques par type d\'examen, bouton « Prise en charge » → validation.',
  'front_anapath/app/validation/page.tsx':
    'Saisie et validation : résultat microscopique, conclusion, signature numérique, export PDF, PATCH sauvegarde/validation.',
  'front_anapath/app/archives/page.tsx':
    'Archives : liste des examens validés, filtre par type, recherche, lien vers détail.',
  'front_anapath/app/archives/[id]/page.tsx':
    'Détail archive : compte-rendu complet, conclusion diagnostique, hash validation, export PDF.',
  'front_anapath/app/reports/page.tsx':
    'Rapports statistiques : volumes par semaine, répartition par type/statut, TAT moyen, export PDF rapport.',

  // ── Frontend — composants ─────────────────────────────────
  'front_anapath/components/Sidebar.tsx':
    'Navigation latérale fixe : liens Dashboard, Worklist, Validation, Archives, Rapports.',
  'front_anapath/components/TopBar.tsx':
    'Barre supérieure : titre page, barre de recherche globale, cloche notifications, menu paramètres.',
  'front_anapath/components/NotificationBell.tsx':
    'Cloche notifications : polling 30s, tri STAT/URGENTE/NORMALE, sons d\'alerte, redirection /validation?id=…',
  'front_anapath/components/PatientIdentitySection.tsx':
    'Bloc identité patient réutilisable : nom, âge, sexe, CIN, téléphone, skeleton chargement.',
  'front_anapath/components/SearchContext.tsx':
    'Contexte React : état global de la recherche partagé entre toutes les pages.',
  'front_anapath/components/SearchBar.tsx':
    'Champ de recherche dans la TopBar, connecté au SearchContext.',
  'front_anapath/components/ThemeProvider.tsx':
    'Provider thème clair/sombre, persistance localStorage.',
  'front_anapath/components/ThemeToggle.tsx':
    'Bouton bascule thème clair/sombre.',
  'front_anapath/components/SettingsMenu.tsx':
    'Menu déroulant paramètres (thème, etc.).',
  'front_anapath/components/KpiCard.tsx':
    'Carte KPI du dashboard (chiffre + label + icône).',
  'front_anapath/components/UrgentTable.tsx':
    'Tableau des demandes urgentes/STAT sur le dashboard.',
  'front_anapath/components/UrgentRequestsSnippet.tsx':
    'Snippet compact des demandes urgentes.',
  'front_anapath/components/ExtemporaneTimer.tsx':
    'Compte à rebours 30 min pour examens extemporanés STAT, alerte sonore à expiration.',
  'front_anapath/components/WeeklyActivityChart.tsx':
    'Graphique activité hebdomadaire (barres) sur le dashboard.',
  'front_anapath/components/ArchivesTable.tsx':
    'Tableau archives réutilisable.',
  'front_anapath/components/StatAlertBanner.tsx':
    'Bannière d\'alerte STAT en haut du dashboard.',
  'front_anapath/components/FAB.tsx':
    'Bouton d\'action flottant (Floating Action Button).',

  // ── Frontend — lib utilitaires ──────────────────────────
  'front_anapath/lib/api.ts':
    'Client API central : axios + fetch, getPatientForExamen, getNotificationsAnapath, markNotificationAsRead.',
  'front_anapath/lib/generatePDF.ts':
    'Génération PDF compte-rendu via html2pdf.js + iframe visible (évite PDF blanc). Import dynamique uniquement.',
  'front_anapath/lib/reportPDF.ts':
    'Génération PDF des rapports statistiques hebdomadaires.',
  'front_anapath/lib/statusLabels.ts':
    'Libellés et couleurs des statuts (CREEE, EN_ATTENTE, VALIDE, etc.).',
  'front_anapath/lib/dateFormat.ts':
    'Helpers formatage dates (formatDate, formatDateLong, formatDateTime).',
  'front_anapath/lib/searchAnapath.ts':
    'Filtre et tri des demandes par requête de recherche.',
  'front_anapath/lib/serviceDisplay.ts':
    'Affichage lisible des noms de services hospitaliers.',
  'front_anapath/lib/weekUtils.ts':
    'Utilitaires semaines pour les rapports (lundi, volumes journaliers).',
  'front_anapath/lib/notifications.ts':
    'Helpers notifications frontend (legacy).',
  'front_anapath/lib/mockData.ts':
    'Données fictives pour développement/démo.',
  'front_anapath/types/html2pdf.d.ts':
    'Déclarations TypeScript pour html2pdf.js.',
};

/** Descriptions par catégorie pour la section intro */
const CATEGORIES = [
  {
    id: 'overview',
    title: 'Vue d\'ensemble du projet',
    content: `
<p><strong>Anapath System</strong> est un SI hospitalier pour le service d'Anatomie Pathologique du CHU Andrainjato – Fianarantsoa.</p>
<ul>
<li><strong>Frontend</strong> : <code>https://anapath-frontend.onrender.com</code> (Next.js 15)</li>
<li><strong>Backend</strong> : <code>https://anapath-backend-ar7u-uj8n.onrender.com</code> (NestJS 10 + PostgreSQL)</li>
<li><strong>Service Anapath ID</strong> : <code>9e73904c-71e5-4477-9280-513e4112a468</code></li>
<li><strong>Service CHU</strong> : <code>https://chu-service-cms7.onrender.com</code> (/chu, /prise-en-charge)</li>
<li><strong>Services (registre)</strong> : <code>https://service-service-0f7p.onrender.com</code> (/services)</li>
<li><strong>Users</strong> : <code>https://user-services-0sze.onrender.com</code></li>
<li><strong>Auth</strong> : <code>https://auth-service-4q6g.onrender.com</code></li>
<li><strong>Notifications</strong> : <code>https://service-notification-nlqp.onrender.com</code></li>
<li><strong>Upload</strong> : <code>https://service-upload-u5z9.onrender.com</code></li>
<li><strong>Accueil patients</strong> : <code>https://acceuil-back.onrender.com</code></li>
<li><strong>Prescription</strong> : <code>https://prescriptionback-production.up.railway.app</code></li>
</ul>
<h3>Workflow des statuts</h3>
<ol>
<li><code>CREEE</code> — Prescription reçue via POST /api/external/anapath</li>
<li><code>EN_ATTENTE</code> — Prise en charge par le laboratoire</li>
<li><code>RESULTAT_DISPONIBLE</code> — Résultat et conclusion saisis</li>
<li><code>VALIDE</code> — Signé par le pathologiste (hash SHA-256)</li>
<li><code>ARCHIVE</code> — Archivé définitivement</li>
</ol>`,
  },
  {
    id: 'pages',
    title: 'Pages frontend — rôles et navigation',
    content: `
<table>
<tr><th>Route</th><th>Fichier</th><th>Rôle</th></tr>
<tr><td><code>/</code></td><td>app/page.tsx</td><td>Redirige vers /dashboard</td></tr>
<tr><td><code>/dashboard</code></td><td>app/dashboard/page.tsx</td><td>Vue d'ensemble, KPI, toutes les demandes</td></tr>
<tr><td><code>/worklist</code></td><td>app/worklist/page.tsx</td><td>File d'attente des examens à traiter</td></tr>
<tr><td><code>/worklist/[id]</code></td><td>app/worklist/[id]/page.tsx</td><td>Détail prescription + prise en charge</td></tr>
<tr><td><code>/validation</code></td><td>app/validation/page.tsx</td><td>Saisie résultat, conclusion, signature, PDF</td></tr>
<tr><td><code>/archives</code></td><td>app/archives/page.tsx</td><td>Liste des examens validés</td></tr>
<tr><td><code>/archives/[id]</code></td><td>app/archives/[id]/page.tsx</td><td>Compte-rendu archivé + export PDF</td></tr>
<tr><td><code>/reports</code></td><td>app/reports/page.tsx</td><td>Statistiques et rapports hebdomadaires</td></tr>
</table>`,
  },
  {
    id: 'api',
    title: 'Endpoints API backend principaux',
    content: `
<table>
<tr><th>Méthode</th><th>Route</th><th>Description</th></tr>
<tr><td>GET</td><td>/api/anapath</td><td>Liste toutes les demandes</td></tr>
<tr><td>GET</td><td>/api/anapath/:id</td><td>Détail d'une demande</td></tr>
<tr><td>PATCH</td><td>/api/anapath/:id</td><td>Mise à jour (résultat, statut, validation)</td></tr>
<tr><td>GET</td><td>/api/anapath/:id/patient</td><td>Identité patient (Accueil)</td></tr>
<tr><td>POST</td><td>/api/anapath/:id/validate</td><td>Validation avec signature</td></tr>
<tr><td>GET</td><td>/api/anapath/notifications</td><td>Notifications du service</td></tr>
<tr><td>GET</td><td>/api/anapath/notifications/non-lues</td><td>Notifications non lues</td></tr>
<tr><td>PUT</td><td>/api/anapath/notifications/:id/lire</td><td>Marquer comme lue</td></tr>
<tr><td>POST</td><td>/api/external/anapath</td><td>Réception prescription externe</td></tr>
<tr><td>GET</td><td>/api/docs</td><td>Documentation Swagger</td></tr>
</table>`,
  },
];

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(full, files);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (INCLUDE_EXT.has(ext) && !EXCLUDE_FILES.has(entry.name)) {
        files.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  }
  return files.sort();
}

function guessDescription(rel) {
  if (DESCRIPTIONS[rel]) return DESCRIPTIONS[rel];
  if (rel.includes('/dto/')) return 'DTO (Data Transfer Object) : validation et typage des données entrantes/sortantes.';
  if (rel.includes('.spec.ts')) return 'Tests unitaires Jest.';
  if (rel.includes('e2e')) return 'Tests end-to-end.';
  if (rel.endsWith('.entity.ts')) return 'Entité TypeORM mappée sur une table PostgreSQL.';
  if (rel.endsWith('.module.ts')) return 'Module NestJS : regroupe contrôleur, service et dépendances.';
  if (rel.endsWith('.controller.ts')) return 'Contrôleur REST : expose les endpoints HTTP.';
  if (rel.endsWith('.service.ts')) return 'Service : logique métier et accès base de données.';
  if (rel.endsWith('.css')) return 'Feuille de styles.';
  if (rel.endsWith('.json')) return 'Fichier de configuration JSON.';
  return 'Fichier source du projet Anapath.';
}

const files = walk(ROOT);
const toc = [];
const sections = [];

// Sections intro
const introSections = CATEGORIES.map(
  (cat) => `<section id="${cat.id}" class="intro-section">
<h2>${escapeHtml(cat.title)}</h2>
${cat.content}
</section>`,
).join('\n');

for (const rel of files) {
  const fullPath = path.join(ROOT, ...rel.split('/'));
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    continue;
  }

  const id = rel.replace(/[^a-zA-Z0-9]/g, '-');
  const lines = content.split('\n').length;
  const desc = guessDescription(rel);
  const ext = path.extname(rel).slice(1);

  toc.push(
    `<li><a href="#${id}">${escapeHtml(rel)}</a> <span class="meta">(${lines} lignes)</span></li>`,
  );

  sections.push(`<section id="${id}" class="file">
<h2><code>${escapeHtml(rel)}</code> <span class="meta">— ${lines} lignes · .${ext}</span></h2>
<div class="desc"><strong>📋 Description :</strong> ${escapeHtml(desc)}</div>
<pre><code>${escapeHtml(content)}</code></pre>
</section>`);
}

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anapath — Documentation complète du code source</title>
<style>
:root{--bg:#0f172a;--panel:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#38bdf8;--accent2:#a78bfa;--border:#334155;--desc:#1a2744}
*{box-sizing:border-box}
body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{padding:1.5rem 2rem;background:var(--panel);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
header h1{margin:0 0 .25rem;font-size:1.6rem;color:var(--accent)}
header p{margin:0;color:var(--muted);font-size:.9rem}
.layout{display:grid;grid-template-columns:340px 1fr;min-height:calc(100vh - 100px)}
nav{background:var(--panel);border-right:1px solid var(--border);padding:1rem;overflow:auto;max-height:calc(100vh - 100px);position:sticky;top:100px}
nav h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:1rem 0 .5rem}
nav h2:first-child{margin-top:0}
nav ul{list-style:none;padding:0;margin:0 0 1rem}
nav li{margin:.3rem 0;font-size:.8rem;line-height:1.4}
nav a{color:var(--accent);text-decoration:none;word-break:break-all}
nav a:hover{text-decoration:underline}
.meta{color:var(--muted);font-size:.75rem}
main{padding:1.5rem 2rem;overflow:auto;max-width:1100px}
.intro-section{margin-bottom:2.5rem;padding:1.25rem;background:var(--panel);border:1px solid var(--border);border-radius:10px}
.intro-section h2{color:var(--accent2);margin:0 0 1rem;font-size:1.2rem}
.intro-section table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem}
.intro-section th,.intro-section td{border:1px solid var(--border);padding:.4rem .6rem;text-align:left}
.intro-section th{background:#0f172a;color:var(--accent)}
.intro-section code{background:#020617;padding:.1rem .3rem;border-radius:3px;font-size:.82rem}
.intro-section ul,.intro-section ol{padding-left:1.25rem;font-size:.9rem}
.file{margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border)}
.file h2{font-size:.95rem;margin:0 0 .5rem;color:var(--accent);word-break:break-all}
.desc{background:var(--desc);border-left:3px solid var(--accent2);padding:.6rem .9rem;margin-bottom:.75rem;border-radius:0 6px 6px 0;font-size:.88rem;color:#cbd5e1}
pre{margin:0;padding:1rem;background:#020617;border:1px solid var(--border);border-radius:8px;overflow:auto;font-size:.75rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:600px}
code{font-family:Consolas,Monaco,monospace}
@media(max-width:900px){.layout{grid-template-columns:1fr}nav{position:static;max-height:none}}
@media print{nav{display:none}.layout{grid-template-columns:1fr}pre{max-height:none;font-size:.65rem}}
</style>
</head>
<body>
<header>
<h1>🧬 Anapath — Documentation complète du code source</h1>
<p>${files.length} fichiers · Monorepo back_anapath + front_anapath · Généré le ${new Date().toLocaleString('fr-FR')}</p>
</header>
<div class="layout">
<nav>
<h2>📖 Guide</h2>
<ul>
<li><a href="#overview">Vue d'ensemble</a></li>
<li><a href="#pages">Pages frontend</a></li>
<li><a href="#api">Endpoints API</a></li>
</ul>
<h2>📁 Fichiers source</h2>
<ul>
${toc.join('\n')}
</ul>
</nav>
<main>
${introSections}
<h2 style="color:var(--accent2);margin:2rem 0 1rem;font-size:1.3rem;border-top:2px solid var(--border);padding-top:1.5rem">
📂 Code source complet (${files.length} fichiers)
</h2>
${sections.join('\n')}
</main>
</div>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
const sizeMb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`✅ Fichier créé : ${OUT}`);
console.log(`   ${files.length} fichiers · ${sizeMb} Mo`);
