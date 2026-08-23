'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import UrgenceStatsCards from '@/components/UrgenceStatsCards';
import LocalSearchBox from '@/components/LocalSearchBox';
import FilterButton from '@/components/FilterButton';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import PatientHistoriqueButton, { type HistoriqueEntry } from '@/components/PatientHistoriqueButton';
import { PatientInfo } from '@/components/PatientIdentitySection';
import { useSearch } from '@/components/SearchContext';
import axios from 'axios';
import { API_BASE, getPatientForExamen } from '@/lib/api';
import { filterAndSortAnapathRequests, matchesAnapathSearch } from '@/lib/searchAnapath';
import { formatDateTime, formatRelativeTime, formatDateLong } from '@/lib/dateFormat';
import { typeExamenLabel, prescripteurLabel, TYPE_EXAMEN_LABELS } from '@/lib/statusLabels';
import FloatingModal from '@/components/FloatingModal';

interface AnapathRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  validatedAt: string | null;
  validatedByUserId: string | null;
  resultat: { conclusion: string; details: string } | null;
  prelevement?: {
    site?: string;
    description?: string;
    clinicalData?: { treatmentType?: string; suspicion?: string; clinicalNotes?: string };
  } | null;
  metadata?: Record<string, unknown> | null;
  isExtemporane?: boolean;
  patientInfo?: PatientInfo | null;
}

const TYPE_LABELS = TYPE_EXAMEN_LABELS;

/** Nom affichable du patient : nom complet enrichi (Accueil), sinon nom+prénom, sinon tiret. */
function patientDisplayName(req: { patientInfo?: PatientInfo | null }): string {
  const info = req.patientInfo;
  const complet = info?.nomComplet?.trim();
  if (complet) return complet;
  const assemble = [info?.nom, info?.prenom].filter(Boolean).join(' ').trim();
  return assemble || '—';
}

