'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import UrgenceStatsCards from '@/components/UrgenceStatsCards';
import LocalSearchBox from '@/components/LocalSearchBox';
import FilterButton from '@/components/FilterButton';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import PatientHistoriqueButton from '@/components/PatientHistoriqueButton';
import ExamenSpeculumForm from '@/components/ExamenSpeculumForm';
import ExamenTechniqueForm from '@/components/ExamenTechniqueForm';
import DiagnosticCytoponctionForm from '@/components/DiagnosticCytoponctionForm';
import { PatientInfo } from '@/components/PatientIdentitySection';
import { useSearch } from '@/components/SearchContext';
import { useAuth } from '@/components/AuthProvider';
import axios from 'axios';
import { API_BASE, getPatientForExamen } from '@/lib/api';
import { matchesAnapathSearch } from '@/lib/searchAnapath';
import { sortByUrgencyThenArrival, getUrgenceLevel, type UrgenceLevel } from '@/lib/urgencySort';
import { formatDateTime, formatRelativeTime } from '@/lib/dateFormat';
import { statusLabel, statusColors, typeExamenLabel, prescripteurLabel, TYPE_EXAMEN_LABELS } from '@/lib/statusLabels';
import { siteOf } from '@/lib/prescriptionContent';
import { isTechnicienUser } from '@/lib/roles';

interface AnapathRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  isExtemporane?: boolean;
  prelevement?: { site: string; description: string };
  resultat?: { conclusion?: string; details?: string } | null;
  validatedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  patientInfo?: PatientInfo | null;
  examenSpeculum?: Record<string, unknown> | null;
  examenTechnique?: Record<string, unknown> | null;
  diagnosticCytoponction?: {
    sitePreleve?: string;
    organe?: string;
    fixation?: string;
    validatedByName?: string | null;
    validatedAt?: string | null;
  } | null;
}

// Le fil de travail technique = les examens en phase d'examen technique
// (acceptés par le technicien). La validation de l'examen technique bascule
// en EN_ATTENTE_PATHOLOGUE : l'examen quitte le fil technicien.
const TECHNICAL_STATUSES = ['EN_COURS'];
// Fil de travail « Commencer l'examen » (pathologiste) : cytoponctions en
// attente de diagnostic anticipé, examens techniques validés prêts pour
// l'examen demandé — et résultats déjà saisis (autosave) encore en attente
// de validation/signature finale.
const PATHOLOGIST_STATUSES = ['EN_ATTENTE_DIAGNOSTIC', 'EN_ATTENTE_PATHOLOGUE', 'RESULTAT_DISPONIBLE'];

const URGENCE_LABELS: Record<UrgenceLevel, string> = {
  STAT: 'Très urgent',
  URGENTE: 'Urgent',
  NORMALE: 'Normal',
};

/** Nom affichable du patient : nom complet enrichi (Accueil), sinon nom+prénom, sinon tiret. */
function patientDisplayName(req: { patientInfo?: { nomComplet?: string | null; nom?: string | null; prenom?: string | null } | null }): string {
  const info = req.patientInfo;
  const complet = info?.nomComplet?.trim();
  if (complet) return complet;
  const assemble = [info?.nom, info?.prenom].filter(Boolean).join(' ').trim();
  return assemble || '—';
}

