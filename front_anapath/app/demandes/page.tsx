'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useSearch } from '@/components/SearchContext';
import { useToast } from '@/components/ToastContext';
import {
  getNotificationsAnapath,
  getPrescriptionsRefusees,
  accepterPrescriptionNotif,
  refuserPrescriptionNotif,
  API_BASE,
} from '@/lib/api';
import { formatDate } from '@/lib/dateFormat';

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
const getCreatedAt = (n: any): string =>
  n?.createdAt ?? n?.timestamp ?? n?.enriched?.createdAt ?? '';

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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20 flex justify-between items-center">
      <div>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
          {label}
        </p>
        <p className={`text-3xl font-extrabold mt-1 ${color}`}>{value}</p>
      </div>
      <span className={`material-symbols-outlined text-2xl rounded-full p-2 ${color} bg-current/10`}>
        {icon}
      </span>
    </div>
  );
}

export default function DemandesPage() {
  const { searchQuery } = useSearch();
  const toast = useToast();

  const [pending, setPending] = useState<any[]>([]);
  const [acceptedToday, setAcceptedToday] = useState(0);
  const [refusedToday, setRefusedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [notifs, refusees, reqRes] = await Promise.all([
        getNotificationsAnapath(),
        getPrescriptionsRefusees(),
        fetch(`${API_BASE}/anapath`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);

      setPending(notifs.filter(isPending));

      const requests: any[] = Array.isArray(reqRes) ? reqRes : [];
      setAcceptedToday(
        requests.filter(
          (r) =>
            (r?.metadata?.sourceService === 'prescription' ||
              r?.prescriptionId) &&
            isToday(r?.createdAt),
        ).length,
      );

      const refusedArr: any[] = Array.isArray(refusees) ? refusees : [];
      setRefusedToday(
        refusedArr.filter((r) =>
          isToday(r?.createdAt ?? r?.updatedAt ?? r?.refusedAt),
        ).length,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((n) =>
      [
        getPatientId(n),
        getTypeExamen(n),
        getServiceNom(n),
        n?.title ?? '',
        n?.message ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [pending, searchQuery]);

  const nouvellesJour = useMemo(
    () => pending.filter((n) => isToday(getCreatedAt(n))).length,
    [pending],
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

  const handleRefuse = async (n: any) => {
    const id = n.id ?? n._id;
    const motif = window.prompt('Motif du refus :')?.trim();
    if (!motif) return;
    setBusyId(id);
    try {
      await refuserPrescriptionNotif(id, motif);
      toast.success('Demande refusée');
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du refus');
    } finally {
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
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight">
              Nouvelles demandes
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Prescriptions en attente d&apos;acceptation ou de refus
            </p>
          </div>

          {/* Statistiques du jour */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <StatCard label="Nouvelles (aujourd'hui)" value={nouvellesJour} icon="inbox" color="text-primary" />
            <StatCard label="Acceptées (aujourd'hui)" value={acceptedToday} icon="check_circle" color="text-emerald-600" />
            <StatCard label="Refusées (aujourd'hui)" value={refusedToday} icon="cancel" color="text-red-600" />
          </div>

          {/* Liste des demandes en attente */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-outline-variant/20">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f2f3fb] text-[11px] font-bold text-slate-500 uppercase">
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
                  {filtered.map((n) => {
                    const id = n.id ?? n._id;
                    const urg = getUrgence(n);
                    const busy = busyId === id;
                    return (
                      <tr key={id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-medium">{getPatientId(n) || '—'}</td>
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
                              onClick={() => handleAccept(n)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition disabled:opacity-60"
                            >
                              <span className="material-symbols-outlined text-base">check</span>
                              Accepter
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRefuse(n)}
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
              {!loading && filtered.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  Aucune demande en attente
                </div>
              )}
              {loading && (
                <div className="text-center py-10 text-slate-400">Chargement…</div>
              )}
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-slate-400">
            {filtered.length} demande(s) en attente
          </div>
        </div>
      </main>
    </div>
  );
}
