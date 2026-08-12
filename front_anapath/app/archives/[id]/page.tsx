'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import PatientAvatar from '@/components/PatientAvatar';
import axios from 'axios';
import { formatDateLong, formatDateTime } from '@/lib/dateFormat';
import { getPatientForExamen, API_BASE } from '@/lib/api';
import { getTypeLabel } from '@/lib/generatePDF';
import { statusLabels, statusColors } from '@/lib/statusLabels';
import { getClinicalNotes, getSuspicion, getTreatmentType } from '@/lib/prescriptionFields';

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
    clinicalData?: {
      treatmentType?: string;
      suspicion?: string;
      clinicalNotes?: string;
    };
  };
  resultat: {
    conclusion: string;
    details: string;
  } | null;
  resultatDetails?: string | null;
  resultatConclusion?: string | null;
  validatedBySignature?: string | null;
  validatedByUserId: string | null;
  validatedAt: string | null;
  validationHash?: string | null;
  signedHash: string | null;
  createdAt: string;
  episodeId?: string | null;
  metadata?: Record<string, unknown> | null;
  patientInfo?: PatientInfo | null;
  diagnosticCytoponction?: {
    sitePreleve?: string;
    organe?: string;
    fixation?: string;
    validatedByName?: string | null;
    validatedAt?: string | null;
  } | null;
}

export default function ArchiveDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [request, setRequest] = useState<AnapathRequest | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(true);

  useEffect(() => {
    async function loadExamen() {
      setLoading(true);
      setPatientLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/anapath/${id}`);
        setRequest(response.data);
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    }
    loadExamen();
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

  const handleExportPDF = async () => {
    if (!request) {
      alert('Aucune donnée à exporter.');
      return;
    }

    try {
      const { generatePDF } = await import('@/lib/generatePDF');
      await generatePDF(request, patient);
    } catch (e) {
      console.error('Erreur PDF:', e);
      alert('Erreur lors de la génération du PDF');
    }
  };

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
          <p className="text-slate-500">Résultat non trouvé</p>
        </main>
      </div>
    );
  }

  const clinicalData = {
    treatmentType: getTreatmentType(request),
    suspicion: getSuspicion(request),
    clinicalNotes: getClinicalNotes(request),
  };

  return (
    <div className="flex min-h-screen bg-transparent text-[#191c21]">
      <div className="fixed inset-0 grain-overlay z-[60] pointer-events-none"></div>
      <Sidebar />

      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 py-3 shadow-sm">
          <div className="flex items-center gap-4">
            <Link href="/archives" className="flex items-center gap-2 text-primary text-sm hover:underline">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Retour aux archives
            </Link>
            <h2 className="text-lg font-black text-blue-900">Résultat d'examen</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[request.statut] || 'bg-gray-100 text-gray-700'}`}>
              {statusLabels[request.statut] || request.statut}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PatientAvatar nom={patient?.nom} prenom={patient?.prenom} />
          </div>
        </header>

        <div className="flex-1 p-6 w-full max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-6">
            <PatientIdentitySection
              examen={request}
              patient={patient}
              loading={patientLoading}
              title="👤 Identité Patient"
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-4 pt-4 border-t border-outline-variant/20">
              <div>
                <label className="text-xs text-slate-400">Type d'examen</label>
                <p className="font-medium">{getTypeLabel(request.typeExamen)}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400">Date Prélèvement</label>
                <p className="font-medium">{formatDateLong(request.createdAt)}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400">Site de prélèvement</label>
                <p className="font-medium">{request.prelevement?.site || '-'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-6">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary">stethoscope</span>
              <div>
                <p className="text-xs text-slate-400">Service demandeur</p>
                <p className="font-medium">{(request.metadata?.serviceNom as string) ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-3">
              <span className="material-symbols-outlined text-secondary">local_hospital</span>
              <div>
                <p className="text-xs text-slate-400">CHU</p>
                <p className="font-medium">{(request.metadata?.chuNom as string) ?? '—'}</p>
              </div>
            </div>
            <hr className="border-outline-variant my-3" />
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-xs text-slate-400">Type de traitement</p>
                <p className="font-medium">{clinicalData.treatmentType || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Suspicion diagnostique</p>
                <p className="font-medium italic">{clinicalData.suspicion || 'Non renseignée'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Renseignements cliniques</p>
                <p className="font-medium italic">{clinicalData.clinicalNotes || 'Non renseignés'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-6">
            <h4 className="font-bold text-primary mb-3">🔬 Compte-rendu d'analyse</h4>
            <div className="space-y-4">
              <div className="w-full p-3 bg-[#f2f3fb] border border-outline-variant/30 rounded-lg text-sm whitespace-pre-wrap">
                {request?.resultat?.details
                  ?? request?.resultatDetails
                  ?? '—'}
              </div>
              <div>
                <label className="text-xs font-bold text-tertiary uppercase">Conclusion diagnostique</label>
                <div className="w-full mt-1 p-3 bg-tertiary/5 border border-tertiary/20 rounded-lg text-sm font-semibold whitespace-pre-wrap">
                  {request?.resultat?.conclusion
                    ?? request?.resultatConclusion
                    ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {request?.diagnosticCytoponction && (
            <div className="bg-cyan-50 p-6 rounded-xl border border-cyan-200 mb-6">
              <h4 className="font-bold text-cyan-800 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">biotech</span>
                Diagnostic cytoponction (pathologiste)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-cyan-800/70 font-semibold uppercase">Site prélevé</p>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.sitePreleve || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-cyan-800/70 font-semibold uppercase">Organe concerné</p>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.organe || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-cyan-800/70 font-semibold uppercase">Fixation</p>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.fixation || '—'}</p>
                </div>
              </div>
              {request.diagnosticCytoponction.validatedByName && (
                <p className="text-[11px] text-cyan-800/70 mt-3">
                  Validé par {request.diagnosticCytoponction.validatedByName}
                  {request.diagnosticCytoponction.validatedAt
                    ? ` le ${new Date(request.diagnosticCytoponction.validatedAt).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              )}
            </div>
          )}

          <div className="bg-green-50 p-6 rounded-xl border border-green-200 mb-6">
            <h4 className="font-bold text-green-700 mb-3">✅ Demande validée</h4>
            <p className="text-sm">
              Validée par: {request.validatedBySignature ?? request.validatedByUserId ?? '—'}
            </p>
            <p className="text-sm">Le: {request.validatedAt ? formatDateTime(request.validatedAt) : '—'}</p>
            <p className="text-xs text-slate-500 mt-2 break-all">
              Hash: {(request.validationHash ?? request.signedHash) ?? '—'}
            </p>
          </div>

          <div className="flex justify-center mt-8">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors font-medium"
            >
              Exporter PDF
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}