export default function ArchivesPage() {
  const { searchQuery } = useSearch();
  const [localQuery, setLocalQuery] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [requests, setRequests] = useState<AnapathRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<AnapathRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<AnapathRequest | null>(null);
  const [modalPatient, setModalPatient] = useState<PatientInfo | null>(null);
  const [modalPatientLoading, setModalPatientLoading] = useState(false);
  const [exportingModal, setExportingModal] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [patientHistorique, setPatientHistorique] = useState<HistoriqueEntry[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = requests;
    if (filterTypes.length > 0) filtered = filtered.filter((req) => filterTypes.includes(req.typeExamen));
    if (localQuery.trim()) filtered = filtered.filter((req) => matchesAnapathSearch(req, localQuery));
    setFilteredRequests(filterAndSortAnapathRequests(filtered, searchQuery));
  }, [searchQuery, localQuery, filterTypes, requests]);

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

  // La liste locale ne contient que les examens VALIDE : on va chercher
  // l'historique complet du patient (tous statuts) côté serveur.
  useEffect(() => {
    if (!selectedRequest?.patientId) {
      setPatientHistorique([]);
      return;
    }
    axios.get(`${API_BASE}/anapath`, { params: { patientId: selectedRequest.patientId } })
      .then((res) => setPatientHistorique(
        (res.data as AnapathRequest[]).filter((r) => r.id !== selectedRequest.id),
      ))
      .catch(() => setPatientHistorique([]));
  }, [selectedRequest?.patientId, selectedRequest?.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/anapath`);
      const validatedRequests = response.data.filter((req: AnapathRequest) => req.statut === 'VALIDE');
      setRequests(validatedRequests);
      setFilteredRequests(validatedRequests);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => typeExamenLabel(type);

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      BIOPSIE: 'bg-blue-100 text-blue-700',
      FCV_PAP: 'bg-purple-100 text-purple-700',
      CYT0PONCTION: 'bg-green-100 text-green-700',
      LIQUIDE: 'bg-yellow-100 text-yellow-700',
      EXTEMPORANE_STAT: 'bg-red-100 text-red-700',
      POS: 'bg-indigo-100 text-indigo-700',
      POC: 'bg-pink-100 text-pink-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const handleDownloadPDF = async (req: AnapathRequest, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(req.id);
    try {
      const patient = req.patientInfo?.nomComplet ? req.patientInfo : await getPatientForExamen(req.id);
      const { generatePDF } = await import('@/lib/generatePDF');
      await generatePDF(req, patient);
    } catch (error) {
      console.error('Erreur PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleExportModalPDF = async () => {
    if (!selectedRequest) return;
    setExportingModal(true);
    try {
      const { generatePDF } = await import('@/lib/generatePDF');
      await generatePDF(selectedRequest, modalPatient);
    } catch (error) {
      console.error('Erreur PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setExportingModal(false);
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

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#191c21]">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <TopBar />
        <div className="flex-1 p-6 w-full">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight">Examens archivés</h2>
            <p className="text-slate-500 text-sm mt-1">Registre des comptes-rendus validés</p>
          </div>

          <UrgenceStatsCards requests={filteredRequests} />

          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <LocalSearchBox value={localQuery} onChange={setLocalQuery} placeholder="Rechercher dans les archives..." />
            <FilterButton
              sections={[
                {
                  key: 'type',
                  label: "Type d'examen",
                  placeholder: 'Tous les examens',
                  multiple: true,
                  options: Object.entries(TYPE_LABELS).map(([code, label]) => ({ value: code, label })),
                  value: filterTypes,
                  onChange: setFilterTypes,
                },
              ]}
            />
          </div>

          <div className="bg-white rounded-[12px] shadow-sm overflow-hidden border-2 border-[#00478d] mx-[30px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[#1E293B]">
                <thead className="bg-[#1E293B] text-[11px] font-bold text-white/90 uppercase">
                  <tr>
                    <th className="p-4 text-left">Patient</th>
                    <th className="p-4 text-left">Type examen</th>
                    <th className="p-4 text-left">Diagnostic</th>
                    <th className="p-4 text-left">Validé par</th>
                    <th className="p-4 text-left">Date validation</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#00478d]/40">
                  {filteredRequests.map((req) => (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className="hover:bg-[#00478d]/5 transition-colors group cursor-pointer"
                    >
                      <td className="p-4 font-medium">{patientDisplayName(req)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getTypeBadge(req.typeExamen)}`}>
                          {getTypeLabel(req.typeExamen)}
                        </span>
                        {prescripteurLabel(req.metadata) && (
                          <span className="block mt-1 text-[10px] font-semibold text-slate-500">{prescripteurLabel(req.metadata)}</span>
                        )}
                      </td>
                      <td className="p-4 max-w-xs truncate text-slate-600">{req.resultat?.conclusion || '-'}</td>
                      <td className="p-4 text-slate-500 text-xs">{req.validatedByUserId || '-'}</td>
                      <td className="p-4 text-slate-500 text-xs">
                        {req.validatedAt ? (
                          <>
                            <div>{formatDateTime(req.validatedAt)}</div>
                            <div className="text-[10px] text-slate-400">{formatRelativeTime(req.validatedAt)}</div>
                          </>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleDownloadPDF(req, e)}
                          disabled={downloadingId === req.id}
                          title="Télécharger le PDF"
                          className="p-2 text-slate-400 hover:text-primary transition-colors inline-block disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-base">
                            {downloadingId === req.id ? 'progress_activity' : 'download'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRequests.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <span className="material-symbols-outlined text-5xl">inbox</span>
                  <p className="mt-2">Aucune archive trouvée</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {selectedRequest && (
        <FloatingModal
          open
          onClose={() => setSelectedRequest(null)}
          icon="description"
          title="Détails de l'examen"
        >
          <PrescriptionDetails
            request={selectedRequest}
            patient={modalPatient}
            patientLoading={modalPatientLoading}
            historiqueButton={<PatientHistoriqueButton entries={patientHistorique} />}
          />

              <div className="bg-green-50 border border-green-100 rounded-lg p-4 mt-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-green-700">verified</span>
                  <h4 className="font-bold text-green-800">Résultat d'examen</h4>
                </div>
                <div className="mb-3">
                  <p className="text-xs text-slate-500">Conclusion</p>
                  <p className="font-medium text-on-surface">{selectedRequest.resultat?.conclusion || '—'}</p>
                </div>
                <div className="mb-3">
                  <p className="text-xs text-slate-500">Détails de résultat</p>
                  <p className="font-medium text-on-surface whitespace-pre-wrap">{selectedRequest.resultat?.details || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Validé par</p>
                    <p className="font-medium text-on-surface">{selectedRequest.validatedByUserId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Date de validation</p>
                    <p className="font-medium text-on-surface">
                      {selectedRequest.validatedAt ? formatDateLong(selectedRequest.validatedAt) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-6">
                <button
                  onClick={handleExportModalPDF}
                  disabled={exportingModal}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white rounded-full hover:bg-blue-800 transition-colors font-semibold disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">
                    {exportingModal ? 'progress_activity' : 'picture_as_pdf'}
                  </span>
                  {exportingModal ? 'Génération...' : 'Exporter PDF'}
                </button>
              </div>
        </FloatingModal>
      )}
    </div>
  );
}
