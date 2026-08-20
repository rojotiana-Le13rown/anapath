'use client';
import {
  useState, useEffect, useRef, useCallback
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import {
  getNotificationsAnapath,
  getWsTicket,
  markNotificationAsRead,
  marquerNotifLue,
  accepterPrescriptionNotif,
  refuserPrescriptionNotif,
  API_BASE,
} from '@/lib/api';
import { useAuth } from './AuthProvider';
import { isTechnicienUser, userRecipientGroup, notificationVisible, isMajorRole } from '@/lib/roles';
import { playUrgenceSound, playReportSound, playExtemporaneAlarm } from '@/lib/sounds';
import { exportMajorReportExcel } from '@/lib/majorReport';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import { type PatientInfo } from '@/components/PatientIdentitySection';
import { getPatientForExamen } from '@/lib/api';
import { getMondayOfWeek, formatWeekLabel } from '@/lib/weekUtils';

// URL de la Gateway socket.io du backend (namespace /anapath). En local :
// http://localhost:3334. Sur Render : https://anapath-backend-ar7u-uj8n.onrender.com.
// Si vide, la cloche retombe uniquement sur le polling 30s (filet de sécurité).
const WS_URL = process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, '');

function sortNotifs(notifs: any[]): any[] {
  const p: Record<string, number> =
    { STAT: 1, URGENTE: 2, NORMALE: 3 };
  return [...notifs].sort((a, b) => {
    const getUrg = (n: any) =>
      n.enriched?.urgence
      ?? n.urgence
      ?? n.metadata?.urgence
      ?? 'NORMALE';
    const pa = p[getUrg(a)] ?? 3;
    const pb = p[getUrg(b)] ?? 3;
    if (pa !== pb) return pa - pb;
    const da = new Date(
      a.createdAt ?? a.date ?? 0).getTime();
    const db = new Date(
      b.createdAt ?? b.date ?? 0).getTime();
    return db - da;
  });
}

function isLue(n: any): boolean {
  return n.enriched?.lu === true || n.read === true;
}

function isPrescriptionEnAttente(n: any): boolean {
  // Reste « en attente » tant qu'elle n'est ni acceptée ni refusée (outcome
  // absent) — indépendant de l'état « lu » : « tout marquer lu » ne doit pas
  // rendre la demande inactionnable.
  return n.type === 'NOUVELLE_PRESCRIPTION' && !n.metadata?.outcome;
}

// Le service Prescription externe utilise un vocabulaire différent
// (NORMAL/URGENT/TRES_URGENT) de celui utilisé ici pour le son et les
// badges (NORMALE/URGENTE/STAT) — sans cette table, une prescription
// TRES_URGENT retombait silencieusement sur le son "normal".
const URGENCE_MAP: Record<string, string> = {
  TRES_URGENT: 'STAT',
  URGENT: 'URGENTE',
  NORMAL: 'NORMALE',
  STAT: 'STAT',
  URGENTE: 'URGENTE',
  NORMALE: 'NORMALE',
};

function getUrgence(n: any): string {
  const raw = n.enriched?.urgence
    ?? n.urgence
    ?? n.metadata?.urgence
    ?? 'NORMALE';
  return URGENCE_MAP[raw] ?? raw;
}

/** Examen STAT / TRES URGENT (le vocabulaire Prescription est normalisé par getUrgence). */
function isStatUrgent(n: any): boolean {
  const urg = getUrgence(n);
  return urg === 'STAT' || urg === 'TRES_URGENT';
}

/** Crée la notification d'alerte STAT (arrivée ou 5 min restantes) dans la cloche. */
async function postStatAlert(payload: {
  anapathId?: string;
  patientId?: string;
  requestId?: string;
  phase: 'arrival' | 'remaining';
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/anapath/notifications/stat-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non bloquant : le fil de travail garde l'alerte côté client.
  }
}

function getTypeExamen(n: any): string {
  const t = n.enriched?.typeExamen
    ?? n.metadata?.typeExamen
    ?? n.typeExamen ?? '';
  const map: Record<string, string> = {
    BIOPSIE:          'Biopsie',
    FCV_PAP:          'FCV / Pap test',
    CYT0PONCTION:     'Cytoponction',
    LIQUIDE:          'Liquide',
    POS:              'POS',
    POC:              'POC',
    EXTEMPORANE_STAT: '⚡ Extemporané STAT',
  };
  return map[t] ?? t;
}

