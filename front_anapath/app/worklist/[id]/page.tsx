'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import PatientAvatar from '@/components/PatientAvatar';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import ExamenSpeculumForm from '@/components/ExamenSpeculumForm';
import ExamenTechniqueForm from '@/components/ExamenTechniqueForm';
import DiagnosticCytoponctionForm from '@/components/DiagnosticCytoponctionForm';
import PatientHistoriqueButton, { type HistoriqueEntry } from '@/components/PatientHistoriqueButton';
import VoiceRecorder from '@/components/VoiceRecorder';
import { appendFinalSegment } from '@/lib/formatTranscript';
import { PatientInfo } from '@/components/PatientIdentitySection';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastContext';
import axios from 'axios';
import { getPatientForExamen, marquerNotifLue, API_BASE } from '@/lib/api';
import { formatDateLong } from '@/lib/dateFormat';
import { statusLabel, statusColors } from '@/lib/statusLabels';
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
    clinicalData?: Record<string, unknown>;
  } | null;
  resultat?: { conclusion: string; details: string } | null;
  createdAt: string;
  episodeId?: string | null;
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

/** Colle la transcription en direct au texte définitif, sans dédoubler les séparateurs. */
function withInterim(committed: string, interim: string): string {
  if (!interim) return committed;
  if (interim.startsWith('\n')) return committed + interim;
  return committed.trim() ? `${committed} ${interim}` : interim;
}

// Statuts où la saisie du résultat (et sa validation/signature) est possible :
// l'examen technique est validé et le pathologiste rend son compte rendu,
// ou résultat déjà saisi en attente de signature (anciens flux hérités).
const RESULT_PHASE_STATUSES = ['EN_ATTENTE_PATHOLOGUE', 'RESULTAT_DISPONIBLE', 'CREEE', 'EN_ATTENTE'];

