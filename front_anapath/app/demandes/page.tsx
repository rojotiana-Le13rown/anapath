'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import LocalSearchBox from '@/components/LocalSearchBox';
import FilterButton from '@/components/FilterButton';
import { useSearch } from '@/components/SearchContext';
import { useToast } from '@/components/ToastContext';
import { accepterPrescriptionNotif, refuserPrescriptionNotif, API_BASE } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/dateFormat';
import { getUrgenceLevel, sortByUrgencyThenArrival, type UrgenceLevel } from '@/lib/urgencySort';

/* ---- Helpers (mêmes règles que la cloche de notification) ---- */
const isLue = (n: any) => n?.enriched?.lu === true || n?.read === true;
const isPending = (n: any) =>
  n?.type === 'NOUVELLE_PRESCRIPTION' && !isLue(n);

const getUrgence = (n: any): string =>
  n?.enriched?.urgence ?? n?.metadata?.urgence ?? 'NORMALE';
const getTypeExamen = (n: any): string =>
  n?.enriched?.typeExamen ?? n?.metadata?.typeExamen ?? n?.typeExamen ?? '';
const getServiceNom = (n: any): string =>
  n?.enriched?.serviceNom ?? n?.metadata?.serviceNom ?? '—';
const getPatientId = (n: any): string =>
  n?.enriched?.patientId ?? n?.metadata?.patientId ?? '';
const getPatientName = (n: any): string =>
  n?.enriched?.patientName ??
  n?.metadata?.patientName ??
  n?.patientName ??
  getPatientId(n);
const getCreatedAt = (n: any): string =>
  n?.createdAt ?? n?.timestamp ?? n?.enriched?.createdAt ?? '';
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
  if (up.includes('STAT')) return 'bg-red-100 text-red-700';
  if (up.includes('URGENT')) return 'bg-amber-100 text-amber-800';
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

const TYPE_OPTIONS: Record<string, string> = {
  BIOPSIE: 'Biopsie',
  FCV_PAP: 'FCV / Pap test',
  CYT0PONCTION: 'Cytoponction',
  LIQUIDE: 'Liquide',
  POS: 'POS',
  POC: 'POC',
  EXTEMPORANE_STAT: 'Extemporané STAT',
};

const URGENCE_OPTIONS: Record<UrgenceLevel, string> = {
  STAT: 'Très urgent',
  URGENTE: 'Urgent',
  NORMALE: 'Normal',
};

