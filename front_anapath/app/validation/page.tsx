'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import PatientIdentitySection, { PatientInfo } from '@/components/PatientIdentitySection';
import PatientHistoriqueButton, { type HistoriqueEntry } from '@/components/PatientHistoriqueButton';
import VoiceInputButton from '@/components/VoiceInputButton';
import ExamenSpeculumForm from '@/components/ExamenSpeculumForm';
import { useSearch } from '@/components/SearchContext';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastContext';
import axios from 'axios';
import { formatDateLong } from '@/lib/dateFormat';
import { getPatientForExamen, marquerNotifLue, API_BASE } from '@/lib/api';
import { getTypeLabel } from '@/lib/generatePDF';
import { sortByUrgencyThenArrival } from '@/lib/urgencySort';

interface AnapathRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  prelevement: {
    site: string;
    description: string;
    clinicalData?: {
      treatmentType?: string;
      suspicion?: string;
      clinicalNotes?: string;
    };
  };
  resultat: { conclusion: string; details: string } | null;
  createdAt: string;
  isExtemporane?: boolean;
  episodeId?: string | null;
  metadata?: Record<string, unknown> | null;
  patientInfo?: PatientInfo | null;
  examenSpeculum?: Record<string, unknown> | null;
}

/** Nom affichable du patient : nom complet enrichi (Accueil), sinon nom+prénom, sinon tiret. */
function patientDisplayName(req: { patientInfo?: PatientInfo | null }): string {
  const info = req.patientInfo;
  const complet = info?.nomComplet?.trim();
  if (complet) return complet;
  const assemble = [info?.nom, info?.prenom].filter(Boolean).join(' ').trim();
  return assemble || '—';
}

/** Colle la transcription en direct au texte définitif, sans dédoubler les séparateurs. */
function withInterim(committed: string, interim: string): string {
  if (!interim) return committed;
  if (interim.startsWith('\n')) return committed + interim;
  return committed.trim() ? `${committed} ${interim}` : interim;
}

