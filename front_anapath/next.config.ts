import type { NextConfig } from "next";
import path from "path";

// Backend anapath (même défaut que app/api/[...path]/route.ts).
const BACKEND_URL = (
  process.env.API_PROXY_TARGET ||
  "https://anapath-backend-ar7u-uj8n.onrender.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Corrige la détection de racine quand un package-lock.json existe dans le dossier utilisateur
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  // Note: /api/* est géré par app/api/[...path]/route.ts (proxy qui injecte le
  // token d'auth depuis le cookie httpOnly), pas par un rewrites() Next.js qui
  // ne peut pas ajouter de headers.
  //
  // Chemins « bruts » (sans préfixe /api) attendus par les outils de
  // l'écosystème : l'agrégateur dossier-patient interroge chaque service
  // paraclinique sur {service}/resultats/patient/:patientId (contrat ORL :
  // gateway-bwm4.onrender.com/orl/resultats/patient/:id). Le front étant le
  // baseUrl enregistré, on proxifie ces chemins vers le backend — la
  // transparence d'hôte est ainsi totale, comme chez ORL.
  async rewrites() {
    return [
      {
        source: "/anapath/resultats/patient/:patientId",
        destination: `${BACKEND_URL}/api/anapath/resultats/patient/:patientId`,
      },
      {
        source: "/resultats/patient/:patientId",
        destination: `${BACKEND_URL}/api/resultats/patient/:patientId`,
      },
      {
        source: "/docs",
        destination: `${BACKEND_URL}/api/docs`,
      },
      {
        source: "/docs-json",
        destination: `${BACKEND_URL}/api/docs-json`,
      },
    ];
  },
};

export default nextConfig;
