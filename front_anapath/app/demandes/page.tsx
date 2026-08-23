'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import LocalSearchBox from '@/components/LocalSearchBox';
import FilterButton from '@/components/FilterButton';
import { useSearch } from '@/components/SearchContext';
import { useToast } from '@/components/ToastContext';
import StatCountdown from '@/components/StatCountdown';
import { accepterPrescriptionNotif, refuserPrescriptionNotif, getPatientForExamen, API_BASE } from '@/lib/api';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/dateFormat';
import { getUrgenceLevel, sortByUrgencyThenArrival, type UrgenceLevel } from '@/lib/urgencySort';
import { typeExamenLabel, prescripteurLabel, TYPE_EXAMEN_LABELS } from '@/lib/statusLabels';
import PrescriptionDetails from '@/components/PrescriptionDetails';
import FloatingModal from '@/components/FloatingModal';
import { type PatientInfo } from '@/components/PatientIdentitySection';

/* ---- Helpers (mêmes règles que la cloche de notification) ---- */
const isPending = (n: any) =>
  n?.type === 'NOUVELLE_PRESCRIPTION' && !n?.metadata?.outcome;

const getUrgence = (n: any): string =>
  n?.enriched?.urgence ?? n?.metadata?.urgence ?? 'NORMALE';
const getTypeExamen = (n: any): string =>
  typeExamenLabel(n?.enriched?.typeExamen ?? n?.metadata?.typeExamen ?? n?.typeExamen ?? '');
const getServiceNom = (n: any): string =>
  n?.enriched?.serviceNom ?? n?.metadata?.serviceNom ?? '—';
const getPatientId = (n: any): string =>
  n?.enriched?.patientId ?? n?.metadata?.patientId ?? '';
const getPatientName = (n: any): string =>
  n?.enriched?.patientName ??
  n?.metadata?.patientName ??
  n?.patientName ??
  '';
const getCreatedAt = (n: any): string =>
  n?.createdAt ?? n?.timestamp ?? n?.enriched?.createdAt ?? '';
const getAnapathId = (n: any): string =>
  n?.enriched?.anapathId ?? n?.metadata?.anapathId ?? n?.referenceId ?? n?.examId ?? '';
const getResolvedAt = (n: any): string =>
  n?.metadata?.resolvedAt ?? getCreatedAt(n);

const isToday = (d?: string): boolean => {
  if (!d) return false;
  const x = new Date(d);
  const n = new Date();
  return (
    x.getFullYear() === n.getFullYear() &&
    x.getMonth() === n.getMonth() &&
    x.getDate() === n.getDate()
  );
};

