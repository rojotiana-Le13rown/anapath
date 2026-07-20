'use client';
import {
  useState, useEffect, useRef, useCallback
} from 'react';
import { useRouter } from 'next/navigation';
import {
  getNotificationsAnapath,
  markNotificationAsRead,
  marquerNotifLue,
  accepterPrescriptionNotif,
  refuserPrescriptionNotif,
} from '@/lib/api';

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

function playSound(urgence: string, volume = 1.0) {
  try {
    const Ctx = window.AudioContext
      || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);

    const vol = Math.min(volume, 1.0);

    if (urgence === 'STAT') {
      osc.frequency.value = 880;
      osc.type = 'square';
      g.gain.setValueAtTime(0, ctx.currentTime);
      [0, 0.3, 0.6].forEach(t => {
        g.gain.setValueAtTime(vol, ctx.currentTime + t);
        g.gain.setValueAtTime(
          0, ctx.currentTime + t + 0.2);
      });
      osc.start();
      osc.stop(ctx.currentTime + 0.85);
    } else if (urgence === 'URGENTE') {
      osc.frequency.value = 660;
      osc.type = 'sine';
      g.gain.setValueAtTime(0, ctx.currentTime);
      [0, 0.4].forEach(t => {
        g.gain.setValueAtTime(
          vol * 0.7, ctx.currentTime + t);
        g.gain.setValueAtTime(
          0, ctx.currentTime + t + 0.25);
      });
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } else {
      osc.frequency.value = 440;
      osc.type = 'sine';
      g.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(
        0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

function playAlerteExtemporane() {
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }

    const Ctx = window.AudioContext
      || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const g = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    osc1.connect(g);
    osc2.connect(g);
    osc3.connect(g);
    g.connect(compressor);
    compressor.connect(ctx.destination);

    osc1.frequency.value = 1000;
    osc2.frequency.value = 1250;
    osc3.frequency.value = 800;
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc3.type = 'sawtooth';

    g.gain.setValueAtTime(0, ctx.currentTime);

    for (let i = 0; i < 5; i++) {
      const t = ctx.currentTime + i * 0.4;
      g.gain.setValueAtTime(1.0, t);
      g.gain.setValueAtTime(0, t + 0.25);
    }

    osc1.start(); osc2.start(); osc3.start();
    osc1.stop(ctx.currentTime + 2.0);
    osc2.stop(ctx.currentTime + 2.0);
    osc3.stop(ctx.currentTime + 2.0);

    setTimeout(() => ctx.close(), 3000);
  } catch {}
}

function isLue(n: any): boolean {
  return n.enriched?.lu === true || n.read === true;
}

function isPrescriptionEnAttente(n: any): boolean {
  return n.type === 'NOUVELLE_PRESCRIPTION' && !isLue(n);
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
  const [notifs, setNotifs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [detailNotif, setDetailNotif] = useState<any>(null);
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
  const known = useRef<Set<string>>(new Set());
  const extemporaneTimers =
    useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const router = useRouter();

  const cancelExtemporaneTimer = useCallback((aid: string) => {
    const timer = extemporaneTimers.current.get(aid);
    if (timer) {
      clearTimeout(timer);
      extemporaneTimers.current.delete(aid);
    }
  }, []);

  const fetchNotifs = useCallback(async () => {
    const raw = await getNotificationsAnapath();
    if (!Array.isArray(raw)) return;

    const sorted = sortNotifs(raw);

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

    if (newOnes.length > 0) {
      const urgences = newOnes.map(n => getUrgence(n));
      const maxUrg = urgences.includes('STAT') ? 'STAT'
        : urgences.includes('URGENTE') ? 'URGENTE'
        : 'NORMALE';
      playSound(maxUrg);

      newOnes.forEach(n => {
        const aid = getAnapathId(n);
        const type = n.enriched?.typeExamen
          ?? n.metadata?.typeExamen ?? '';
        if (type === 'EXTEMPORANE_STAT' && aid
            && !extemporaneTimers.current.has(aid)) {
          const timer = setTimeout(() => {
            playAlerteExtemporane();
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
          }, 25 * 60 * 1000);

          extemporaneTimers.current.set(aid, timer);
        }
        known.current.add(n.id ?? n._id);
      });
    }

    setNotifs(sorted);
  }, [cancelExtemporaneTimer]);

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 30000);
    return () => {
      clearInterval(t);
      extemporaneTimers.current.forEach(
        timer => clearTimeout(timer));
    };
  }, [fetchNotifs]);

  const unreadCount = notifs.filter(n => !isLue(n)).length;

  const maxUrg = notifs
    .filter(n => !isLue(n))
    .reduce((m, n) => {
      const u = getUrgence(n);
      return u === 'STAT' ? 'STAT'
        : u === 'URGENTE' && m !== 'STAT' ? 'URGENTE' : m;
    }, 'NORMALE');

  const badgeCls = maxUrg === 'STAT'
    ? 'bg-red-600 animate-pulse'
    : maxUrg === 'URGENTE'
    ? 'bg-orange-500'
    : 'bg-blue-600';

  const handleClick = async (n: any) => {
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
    if (uuid) {
      // Passe par la page de détail : les étapes du workflow doivent être
      // renseignées avant de pouvoir saisir le résultat.
      router.push(`/worklist/${uuid}`);
    } else if (aid) {
      router.push(`/validation?id=${aid}`);
    } else {
      router.push('/validation');
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
    const eligibles = notifs.filter(n => {
      const statut = n.enriched?.statut ?? '';
      return ['RESULTAT_DISPONIBLE', 'VALIDE', 'ARCHIVE']
        .includes(statut) && !isLue(n);
    });
    await Promise.all(eligibles.map(async n => {
      const aid = getAnapathId(n);
      const notifId = n.id ?? n._id;
      if (aid) await marquerNotifLue(aid);
      if (notifId) await markNotificationAsRead(notifId);
    }));
    await fetchNotifs();
  };

  return (
    <div className="relative">
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
              ) : notifs.map(n => {
                const urg  = getUrgence(n);
                const lue  = isLue(n);
                const rel  = isRelance(n);
                const aid  = getAnapathId(n);
                const id   = n.id ?? n._id;
                const type = getTypeExamen(n);
                const svc  = getServiceNom(n);
                const heure = formatHeure(
                  n.createdAt ?? n.date ?? '');
                const relatif = formatRelativeTime(
                  n.createdAt ?? n.date ?? '');
                const alerte = n._alerteExtemporane;
                const enAttente = isPrescriptionEnAttente(n);
                const isRefusingThis = inlineRefuseId === id;
                const isSubmittingThis = inlineSubmittingId === id;

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
                    onClick={() =>
                      !lue && handleClick(n)}
                    className={`
                      ${bg} ${border}
                      px-4 py-3
                      ${!lue ? 'cursor-pointer' : 'cursor-default'}
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
                              ? '🚨 STAT' : '⚠️ URGENT'}
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
                          {type}
                        </p>

                        <p className="text-xs
                          text-gray-600 mt-0.5
                          font-medium">
                          📍 {svc}
                        </p>

                        {lue && (
                          <p className="text-xs
                            text-green-600 mt-0.5
                            font-medium">
                            ✅ Résultat saisi
                          </p>
                        )}
                      </div>

                      <div
                        className="flex items-center
                          gap-1.5 flex-shrink-0"
                        title={heure}
                      >
                        <span className="text-[10px]
                          text-gray-400 whitespace-nowrap">
                          {relatif}
                        </span>
                        {!lue && !enAttente && (
                          <div className="w-2.5 h-2.5
                            bg-blue-600 rounded-full"/>
                        )}
                      </div>
                    </div>

                    {enAttente && !isRefusingThis && (
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

                    {enAttente && isRefusingThis && (
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
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {detailNotif && (
        <div
          className="fixed inset-0 z-[60] flex items-center
            justify-center bg-black/40 p-4"
          onClick={closeDetail}
        >
          <div
            className="bg-white rounded-xl shadow-xl
              max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between
              px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-800">
                Nouvelle prescription
              </h3>
              <button
                onClick={closeDetail}
                disabled={submitting}
                className="text-gray-400 hover:text-gray-600
                  disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500">
                  Type d'examen
                </p>
                <p className="text-sm font-semibold
                  text-gray-800">
                  {getTypeExamen(detailNotif)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">
                  Patient
                </p>
                <p className="text-sm text-gray-800">
                  {detailNotif.metadata?.patientId ?? '—'}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">
                  Urgence
                </p>
                <p className="text-sm text-gray-800">
                  {detailNotif.metadata?.urgence ?? 'NORMALE'}
                </p>
              </div>

              {detailNotif.metadata?.alertes && (
                <div>
                  <p className="text-xs text-gray-500">
                    Alertes
                  </p>
                  <p className="text-sm text-gray-800">
                    {detailNotif.metadata.alertes}
                  </p>
                </div>
              )}

              {detailNotif.metadata?.data
                && Object.keys(detailNotif.metadata.data).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Détails cliniques
                  </p>
                  <div className="text-sm text-gray-700
                    bg-gray-50 rounded-lg p-3 space-y-1">
                    {Object.entries(detailNotif.metadata.data).map(
                      ([k, v]) => (
                        <p key={k}>
                          <span className="text-gray-500">
                            {k} :
                          </span>{' '}
                          {String(v)}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              )}

              {actionError && (
                <p className="text-sm text-red-600
                  bg-red-50 rounded-lg px-3 py-2">
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
        </div>
      )}
    </div>
  );
}
