'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import PatientAvatar from '@/components/PatientAvatar';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import ExamenSpeculumForm from '@/components/ExamenSpeculumForm';
import ExamenTechniqueForm from '@/components/ExamenTechniqueForm';
import { PatientInfo } from '@/components/PatientIdentitySection';
import { useAuth } from '@/components/AuthProvider';
import axios from 'axios';
import { getPatientForExamen, API_BASE } from '@/lib/api';
import { statusLabels, statusColors } from '@/lib/statusLabels';
import { isTechnicienUser } from '@/lib/roles';

interface AnapathRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  isExtemporane: boolean;
  prelevement: {
    site: string;
    description: string;
  } | null;
  createdAt: string;
  episodeId?: string | null;
  metadata?: Record<string, unknown> | null;
  patientInfo?: PatientInfo | null;
  examenSpeculum?: Record<string, unknown> | null;
  examenTechnique?: Record<string, unknown> | null;
}

export default function WorklistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { hasPermission, user } = useAuth();
  // Lecture seule pour Histotechnicien/Secrétaire : seuls UPDATE /
  // OBSERVATION_WRITE peuvent réellement saisir un résultat.
  const canWrite = hasPermission('anapath:update') || hasPermission('anapath:observation:write');
  // Le spéculum reste réservé au technicien/histotechnicien.
  const isTechnicien = isTechnicienUser(user);

  const [request, setRequest] = useState<AnapathRequest | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(true);
  const [showSpeculum, setShowSpeculum] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const loadExamen = async () => {
    try {
      const response = await axios.get(`${API_BASE}/anapath/${id}`);
      setRequest(response.data);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadExamen().finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!request?.id) return;
    setPatientLoading(true);
    if (request.patientInfo?.nomComplet) {
      setPatient(request.patientInfo);
      setPatientLoading(false);
      return;
    }
    getPatientForExamen(request.id)
      .then((p) => setPatient(p))
      .catch(() => setPatient(null))
      .finally(() => setPatientLoading(false));
  }, [request?.id, request?.patientInfo]);

  const handleSaisirResultat = () => {
    if (!request) return;
    router.push(`/validation?id=${request.id}`);
  };

  const isFcvPap = request?.typeExamen === 'FCV_PAP';
  const speculumDone = Boolean(request?.examenSpeculum);
  // La demande est en phase « examen technique » (fil technicien / onglet
  // Examen technique du pathologiste) quand elle est EN_COURS ; en
  // EN_ATTENTE_PATHOLOGUE, seul le pathologiste continue (vrai examen).
  const isTechnicalPhase = request?.statut === 'EN_COURS';
  const isReadyForPathologist = request?.statut === 'EN_ATTENTE_PATHOLOGUE';

  if (loading) {
    return (
      <div className="flex min-h-screen bg-transparent">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </main>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-screen bg-transparent">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-slate-500">Demande non trouvée</p>
        </main>
      </div>
    );
  }

  // Le bouton de saisie est visible tant que l'examen n'est pas validé (Terminé)
  const isWorkflowVisible = request.statut !== 'VALIDE' && request.statut !== 'ARCHIVE';

  return (
    <div className="flex min-h-screen bg-transparent text-[#191c21]">
      <div className="fixed inset-0 grain-overlay z-[60] pointer-events-none"></div>
      <Sidebar />

      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 py-3 shadow-sm">
          <div className="flex items-center gap-4">
            <Link href="/worklist" className="flex items-center gap-2 text-primary text-sm hover:underline">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Retour
            </Link>
            <h2 className="text-lg font-black text-blue-900">Détail de la prescription</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[request.statut] || 'bg-gray-100 text-gray-700'}`}>
              {statusLabels[request.statut] || request.statut}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PatientAvatar nom={patient?.nom} prenom={patient?.prenom} />
          </div>
        </header>

        <div className="flex-1 p-6 w-full max-w-5xl mx-auto">
          <div className="mb-6">
            <PrescriptionDetails request={request} patient={patient} patientLoading={patientLoading} />
          </div>

          {isWorkflowVisible && (
            <div className="flex flex-col items-center gap-2 mt-8">
              {isReadyForPathologist ? (
                canWrite ? (
                  <button
                    onClick={handleSaisirResultat}
                    className="px-8 py-3 bg-green-600 text-white font-bold rounded-full shadow-md hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined">edit_note</span>
                    Saisir le résultat d'examen
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">Consultation en lecture seule</p>
                )
              ) : isTechnicalPhase ? (
                isFcvPap && !speculumDone ? (
                  isTechnicien ? (
                    <button
                      onClick={() => setShowSpeculum(true)}
                      className="px-8 py-3 bg-[#00478d] text-white font-bold rounded-full shadow-md hover:opacity-90 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">visibility</span>
                      Examen au spéculum (préalable)
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      En attente de l'examen au spéculum (réservé au technicien)
                    </p>
                  )
                ) : (
                  <button
                    onClick={() => setShowTech(true)}
                    className="px-8 py-3 bg-[#00284d] text-white font-bold rounded-full shadow-md hover:opacity-90 transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined">science</span>
                    Examen technique
                  </button>
                )
              ) : (
                <p className="text-xs text-slate-400">Consultation en lecture seule</p>
              )}
            </div>
          )}
        </div>
      </main>

      {showSpeculum && request && isTechnicien && (
        <ExamenSpeculumForm
          requestId={request.id}
          anapathId={request.anapathId}
          patientName={patient?.nomComplet || patient?.nom || request.patientId}
          initialData={request.examenSpeculum}
          prescripteurNom={(request.metadata?.prescripteurNom as string | undefined) ?? null}
          onClose={() => setShowSpeculum(false)}
          onSaved={async () => {
            setShowSpeculum(false);
            await loadExamen();
          }}
        />
      )}

      {showTech && request && (
        <ExamenTechniqueForm
          requestId={request.id}
          anapathId={request.anapathId}
          patientName={patient?.nomComplet || patient?.nom || request.patientId}
          initialData={request.examenTechnique}
          onClose={() => setShowTech(false)}
          onSaved={async () => {
            setShowTech(false);
            await loadExamen();
          }}
        />
      )}
    </div>
  );
}