const urgenceBadge = (u: string) => {
  const up = u.toUpperCase();
  if (up.includes('STAT') || up === 'TRES_URGENT') return 'bg-red-100 text-red-700';
  if (up.includes('URGENT')) return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-600';
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Le serveur a répondu ${res.status}`);
  return res.json();
}

function StatCard({
  label,
  value,
  icon,
  color,
  badge,
  delay,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  badge?: string;
  delay?: number;
}) {
  return (
    <div
      className="card-rise group bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20
        flex justify-between items-center transition-all duration-200
        hover:shadow-lg hover:-translate-y-0.5 hover:border-[#00478d]/20"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {label}
          </p>
          {badge && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full animate-pulse">
              {badge}
            </span>
          )}
        </div>
        <p className={`text-3xl font-extrabold mt-1 ${color}`}>{value}</p>
      </div>
      <span
        className={`material-symbols-outlined text-2xl rounded-full p-2 ${color} bg-current/10
          transition-transform duration-200 group-hover:scale-110`}
      >
        {icon}
      </span>
    </div>
  );
}

const TYPE_OPTIONS = TYPE_EXAMEN_LABELS;

const URGENCE_OPTIONS: Record<UrgenceLevel, string> = {
  STAT: 'Très urgent',
  URGENTE: 'Urgent',
  NORMALE: 'Normal',
};

export default function DemandesPage() {
  const { searchQuery } = useSearch();
  const toast = useToast();

  const [pendingList, setPendingList] = useState<any[]>([]);
  const [acceptedList, setAcceptedList] = useState<any[]>([]);
  const [refusedList, setRefusedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState('');
  const [filterUrgences, setFilterUrgences] = useState<UrgenceLevel[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [refuseTarget, setRefuseTarget] = useState<any | null>(null);
  const [motifInput, setMotifInput] = useState('');
  const [refusing, setRefusing] = useState(false);
  const [detailTarget, setDetailTarget] = useState<any | null>(null);
  const [modalPatient, setModalPatient] = useState<PatientInfo | null>(null);
  const [modalPatientLoading, setModalPatientLoading] = useState(false);

  // Actualise les libellés relatifs ("il y a X") toutes les 30 s.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const openDetail = (n: any) => setDetailTarget(n);
  const closeDetail = () => setDetailTarget(null);

  useEffect(() => {
    if (!detailTarget) { setModalPatient(null); return; }
    const pid = getPatientId(detailTarget);
    if (!pid) { setModalPatient(null); return; }
    let cancelled = false;
    setModalPatientLoading(true);
    getPatientForExamen(pid)
      .then(p => { if (!cancelled) setModalPatient(p as PatientInfo); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setModalPatientLoading(false); });
    return () => { cancelled = true; };
  }, [detailTarget?.id ?? detailTarget?._id]);

  const loadOnce = useCallback(async () => {
    const [notifs, acceptees, refusees] = await Promise.all([
      fetchJson(`${API_BASE}/anapath/notifications/en-attente`),
      fetchJson(`${API_BASE}/anapath/notifications/acceptees`),
      fetchJson(`${API_BASE}/anapath/notifications/refusees`),
    ]);
    setPendingList(Array.isArray(notifs) ? notifs.filter(isPending) : []);
    setAcceptedList(Array.isArray(acceptees) ? acceptees : []);
    setRefusedList(Array.isArray(refusees) ? refusees : []);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadOnce();
    } catch {
      // Le service peut mettre du temps à se réveiller (cold start) — on retente
      // une fois avant d'afficher une vraie erreur, pour ne pas confondre
      // "aucune donnée" et "le serveur n'a pas encore répondu".
      try {
        await new Promise((r) => setTimeout(r, 3500));
        await loadOnce();
      } catch (e2) {
        setLoadError(
          e2 instanceof Error
            ? e2.message
            : 'Le service ne répond pas pour le moment.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [loadOnce]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Alerte à l'arrivée d'un examen STAT (TRES URGENT) : la première remontée
  // hydrate silencieusement, puis chaque nouveau STAT réellement reçu déclenche
  // une notification dans la cloche.
  const knownStatIds = useRef<Set<string>>(new Set());
  const statHydrated = useRef(false);
  useEffect(() => {
    if (!statHydrated.current) {
      statHydrated.current = true;
      pendingList.forEach((n) => {
        const urg = getUrgence(n);
        if (urg === 'STAT' || urg === 'TRES_URGENT') {
          knownStatIds.current.add(String(n.id ?? n._id ?? getCreatedAt(n)));
        }
      });
      return;
    }
    pendingList.forEach((n) => {
      const urg = getUrgence(n);
      if (urg !== 'STAT' && urg !== 'TRES_URGENT') return;
      const id = String(n.id ?? n._id);
      if (knownStatIds.current.has(id)) return;
      knownStatIds.current.add(id);
      fetch(`${API_BASE}/anapath/notifications/stat-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anapathId: getAnapathId(n),
          patientId: getPatientId(n),
          requestId: id,
          phase: 'arrival',
        }),
      }).catch(() => {});
    });
  }, [pendingList]);

  const matchesQuery = (n: any, q: string) =>
    [getPatientName(n), getPatientId(n), getTypeExamen(n), getServiceNom(n), n?.title ?? '', n?.message ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q);

  const filtered = useMemo(() => {
    let result = pendingList;
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter((n) => matchesQuery(n, q));
    const lq = localQuery.trim().toLowerCase();
    if (lq) result = result.filter((n) => matchesQuery(n, lq));
    if (filterUrgences.length > 0) {
      result = result.filter((n) => filterUrgences.includes(getUrgenceLevel(n)));
    }
    if (filterTypes.length > 0) {
      result = result.filter((n) => filterTypes.includes(getTypeExamen(n)));
    }
    // Une demande très urgente (TRES_URGENT/STAT) doit toujours apparaître en premier.
    return sortByUrgencyThenArrival(result);
  }, [pendingList, searchQuery, localQuery, filterUrgences, filterTypes]);

  // Totaux globaux (pas seulement aujourd'hui) + part reçue/traitée aujourd'hui pour le badge "+N".
  const nouvellesAujourdhui = useMemo(
    () => pendingList.filter((n) => isToday(getCreatedAt(n))).length,
    [pendingList],
  );
  const accepteesAujourdhui = useMemo(
    () => acceptedList.filter((n) => isToday(getResolvedAt(n))).length,
    [acceptedList],
  );
  const refuseesAujourdhui = useMemo(
    () => refusedList.filter((n) => isToday(getResolvedAt(n))).length,
    [refusedList],
  );

  const handleAccept = async (n: any) => {
    const id = n.id ?? n._id;
    setBusyId(id);
    try {
      await accepterPrescriptionNotif(id);
      toast.success('Demande acceptée');
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'acceptation");
    } finally {
      setBusyId(null);
    }
  };

  const openRefuse = (n: any) => {
    setRefuseTarget(n);
    setMotifInput('');
  };

  const closeRefuse = () => {
    if (refusing) return;
    setRefuseTarget(null);
    setMotifInput('');
  };

  const confirmRefuse = async () => {
    if (!refuseTarget || !motifInput.trim()) return;
    const id = refuseTarget.id ?? refuseTarget._id;
    setRefusing(true);
    setBusyId(id);
    try {
      await refuserPrescriptionNotif(id, motifInput.trim());
      toast.success('Demande refusée');
      setRefuseTarget(null);
      setMotifInput('');
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du refus');
    } finally {
      setRefusing(false);
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#191c21]">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col w-[calc(100%-256px)]">
        <TopBar />
        <div className="flex-1 p-6 w-full">
          <div className="mb-6 flex items-center gap-3">
            <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-[#00284d] to-[#00478d]" />
            <div>
              <h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight">
                Nouvelles demandes
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                Prescriptions en attente d&apos;acceptation ou de refus
              </p>
            </div>
          </div>

          {loadError && (
            <div className="mb-6 flex items-center justify-between gap-4 bg-gradient-to-r from-[#00284d] to-[#00478d] text-white rounded-xl px-5 py-4 shadow-sm modal-in">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined">cloud_off</span>
                <div>
                  <p className="font-semibold text-sm">Service indisponible pour le moment</p>
                  <p className="text-xs text-white/70 mt-0.5">
                    Le serveur met parfois quelques secondes à se réveiller après une période
                    d&apos;inactivité. ({loadError})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="shrink-0 px-4 py-2 bg-white text-[#00478d] rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Statistiques globales + delta du jour */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <StatCard
              label="Nouvelles demandes"
              value={pendingList.length}
              icon="inbox"
              color="text-primary"
              badge={nouvellesAujourdhui > 0 ? `+${nouvellesAujourdhui} aujourd'hui` : undefined}
            />
            <StatCard
              label="Acceptées"
              value={acceptedList.length}
              icon="check_circle"
              color="text-emerald-600"
              badge={accepteesAujourdhui > 0 ? `+${accepteesAujourdhui} aujourd'hui` : undefined}
              delay={60}
            />
            <StatCard
              label="Refusées"
              value={refusedList.length}
              icon="cancel"
              color="text-red-600"
              badge={refuseesAujourdhui > 0 ? `+${refuseesAujourdhui} aujourd'hui` : undefined}
              delay={120}
            />
          </div>

          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <LocalSearchBox
              value={localQuery}
              onChange={setLocalQuery}
              placeholder="Rechercher dans les nouvelles demandes..."
            />
            <FilterButton
              sections={[
                {
                  key: 'urgence',
                  label: 'Urgence',
                  placeholder: 'Toutes les urgences',
                  options: (Object.keys(URGENCE_OPTIONS) as UrgenceLevel[]).map((lvl) => ({
                    value: lvl,
                    label: URGENCE_OPTIONS[lvl],
                  })),
                  value: filterUrgences,
                  onChange: (v) => setFilterUrgences(v as UrgenceLevel[]),
                },
                {
                  key: 'type',
                  label: "Type d'examen",
                  placeholder: 'Tous les examens',
                  multiple: true,
                  options: Object.entries(TYPE_OPTIONS).map(([code, label]) => ({ value: code, label })),
                  value: filterTypes,
                  onChange: setFilterTypes,
                },
              ]}
            />
          </div>

          {/* Liste des demandes en attente */}
          <div className="bg-white rounded-[12px] shadow-sm overflow-hidden border-2 border-[#00478d] mx-[30px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[#1E293B]">
                <thead className="bg-[#1E293B] text-[11px] font-bold text-white/90 uppercase">
                  <tr>
                    <th className="p-4 text-left">Patient</th>
                    <th className="p-4 text-left">Type examen</th>
                    <th className="p-4 text-left">Service demandeur</th>
                    <th className="p-4 text-left">Urgence</th>
                    <th className="p-4 text-left">Reçue</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#00478d]/40">
                  {filtered.map((n) => {
                    const id = n.id ?? n._id;
                    const urg = getUrgence(n);
                    const busy = busyId === id;
                    return (
                      <tr
                        key={id}
                        onClick={() => openDetail(n)}
                        className={`cursor-pointer transition-colors ${
                          urg === 'STAT' || urg === 'TRES_URGENT'
                            ? 'bg-red-50 hover:bg-red-100/60'
                            : urg === 'URGENTE'
                              ? 'bg-orange-50 hover:bg-orange-100/60'
                              : 'hover:bg-[#00478d]/5'
                        }`}
                      >
                        <td className="p-4">
                          <p className="font-medium text-[#1E293B]">
                            {getPatientName(n) || '—'}
                          </p>
                        </td>
                        <td className="p-4">
                          {getTypeExamen(n) || '—'}
                          {prescripteurLabel(n?.metadata) && (
                            <span className="block text-[10px] font-semibold text-slate-500 mt-0.5">{prescripteurLabel(n?.metadata)}</span>
                          )}
                        </td>
                        <td className="p-4 text-slate-600">{getServiceNom(n)}</td>
                        <td className="p-4">
                          <div className="flex flex-col items-start gap-0.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${urgenceBadge(urg)}`}>
                              {urg === 'TRES_URGENT'
                                ? 'TRES URGENT'
                                : URGENCE_OPTIONS[urg as UrgenceLevel] ?? urg}
                            </span>
                            {(urg === 'STAT' || urg === 'TRES_URGENT') && (
                              <StatCountdown startTime={getCreatedAt(n)} />
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          <div>{formatDate(getCreatedAt(n))}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {formatRelativeTime(getCreatedAt(n))}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleAccept(n); }}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#00478d] to-[#005eb8] text-white text-xs font-semibold hover:shadow-md active:scale-95 transition-all disabled:opacity-60"
                            >
                              <span className="material-symbols-outlined text-base">check</span>
                              Accepter
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openRefuse(n); }}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 active:scale-95 transition disabled:opacity-60"
                            >
                              <span className="material-symbols-outlined text-base">close</span>
                              Refuser
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && !loadError && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-40">inbox</span>
                  <p>Aucune demande en attente</p>
                </div>
              )}
              {loading && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                  <div className="w-8 h-8 border-2 border-[#00478d]/20 border-t-[#00478d] rounded-full animate-spin mb-3" />
                  <p>Chargement…</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-slate-400">
            {filtered.length} demande(s) en attente
          </div>
        </div>
      </main>

      {/* Fenêtre de détails de la prescription — déplaçable et redimensionnable */}
      {detailTarget && (
        <FloatingModal
          open
          onClose={closeDetail}
          zIndex={100}
          icon="description"
          title="Détails de la prescription"
          subtitle={`${getTypeExamen(detailTarget) || 'Examen'}${prescripteurLabel(detailTarget?.metadata) ? ` · ${prescripteurLabel(detailTarget?.metadata)}` : ''} — Patient ${getPatientName(detailTarget) || '—'}`}
          footer={
            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { closeDetail(); openRefuse(detailTarget); }}
                disabled={busyId === (detailTarget?.id ?? detailTarget?._id)}
                className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => { closeDetail(); handleAccept(detailTarget); }}
                disabled={busyId === (detailTarget?.id ?? detailTarget?._id)}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#00478d] to-[#005eb8] rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
              >
                {busyId === (detailTarget?.id ?? detailTarget?._id) ? '...' : 'Accepter'}
              </button>
            </div>
          }
        >
          <PrescriptionDetails
            request={{
              typeExamen: detailTarget.metadata?.typeExamen ?? '',
              createdAt: detailTarget.createdAt ?? detailTarget.date ?? '',
              patientId: getPatientId(detailTarget),
              metadata: detailTarget.metadata ?? {},
            }}
            patient={modalPatient}
            patientLoading={modalPatientLoading}
          />
        </FloatingModal>
      )}

      {/* Fenêtre de refus — déplaçable et redimensionnable */}
      {refuseTarget && (
        <FloatingModal
          open
          onClose={closeRefuse}
          zIndex={100}
          maxWidthPx={512}
          heightPct={0.6}
          icon="block"
          title="Refuser la demande"
          footer={
            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={closeRefuse}
                disabled={refusing}
                className="px-4 py-2 text-sm font-semibold text-[#00478d] hover:bg-[#00478d]/10 rounded-lg transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmRefuse}
                disabled={refusing || !motifInput.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-700
                  rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {refusing ? 'Envoi...' : 'Confirmer le refus'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Patient <strong className="text-[#191c21]">{getPatientName(refuseTarget) || '—'}</strong>
              {' — '}
              {getTypeExamen(refuseTarget) || '—'}
            </p>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Motif du refus *</label>
              <textarea
                value={motifInput}
                onChange={(e) => setMotifInput(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Expliquez pourquoi cette demande est refusée..."
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#00478d]/30 focus:border-[#00478d] transition-shadow"
              />
            </div>
          </div>
        </FloatingModal>
      )}
    </div>
  );
}
