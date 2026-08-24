'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import FilterButton from '@/components/FilterButton';
import { useSearch } from '@/components/SearchContext';
import { useAuth } from '@/components/AuthProvider';
import FloatingModal from '@/components/FloatingModal';
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import {
  getMondayOfWeek,
  formatWeekLabel,
  isDateInWeek,
  getDailyVolumeForWeek,
} from '@/lib/weekUtils';
import { statusLabel } from '@/lib/statusLabels';
import { PENDING_STATUSES } from '@/lib/statusLabels';
import { getServiceDisplayName } from '@/lib/serviceDisplay';
import { generateReportPDF, type ReportPdfData } from '@/lib/reportPDF';
import { getTypeLabel } from '@/lib/generatePDF';
import { isMajorRole } from '@/lib/roles';
import { getPrescriptionsRefusees } from '@/lib/api';
import {
  buildTableau1,
  buildTableau2,
  tableau1Total,
  ACTIVITE_HEADERS,
  PRISE_EN_CHARGE_HEADERS,
  exportMajorReportExcel,
  exportMajorReportPDF,
} from '@/lib/majorReport';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#00478d', '#2563eb', '#10b981',
  '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

type Period = 'week' | 'month' | 'quarter' | 'semester' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Hebdomadaire',
  month: 'Mois',
  quarter: 'Trimestriel',
  semester: 'Semestriel',
  year: 'Annuel',
};

interface AnapathRequest {
  id: string;
  anapathId: string;
  patientId: string;
  typeExamen: string;
  statut: string;
  createdAt: string;
  validatedAt: string | null;
  episodeId?: string | null;
  patientInfo?: {
    nomComplet?: string | null;
    nom?: string | null;
    prenom?: string | null;
    sexe?: string | null;
    age?: number | null;
    dateNaissance?: string | null;
  } | null;
}

interface Statistics {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  monthlyData: { month: string; count: number }[];
  tatMoyen: number;
}

/** Stats de base (hors répartition mensuelle) pour un sous-ensemble arbitraire de demandes. */
function computeCoreStats(data: AnapathRequest[]): Omit<Statistics, 'monthlyData'> {
  const total = data.length;
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  data.forEach((req) => {
    byType[req.typeExamen] = (byType[req.typeExamen] || 0) + 1;
    byStatus[req.statut] = (byStatus[req.statut] || 0) + 1;
  });

  const validatedRequests = data.filter((req) => req.validatedAt && req.statut === 'VALIDE');
  let tatMoyen = 0;
  if (validatedRequests.length > 0) {
    const totalDays = validatedRequests.reduce((sum, req) => {
      const created = new Date(req.createdAt);
      const validated = new Date(req.validatedAt!);
      return sum + (validated.getTime() - created.getTime()) / (1000 * 3600 * 24);
    }, 0);
    tatMoyen = totalDays / validatedRequests.length;
  }

  return { total, byType, byStatus, tatMoyen };
}

/** Effectif journalier pour un mois calendaire donné (tous les jours du mois). */
function getDailyVolumeForMonth(data: AnapathRequest[], year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const volumes: { day: number; count: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const count = data.filter((req) => {
      const rd = new Date(req.createdAt);
      return rd.getFullYear() === year && rd.getMonth() === month && rd.getDate() === d;
    }).length;
    volumes.push({ day: d, count });
  }
  return volumes;
}

/** Date au format aaaa-mm-jj pour un champ <input type="date">. */
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const AGE_BUCKETS = [
  { label: '0-14', min: 0, max: 14 },
  { label: '15-29', min: 15, max: 29 },
  { label: '30-44', min: 30, max: 44 },
  { label: '45-59', min: 45, max: 59 },
  { label: '60+', min: 60, max: 200 },
];