function getServiceNom(n: any): string {
  return n.enriched?.serviceNom
    ?? n.metadata?.serviceNom
    ?? n.metadata?.serviceId
    ?? n.metadata?.serviceIdSource
    ?? '—';
}

function getAllergies(n: any): string {
  return n.enriched?.allergies ?? '';
}

function getMessage(n: any): string {
  return n.message
    ?? n.enriched?.message
    ?? n.metadata?.message
    ?? '';
}

function getPatientId(n: any): string {
  return n.enriched?.patientId
    ?? n.metadata?.patientId
    ?? n.patientId
    ?? '';
}

function getPatientName(n: any): string {
  return n.enriched?.patientName
    ?? n.metadata?.patientName
    ?? n.patientName
    ?? '';
}

function getAnapathId(n: any): string {
  return n.enriched?.anapathId
    ?? n.metadata?.anapathId
    ?? n.referenceId
    ?? n.examId
    ?? '';
}

function getRequestUuid(n: any): string {
  return n.enriched?.id ?? '';
}

function formatHeure(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatRelativeTime(d: string): string {
  if (!d) return '';
  const diffMs = Date.now() - new Date(d).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffJ = Math.floor(diffH / 24);
  return `il y a ${diffJ}j`;
}

function isRelance(n: any): boolean {
  return n.metadata?.isRelance === true
    || n.type === 'RAPPEL_VALIDATION';
}

export default function NotificationBell() {
  const { user } = useAuth();
  // Ciblage par rôle des notifications (miroir du filtre backend) :
  // - technicien/histotechnicien : voit et traite les nouvelles demandes ;
  // - pathologiste : voit « prêt pour l'examen » ;
  // - le major (ou tout autre rôle) ne reçoit AUCUNE notification destinée à
  //   un autre rôle — seulement les notifications globales (alertes STAT,
  //   rapport hebdomadaire, …).
  const canActOnPrescriptions = isTechnicienUser(user);
  const userGroup = userRecipientGroup(user);
  const isMajor = isMajorRole(user?.roleName);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [detailNotif, setDetailNotif] = useState<any>(null);
  const [modalPatient, setModalPatient] = useState<PatientInfo | null>(null);
  const [modalPatientLoading, setModalPatientLoading] = useState(false);
  const [refuserMode, setRefuserMode] = useState(false);
  const [motif, setMotif] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Refus inline directement dans la liste (sans passer par la fenêtre de détail)
  const [inlineRefuseId, setInlineRefuseId] = useState<string | null>(null);
  const [inlineMotif, setInlineMotif] = useState('');
  const [inlineSubmittingId, setInlineSubmittingId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineErrorId, setInlineErrorId] = useState<string | null>(null);
  const [showOldNotifs, setShowOldNotifs] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const extemporaneTimers =
    useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Dès la première remontée (chargement ou navigation), les notifications déjà
  // présentes sont marquées connues SANS son : un son n'est joué que pour une
  // notification réellement nouvelle, reçue après l'ouverture de la page.
  const initializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const cancelExtemporaneTimer = useCallback((aid: string) => {
    const timer = extemporaneTimers.current.get(aid);
    if (timer) {
      clearTimeout(timer);
      extemporaneTimers.current.delete(aid);
    }
  }, []);

  // Lance le compte à rebours (25 min depuis la RÉCEPTION) puis l'alarme sonore
  // et la notification « 5 min restantes » pour un examen STAT (très urgent) —
  // partagé entre le polling et le push temps réel. Le délai est calculé depuis
  // createdAt, donc une navigation/reconnexion ne redémarre PAS la minuterie.
  const scheduleExtemporane = useCallback((n: any) => {
    const aid = getAnapathId(n);
    const type = n.enriched?.typeExamen
      ?? n.metadata?.typeExamen ?? '';
    if (
      (!isStatUrgent(n) && type !== 'EXTEMPORANE_STAT') || !aid
      || extemporaneTimers.current.has(aid)
      || n._alerteExtemporane
    ) {
      return;
    }

    const ALARME_MS = 25 * 60 * 1000;
    const createdAt = n.enriched?.createdAt
      ?? n.createdAt ?? n.date ?? n.timestamp;
    const elapsed = createdAt
      ? Date.now() - new Date(createdAt).getTime()
      : 0;
    const remaining = ALARME_MS - elapsed;
    if (remaining <= 0) return;

    const timer = setTimeout(() => {
      playExtemporaneAlarm();
      void postStatAlert({
        anapathId: aid,
        patientId: getPatientId(n),
        requestId: n.id ?? n._id,
        phase: 'remaining',
      });
      setNotifs(prev => prev.map(x =>
        getAnapathId(x) === aid
          ? {
              ...x,
              _alerteExtemporane: true,
              _alerteAt: new Date().toISOString(),
            }
          : x
      ));
      extemporaneTimers.current.delete(aid);
    }, remaining);

    extemporaneTimers.current.set(aid, timer);
  }, []);

  const fetchNotifs = useCallback(async () => {
    const raw = await getNotificationsAnapath();
    if (!Array.isArray(raw)) return;

    // Défense en profondeur : même si le backend n'a pas filtré (cache, proxy),
    // on masque côté client toute notification destinée à un autre groupe de
    // rôles (nouvelles demandes, patient prêt, examen prêt pour le pathologiste).
    const sorted = sortNotifs(raw).filter((n) =>
      notificationVisible(userGroup, n.type, n.metadata?.recipientRole, isMajor),
    );

    // Annuler timers si examen validé/archivé
    sorted.forEach(n => {
      const aid = getAnapathId(n);
      const statut = n.enriched?.statut ?? '';
      if (
        aid &&
        (statut === 'VALIDE' || statut === 'ARCHIVE')
      ) {
        cancelExtemporaneTimer(aid);
      }
    });

    const newOnes = sorted.filter(n => {
      const id = n.id ?? n._id;
      return !isLue(n) && !known.current.has(id);
    });

    // Hydratation silencieuse : au premier chargement on mémorise les
    // notifications déjà en attente (sans son) et on planifie l'éventuelle
    // alarme extemporanée pour le temps restant — pas pour un 25 min entier.
    if (!initializedRef.current) {
      initializedRef.current = true;
      sorted.forEach(n => {
        if (!isLue(n)) {
          known.current.add(n.id ?? n._id);
          scheduleExtemporane(n);
        }
      });
      setNotifs(sorted);
      return;
    }

    if (newOnes.length > 0) {
      if (newOnes.some((n) => n.type === 'RAPPORT_HEBDOMADAIRE' || n.type === 'RAPPORT')) {
        playReportSound();
      } else {
        const urgences = newOnes.map(n => getUrgence(n));
        const maxUrg = urgences.includes('STAT') ? 'STAT'
          : urgences.includes('URGENTE') ? 'URGENTE'
          : 'NORMALE';
        playUrgenceSound(maxUrg);
      }

      newOnes.forEach(n => {
        scheduleExtemporane(n);
        known.current.add(n.id ?? n._id);
        // Alerte STAT d'arrivée uniquement pour un examen réel (anapathId
        // présent). Une nouvelle prescription en attente n'a pas encore
        // d'examen : poster une alerte sans anapathId générerait des doublons
        // que la dédup backend ne peut pas bloquer.
        if (isStatUrgent(n) && getAnapathId(n)) {
          void postStatAlert({
            anapathId: getAnapathId(n),
            patientId: getPatientId(n),
            requestId: n.id ?? n._id,
            phase: 'arrival',
          });
        }
      });
    }

    setNotifs(sorted);
  }, [cancelExtemporaneTimer, scheduleExtemporane, userGroup, isMajor]);

  // Notification reçue en temps réel via socket.io (event `notification:new`) :
  // affichage + son immédiats, puis réconciliation avec la version enrichie (REST).
  const ingest = useCallback((payload: any) => {
    if (!payload || typeof payload !== 'object') return;
    const id = payload.id ?? payload._id;
    if (!id || known.current.has(id)) return;
    // Une notification destinée à un autre groupe de rôles n'arrive jamais ici
    // (le backend pousse par groupe) ; au cas où, on l'ignore silencieusement.
    if (!notificationVisible(userGroup, payload.type, payload.metadata?.recipientRole, isMajor)) return;

    known.current.add(id);
    setNotifs(prev => sortNotifs([
      payload,
      ...prev.filter(n => (n.id ?? n._id) !== id),
    ]));
    if (payload.type === 'RAPPORT_HEBDOMADAIRE' || payload.type === 'RAPPORT') {
      playReportSound();
    } else {
      playUrgenceSound(getUrgence(payload));
    }
    scheduleExtemporane(payload);
    // Idem : alerte STAT d'arrivée seulement pour un examen réel.
    if (isStatUrgent(payload) && getAnapathId(payload)) {
      void postStatAlert({
        anapathId: getAnapathId(payload),
        patientId: getPatientId(payload),
        requestId: id,
        phase: 'arrival',
      });
    }
    void fetchNotifs();
  }, [fetchNotifs, scheduleExtemporane, userGroup, isMajor]);

  const socketRef = useRef<Socket | null>(null);
  const ticketRef = useRef<string | null>(null);

  useEffect(() => {
    if (!WS_URL) return;
    let disposed = false;

    const connect = async () => {
      const ticket = await getWsTicket();
      if (disposed) return;
      ticketRef.current = ticket;

      const s = io(`${WS_URL}/anapath`, {
        transports: ['websocket'],
        // Fonction (pas objet figé) : à chaque connexion/reconnexion, on lit le
        // ticket courant (rafraîchi en cas d'expiration) — même pattern que le
        // backend avec le service Prescription.
        auth: (cb: (d: { token?: string }) => void) =>
          cb({ token: ticketRef.current ?? undefined }),
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 15000,
      });
      socketRef.current = s;

      s.on('notification:new', (payload: any) => ingest(payload));

      s.on('connect_error', () => {
        // Le ticket a pu expirer : on le rafraîchit pour la reconnexion suivante.
        void getWsTicket().then((t) => {
          if (!disposed && t) ticketRef.current = t;
        });
      });
    };

    void connect();

    return () => {
      disposed = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [ingest]);

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 30000);
    return () => {
      clearInterval(t);
      extemporaneTimers.current.forEach(
        timer => clearTimeout(timer));
    };
  }, [fetchNotifs]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!detailNotif) { setModalPatient(null); return; }
    const pid = getPatientId(detailNotif);
    if (!pid) { setModalPatient(null); return; }
    let cancelled = false;
    setModalPatientLoading(true);
    getPatientForExamen(pid)
      .then(p => { if (!cancelled) setModalPatient(p as PatientInfo); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setModalPatientLoading(false); });
    return () => { cancelled = true; };
  }, [detailNotif?.id ?? detailNotif?._id]);

  const unreadCount = notifs.filter(n => !isLue(n)).length;

  const maxUrg = notifs
    .filter(n => !isLue(n))
    .reduce((m, n) => {
      const u = getUrgence(n);
      return u === 'STAT' ? 'STAT'
        : u === 'URGENTE' && m !== 'STAT' ? 'URGENTE' : m;
    }, 'NORMALE');

  const badgeCls = maxUrg === 'STAT'
    ? 'bg-[#e41e3f] animate-pulse'
    : 'bg-[#e41e3f]';

  const handleClick = async (n: any) => {
    // Rapport hebdomadaire : génère et télécharge automatiquement le fichier Excel
    // du rapport de la semaine en cours, sans quitter la page.
    const type = n.type ?? n.enriched?.type ?? '';
    if (type === 'RAPPORT_HEBDOMADAIRE' || type === 'RAPPORT') {
      setOpen(false);
      try {
        const res = await fetch(`${API_BASE}/anapath`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const requests = Array.isArray(data) ? data : [];
          // Semaine en cours : lundi → dimanche (le rapport du major suit le
          // modèle CHU : VOLET ACTIVITÉ + PRISE EN CHARGE).
          const monday = getMondayOfWeek(new Date());
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          const weekRequests = requests.filter((r: any) => {
            const d = new Date(r.createdAt ?? r.date ?? 0);
            return d >= monday && d <= sunday;
          });
          await exportMajorReportExcel(
            weekRequests,
            formatWeekLabel(monday),
          );
        }
      } catch (e) {
        console.error('Erreur génération rapport hebdomadaire:', e);
        alert('Erreur lors de la génération du rapport hebdomadaire.');
      }
      return;
    }

    if (isPrescriptionEnAttente(n)) {
      setOpen(false);
      setActionError(null);
      setRefuserMode(false);
      setMotif('');
      setDetailNotif(n);
      return;
    }

    const uuid = getRequestUuid(n);
    const aid = getAnapathId(n);
    setOpen(false);
    // Examen déjà validé (ou archivé) → page archive ; sinon → saisie/validation.
    const statut = n.enriched?.statut ?? '';
    if (statut === 'VALIDE' || statut === 'ARCHIVE') {
      if (uuid) router.push(`/archives/${uuid}`);
      else router.push('/archives');
      return;
    }
    if (uuid) {
      // Passe par la page de détail : les étapes du workflow doivent être
      // renseignées avant de pouvoir saisir le résultat.
      router.push(`/worklist/${uuid}`);
    } else if (aid) {
      router.push(`/worklist/${aid}`);
    } else {
      router.push('/worklist');
    }
  };

  const closeDetail = () => {
    if (submitting) return;
    setDetailNotif(null);
    setRefuserMode(false);
    setMotif('');
    setActionError(null);
  };

  const handleAccepter = async () => {
    if (!detailNotif) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const created = await accepterPrescriptionNotif(detailNotif.id ?? detailNotif._id);
      closeDetail();
      await fetchNotifs();
      if (created?.id) router.push(`/worklist/${created.id}`);
    } catch (e: any) {
      setActionError(e?.message || "Échec de l'acceptation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefuser = async () => {
    if (!detailNotif || !motif.trim()) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await refuserPrescriptionNotif(detailNotif.id ?? detailNotif._id, motif.trim());
      closeDetail();
      await fetchNotifs();
    } catch (e: any) {
      setActionError(e?.message || 'Échec du refus');
    } finally {
      setSubmitting(false);
    }
  };

  // Accepter en un clic directement depuis la ligne de la liste (sans ouvrir la fenêtre de détail)
  const handleAccepterInline = async (n: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = n.id ?? n._id;
    setInlineSubmittingId(id);
    setInlineError(null);
    setInlineErrorId(null);
    try {
      const created = await accepterPrescriptionNotif(id);
      await fetchNotifs();
      if (created?.id) router.push(`/worklist/${created.id}`);
    } catch (err: any) {
      setInlineError(err?.message || "Échec de l'acceptation");
      setInlineErrorId(id);
    } finally {
      setInlineSubmittingId(null);
    }
  };

  // Accès direct à la validation depuis une notification de rappel
  // (RAPPEL_VALIDATION) : ouvre la page de détail de l'examen concerné.
  const handleValidateClick = (n: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const uuid = getRequestUuid(n);
    const aid = getAnapathId(n);
    if (uuid) router.push(`/worklist/${uuid}`);
    else if (aid) router.push(`/worklist/${aid}`);
    else router.push('/worklist');
  };

  const openInlineRefuse = (n: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineRefuseId(n.id ?? n._id);
    setInlineMotif('');
    setInlineError(null);
    setInlineErrorId(null);
  };

  const cancelInlineRefuse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineRefuseId(null);
    setInlineMotif('');
    setInlineError(null);
    setInlineErrorId(null);
  };

  const confirmInlineRefuse = async (n: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inlineMotif.trim()) return;
    const id = n.id ?? n._id;
    setInlineSubmittingId(id);
    setInlineError(null);
    setInlineErrorId(null);
    try {
      await refuserPrescriptionNotif(id, inlineMotif.trim());
      setInlineRefuseId(null);
      setInlineMotif('');
      await fetchNotifs();
    } catch (err: any) {
      setInlineError(err?.message || 'Échec du refus');
      setInlineErrorId(id);
    } finally {
      setInlineSubmittingId(null);
    }
  };

  const markAll = async () => {
    const eligibles = notifs.filter(n => !isLue(n));
    await Promise.all(eligibles.map(async n => {
      const aid = getAnapathId(n);
      const notifId = n.id ?? n._id;
      if (aid) await marquerNotifLue(aid);
      if (notifId) await markNotificationAsRead(notifId);
    }));
    await fetchNotifs();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full
          hover:bg-gray-100 transition-colors"
      >
        <svg className="w-6 h-6 text-gray-600"
          fill="none" stroke="currentColor"
          viewBox="0 0 24 24">
          <path strokeLinecap="round"
            strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0
               0118 14.158V11a6.002 6.002 0
               00-4-5.659V5a2 2 0 10-4
               0v.341C7.67 6.165 6 8.388 6
               11v3.159c0 .538-.214 1.055-.595
               1.436L4 17h5m6 0v1a3 3 0
               11-6 0v-1m6 0H9"/>
        </svg>

        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1
            ${badgeCls} text-white text-xs font-bold
            rounded-full min-w-[20px] h-5
            flex items-center justify-center px-1
            leading-none`}>
            {unreadCount >= 15 ? '+15' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-12
            w-[420px] bg-white rounded-xl shadow-2xl
            border border-gray-100 z-50 overflow-hidden">

            <div className="flex items-center
              justify-between px-4 py-3
              border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="bg-blue-100
                    text-blue-700 text-xs font-bold
                    px-2 py-0.5 rounded-full">
                    {unreadCount} non lue
                    {unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAll}
                  className="text-xs text-blue-600
                    hover:text-blue-800 font-medium">
                  Tout marquer lu
                </button>
              )}
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="flex flex-col
                  items-center justify-center
                  py-12 text-gray-400">
                  <svg className="w-10 h-10 mb-2 opacity-40"
                    fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path strokeLinecap="round"
                      strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 17h5l-1.405-1.405A2.032
                         2.032 0 0118 14.158V11a6.002
                         6.002 0 00-4-5.659V5a2 2 0
                         10-4 0v.341C7.67 6.165 6 8.388
                         6 11v3.159c0 .538-.214 1.055-.595
                         1.436L4 17h5m6 0v1a3 3 0
                         11-6 0v-1m6 0H9"/>
                  </svg>
                  <p className="text-sm">
                    Aucune notification
                  </p>
                </div>
              ) : (() => {
                const CINQ_MIN = 5 * 60 * 1000;
                const now = Date.now();
                const recent = notifs.filter(n => {
                  const d = new Date(n.createdAt ?? n.date ?? 0).getTime();
                  return now - d <= CINQ_MIN;
                });
                const old = notifs.filter(n => {
                  const d = new Date(n.createdAt ?? n.date ?? 0).getTime();
                  return now - d > CINQ_MIN;
                });
                const visible = showOldNotifs ? notifs : recent;
                return (
                  <>
                    {visible.map(n => {
                const urg  = getUrgence(n);
                const lue  = isLue(n);
                const rel  = isRelance(n);
                const aid  = getAnapathId(n);
                const id   = n.id ?? n._id;
                const type = getTypeExamen(n);
                const svc  = getServiceNom(n);
                const patient = getPatientName(n);
                const heure = formatHeure(
                  n.createdAt ?? n.date ?? '');
                const relatif = formatRelativeTime(
                  n.createdAt ?? n.date ?? '');
                const alerte = n._alerteExtemporane;
                const enAttente = isPrescriptionEnAttente(n);
                const isRefusingThis = inlineRefuseId === id;
                const isSubmittingThis = inlineSubmittingId === id;
                const isRapport = (n.type ?? n.enriched?.type ?? '') === 'RAPPORT_HEBDOMADAIRE'
                  || (n.type ?? n.enriched?.type ?? '') === 'RAPPORT';

                const bg = lue
                  ? 'bg-gray-50 opacity-70'
                  : urg === 'STAT'
                  ? 'bg-red-50 hover:bg-red-100'
                  : urg === 'URGENTE'
                  ? 'bg-orange-50 hover:bg-orange-100'
                  : 'bg-white hover:bg-gray-50';

                const border = lue
                  ? 'border-l-4 border-gray-300'
                  : urg === 'STAT'
                  ? 'border-l-4 border-red-600'
                  : urg === 'URGENTE'
                  ? 'border-l-4 border-orange-500'
                  : 'border-l-4 border-blue-400';

                return (
                  <div
                    key={id ?? aid}
                    onClick={() => handleClick(n)}
                    className={`
                      ${bg} ${border}
                      px-4 py-3
                      cursor-pointer
                      transition-colors
                      border-b border-gray-100
                      last:border-b-0
                    `}
                  >
                    {alerte && (
                      <div className="mb-2 px-2 py-1
                        bg-red-700 text-white text-xs
                        font-bold rounded animate-pulse">
                        🚨 ALERTE 25 MIN — EXTEMPORANÉ
                        EN COURS
                      </div>
                    )}

                    {rel && (
                      <div className="mb-1 text-xs
                        text-amber-700 font-semibold
                        bg-amber-50 border border-amber-200
                        px-2 py-0.5 rounded inline-block">
                        ⏰ Rappel — Validation en attente
                      </div>
                    )}

                    <div className="flex items-start
                      justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px]
                          text-gray-400 whitespace-nowrap"
                          title={heure}>
                          {relatif}
                        </span>
                        {isRapport ? (
                          <>
                            <p className="text-sm font-semibold text-[#00478d]">
                              📊 Rapport hebdomadaire
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 font-medium">
                              {formatWeekLabel(
                                getMondayOfWeek(new Date(n.createdAt ?? n.date ?? 0)),
                              )}
                            </p>
                            {getMessage(n) && (
                              <p className="text-xs text-slate-700 mt-1 leading-snug">
                                {getMessage(n)}
                              </p>
                            )}
                          </>
                        ) : (
                        <>
                        {!lue && urg !== 'NORMALE' && (
                          <span className={`
                            inline-block text-xs
                            font-bold px-2 py-0.5
                            rounded-full mb-1
                            ${urg === 'STAT'
                              ? 'bg-red-600 text-white animate-pulse'
                              : 'bg-orange-500 text-white'}
                          `}>
                            {urg === 'STAT'
                              ? '🚨 TRES URGENT' : '⚠️ URGENT'}
                          </span>
                        )}

                        <p className={`
                          text-sm font-semibold
                          ${lue
                            ? 'text-gray-400'
                            : urg === 'STAT'
                            ? 'text-red-700'
                            : urg === 'URGENTE'
                            ? 'text-orange-700'
                            : 'text-gray-800'}
                        `}>
                          {patient || '—'}
                        </p>

                        <p className="text-xs
                          text-gray-600 mt-0.5
                          font-medium">
                          {type}
                        </p>

                        <p className="text-xs
                          text-gray-600 mt-0.5
                          font-medium">
                          📍 {svc}
                        </p>

                        {getAllergies(n) && (
                          <p className="text-xs
                            text-red-600 mt-0.5
                            font-medium">
                            ⚠️ {getAllergies(n)}
                          </p>
                        )}

                        {getMessage(n) && (
                          <p className="text-xs
                            text-slate-700 mt-1
                            leading-snug">
                            {getMessage(n)}
                          </p>
                        )}
                        </>
                        )}
                      </div>

                      <div
                        className="flex items-center
                          gap-1.5 flex-shrink-0"
                      >
                        {!lue && !enAttente && (
                          <div className="w-2.5 h-2.5
                            bg-blue-600 rounded-full"/>
                        )}
                      </div>
                    </div>

                    {enAttente && canActOnPrescriptions && !isRefusingThis && (
                      <div className="flex items-center
                        gap-2 mt-2">
                        <button
                          onClick={(e) => handleAccepterInline(n, e)}
                          disabled={isSubmittingThis}
                          className="flex-1 px-3 py-1.5
                            text-xs font-semibold text-white
                            bg-gradient-to-r from-[#00478d]
                            to-[#005eb8] rounded-lg
                            disabled:opacity-40"
                        >
                          {isSubmittingThis ? '...' : 'Accepter'}
                        </button>
                        <button
                          onClick={(e) => openInlineRefuse(n, e)}
                          disabled={isSubmittingThis}
                          className="flex-1 px-3 py-1.5
                            text-xs font-semibold text-red-600
                            bg-red-50 hover:bg-red-100
                            rounded-lg disabled:opacity-40"
                        >
                          Refuser
                        </button>
                      </div>
                    )}

                    {enAttente && canActOnPrescriptions && isRefusingThis && (
                      <div
                        className="mt-2 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <textarea
                          value={inlineMotif}
                          onChange={(e) => setInlineMotif(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="Motif de refus..."
                          className="w-full border
                            border-gray-300 rounded-lg
                            px-2 py-1.5 text-xs
                            focus:outline-none focus:ring-2
                            focus:ring-blue-500"
                        />
                        <div className="flex items-center
                          gap-2">
                          <button
                            onClick={(e) => cancelInlineRefuse(e)}
                            disabled={isSubmittingThis}
                            className="flex-1 px-3 py-1.5
                              text-xs font-medium
                              text-gray-600 bg-gray-100
                              hover:bg-gray-200 rounded-lg
                              disabled:opacity-40"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={(e) => confirmInlineRefuse(n, e)}
                            disabled={isSubmittingThis || !inlineMotif.trim()}
                            className="flex-1 px-3 py-1.5
                              text-xs font-semibold text-white
                              bg-red-600 hover:bg-red-700
                              rounded-lg disabled:opacity-40"
                          >
                            {isSubmittingThis ? '...' : 'Confirmer'}
                          </button>
                        </div>
                      </div>
                    )}

                    {enAttente && inlineError && inlineErrorId === id && (
                      <p className="mt-1 text-xs text-red-600">
                        {inlineError}
                      </p>
                    )}

                    {rel && !lue && (
                      <button
                        onClick={(e) => handleValidateClick(n, e)}
                        className="mt-2 w-full px-3 py-1.5
                          text-xs font-semibold text-white
                          bg-gradient-to-r from-[#00478d]
                          to-[#005eb8] rounded-lg
                          hover:opacity-90 active:scale-[0.98]
                          transition"
                      >
                        Cliquer pour valider
                      </button>
                    )}
                  </div>
                );
              })}
              {old.length > 0 && !showOldNotifs && (
                <button
                  onClick={() => setShowOldNotifs(true)}
                  className="w-full px-4 py-2 text-xs text-[#00478d]
                    font-medium hover:bg-gray-50 transition-colors
                    border-t border-gray-100"
                >
                  Afficher les anciennes notifications ({old.length})
                </button>
              )}
              {showOldNotifs && old.length > 0 && (
                <button
                  onClick={() => setShowOldNotifs(false)}
                  className="w-full px-4 py-2 text-xs text-gray-500
                    font-medium hover:bg-gray-50 transition-colors
                    border-t border-gray-100"
                >
                  Masquer les anciennes notifications
                </button>
              )}
              </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {detailNotif &&
        createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center
            justify-center bg-black/40 p-4"
          onClick={closeDetail}
        >
          <div
            className="bg-white rounded-xl shadow-xl
              max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between
              px-5 py-4 bg-gradient-to-r from-[#00284d] to-[#00478d]">
              <h3 className="font-semibold text-white">
                Nouvelle prescription
              </h3>
              <button
                onClick={closeDetail}
                disabled={submitting}
                className="text-white/70 hover:text-white transition-colors
                  disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <PrescriptionDetails
                request={{
                  typeExamen: detailNotif.metadata?.typeExamen ?? '',
                  createdAt: detailNotif.createdAt ?? detailNotif.date ?? '',
                  patientId: getPatientId(detailNotif),
                  metadata: detailNotif.metadata ?? {},
                }}
                patient={modalPatient}
                patientLoading={modalPatientLoading}
              />

              {actionError && (
                <p className="text-sm text-red-600
                  bg-red-50 rounded-lg px-3 py-2 mt-3">
                  {actionError}
                </p>
              )}

              {refuserMode && (
                <div>
                  <label className="text-xs text-gray-500">
                    Motif de refus *
                  </label>
                  <textarea
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    rows={3}
                    autoFocus
                    className="mt-1 w-full border
                      border-gray-300 rounded-lg px-3 py-2
                      text-sm focus:outline-none
                      focus:ring-2 focus:ring-blue-500"
                    placeholder="Expliquez pourquoi cette
                      demande est refusée..."
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end
              gap-2 px-5 py-4 border-t bg-gray-50
              rounded-b-xl">
              {refuserMode ? (
                <>
                  <button
                    onClick={() => { setRefuserMode(false); setMotif(''); }}
                    disabled={submitting}
                    className="px-4 py-2 text-sm
                      font-medium text-gray-600
                      hover:text-gray-800
                      disabled:opacity-40"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleRefuser}
                    disabled={submitting || !motif.trim()}
                    className="px-4 py-2 text-sm
                      font-medium text-white bg-red-600
                      hover:bg-red-700 rounded-lg
                      disabled:opacity-40"
                  >
                    {submitting ? 'Envoi...' : 'Confirmer le refus'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setRefuserMode(true)}
                    disabled={submitting}
                    className="px-4 py-2 text-sm
                      font-medium text-red-600
                      hover:bg-red-50 rounded-lg
                      disabled:opacity-40"
                  >
                    Refuser
                  </button>
                  <button
                    onClick={handleAccepter}
                    disabled={submitting}
                    className="px-4 py-2 text-sm
                      font-medium text-white
                      bg-gradient-to-r from-[#00478d]
                      to-[#005eb8] rounded-lg
                      disabled:opacity-40"
                  >
                    {submitting ? 'Envoi...' : 'Accepter'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