function toggleValue<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

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

  const openDetail = (n: any) => setDetailTarget(n);
  const closeDetail = () => setDetailTarget(null);

  const loadOnce = useCallback(async () => {
    const [notifs, acceptees, refusees] = await Promise.all([
      fetchJson(`${API_BASE}/anapath/notifications/non-lues`),
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

  const matchesQuery = (n: any, q: string) =>
    [getPatientName(n), getPatientId(n), getTypeExamen(n), getServiceNom(n), n?.title ?? '', n?.message ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q);

  const hasActiveFilters = filterUrgences.length > 0 || filterTypes.length > 0;
  const resetFilters = () => {
    setFilterUrgences([]);
    setFilterTypes([]);
  };

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
    <div className="flex min-h-screen bg-transparent text-[#191c21]">
      <div className="fixed inset-0 grain-overlay z-[60] pointer-events-none"></div>
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
            <FilterButton active={hasActiveFilters}>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Urgence</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(URGENCE_OPTIONS) as UrgenceLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setFilterUrgences(toggleValue(filterUrgences, lvl))}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          filterUrgences.includes(lvl)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-slate-50 text-slate-600 border-outline-variant/30 hover:bg-slate-100'
                        }`}
                      >
                        {URGENCE_OPTIONS[lvl]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Type d&apos;examen</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(TYPE_OPTIONS).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setFilterTypes(toggleValue(filterTypes, code))}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          filterTypes.includes(code)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-slate-50 text-slate-600 border-outline-variant/30 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className="text-xs text-primary font-semibold hover:underline">
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            </FilterButton>
          </div>

          {/* Liste des demandes en attente */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-outline-variant/20">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-[#00284d] to-[#00478d] text-[11px] font-bold text-white/90 uppercase">
                  <tr>
                    <th className="p-4 text-left">Patient</th>
                    <th className="p-4 text-left">Type examen</th>
                    <th className="p-4 text-left">Service demandeur</th>
                    <th className="p-4 text-left">Urgence</th>
                    <th className="p-4 text-left">Reçue</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filtered.map((n, i) => {
                    const id = n.id ?? n._id;
                    const urg = getUrgence(n);
                    const busy = busyId === id;
                    return (
                      <tr
                        key={id}
                        onClick={() => openDetail(n)}
                        className="card-rise cursor-pointer hover:bg-[#00478d]/[0.03] transition-colors"
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                      >
                        <td className="p-4">
                          <p className="font-medium text-[#191c21]">
                            {getPatientName(n) || '—'}
                          </p>
                        </td>
                        <td className="p-4">{getTypeExamen(n) || '—'}</td>
                        <td className="p-4 text-slate-600">{getServiceNom(n)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${urgenceBadge(urg)}`}>
                            {urg}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">{formatDate(getCreatedAt(n))}</td>
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

      {/* Fenêtre de détails de la prescription — thème bleu marine/blanc */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#00203a]/50 backdrop-blur-sm p-4 overlay-in"
          onClick={closeDetail}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#00284d] to-[#00478d] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-2xl">description</span>
                <div>
                  <h3 className="text-white font-bold text-base">Détails de la prescription</h3>
                  <p className="text-white/60 text-xs mt-0.5">
                    {getTypeExamen(detailTarget) || 'Examen'} — Patient{' '}
                    {getPatientName(detailTarget) || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="text-white/70 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Patient</p>
                  <p className="font-medium text-[#191c21]">{getPatientName(detailTarget) || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Type d'examen</p>
                  <p className="font-medium text-[#191c21]">{getTypeExamen(detailTarget) || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Service demandeur</p>
                  <p className="font-medium text-[#191c21]">{getServiceNom(detailTarget)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Urgence</p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${urgenceBadge(getUrgence(detailTarget))}`}>
                    {getUrgence(detailTarget)}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-slate-400">Reçue le</p>
                  <p className="font-medium text-[#191c21]">
                    {formatDateTime(getCreatedAt(detailTarget))}
                  </p>
                </div>
              </div>

              {(detailTarget.metadata?.anapathId || detailTarget.referenceId || detailTarget.examId) && (
                <div className="bg-[#00478d]/5 border border-[#00478d]/15 rounded-lg p-3 text-sm">
                  <p className="text-xs text-slate-400 mb-0.5">Référence examen</p>
                  <p className="font-mono font-medium text-[#00478d]">
                    {detailTarget.metadata?.anapathId ?? detailTarget.referenceId ?? detailTarget.examId}
                  </p>
                </div>
              )}

              {detailTarget.metadata?.alertes && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                  <p className="text-xs text-red-400 font-bold uppercase tracking-wider mb-0.5">
                    Alertes
                  </p>
                  <p className="font-medium text-red-700">{detailTarget.metadata.alertes}</p>
                </div>
              )}

              {detailTarget.message && (
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-sm">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                    Message
                  </p>
                  <p className="font-medium text-[#191c21] leading-relaxed">{detailTarget.message}</p>
                </div>
              )}

              {detailTarget.metadata?.data &&
                Object.keys(detailTarget.metadata.data).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                      Détails cliniques
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(detailTarget.metadata.data).map(([k, v]) => (
                        <div key={k} className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 capitalize">{k}</p>
                          <p className="font-medium text-[#191c21] break-words">
                            {String(v ?? '—')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={closeDetail}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#00478d] to-[#005eb8] rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fenêtre de refus — thème bleu marine/blanc */}
      {refuseTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#00203a]/50 backdrop-blur-sm p-4 overlay-in"
          onClick={closeRefuse}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#00284d] to-[#00478d] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-2xl">block</span>
                <h3 className="text-white font-bold text-base">Refuser la demande</h3>
              </div>
              <button
                type="button"
                onClick={closeRefuse}
                disabled={refusing}
                className="text-white/70 hover:text-white transition-colors disabled:opacity-40"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-5 space-y-3">
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
          </div>
        </div>
      )}
    </div>
  );
}