export default function ReportsPage() {
  const { searchQuery } = useSearch();
  const { user } = useAuth();
  // L'importation du rapport (paramétrage du rapport automatique hebdomadaire)
  // est réservée au major du service ; le chef de service consulte les rapports
  // mais ne peut pas importer.
  const canManageAutoReport = isMajorRole(user?.roleName);
  const [requests, setRequests] = useState<AnapathRequest[]>([]);
  const [refusedCount, setRefusedCount] = useState(0);
  const [filteredRequests, setFilteredRequests] = useState<AnapathRequest[]>([]);
  const [stats, setStats] = useState<Statistics>({
    total: 0, byType: {}, byStatus: {}, monthlyData: [], tatMoyen: 0
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [volumeChartType, setVolumeChartType] = useState<'bar' | 'line'>('bar');
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [chartType, setChartType] = useState<'bar' | 'pie' | 'histogram'>('bar');
  const [autoReportEnabled, setAutoReportEnabled] = useState(false);
  const [autoReportLoading, setAutoReportLoading] = useState(false);
  const [showCustomReportModal, setShowCustomReportModal] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [generatingCustom, setGeneratingCustom] = useState(false);
  // Plage de dates du « Rapport hebdomadaire du service (modèle CHU) » :
  // par défaut la semaine en cours (lundi → aujourd'hui).
  const [majorStart, setMajorStart] = useState(() => toInputDate(getMondayOfWeek(new Date())));
  const [majorEnd, setMajorEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
    fetchData();
    axios.get(`${API_BASE}/anapath/report-settings`)
      .then((res) => setAutoReportEnabled(Boolean(res.data?.autoWeeklyReportEnabled)))
      .catch(() => {});
    getPrescriptionsRefusees().then((rows) => setRefusedCount(rows.length));
  }, []);

  useEffect(() => {
    let filtered = requests;
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(req =>
        req.anapathId.toLowerCase().includes(query) ||
        req.patientId.toLowerCase().includes(query) ||
        req.typeExamen.toLowerCase().includes(query)
      );
    }
    setFilteredRequests(filtered);
    calculateStatistics(filtered);
  }, [searchQuery, requests]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/anapath`);
      const data = response.data;
      setRequests(data);
      setFilteredRequests(data);
      calculateStatistics(data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = (data: AnapathRequest[]) => {
    const core = computeCoreStats(data);

    const monthlyData: { month: string; count: number }[] = [];
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const currentDate = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthName = months[date.getMonth()];
      const count = data.filter(req => {
        const reqDate = new Date(req.createdAt);
        return reqDate.getMonth() === date.getMonth() && reqDate.getFullYear() === date.getFullYear();
      }).length;
      monthlyData.push({ month: monthName, count });
    }

    setStats({ ...core, monthlyData });
  };

  const toggleAutoReport = async () => {
    const next = !autoReportEnabled;
    setAutoReportLoading(true);
    try {
      await axios.patch(`${API_BASE}/anapath/report-settings`, { autoWeeklyReportEnabled: next });
      setAutoReportEnabled(next);
    } catch (error) {
      console.error('Erreur mise à jour rapport automatique:', error);
      alert('Erreur lors de la mise à jour du paramètre');
    } finally {
      setAutoReportLoading(false);
    }
  };

  const getFilteredData = () => {
    if (period === 'month') return stats.monthlyData.slice(-1);
    if (period === 'quarter') return stats.monthlyData.slice(-3);
    if (period === 'semester') return stats.monthlyData.slice(-6);
    if (period === 'year') return stats.monthlyData.slice(-12);
    return stats.monthlyData.slice(-1);
  };

  const weeklyRequests = requests
    .filter((req) => isDateInWeek(req.createdAt, weekStart))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Variation hebdomadaire réelle du total d'examens (semaine en cours vs
  // semaine précédente) pour le badge « Total examens ».
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const currentWeekCount = weeklyRequests.length;
  const prevWeekCount = requests.filter((req) => isDateInWeek(req.createdAt, prevWeekStart)).length;
  const weekChangePct = prevWeekCount === 0
    ? (currentWeekCount > 0 ? 100 : 0)
    : Math.round(((currentWeekCount - prevWeekCount) / prevWeekCount) * 100);
  const weekChangeBadgeClass = weekChangePct > 0
    ? 'text-emerald-600 bg-emerald-50'
    : weekChangePct < 0
      ? 'text-red-600 bg-red-50'
      : 'text-slate-500 bg-slate-100';
  const weekChangeBadgeText = weekChangePct > 0
    ? `+${weekChangePct}% cette semaine`
    : `${weekChangePct}% cette semaine`;

  const weeklyValidated = weeklyRequests.filter((r) => r.statut === 'VALIDE');
  const weeklyPending = weeklyRequests.filter((r) => PENDING_STATUSES.includes(r.statut));
  let weeklyAvgDelay = 0;
  if (weeklyValidated.length > 0) {
    const totalDays = weeklyValidated.reduce((sum, req) => {
      if (!req.validatedAt) return sum;
      const created = new Date(req.createdAt);
      const validated = new Date(req.validatedAt);
      return sum + (validated.getTime() - created.getTime()) / (1000 * 3600 * 24);
    }, 0);
    weeklyAvgDelay = totalDays / weeklyValidated.length;
  }
  const weeklyDailyVolume = getDailyVolumeForWeek(weeklyRequests, weekStart);

  // Le graphique "Volume d'examens" suit la période choisie dans le filtre :
  // par jour pour l'hebdomadaire et le mensuel, par mois agrégé pour le reste.
  const now = new Date();
  const monthlyDailyVolume = period === 'month'
    ? getDailyVolumeForMonth(filteredRequests, now.getFullYear(), now.getMonth())
    : [];
  const volumeChartData = period === 'week'
    ? weeklyDailyVolume.map((d) => ({ label: d.day, count: d.count }))
    : period === 'month'
      ? monthlyDailyVolume.map((d) => ({ label: String(d.day), count: d.count }))
      : getFilteredData().map((item) => ({ label: item.month, count: item.count }));
  // En mensuel, on force une courbe journalière (pas de choix barres/courbe).
  const effectiveVolumeChartType: 'bar' | 'line' = period === 'month' ? 'line' : volumeChartType;

  const dataParType = Object.entries(stats.byType).map(([type, count]) => ({
    type: getTypeLabel(type),
    count,
  }));

  const dataParJour = weeklyDailyVolume.map((d) => ({
    jour: d.day,
    count: d.count,
  }));

  const termineCount = filteredRequests.filter((r) => r.statut === 'VALIDE' || r.statut === 'ARCHIVE').length;
  const nonTermineCount = filteredRequests.length - termineCount;
  const dataTermineVsNon = [
    { name: 'Terminé', value: termineCount, color: '#10b981' },
    { name: 'Non terminé', value: nonTermineCount, color: '#f59e0b' },
  ];

  // ===== Rapport hebdomadaire du service (modèle CHU) : 2 tableaux =====
  const majorRangeRequests = requests.filter((r) => {
    if (!majorStart || !majorEnd) return false;
    const d = new Date(r.createdAt);
    const s = new Date(majorStart);
    s.setHours(0, 0, 0, 0);
    const e = new Date(majorEnd);
    e.setHours(23, 59, 59, 999);
    return d >= s && d <= e;
  });
  const tableau1 = buildTableau1(majorRangeRequests);
  const t1Total = tableau1Total(tableau1);
  const tableau2 = buildTableau2(majorRangeRequests);
  const majorPeriodeLabel =
    `${new Date(majorStart).toLocaleDateString('fr-FR')} au ` +
    `${new Date(majorEnd).toLocaleDateString('fr-FR')}`;

  const pecVsEnCours = tableau1
    .filter((r) => r.pec > 0 || r.enCours > 0)
    .map((r) => ({
      name: r.label,
      'Prise en charge (PEC)': r.pec,
      'Résultats en cours': r.enCours,
    }));

  const sexeData = [
    { name: 'Féminin', value: tableau2.filter((r) => r.sexe === 'F').length, color: '#ec4899' },
    { name: 'Masculin', value: tableau2.filter((r) => r.sexe === 'M').length, color: '#00478d' },
    { name: 'Non renseigné', value: tableau2.filter((r) => r.sexe !== 'M' && r.sexe !== 'F').length, color: '#94a3b8' },
  ].filter((d) => d.value > 0);

  const ageData = AGE_BUCKETS.map((b) => ({
    label: b.label,
    count: tableau2.filter((r) => {
      const a = Number(r.age);
      return !Number.isNaN(a) && a >= b.min && a <= b.max;
    }).length,
  }));

  const chartBtn = (active: boolean) =>
    `px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
      active
        ? 'bg-[#00478d] text-white shadow-sm'
        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
    }`;

  const mapToReportRow = (req: AnapathRequest) => ({
    anapathId: req.anapathId,
    patientId: req.patientId,
    typeExamen: req.typeExamen,
    typeLabel: getTypeLabel(req.typeExamen),
    statut: req.statut,
    statutLabel: statusLabel(req.statut),
    prescriber: getServiceDisplayName({ episodeId: req.episodeId }),
    createdAt: req.createdAt,
  });

  const getPeriodLabel = () => {
    const now = new Date();
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
    ];
    if (period === 'week') return `Rapport hebdomadaire : semaine du ${formatWeekLabel(weekStart)}`;
    if (period === 'month') return `Rapport mensuel : ${months[now.getMonth()]} ${now.getFullYear()}`;
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return `Rapport trimestriel : T${q} ${now.getFullYear()}`;
    }
    if (period === 'semester') {
      const s = now.getMonth() < 6 ? 1 : 2;
      return `Rapport semestriel : S${s} ${now.getFullYear()}`;
    }
    return `Rapport annuel : ${now.getFullYear()}`;
  };

  const buildReportPdfData = (weeklyOnly = false): ReportPdfData => ({
    period,
    periodLabel: weeklyOnly ? `Semaine du ${formatWeekLabel(weekStart)}` : getPeriodLabel(),
    stats,
    filteredMonthlyData: getFilteredData(),
    weekly: {
      weekLabel: formatWeekLabel(weekStart),
      total: weeklyRequests.length,
      validated: weeklyValidated.length,
      pending: weeklyPending.length,
      avgDelay: weeklyAvgDelay,
      dailyVolume: weeklyDailyVolume,
      requests: weeklyRequests.map(mapToReportRow),
    },
    allRequests: filteredRequests.map(mapToReportRow),
    weeklyOnly,
  });

  const exportToPDF = async () => {
    try {
      await generateReportPDF(buildReportPdfData(false));
    } catch {
      alert('Erreur lors de la génération du rapport PDF.');
    }
  };

  const handleGenerateCustomReport = async () => {
    if (!customStart || !customEnd) return;
    setGeneratingCustom(true);
    try {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      const rangeRequests = requests.filter((r) => {
        const d = new Date(r.createdAt);
        return d >= start && d <= end;
      });
      const customStats: Statistics = { ...computeCoreStats(rangeRequests), monthlyData: [] };

      await generateReportPDF({
        period: 'custom',
        periodLabel: `Rapport personnalisé : du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`,
        stats: customStats,
        filteredMonthlyData: [],
        weekly: {
          weekLabel: formatWeekLabel(weekStart),
          total: weeklyRequests.length,
          validated: weeklyValidated.length,
          pending: weeklyPending.length,
          avgDelay: weeklyAvgDelay,
          dailyVolume: weeklyDailyVolume,
          requests: weeklyRequests.map(mapToReportRow),
        },
        allRequests: rangeRequests.map(mapToReportRow),
        weeklyOnly: false,
      });
      setShowCustomReportModal(false);
    } catch {
      alert('Erreur lors de la génération du rapport personnalisé.');
    } finally {
      setGeneratingCustom(false);
    }
  };

  const handleExportMajorExcel = async () => {
    try {
      await exportMajorReportExcel(majorRangeRequests, majorPeriodeLabel);
    } catch {
      alert("Erreur lors de l'export Excel du rapport.");
    }
  };

  const handleExportMajorPDF = async () => {
    try {
      await exportMajorReportPDF(majorRangeRequests, majorPeriodeLabel);
    } catch {
      alert("Erreur lors de l'export PDF du rapport.");
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
          <div className="mb-6"><h2 className="text-2xl font-extrabold text-[#191c21] tracking-tight">Analyse de performance</h2><p className="text-slate-500 text-sm mt-1">Statistiques et indicateurs clés</p></div>

          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="text-sm text-slate-500">
              Période : <strong className="text-on-surface">{PERIOD_LABELS[period]}</strong>
            </span>

            <div className="flex items-center gap-3 ml-auto">
              <FilterButton
                activeCount={period !== 'week' ? 1 : 0}
                sections={[
                  {
                    key: 'period',
                    label: 'Période',
                    placeholder: 'Toutes les périodes',
                    options: (Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({
                      value: p,
                      label: PERIOD_LABELS[p],
                    })),
                    value: [period],
                    onChange: (v) => setPeriod(v[0] ? (v[0] as Period) : 'week'),
                  },
                ]}
              />
              <button
                type="button"
                onClick={() => setShowCustomReportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00478d] to-[#005eb8] text-white rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-base">event_note</span>
                Créer un rapport
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20">
              <div className="flex justify-between items-start mb-2"><span className="material-symbols-outlined text-primary text-2xl">analytics</span><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${weekChangeBadgeClass}`}>{weekChangeBadgeText}</span></div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Total examens</p><p className="text-3xl font-extrabold text-primary">{stats.total}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20">
              <div className="flex justify-between items-start mb-2"><span className="material-symbols-outlined text-tertiary text-2xl">speed</span><span className="text-xs font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">TRES URGENT</span></div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">En attente</p><p className="text-3xl font-extrabold text-tertiary">{Object.entries(stats.byStatus).filter(([s]) => PENDING_STATUSES.includes(s)).reduce((sum, [, c]) => sum + c, 0)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20">
              <span className="material-symbols-outlined text-primary text-2xl mb-2">schedule</span>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Délai moyen TAT</p><p className="text-3xl font-extrabold text-primary">{stats.tatMoyen.toFixed(1)} <span className="text-base font-normal">jours</span></p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20">
              <span className="material-symbols-outlined text-primary text-2xl mb-2">verified</span>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Validés</p><p className="text-3xl font-extrabold text-primary">{stats.byStatus['VALIDE'] || 0}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-outline-variant/20">
              <span className="material-symbols-outlined text-red-600 text-2xl mb-2">block</span>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Demandes refusées</p><p className="text-3xl font-extrabold text-red-600">{refusedCount}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-bold">
                Volume d&apos;examens {period === 'week' || period === 'month' ? '(par jour)' : '(par mois)'}
              </h3>
              {period !== 'month' && (
                <div className="flex gap-2">
                  <button onClick={() => setVolumeChartType('bar')} className={chartBtn(volumeChartType === 'bar')}>📊 Barres</button>
                  <button onClick={() => setVolumeChartType('line')} className={chartBtn(volumeChartType === 'line')}>📈 Courbe</button>
                </div>
              )}
            </div>
            {volumeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                {effectiveVolumeChartType === 'bar' ? (
                  <BarChart data={volumeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#00478d" radius={[6, 6, 0, 0]} name="Examens" />
                  </BarChart>
                ) : (
                  <LineChart data={volumeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval={period === 'month' ? 1 : 0} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#00478d" strokeWidth={2} dot={{ r: 3 }} name="Examens" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 text-center py-12">Aucune donnée pour cette période</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-8">
            <h3 className="font-bold mb-4">Examens terminés vs non terminés</h3>
            {filteredRequests.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:max-w-xs">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={dataTermineVsNon}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {dataTermineVsNon.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-3">
                  {dataTermineVsNon.map((entry) => {
                    const pct = filteredRequests.length > 0 ? Math.round((entry.value / filteredRequests.length) * 100) : 0;
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                          <span className="text-slate-600">{entry.name}</span>
                        </div>
                        <span className="font-bold text-[#191c21]">
                          {entry.value} <span className="text-slate-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-12">Aucune donnée disponible</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-8">
              <h3 className="font-bold mb-4">Répartition par type d&apos;examen</h3>

              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setChartType('bar')} className={chartBtn(chartType === 'bar')}>
                  📊 Diagramme en bâtons
                </button>
                <button onClick={() => setChartType('pie')} className={chartBtn(chartType === 'pie')}>
                  🥧 Diagramme circulaire
                </button>
                <button onClick={() => setChartType('histogram')} className={chartBtn(chartType === 'histogram')}>
                  📈 Histogramme
                </button>
              </div>

              {chartType === 'bar' && dataParType.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dataParType}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#00478d" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === 'pie' && dataParType.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={dataParType} dataKey="count"
                      nameKey="type" cx="50%" cy="50%"
                      outerRadius={100} label>
                      {dataParType.map((entry, i) => (
                        <Cell key={entry.type} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {chartType === 'histogram' && dataParJour.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dataParJour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="jour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {dataParType.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">Aucune donnée disponible</p>
              )}

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {Object.entries(stats.byType).map(([type, count]) => {
                const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={type} className="mb-3">
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium">{getTypeLabel(type)}</span><span className="font-bold text-primary">{count} ({percentage}%)</span></div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-primary h-2 rounded-full" style={{ width: `${percentage}%` }}></div></div>
                  </div>
                );
              })}
              </div>
            </div>

          {/* Rapport hebdomadaire officiel du service (modèle CHU) : les 2 tableaux + représentation statistique + export Excel/PDF. */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/20 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
              <div>
                <h3 className="font-bold text-lg">Rapport hebdomadaire du service (modèle CHU)</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  VOLET ACTIVITÉ et PRISE EN CHARGE — colonnes auto remplies, le reste à compléter par le major.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <label className="text-slate-500 font-medium">Du</label>
                  <input
                    type="date"
                    value={majorStart}
                    onChange={(e) => setMajorStart(e.target.value)}
                    className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm"
                  />
                  <label className="text-slate-500 font-medium">Au</label>
                  <input
                    type="date"
                    value={majorEnd}
                    onChange={(e) => setMajorEnd(e.target.value)}
                    className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExportMajorExcel}
                  className="flex items-center gap-2 px-3 py-2 bg-[#107c41] text-white rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-all"
                >
                  <span className="material-symbols-outlined text-base">table_chart</span>
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportMajorPDF}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#00478d] to-[#005eb8] text-white rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-all"
                >
                  <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                  PDF
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Période sélectionnée : <strong className="text-on-surface">{majorPeriodeLabel}</strong>
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Tableau 1 — VOLET ACTIVITÉ */}
              <div className="overflow-x-auto">
                <h4 className="font-bold mb-2">VOLET ACTIVITÉ</h4>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {ACTIVITE_HEADERS.map((h) => (
                        <th key={h} className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableau1.map((row, i) => (
                      <tr key={row.label}>
                        <td className="border border-slate-200 px-2 py-1.5 font-medium">{row.label}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.externe}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.hosp}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.pec > 0 ? row.pec : ''}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.demuni}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.positifs}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.enCours > 0 ? row.enCours : ''}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{row.recette}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="border border-slate-200 px-2 py-1.5">TOTAL</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center"></td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center"></td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{t1Total.pec > 0 ? t1Total.pec : ''}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center"></td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center"></td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{t1Total.enCours > 0 ? t1Total.enCours : ''}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tableau 2 — PRISE EN CHARGE */}
              <div className="overflow-x-auto">
                <h4 className="font-bold mb-2">PRISE EN CHARGE (PIVOT, ASSOCIATION MANAMPY…….)</h4>
                {tableau2.length > 0 ? (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        {PRISE_EN_CHARGE_HEADERS.map((h) => (
                          <th key={h} className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-bold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableau2.map((row, i) => (
                        <tr key={i}>
                          <td className="border border-slate-200 px-2 py-1.5">{row.service}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{row.numero}</td>
                          <td className="border border-slate-200 px-2 py-1.5 font-medium">{row.nom}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center">{row.age}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center">{row.sexe}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center">{row.dateReception}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{row.examen}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{row.resultatsPathologiques}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{row.resultatsEnCours}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{row.observation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Aucun examen sur la période sélectionnée</p>
                )}
              </div>
            </div>

            <h4 className="font-bold mb-3">Représentation statistique des tableaux</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Répartition par sexe (données du tableau 2) */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h5 className="text-sm font-bold mb-3">Répartition par sexe (tableau 2)</h5>
                {sexeData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={sexeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                          {sexeData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1.5">
                      {sexeData.map((entry) => {
                        const pct = tableau2.length > 0 ? Math.round((entry.value / tableau2.length) * 100) : 0;
                        return (
                          <div key={entry.name} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                              {entry.name}
                            </span>
                            <span className="font-bold">{entry.value} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Aucune donnée sur la période</p>
                )}
              </div>

              {/* Tranches d'âge (données du tableau 2) */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h5 className="text-sm font-bold mb-3">Répartition par tranche d&apos;âge (tableau 2)</h5>
                {ageData.some((d) => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={ageData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Patients" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Aucune donnée sur la période</p>
                )}
              </div>
            </div>

            {/* PEC vs Résultats en cours par type (données du tableau 1) — pleine largeur */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mt-6">
              <h5 className="text-sm font-bold mb-3">Prise en charge vs résultats en cours (par type)</h5>
              {pecVsEnCours.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={pecVsEnCours}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Prise en charge (PEC)" fill="#00478d" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Résultats en cours" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400 text-center py-10">Aucune donnée sur la période</p>
              )}
            </div>
          </div>

          {canManageAutoReport && (
            <div className="flex justify-end mb-4">
              <div className="bg-white border border-outline-variant/20 rounded-xl shadow-sm p-4 flex items-center gap-4 max-w-md">
                <div>
                  <p className="text-sm font-bold text-on-surface">Rapport automatique chaque vendredi à 18h</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Notifie le major du service pour consulter et exporter le rapport hebdomadaire.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoReportEnabled}
                  onClick={toggleAutoReport}
                  disabled={autoReportLoading}
                  className={`relative w-12 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
                    autoReportEnabled ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      autoReportEnabled ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {showCustomReportModal && (
        <FloatingModal
          open
          onClose={() => setShowCustomReportModal(false)}
          icon="summarize"
          title="Créer un rapport"
          maxWidthPx={448}
          heightPct={0.55}
          bodyClassName="p-4 space-y-3"
          footer={
            <div className="flex justify-end gap-2 p-4 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowCustomReportModal(false)}
                className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleGenerateCustomReport}
                disabled={generatingCustom || !customStart || !customEnd}
                className={`px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${
                  !generatingCustom && customStart && customEnd
                    ? 'bg-primary text-white hover:opacity-90'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  {generatingCustom ? 'progress_activity' : 'picture_as_pdf'}
                </span>
                {generatingCustom ? 'Génération...' : 'Générer le PDF'}
              </button>
            </div>
          }
        >
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Du</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full mt-1 p-2 border border-outline-variant rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Au</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full mt-1 p-2 border border-outline-variant rounded-lg text-sm"
            />
          </div>
        </FloatingModal>
      )}

      <button onClick={exportToPDF} className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#00478d] to-[#005eb8] text-white rounded-full font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200">
        <span className="material-symbols-outlined text-base">download</span>
        Exporter le rapport (PDF)
      </button>
    </div>
  );
}