export default function WorklistDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { hasPermission, user } = useAuth();
  const toast = useToast();
  // Lecture seule pour Histotechnicien/Secrétaire : seuls UPDATE /
  // OBSERVATION_WRITE peuvent réellement saisir un résultat.
  const canWrite = hasPermission('anapath:update') || hasPermission('anapath:observation:write');
  // La validation/signature finale est réservée au pathologiste.
  const canSign = hasPermission('anapath:validate');
  // Le spéculum reste réservé au technicien/histotechnicien.
  const isTechnicien = isTechnicienUser(user);

  const [request, setRequest] = useState<AnapathRequest | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showSpeculum, setShowSpeculum] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  // Détail de la prescription affiché par défaut ; le pathologiste peut le
  // masquer pour se concentrer sur la saisie du résultat.
  const [showPrescriptionDetails, setShowPrescriptionDetails] = useState(true);

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
  const [patientHistorique, setPatientHistorique] = useState<HistoriqueEntry[]>([]);

  // FCV/Pap test : l'examen au spéculum doit être soumis avant de pouvoir
  // saisir le résultat.
  const needsSpeculum = request?.typeExamen === 'FCV_PAP' && !request?.examenSpeculum;
  // Évite qu'un changement programmatique de resultData (repeuplement à la
  // sélection d'une nouvelle demande) ne déclenche une sauvegarde automatique.
  const skipAutosaveRef = useRef(true);

  const populateFields = (req: AnapathRequest) => {
    const details = req.resultat?.details ?? (req as any).resultatDetails ?? '';
    const conclusion = req.resultat?.conclusion ?? (req as any).resultatConclusion ?? '';
    setResultData({ details, conclusion });
  };

  const loadExamen = async () => {
    try {
      const response = await axios.get(`${API_BASE}/anapath/${id}`);
      setRequest(response.data);
      populateFields(response.data);
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

  // Historique complet du patient (tous statuts) côté serveur.
  useEffect(() => {
    if (!request?.patientId) {
      setPatientHistorique([]);
      return;
    }
    axios.get(`${API_BASE}/anapath`, { params: { patientId: request.patientId } })
      .then((res) => setPatientHistorique(
        (res.data as AnapathRequest[]).filter((r) => r.id !== request.id),
      ))
      .catch(() => setPatientHistorique([]));
  }, [request?.patientId, request?.id]);

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
        if (!active || !d) return;
        if (typeof d?.ordreProfessionnel === 'string') {
          setSignature((prev) => ({
            ...prev,
            ordreProfessionnelNumber: d.ordreProfessionnel,
          }));
        }
        if (typeof d?.ordre === 'string') {
          setIppNumber(d.ordre);
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
  }, [request?.id]);

  // La note (brouillon) est un scratch-pad local à l'appareil, propre à
  // chaque demande — pas la donnée officielle, juste de quoi préparer le
  // résultat avant de le saisir (ou l'y importer).
  useEffect(() => {
    if (!request?.id) {
      setNoteText('');
      return;
    }
    setNoteText(localStorage.getItem(`anapath_note_${request.id}`) ?? '');
  }, [request?.id]);

  const updateNoteText = (text: string) => {
    setNoteText(text);
    if (request) localStorage.setItem(`anapath_note_${request.id}`, text);
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
    if (!request) return;
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

  const autoSaveResult = async () => {
    if (!request) return;

    try {
      setAutoSaveState('saving');
      // Route dédiée (anapath:observation:write) : ne touche qu'au résultat/
      // conclusion, pas au statut de validation finale ni au prélèvement —
      // accessible à la Secrétaire pour la transcription en direct.
      await axios.patch(`${API_BASE}/anapath/${request.id}/resultat`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
      });
      setAutoSaveState('saved');
    } catch (error) {
      console.error('Erreur auto-save:', error);
      setAutoSaveState('error');
    }
  };

  const handleSaveResult = async () => {
    if (!request) return;

    const prelevementData = {
      site: request.prelevement?.site || '',
      description: request.prelevement?.description || '',
      // Renseignés par le service Prescription, non modifiables depuis la
      // saisie du résultat : on les renvoie tels quels pour ne pas les écraser
      // (le PATCH remplace tout l'objet prelevement).
      clinicalData: request.prelevement?.clinicalData || {},
    };

    try {
      setUpdating(true);
      await axios.patch(`${API_BASE}/anapath/${request.id}`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
        statut: 'RESULTAT_DISPONIBLE',
        prelevement: prelevementData,
      });

      await marquerNotifLue(request.id);

      await loadExamen();
      toast.success('Enregistré avec succès');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setUpdating(false);
    }
  };

  const handleValidate = async () => {
    if (!request) return;

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

    if (request.statut !== 'RESULTAT_DISPONIBLE') {
      await handleSaveResult();
      await loadExamen();
    }

    try {
      setUpdating(true);
      const numeroOrdre = signature.ordreProfessionnelNumber;
      const hashInput = `${request.anapathId}-${signature.signature}-${numeroOrdre}`;
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(hashInput),
      );
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await axios.patch(`${API_BASE}/anapath/${request.id}`, {
        resultatDetails: resultData.details,
        resultatConclusion: resultData.conclusion,
        signature: signature.signature,
        numeroOrdre,
        hash,
        statut: 'VALIDE',
      });

      await marquerNotifLue(request.id);

      toast.success('Validé avec succès');
      await loadExamen();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la validation');
    } finally {
      setUpdating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!request) {
      alert('Aucun examen sélectionné.');
      return;
    }

    try {
      const { generatePDF } = await import('@/lib/generatePDF');
      await generatePDF(
        {
          ...request,
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

  const isFormValid = () => {
    return (
      resultData.details.trim() !== '' &&
      resultData.conclusion.trim() !== '' &&
      ippNumber.trim() !== '' &&
      signature.signature.trim() !== '' &&
      signature.ordreProfessionnelNumber.trim() !== ''
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
  // Cytoponction : diagnostic anticipé (site prélevé, organe, fixation) avant
  // l'examen technique — réservé au pathologiste.
  const isDiagnosticPhase =
    request?.typeExamen === 'CYT0PONCTION' && request.statut === 'EN_ATTENTE_DIAGNOSTIC';
  // Phase où le pathologiste rend son compte rendu (résultat + validation).
  const isResultPhase = RESULT_PHASE_STATUSES.includes(request.statut);
  // Phase « examen technique » (fil technicien / onglet Examen technique du
  // pathologiste) : EN_COURS ; en EN_ATTENTE_PATHOLOGUE, seul le pathologiste
  // continue (vrai examen).
  const isTechnicalPhase = request.statut === 'EN_COURS';
  const isFcvPap = request?.typeExamen === 'FCV_PAP';
  const speculumDone = Boolean(request?.examenSpeculum);

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
              {statusLabel(request.statut)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PatientAvatar nom={patient?.nom} prenom={patient?.prenom} />
          </div>
        </header>

        <div className="flex-1 p-6 w-full max-w-5xl mx-auto">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowPrescriptionDetails((v) => !v)}
              aria-pressed={showPrescriptionDetails}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-full border font-bold text-xs shadow-sm transition-all mb-4 ${
                showPrescriptionDetails
                  ? 'bg-gradient-to-r from-[#00284d] to-[#00478d] text-white border-[#00478d] hover:opacity-90'
                  : 'bg-white text-[#00478d] border-[#00478d]/50 hover:bg-[#00478d]/5'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {showPrescriptionDetails ? 'visibility_off' : 'visibility'}
              </span>
              {showPrescriptionDetails ? 'Masquer le détail de prescription' : 'Afficher le détail de prescription'}
              <span
                className={`ml-1 w-2 h-2 rounded-full transition-colors ${
                  showPrescriptionDetails ? 'bg-white/80' : 'bg-[#00478d]'
                }`}
              />
            </button>
            {showPrescriptionDetails && (
              <PrescriptionDetails
                request={request}
                patient={patient}
                patientLoading={patientLoading}
                historiqueButton={<PatientHistoriqueButton entries={patientHistorique} />}
              />
            )}
          </div>

          {isWorkflowVisible && (
            <>
              {request?.diagnosticCytoponction && (
                <section className="bg-cyan-50 border border-cyan-200 rounded-xl shadow-sm p-4 mb-6">
                  <p className="text-xs font-bold text-cyan-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">biotech</span>
                    Diagnostic cytoponction (pathologiste)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[11px] text-cyan-800/70 font-semibold uppercase tracking-wider">Site prélevé</p>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.sitePreleve || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-cyan-800/70 font-semibold uppercase tracking-wider">Organe concerné</p>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.organe || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-cyan-800/70 font-semibold uppercase tracking-wider">Fixation</p>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{request.diagnosticCytoponction.fixation || '—'}</p>
                    </div>
                  </div>
                  {request.diagnosticCytoponction.validatedByName && (
                    <p className="text-[11px] text-cyan-800/70 mt-3">
                      Validé par {request.diagnosticCytoponction.validatedByName}
                      {request.diagnosticCytoponction.validatedAt
                        ? ` le ${new Date(request.diagnosticCytoponction.validatedAt).toLocaleDateString('fr-FR')} à ${new Date(request.diagnosticCytoponction.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </p>
                  )}
                </section>
              )}

              {isDiagnosticPhase ? (
                <div className="flex flex-col items-center gap-2 mt-8">
                  {canWrite ? (
                    <button
                      onClick={() => setShowDiag(true)}
                      className="px-8 py-3 bg-cyan-700 text-white font-bold rounded-full shadow-md hover:bg-cyan-800 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">biotech</span>
                      Remplir le diagnostic
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">
                      En attente du diagnostic (réservé au pathologiste)
                    </p>
                  )}
                </div>
              ) : isResultPhase ? (
                needsSpeculum ? (
                  <section className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-6 text-center">
                    <span className="material-symbols-outlined text-4xl text-amber-600">clinical_notes</span>
                    <p className="font-bold text-amber-800 mt-2">Examen au spéculum requis</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Pour un FCV / Pap test, l&apos;examen au spéculum doit être soumis avant de pouvoir saisir le résultat.
                    </p>
                    {isTechnicien ? (
                      <button
                        type="button"
                        onClick={() => setShowSpeculum(true)}
                        className="mt-4 px-6 py-2.5 bg-amber-600 text-white rounded-full font-semibold text-sm hover:opacity-90 inline-flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">clinical_notes</span>
                        Remplir l&apos;examen spéculum
                      </button>
                    ) : (
                      <p className="mt-4 text-xs text-amber-700 flex items-center justify-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">lock</span>
                        Cette étape est réservée au technicien / histotechnicien.
                      </p>
                    )}
                  </section>
                ) : canWrite ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {request?.typeExamen === 'FCV_PAP' && request?.examenSpeculum && (
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

                    {String(request?.examenTechnique?.compteRendu ?? '').trim() && (
                      <section className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
                        <p className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">science</span>
                          Compte rendu de l'examen technique
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {String(request.examenTechnique?.compteRendu ?? '')}
                        </p>
                      </section>
                    )}

                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">RÉSULTAT : <span className="text-red-500">*</span></p>
                        {canWrite && (
                          <VoiceRecorder
                            hideTextArea
                            statusIdleText="Dicter (transcription vocale)"
                            onTranscriptChange={(data) => setInterimDetails(data.interim ?? '')}
                            onRestart={() => {
                              setResultData((prev) => ({ ...prev, details: '' }));
                              setInterimDetails('');
                            }}
                            onFinalTranscript={(text, meta) =>
                              setResultData((prev) => ({
                                ...prev,
                                details: appendFinalSegment(prev.details, text, meta?.startsAfterPause ?? false),
                              }))
                            }
                          />
                        )}
                      </div>
                      <textarea
                        value={withInterim(resultData.details, interimDetails)}
                        onChange={(e) => {
                          setResultData({ ...resultData, details: e.target.value });
                          setInterimDetails('');
                        }}
                        className={`w-full p-2 border rounded-lg bg-surface-container-low border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-medium text-on-surface ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Saisir les résultats de l'examen ici..."
                        rows={12}
                        required
                        disabled={!canWrite}
                      />
                    </section>

                    <section className="bg-white border border-outline-variant rounded-xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">CONCLUSION : <span className="text-red-500">*</span></p>
                        {canWrite && (
                          <VoiceRecorder
                            hideTextArea
                            statusIdleText="Dicter (transcription vocale)"
                            onTranscriptChange={(data) => setInterimConclusion(data.interim ?? '')}
                            onRestart={() => {
                              setResultData((prev) => ({ ...prev, conclusion: '' }));
                              setInterimConclusion('');
                            }}
                            onFinalTranscript={(text, meta) =>
                              setResultData((prev) => ({
                                ...prev,
                                conclusion: appendFinalSegment(prev.conclusion, text, meta?.startsAfterPause ?? false),
                              }))
                            }
                          />
                        )}
                      </div>
                      <textarea
                        value={withInterim(resultData.conclusion, interimConclusion)}
                        onChange={(e) => {
                          setResultData({ ...resultData, conclusion: e.target.value });
                          setInterimConclusion('');
                        }}
                        className={`w-full p-2 border rounded-lg bg-surface-container-low border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-medium text-on-surface ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Saisir la conclusion ici..."
                        rows={4}
                        required
                        disabled={!canWrite}
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
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 mt-8">
                    <p className="text-xs text-slate-400">Consultation en lecture seule</p>
                  </div>
                )
              ) : isTechnicalPhase ? (
                <div className="flex flex-col items-center gap-2 mt-8">
                  {isFcvPap && !speculumDone ? (
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
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 mt-8">
                  <p className="text-xs text-slate-400">Consultation en lecture seule</p>
                </div>
              )}
            </>
          )}

          {isWorkflowVisible && isResultPhase && !needsSpeculum && canWrite && (
            <>
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

              <div className="flex flex-wrap gap-3 items-center justify-center pt-6 pb-4 border-t border-outline-variant mt-4">
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
      </main>

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
                <VoiceRecorder
                  hideTextArea
                  statusIdleText="Dicter votre brouillon"
                  onTranscriptChange={(data) => setNoteInterim(data.interim ?? '')}
                  onRestart={() => {
                    updateNoteText('');
                    setNoteInterim('');
                  }}
                  onFinalTranscript={(text, meta) => {
                    setNoteText((prev) => {
                      const next = appendFinalSegment(prev, text, meta?.startsAfterPause ?? false);
                      if (request) localStorage.setItem(`anapath_note_${request.id}`, next);
                      return next;
                    });
                  }}
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

      {showDiag && request && (
        <DiagnosticCytoponctionForm
          requestId={request.id}
          anapathId={request.anapathId}
          patientName={patient?.nomComplet || patient?.nom || request.patientId}
          initialData={request.diagnosticCytoponction}
          onClose={() => setShowDiag(false)}
          onSaved={async () => {
            setShowDiag(false);
            await loadExamen();
          }}
        />
      )}
    </div>
  );
}