export default function WorklistPage() {
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  // Fil de travail accessible en lecture seule (Histotechnicien, Secrétaire) :
  // seuls UPDATE / OBSERVATION_WRITE peuvent réellement saisir un résultat.
  const canWrite = hasPermission('anapath:update') || hasPermission('anapath:observation:write');
  // Seul le technicien/histotechnicien traite l'examen technique au quotidien ;
  // le pathologiste peut aussi le prendre (second onglet) mais PAS le spéculum.
  const isTechnicien = isTechnicienUser(user);
  const { searchQuery } = useSearch();
  const [localQuery, setLocalQuery] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterUrgences, setFilterUrgences] = useState<UrgenceLevel[]>([]);
  const [filterStatuts, setFilterStatuts] = useState<string[]>([]);
  const [requests, setRequests] = useState<AnapathRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<AnapathRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<AnapathRequest | null>(null);
  const [modalPatient, setModalPatient] = useState<PatientInfo | null>(null);
  const [modalPatientLoading, setModalPatientLoading] = useState(false);
  const [speculumRequest, setSpeculumRequest] = useState<AnapathRequest | null>(null);
  const [techRequest, setTechRequest] = useState<AnapathRequest | null>(null);
  const [diagRequest, setDiagRequest] = useState<AnapathRequest | null>(null);
  // Le pathologiste a deux onglets : « Commencer l'examen » (défaut) et
  // « Examen technique » (identique au fil de travail du technicien).
  const [tab, setTab] = useState<'suivre' | 'technique'>('suivre');

  // Statuts affichés selon le rôle et l'onglet actif.
  const visibleStatuts = isTechnicien
    ? TECHNICAL_STATUSES
    : tab === 'suivre'
      ? PATHOLOGIST_STATUSES
      : TECHNICAL_STATUSES;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = requests.filter((req) => visibleStatuts.includes(req.statut));
    if (searchQuery.trim()) {
      filtered = filtered.filter((req) => matchesAnapathSearch(req, searchQuery));
    }
    if (localQuery.trim()) {
      filtered = filtered.filter((req) => matchesAnapathSearch(req, localQuery));
    }
    if (filterTypes.length > 0) {
      filtered = filtered.filter((req) => filterTypes.includes(req.typeExamen));
    }
    if (filterUrgences.length > 0) {
      filtered = filtered.filter((req) => filterUrgences.includes(getUrgenceLevel(req)));
    }
    if (filterStatuts.length > 0) {
      filtered = filtered.filter((req) => filterStatuts.includes(req.statut));
    }
    setFilteredRequests(sortByUrgencyThenArrival(filtered));
  }, [searchQuery, localQuery, filterTypes, filterUrgences, filterStatuts, requests, visibleStatuts.join(',')]);

  useEffect(() => {
    if (!selectedRequest?.id) return;
    setModalPatientLoading(true);
    if (selectedRequest.patientInfo?.nomComplet) {
      setModalPatient(selectedRequest.patientInfo);
      setModalPatientLoading(false);
      return;
    }
    getPatientForExamen(selectedRequest.id)
      .then((p) => setModalPatient(p))
      .catch(() => setModalPatient(null))
      .finally(() => setModalPatientLoading(false));
  }, [selectedRequest?.id, selectedRequest?.patientInfo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/anapath`);
      setRequests(response.data);
      setFilteredRequests(response.data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => typeExamenLabel(type);

  const handleSaisirResultat = (id: string) => {
    router.push(`/worklist/${id}`);
  };

  const isFcvPap = (req: AnapathRequest) => req.typeExamen === 'FCV_PAP';
  const speculumDone = (req: AnapathRequest) => Boolean(req.examenSpeculum);

  const openSpeculum = (req: AnapathRequest) => {
    setSelectedRequest(null);
    setSpeculumRequest(req);
  };

  const openExamenTechnique = (req: AnapathRequest) => {
    setSelectedRequest(null);
    setTechRequest(req);
  };

  const openDiagnosticCytoponction = (req: AnapathRequest) => {
    setSelectedRequest(null);
    setDiagRequest(req);
  };

  const renderActions = (req: AnapathRequest) => {
    // Cytoponction : diagnostic anticipé par le pathologiste avant l'examen technique.
    if (req.statut === 'EN_ATTENTE_DIAGNOSTIC') {
      return canWrite ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDiagnosticCytoponction(req);
          }}
          title="Remplir le diagnostic"
          className="px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-700 text-[10px] font-bold hover:bg-cyan-100 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-xs">biotech</span>
          Remplir le diagnostic
        </button>
      ) : null;
    }

    // Phase pathologiste : seul l'examen demandé (le vrai résultat) reste à
    // saisir/valider — y compris un résultat déjà autosauvegardé.
    if (req.statut === 'EN_ATTENTE_PATHOLOGUE' || req.statut === 'RESULTAT_DISPONIBLE') {
      return canWrite ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSaisirResultat(req.id);
          }}
          title="Saisir le résultat d'examen"
          className="p-2 text-primary hover:text-primary/70 transition-colors inline-block"
        >
          <span className="material-symbols-outlined text-base">edit_note</span>
        </button>
      ) : null;
    }

    // Phase examen technique.
    // FCV / Pap test : le spéculum est un préalable obligatoire — tant qu'il
    // n'est pas validé (par le technicien), pas d'examen technique possible.
    if (isFcvPap(req) && !speculumDone(req)) {
      return isTechnicien ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openSpeculum(req);
          }}
          title="Examen au spéculum (préalable obligatoire)"
          className="p-2 text-primary hover:text-primary/70 transition-colors inline-block"
        >
          <span className="material-symbols-outlined text-base">visibility</span>
        </button>
      ) : (
        <span className="inline-block px-2 py-1 rounded text-[10px] italic text-slate-400">
          En attente du spéculum
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openExamenTechnique(req);
        }}
        title="Examen technique"
        className="p-2 text-primary hover:text-primary/70 transition-colors inline-block"
      >
        <span className="material-symbols-outlined text-base">science</span>
      </button>
    );
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

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#191c21]">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <TopBar />
        <div className="flex-1 p-6 w-full">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight">
              {isTechnicien ? 'Fil de travail technique' : 'Fil de travail'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {isTechnicien
                ? "Examens en cours d'examen technique — la validation du compte rendu clôt votre travail et notifie le pathologiste"
                : "Commencez l'examen demandé pour les prélèvements prêts — la saisie du résultat puis la validation s'effectuent dans l'onglet « Commencer l'examen »"}
            </p>
          </div>

          {!isTechnicien && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4 w-fit">
              <button
                type="button"
                onClick={() => setTab('suivre')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === 'suivre'
                    ? 'bg-white text-[#00284d] shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Commencer l&apos;examen
              </button>
              <button
                type="button"
                onClick={() => setTab('technique')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === 'technique'
                    ? 'bg-white text-[#00284d] shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Examen technique
              </button>
            </div>
          )}

          <UrgenceStatsCards requests={filteredRequests} />

          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <LocalSearchBox value={localQuery} onChange={setLocalQuery} placeholder="Rechercher dans le fil de travail..." />
            <FilterButton
              sections={[
                {
                  key: 'urgence',
                  label: 'Urgence',
                  placeholder: 'Toutes les urgences',
                  options: (Object.keys(URGENCE_LABELS) as UrgenceLevel[]).map((lvl) => ({
                    value: lvl,
                    label: URGENCE_LABELS[lvl],
                  })),
                  value: filterUrgences,
                  onChange: (v) => setFilterUrgences(v as UrgenceLevel[]),
                },
                {
                  key: 'type',
                  label: "Type d'examen",
                  placeholder: 'Tous les examens',
                  multiple: true,
                  options: Object.entries(TYPE_EXAMEN_LABELS).map(([code, label]) => ({ value: code, label })),
                  value: filterTypes,
                  onChange: setFilterTypes,
                },
                {
                  key: 'statut',
                  label: 'Statut',
                  placeholder: 'Tous les statuts',
                  options: visibleStatuts.map((statut) => ({
                    value: statut,
                    label: statusLabel(statut),
                  })),
                  value: filterStatuts,
                  onChange: setFilterStatuts,
                },
              ]}
            />
          </div>

          <div className="bg-white rounded-[12px] shadow-sm overflow-hidden border-2 border-[#00478d] mx-[30px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[#1E293B]">
                <thead className="bg-[#1E293B] text-[11px] font-bold text-white/90 uppercase">
                  <tr><th className="p-4 text-left">Patient</th><th className="p-4 text-left">Type examen</th><th className="p-4 text-left">Prélèvement</th><th className="p-4 text-left">Statut</th><th className="p-4 text-left">Date</th><th className="p-4 text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-[#00478d]/40">
                  {filteredRequests.map((req) => {
                    const urgence = getUrgenceLevel(req);
                    return (
                      <tr
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className={`transition-colors group cursor-pointer ${
                          urgence === 'STAT'
                            ? 'bg-red-50 hover:bg-red-100/60'
                            : urgence === 'URGENTE'
                              ? 'bg-amber-50 hover:bg-amber-100/60'
                              : 'hover:bg-[#00478d]/5'
                        }`}
                      >
                        <td className="p-4 font-medium">{patientDisplayName(req)}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold inline-flex items-center gap-1">
                            {getTypeLabel(req.typeExamen)}
                            {urgence === 'STAT' && (
                              <span className="px-1.5 py-px rounded-full bg-red-600 text-white text-[7px] leading-normal font-bold stat-pulse whitespace-nowrap">
                                TRES URGENT
                              </span>
                            )}
                            {urgence === 'URGENTE' && (
                              <span className="px-1 py-px rounded-full bg-orange-500 text-white text-[7px] leading-normal font-bold">
                                URGENT
                              </span>
                            )}
                          </span>
                          {prescripteurLabel(req.metadata) && (
                            <span className="block mt-1 text-[10px] font-semibold text-slate-500">{prescripteurLabel(req.metadata)}</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-500">
                          {siteOf(req) ? (
                            <div>
                              <span className="font-semibold text-slate-700">{siteOf(req)}</span>
                              {req.prelevement?.description && (
                                <span className="block text-slate-400 mt-0.5">{req.prelevement.description}</span>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.statut === 'RESULTAT_DISPONIBLE'
                              ? 'bg-amber-100 text-amber-800'
                              : statusColors[req.statut] || 'bg-gray-100 text-gray-700'
                          }`}>
                            {statusLabel(req.statut)}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          <div>{formatDateTime(req.createdAt)}</div>
                          <div className="text-[10px] text-slate-400">{formatRelativeTime(req.createdAt)}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">{renderActions(req)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRequests.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  {isTechnicien || tab === 'technique'
                    ? 'Le fil de travail technique est vide — aucun examen en cours.'
                    : 'Aucun examen prêt pour l\'examen demandé.'}
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 text-center text-xs text-slate-400">Total: {filteredRequests.length} demande(s)</div>
        </div>
      </main>

      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sticky top-0 bg-gradient-to-r from-[#00284d] to-[#00478d] z-10">
              <h3 className="font-bold text-lg text-white">Détail de la prescription</h3>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Fermer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5">
              <PrescriptionDetails
                request={selectedRequest}
                patient={modalPatient}
                patientLoading={modalPatientLoading}
                historiqueButton={
                  <PatientHistoriqueButton
                    entries={requests.filter((r) => r.patientId === selectedRequest.patientId && r.id !== selectedRequest.id)}
                  />
                }
              />
              <div className="flex flex-col items-center gap-2 mt-6">
                {selectedRequest.statut === 'EN_ATTENTE_DIAGNOSTIC' ? (
                  canWrite ? (
                    <button
                      onClick={() => openDiagnosticCytoponction(selectedRequest)}
                      className="px-8 py-3 bg-cyan-700 text-white font-bold rounded-full shadow-md hover:bg-cyan-800 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">biotech</span>
                      Remplir le diagnostic
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Consultation en lecture seule</p>
                  )
                ) : selectedRequest.statut === 'EN_ATTENTE_PATHOLOGUE' || selectedRequest.statut === 'RESULTAT_DISPONIBLE' ? (
                  canWrite ? (
                    <button
                      onClick={() => handleSaisirResultat(selectedRequest.id)}
                      className="px-8 py-3 bg-green-600 text-white font-bold rounded-full shadow-md hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">edit_note</span>
                      Saisir le résultat d'examen
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Consultation en lecture seule</p>
                  )
                ) : (
                  <>
                    {isFcvPap(selectedRequest) && !speculumDone(selectedRequest) ? (
                      isTechnicien ? (
                        <button
                          onClick={() => openSpeculum(selectedRequest)}
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
                        onClick={() => openExamenTechnique(selectedRequest)}
                        className="px-8 py-3 bg-[#00284d] text-white font-bold rounded-full shadow-md hover:opacity-90 transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined">science</span>
                        Examen technique
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {speculumRequest && isTechnicien && (
        <ExamenSpeculumForm
          requestId={speculumRequest.id}
          anapathId={speculumRequest.anapathId}
          patientName={patientDisplayName(speculumRequest)}
          initialData={speculumRequest.examenSpeculum}
          prescripteurNom={(speculumRequest.metadata?.prescripteurNom as string | undefined) ?? null}
          onClose={() => setSpeculumRequest(null)}
          onSaved={async () => {
            setSpeculumRequest(null);
            await fetchData();
          }}
        />
      )}

      {techRequest && (
        <ExamenTechniqueForm
          requestId={techRequest.id}
          anapathId={techRequest.anapathId}
          patientName={patientDisplayName(techRequest)}
          initialData={techRequest.examenTechnique}
          onClose={() => setTechRequest(null)}
          onSaved={async () => {
            setTechRequest(null);
            await fetchData();
          }}
        />
      )}

      {diagRequest && (
        <DiagnosticCytoponctionForm
          requestId={diagRequest.id}
          anapathId={diagRequest.anapathId}
          patientName={patientDisplayName(diagRequest)}
          initialData={diagRequest.diagnosticCytoponction}
          onClose={() => setDiagRequest(null)}
          onSaved={async () => {
            setDiagRequest(null);
            await fetchData();
          }}
        />
      )}
    </div>
  );
}