function ValidationPageContent() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get('id');

  const { searchQuery } = useSearch();
  const { hasPermission, user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission('anapath:update');
  const canSign  = hasPermission('anapath:validate');
  // anapath:observation:write : permission plus étroite que anapath:update,
  // pour un rôle qui peut saisir un résultat provisoire (ex: Interne
  // qualifiant) sans gérer tout le dossier, remplir l'examen au spéculum
  // (réservé à canWrite ci-dessus) ni valider/signer (canSign).
  const canWriteObservation = canWrite || hasPermission('anapath:observation:write');
  const [requests, setRequests] = useState<AnapathRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<AnapathRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AnapathRequest | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [resultData, setResultData] = useState({ details: '', conclusion: '' });
  // Transcription vocale en direct : mots provisoires affichés en plus du texte définitif.
  const [interimDetails, setInterimDetails] = useState('');
  const [interimConclusion, setInterimConclusion] = useState('');
  const [noteInterim, setNoteInterim] = useState('');
  const [signature, setSignature] = useState({ signature: '', ordreProfessionnelNumber: '' });
  const [ippNumber, setIppNumber] = useState('');
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [noteText, setNoteText] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showSpeculumModal, setShowSpeculumModal] = useState(false);
  const [patientHistorique, setPatientHistorique] = useState<HistoriqueEntry[]>([]);

  // FCV/Pap test : l'examen au spéculum doit être soumis avant de pouvoir
  // saisir le résultat.
  const needsSpeculum =
    selectedRequest?.typeExamen === 'FCV_PAP' && !selectedRequest?.examenSpeculum;
  // Évite qu'un changement programmatique de résultData (populateFields, à la
  // sélection d'une nouvelle demande) ne déclenche une sauvegarde automatique.
  const skipAutosaveRef = useRef(true);

  useEffect(() => {
    if (!selectedRequest?.id) return;
    setPatientLoading(true);
    if (selectedRequest.patientInfo?.nomComplet) {
      setPatient(selectedRequest.patientInfo);
      setPatientLoading(false);
      return;
    }
    getPatientForExamen(selectedRequest.id)
      .then((p) => setPatient(p))
      .catch(() => setPatient(null))
      .finally(() => setPatientLoading(false));
  }, [selectedRequest?.id, selectedRequest?.patientInfo]);

  // La liste locale (readyForValidation) exclut les examens déjà validés :
  // on va chercher l'historique complet du patient (tous statuts) côté serveur.
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

  useEffect(() => {
    fetchData();
  }, []);

  // Signature automatique : le nom d'utilisateur + le n° d'ordre professionnel
  // fournis par le service des utilisateurs. Plus rien à saisir à la validation.
  useEffect(() => {
    if (user?.name) {
      setSignature((prev) => ({ ...prev, signature: user.name.trim() }));
    }
  }, [user?.name]);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/anapath/profile`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && typeof d?.ordreProfessionnel === 'string') {
          setSignature((prev) => ({
            ...prev,
            ordreProfessionnelNumber: d.ordreProfessionnel,
          }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.name]);

  // Une nouvelle demande vient d'être chargée : ne pas déclencher l'autosave
  // sur les valeurs qu'on vient de repeupler nous-mêmes.
  useEffect(() => {
    skipAutosaveRef.current = true;
    setInterimDetails('');
    setInterimConclusion('');
  }, [selectedRequest?.id]);

  // La note (brouillon) est un scratch-pad local à l'appareil, propre à
  // chaque demande — pas la donnée officielle, juste de quoi préparer le
  // résultat avant de le saisir (ou l'y importer).
  useEffect(() => {
    if (!selectedRequest?.id) {
      setNoteText('');
      return;
    }
    setNoteText(localStorage.getItem(`anapath_note_${selectedRequest.id}`) ?? '');
  }, [selectedRequest?.id]);

  const updateNoteText = (text: string) => {
    setNoteText(text);
    if (selectedRequest) localStorage.setItem(`anapath_note_${selectedRequest.id}`, text);
  };

  // Fermeture du modal note : on oublie la transcription en direct en cours.
  useEffect(() => {
    if (!showNoteModal) setNoteInterim('');
  }, [showNoteModal]);

  const handleImportNoteToResultat = () => {
    setResultData((prev) => ({
      ...prev,
      details: prev.details.trim() ? `${prev.details}\n\n${noteText}` : noteText,
    }));
  };

  // Sauvegarde automatique du résultat et de la conclusion, avec un léger
  // délai après la dernière frappe — pour ne rien perdre en cas de coupure.
  useEffect(() => {
    if (!selectedRequest) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      autoSaveResult();
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultData.details, resultData.conclusion]);

  useEffect(() => {
    let filtered = requests;
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (req: AnapathRequest) =>
          req.anapathId.toLowerCase().includes(query) ||
          req.patientId.toLowerCase().includes(query) ||
          req.typeExamen.toLowerCase().includes(query)
      );
    }
    setFilteredRequests(filtered);

    if (preselectedId && filtered.length > 0) {
      const found = filtered.find(
        (req: AnapathRequest) =>
          req.id === preselectedId ||
          req.anapathId === preselectedId,
      );
      if (found) {
        setSelectedRequest(found);
        populateFields(found);
        return;
      }
    }

    if (filtered.length > 0 && !selectedRequest) {
      setSelectedRequest(filtered[0]);
      populateFields(filtered[0]);
    }
  }, [searchQuery, requests, preselectedId]);

  const populateFields = (request: AnapathRequest) => {
    const details =
      request.resultat?.details ?? (request as any).resultatDetails ?? '';
    const conclusion =
      request.resultat?.conclusion ?? (request as any).resultatConclusion ?? '';
    if (details || conclusion) {
      setResultData({ details, conclusion });
    } else {
      setResultData({ details: '', conclusion: '' });
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/anapath`);
      const readyForValidation: AnapathRequest[] = response.data.filter(
        (req: AnapathRequest) =>
          req.statut === 'CREEE' ||
          req.statut === 'EN_ATTENTE' ||
          req.statut === 'RESULTAT_DISPONIBLE',
      );
      const pendingRequests = sortByUrgencyThenArrival<AnapathRequest>(readyForValidation);
      setRequests(pendingRequests);
      setFilteredRequests(pendingRequests);

      if (preselectedId) {
        const found = pendingRequests.find(
          (req: AnapathRequest) =>
            req.id === preselectedId ||
            req.anapathId === preselectedId,
        );
        if (found) {
          setSelectedRequest(found);
          populateFields(found);
        } else if (pendingRequests.length > 0) {
          setSelectedRequest(pendingRequests[0]);
          populateFields(pendingRequests[0]);
        }
      } else if (pendingRequests.length > 0) {
        setSelectedRequest(pendingRequests[0]);
        populateFields(pendingRequests[0]);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRequest = async (id: string) => {
    try {
      const response = await axios.get(`${API_BASE}/anapath/${id}`);
      setSelectedRequest(response.data);
      populateFields(response.data);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleSaveResult = async () => {
    if (!selectedRequest) return;

    const prelevementData = {
      site: selectedRequest.prelevement?.site || '',
      description: selectedRequest.prelevement?.description || '',
      // Renseignés par le service Prescription, non modifiables depuis la Validation :
      // on les renvoie tels quels pour ne pas les écraser (le PATCH remplace tout l'objet prelevement).
      clinicalData: selectedRequest.prelevement?.clinicalData || {},
    };

    try {
      setUpdating(true);
      await axios.patch(`${API_BASE}/anapath/${selectedRequest.id}`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
        statut: 'RESULTAT_DISPONIBLE',
        prelevement: prelevementData,
      });

      await marquerNotifLue(selectedRequest.id);

      await fetchData();
      if (selectedRequest) {
        const response = await axios.get(`${API_BASE}/anapath/${selectedRequest.id}`);
        setSelectedRequest(response.data);
        populateFields(response.data);
      }
      toast.success('Enregistré avec succès');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setUpdating(false);
    }
  };

  const autoSaveResult = async () => {
    if (!selectedRequest) return;

    try {
      setAutoSaveState('saving');
      // Route dédiée (anapath:observation:write) : ne touche qu'au résultat/
      // conclusion, pas au statut de validation finale ni au prélèvement —
      // accessible à la Secrétaire pour la transcription en direct.
      await axios.patch(`${API_BASE}/anapath/${selectedRequest.id}/resultat`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
      });
      setAutoSaveState('saved');
    } catch (error) {
      console.error('Erreur auto-save:', error);
      setAutoSaveState('error');
    }
  };

  const handleValidate = async () => {
    if (!selectedRequest) return;

    if (!resultData.details.trim() || !resultData.conclusion.trim()) {
      alert('Veuillez saisir le résultat et la conclusion.');
      return;
    }
    if (!ippNumber.trim()) {
      alert('Veuillez saisir le numéro de dossier (IPP).');
      return;
    }
    if (!signature.signature.trim() || !signature.ordreProfessionnelNumber.trim()) {
      alert('Veuillez remplir les champs de signature.');
      return;
    }

    if (selectedRequest.statut !== 'RESULTAT_DISPONIBLE') {
      await handleSaveResult();
      await fetchData();
      if (selectedRequest) await loadRequest(selectedRequest.id);
    }

    try {
      setUpdating(true);
      const numeroOrdre = signature.ordreProfessionnelNumber;
      const hashInput = `${selectedRequest.anapathId}-${signature.signature}-${numeroOrdre}`;
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(hashInput),
      );
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await axios.patch(`${API_BASE}/anapath/${selectedRequest.id}`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
        signature: signature.signature,
        numeroOrdre,
        hash,
        statut: 'VALIDE',
      });

      await marquerNotifLue(selectedRequest.id);

      toast.success('Validé avec succès');
      await fetchData();
      if (filteredRequests.length > 1) {
        setSelectedRequest(filteredRequests[1]);
        loadRequest(filteredRequests[1].id);
      } else {
        setSelectedRequest(null);
        setResultData({ details: '', conclusion: '' });
        setSignature({ signature: user?.name?.trim() ?? '', ordreProfessionnelNumber: '' });
        setIppNumber('');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la validation');
    } finally {
      setUpdating(false);
    }
  };

  const isFormValid = () => {
    return (
      resultData.details.trim() !== '' &&
      resultData.conclusion.trim() !== '' &&
      ippNumber.trim() !== '' &&
      signature.signature.trim() !== '' &&
      signature.ordreProfessionnelNumber.trim() !== ''
    );
  };

  // ============================================================
  // EXPORT PDF
  // ============================================================
  const handleExportPDF = async () => {
    if (!selectedRequest) {
      alert('Aucun examen sélectionné.');
      return;
    }

    try {
      const { generatePDF } = await import('@/lib/generatePDF');
      await generatePDF(
        {
          ...selectedRequest,
          ippNumber,
          resultatDetails: resultData.details,
          resultatConclusion: resultData.conclusion,
          resultat: {
            details: resultData.details,
            conclusion: resultData.conclusion,
          },
          validatedBySignature: signature.signature,
          validatedByUserId: signature.ordreProfessionnelNumber,
        },
        patient,
      );
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

  return (
    <div className="flex min-h-screen bg-transparent text-on-surface">
      <div className="fixed inset-0 grain-overlay z-[60] pointer-events-none"></div>
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <TopBar />

        <div className="flex-1 p-6 w-full">
          <div className="max-w-4xl mx-auto space-y-4 pt-4 pb-8">
            {filteredRequests.length > 0 ? (
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 uppercase">Demande à traiter</label>
                <select
                  value={selectedRequest?.id || ''}
                  onChange={(e) => loadRequest(e.target.value)}
                  className="w-full mt-1 p-3 bg-white border border-outline-variant/30 rounded-lg text-sm"
                >
                  {filteredRequests.map((req: AnapathRequest) => (
                    <option key={req.id} value={req.id}>
                      {req.anapathId} - {patientDisplayName(req)} - {getTypeLabel(req.typeExamen)}
                      {req.isExtemporane && ' - TRES URGENT'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="bg-green-50 p-6 rounded-xl text-center mb-6">
                <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
                <p className="text-green-700 font-semibold mt-2">Aucune demande en attente de validation</p>
              </div>
            )}

            {selectedRequest && (
              <>
                <div className="py-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-outline-variant pb-3">
                  <div className="text-center sm:text-left">
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Compte Rendu d'Examen</p>
                    <h2 className="text-2xl font-bold text-on-surface">Anatomo-Pathologique</h2>
                  </div>
                  <input
                    type="text"
                    value={ippNumber}
                    onChange={(e) => setIppNumber(e.target.value)}
                    placeholder="F26399"
                    className="w-32 px-2 py-1 text-sm font-bold text-on-surface bg-surface-container-low border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden">
                      <div className="p-4 bg-surface-container-low border-b border-outline-variant">
                        <PatientIdentitySection
                          examen={selectedRequest}
                          patient={patient}
                          loading={patientLoading}
                          historiqueButton={<PatientHistoriqueButton entries={patientHistorique} />}
                        />
                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-4 pt-4 border-t border-outline-variant">
                          <div>
                            <p className="text-xs text-on-surface-variant">Type d'examen</p>
                            <p className="font-medium text-on-surface">{getTypeLabel(selectedRequest.typeExamen)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-on-surface-variant">Date Prélèvement</p>
                            <p className="font-medium text-on-surface">{formatDateLong(selectedRequest.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-on-surface-variant">Site de prélèvement</p>
                            <p className="font-medium text-on-surface">{selectedRequest.prelevement?.site || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-secondary">stethoscope</span>
                        <div>
                          <p className="text-xs text-on-surface-variant">Service demandeur</p>
                          <p className="font-medium text-on-surface">{(selectedRequest.metadata?.serviceNom as string) ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 mt-3">
                        <span className="material-symbols-outlined text-secondary">local_hospital</span>
                        <div>
                          <p className="text-xs text-on-surface-variant">CHU</p>
                          <p className="font-medium text-on-surface">{(selectedRequest.metadata?.chuNom as string) ?? '—'}</p>
                        </div>
                      </div>
                      <hr className="border-outline-variant my-3" />

                      {/* Renseignés par le service Prescription — lecture seule, cf. détails de prescription */}
                      <div className="mb-3">
                        <p className="text-xs text-on-surface-variant">Type de traitement</p>
                        <p className="font-medium text-on-surface">
                          {selectedRequest.prelevement?.clinicalData?.treatmentType || '—'}
                        </p>
                      </div>

                      <div className="mb-3">
                        <p className="text-xs text-on-surface-variant">Suspicion diagnostique</p>
                        <p className="font-medium text-on-surface italic leading-relaxed">
                          {selectedRequest.prelevement?.clinicalData?.suspicion || '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-on-surface-variant">Renseignements cliniques</p>
                        <p className="font-medium text-on-surface italic leading-relaxed">
                          {selectedRequest.prelevement?.clinicalData?.clinicalNotes || '—'}
                        </p>
                      </div>
                    </section>
                  </div>

                  <div className="space-y-4">
                    {needsSpeculum ? (
                      <section className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-6 text-center">
                        <span className="material-symbols-outlined text-4xl text-amber-600">clinical_notes</span>
                        <p className="font-bold text-amber-800 mt-2">Examen au spéculum requis</p>
                        <p className="text-sm text-amber-700 mt-1">
                          Pour un FCV / Pap test, l&apos;examen au spéculum doit être soumis avant de pouvoir saisir le résultat.
                        </p>
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => setShowSpeculumModal(true)}
                            className="mt-4 px-6 py-2.5 bg-amber-600 text-white rounded-full font-semibold text-sm hover:opacity-90 inline-flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-base">clinical_notes</span>
                            Remplir l&apos;examen spéculum
                          </button>
                        ) : (
                          <p className="mt-4 text-xs text-amber-700 flex items-center justify-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">lock</span>
                            Cette étape doit être complétée par un technicien, un pathologiste ou un chef de service.
                          </p>
                        )}
                      </section>
                    ) : (
                      <>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedRequest?.typeExamen === 'FCV_PAP' && selectedRequest?.examenSpeculum && (
                        <span
                          title="L'examen au spéculum a déjà été soumis pour cette demande"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold"
                        >
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          Examen spéculum
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowNoteModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">
                          {noteText.trim() ? 'sticky_note_2' : 'note_add'}
                        </span>
                        {noteText.trim() ? 'Voir la note' : 'Prendre une note'}
                      </button>
                      {noteText.trim() && (
                        <button
                          type="button"
                          onClick={handleImportNoteToResultat}
                          title="Copier le contenu de la note dans le champ Résultat"
                          className="group inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold shadow-sm hover:bg-primary hover:text-white hover:border-primary hover:shadow-md active:scale-95 transition-all duration-150"
                        >
                          <span className="material-symbols-outlined text-base transition-transform group-hover:translate-y-0.5">content_paste_go</span>
                          Importer la note
                        </button>
                      )}
                    </div>

                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">RÉSULTAT : <span className="text-red-500">*</span></p>
                        {canWriteObservation && (
                          <VoiceInputButton
                            onResult={(text) =>
                              setResultData((prev) => ({
                                ...prev,
                                details: prev.details.trim() ? `${prev.details} ${text}` : text,
                              }))
                            }
                            onInterim={(t) => setInterimDetails(t ?? '')}
                          />
                        )}
                      </div>
                      <textarea
                        value={withInterim(resultData.details, interimDetails)}
                        onChange={(e) => {
                          setResultData({ ...resultData, details: e.target.value });
                          setInterimDetails('');
                        }}
                        className={`w-full p-2 border rounded-lg bg-surface-container-low border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-medium text-on-surface ${!canWriteObservation ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Saisir les résultats de l'examen ici..."
                        rows={12}
                        required
                        disabled={!canWriteObservation}
                      />
                    </section>

                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">CONCLUSION : <span className="text-red-500">*</span></p>
                        {canWriteObservation && (
                          <VoiceInputButton
                            onResult={(text) =>
                              setResultData((prev) => ({
                                ...prev,
                                conclusion: prev.conclusion.trim() ? `${prev.conclusion} ${text}` : text,
                              }))
                            }
                            onInterim={(t) => setInterimConclusion(t ?? '')}
                          />
                        )}
                      </div>
                      <textarea
                        value={withInterim(resultData.conclusion, interimConclusion)}
                        onChange={(e) => {
                          setResultData({ ...resultData, conclusion: e.target.value });
                          setInterimConclusion('');
                        }}
                        className={`w-full p-2 border rounded-lg bg-surface-container-low border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-medium text-on-surface ${!canWriteObservation ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Saisir la conclusion ici..."
                        rows={4}
                        required
                        disabled={!canWriteObservation}
                      />
                    </section>

                    <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                      {autoSaveState === 'saving' && (
                        <>
                          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                          Enregistrement automatique...
                        </>
                      )}
                      {autoSaveState === 'saved' && (
                        <>
                          <span className="material-symbols-outlined text-sm text-green-600">cloud_done</span>
                          Enregistré automatiquement
                        </>
                      )}
                      {autoSaveState === 'error' && (
                        <>
                          <span className="material-symbols-outlined text-sm text-red-500">cloud_off</span>
                          Échec de l&apos;enregistrement automatique
                        </>
                      )}
                      {autoSaveState === 'idle' && (
                        <>
                          <span className="material-symbols-outlined text-sm">cloud</span>
                          Vos saisies sont enregistrées automatiquement
                        </>
                      )}
                    </p>
                      </>
                    )}
                  </div>
                </div>

                {canSign && (
                  <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4 md:p-6 mt-4">
                    <div className="text-center">
                      <p className="text-xs text-on-surface-variant mb-4">
                        Fait à Fianarantsoa, le {formatDateLong(new Date())}
                      </p>

                      <div className="mt-6 border-t border-outline-variant pt-4">
                        <p className="text-sm font-bold text-on-surface-variant flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined text-primary">verified</span>
                          Signature numérique
                        </p>

                        <div className="mt-4 w-full max-w-sm mx-auto space-y-3">
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Signature électronique <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={signature.signature}
                              readOnly
                              className="w-full mt-1 p-2 bg-[#e8eaf0] border border-outline-variant/30 rounded-lg text-sm cursor-not-allowed"
                              placeholder="Signature électronique"
                              title="Générée automatiquement à partir de votre nom d'utilisateur"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">N° Ordre professionnel <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={signature.ordreProfessionnelNumber}
                              readOnly
                              className="w-full mt-1 p-2 bg-[#e8eaf0] border border-outline-variant/30 rounded-lg text-sm cursor-not-allowed"
                              placeholder={signature.ordreProfessionnelNumber ? '' : 'Géré par le service des utilisateurs'}
                              title="Provient de votre compte (service utilisateurs)"
                              required
                            />
                          </div>
                          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                            <span className="material-symbols-outlined text-xs">auto_awesome</span>
                            Signature automatique — modifiable dans « Mon profil »
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap gap-3 items-center justify-center pt-6 pb-4 border-t border-outline-variant">
                  <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors font-medium"
                  >
                    Exporter PDF
                  </button>
                  {canSign && (
                    <button
                      onClick={handleValidate}
                      disabled={!isFormValid() || updating}
                      className={`flex items-center gap-2 px-5 h-10 rounded-full font-bold uppercase tracking-wider shadow-sm transition-all ${
                        isFormValid() && !updating
                          ? 'bg-green-700 text-white hover:opacity-90'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      Valider le résultat
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {showNoteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowNoteModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#00284d] to-[#00478d]">
                <h3 className="font-bold text-lg text-white">Note (brouillon)</h3>
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="text-white/70 hover:text-white transition-colors"
                  aria-label="Fermer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="flex justify-end mb-2">
                  <VoiceInputButton
                    onResult={(text) => updateNoteText(noteText.trim() ? `${noteText} ${text}` : text)}
                    onInterim={(t) => setNoteInterim(t ?? '')}
                  />
                </div>
                <textarea
                  value={withInterim(noteText, noteInterim)}
                  onChange={(e) => {
                    updateNoteText(e.target.value);
                    setNoteInterim('');
                  }}
                  rows={8}
                  placeholder="Écrivez ou dictez votre brouillon ici..."
                  className="w-full p-2 border rounded-lg bg-surface-container-low border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-medium text-on-surface"
                />
                <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-1.5">
                  <span className="material-symbols-outlined text-xs">cloud_done</span>
                  Enregistré automatiquement sur cet appareil
                </p>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="px-6 py-2 bg-primary text-white rounded-full font-semibold text-sm hover:opacity-90"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {showSpeculumModal && selectedRequest && (
          <ExamenSpeculumForm
            requestId={selectedRequest.id}
            anapathId={selectedRequest.anapathId}
            patientName={patientDisplayName(selectedRequest)}
            initialData={selectedRequest.examenSpeculum}
            onClose={() => setShowSpeculumModal(false)}
            onSaved={async () => {
              setShowSpeculumModal(false);
              await loadRequest(selectedRequest.id);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function ValidationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-transparent">
          <Sidebar />
          <main className="flex-1 ml-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </main>
        </div>
      }
    >
      <ValidationPageContent />
    </Suspense>
  );
}