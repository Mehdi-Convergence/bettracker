import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Database,
  Cpu,
  Clock,
  RefreshCw,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Zap,
  BarChart2,
  TrendingUp,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Eye,
  EyeOff,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  getAdminSystem,
  getAdminScans,
  getAdminQuota,
  getAdminAnalytics,
  getAdminAlerts,
  getAdminErrors,
  getAdminUsers,
  getAdminAI,
  forceScan,
} from "@/services/api";
import type {
  AdminSystemStatus,
  AdminScanStatus,
  AdminQuota,
  AdminSportAnalytics,
  AdminAlert,
  AdminError,
  AdminUserDetail,
  AdminAIStats,
} from "@/types";

/* ── helpers ── */
function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtAge(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function scanStatusColor(status: AdminScanStatus["status"]): { bg: string; text: string; dot: string } {
  if (status === "ok") return { bg: "var(--green-bg)", text: "var(--green)", dot: "var(--green)" };
  if (status === "warning") return { bg: "var(--amber-bg)", text: "var(--amber)", dot: "var(--amber)" };
  return { bg: "var(--red-bg)", text: "var(--red)", dot: "var(--red)" };
}

function alertSeverityConfig(severity: AdminAlert["severity"]): { bg: string; text: string; label: string } {
  if (severity === "CRITICAL") return { bg: "var(--red-bg)", text: "var(--red)", label: "CRITIQUE" };
  if (severity === "WARNING") return { bg: "var(--amber-bg)", text: "var(--amber)", label: "ALERTE" };
  return { bg: "var(--accent-bg)", text: "var(--accent)", label: "INFO" };
}

/* ── Section Card wrapper ── */
function SectionCard({ title, icon, children, action }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden" style={{ background: "var(--bg-card)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e3e6eb]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ── Status dot ── */
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: ok ? "var(--green)" : "var(--red)" }}
    />
  );
}

/* ══════════════════════════════════════════════
   ADMIN PAGE
   ══════════════════════════════════════════════ */
export default function Admin() {
  const { user } = useAuth();

  // Guard: only admins
  if (user && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [system, setSystem] = useState<AdminSystemStatus | null>(null);
  const [scans, setScans] = useState<AdminScanStatus[]>([]);
  const [quota, setQuota] = useState<AdminQuota | null>(null);
  const [analytics, setAnalytics] = useState<AdminSportAnalytics[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [errors, setErrors] = useState<AdminError[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [forcingScans, setForcingScans] = useState<Record<string, boolean>>({});
  const [forceMessages, setForceMessages] = useState<Record<string, string>>({});
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [aiStats, setAiStats] = useState<AdminAIStats | null>(null);
  const [alertFilter, setAlertFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("admin_read_alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  function markAllAlertsRead() {
    setReadAlertIds(() => {
      const next = new Set(alerts.map((a) => a.id));
      localStorage.setItem("admin_read_alerts", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleAlertRead(id: string) {
    setReadAlertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem("admin_read_alerts", JSON.stringify([...next]));
      return next;
    });
  }

  const load = useCallback(async () => {
    const [sys, sc, q, an, al, er, us, ai] = await Promise.allSettled([
      getAdminSystem(),
      getAdminScans(),
      getAdminQuota(),
      getAdminAnalytics(),
      getAdminAlerts(),
      getAdminErrors(),
      getAdminUsers(),
      getAdminAI(),
    ]);
    if (sys.status === "fulfilled") setSystem(sys.value);
    if (sc.status === "fulfilled") setScans(sc.value);
    if (q.status === "fulfilled") setQuota(q.value);
    if (an.status === "fulfilled") setAnalytics(an.value);
    if (al.status === "fulfilled") setAlerts(al.value);
    if (er.status === "fulfilled") setErrors(er.value);
    if (us.status === "fulfilled") setUsers(us.value);
    if (ai.status === "fulfilled") setAiStats(ai.value);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleForceScan(sport: string) {
    setForcingScans((prev) => ({ ...prev, [sport]: true }));
    setForceMessages((prev) => ({ ...prev, [sport]: "" }));
    try {
      const res = await forceScan(sport);
      setForceMessages((prev) => ({ ...prev, [sport]: res.message || "Scan lancé" }));
      setTimeout(() => load(), 3000);
    } catch (err) {
      setForceMessages((prev) => ({
        ...prev,
        [sport]: err instanceof Error ? err.message : "Erreur",
      }));
    } finally {
      setForcingScans((prev) => ({ ...prev, [sport]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3b5bdb]" />
      </div>
    );
  }

  const quotaPct = quota ? Math.round((quota.used_today / quota.limit_daily) * 100) : 0;
  const quotaMonthPct = quota ? Math.round((quota.used_month / quota.limit_month) * 100) : 0;
  const quotaColor = quotaPct >= 90 ? "var(--red)" : quotaPct >= 70 ? "var(--amber)" : "var(--green)";

  const visibleErrors = errorsExpanded ? errors : errors.slice(0, 5);

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">Admin Dashboard</h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">
            Derniere actualisation : {lastRefresh.toLocaleTimeString("fr-FR")} — rafraichissement auto toutes les 60s
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e3e6eb] text-[13px] font-medium text-[#3c4149] transition-all cursor-pointer"
          style={{ background: "var(--bg-surface)" }}
        >
          <RefreshCw size={13} />
          Actualiser
        </button>
      </div>

      {/* ── Section 1: System Status ── */}
      <SectionCard title="Etat du systeme" icon={<Activity size={14} className="text-[#3b5bdb]" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Redis */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[#e3e6eb]" style={{ background: "var(--bg-surface)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3c4149]">
                <Zap size={13} className="text-[#f79009]" />
                Redis
              </div>
              <StatusDot ok={system?.redis.ok ?? false} />
            </div>
            <div className="font-mono text-[11px] text-[#8a919e]">
              {system?.redis.ok ? (
                <>latence : <span className="text-[#111318] font-bold">{system.redis.latency_ms ?? "—"} ms</span></>
              ) : (
                <span className="text-[#f04438]">Hors ligne</span>
              )}
            </div>
          </div>

          {/* DB */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[#e3e6eb]" style={{ background: "var(--bg-surface)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3c4149]">
                <Database size={13} className="text-[#3b5bdb]" />
                Base de donnees
              </div>
              <StatusDot ok={system?.db.ok ?? false} />
            </div>
            <div className="font-mono text-[11px] text-[#8a919e]">
              {system?.db.ok ? (
                <>taille : <span className="text-[#111318] font-bold">{system.db.size_mb != null ? `${system.db.size_mb.toFixed(1)} Mo` : "—"}</span></>
              ) : (
                <span className="text-[#f04438]">Indisponible</span>
              )}
            </div>
          </div>

          {/* Worker */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[#e3e6eb]" style={{ background: "var(--bg-surface)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3c4149]">
                <Cpu size={13} className="text-[#7c3aed]" />
                Worker
              </div>
              <StatusDot ok={system?.worker.ok ?? false} />
            </div>
            <div className="font-mono text-[11px] text-[#8a919e]">
              {system?.worker.last_heartbeat ? (
                <>derniere activite : <span className="text-[#111318] font-bold">{fmtTs(system.worker.last_heartbeat)}</span></>
              ) : (
                <span className="text-[#f04438]">Aucune activite</span>
              )}
            </div>
          </div>

          {/* Last deploy */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[#e3e6eb]" style={{ background: "var(--bg-surface)" }}>
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3c4149]">
              <Clock size={13} className="text-[#12b76a]" />
              Dernier deploy
            </div>
            <div className="font-mono text-[11px] text-[#8a919e]">
              <span className="text-[#111318] font-bold">{fmtTs(system?.last_deploy ?? null)}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 2: Scans par sport ── */}
      <SectionCard title="Scans par sport" icon={<RefreshCw size={14} className="text-[#3b5bdb]" />}>
        {scans.length === 0 ? (
          <p className="text-[12px] text-[#b0b7c3] text-center py-4">Aucune donnee de scan disponible</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e3e6eb]">
                  {["Sport", "Dernier scan", "Age cache", "Matchs", "Erreurs 24h", "Statut", "Action"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[11px] font-semibold text-[#8a919e] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => {
                  const sc = scanStatusColor(scan.status);
                  const forcing = forcingScans[scan.sport];
                  const msg = forceMessages[scan.sport];
                  return (
                    <tr key={scan.sport} className="border-b border-[#f0f1f3] last:border-0 hover:bg-[#fafbfc] transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-[#111318] capitalize">{scan.sport}</td>
                      <td className="py-2.5 px-3 font-mono text-[#3c4149]">{fmtTs(scan.last_scan)}</td>
                      <td className="py-2.5 px-3 font-mono text-[#3c4149]">{fmtAge(scan.cache_age_minutes)}</td>
                      <td className="py-2.5 px-3 font-mono text-[#3c4149]">{scan.match_count ?? "—"}</td>
                      <td className="py-2.5 px-3 font-mono">
                        <span style={{ color: scan.errors_24h > 0 ? "var(--red)" : "var(--green)" }}>
                          {scan.errors_24h}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.dot }} />
                          {scan.status === "ok" ? "OK" : scan.status === "warning" ? "Alerte" : "Erreur"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleForceScan(scan.sport)}
                            disabled={forcing}
                            className="px-2.5 py-1 rounded-lg bg-[#3b5bdb] text-white text-[11px] font-semibold cursor-pointer border-none hover:bg-[#2f4ac7] transition-all disabled:opacity-50 whitespace-nowrap"
                          >
                            {forcing ? "..." : "Forcer scan"}
                          </button>
                          {msg && (
                            <span className="text-[10px] text-[#8a919e] max-w-[120px] truncate" title={msg}>{msg}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 3: Quota API ── */}
      <SectionCard title="Quota API Odds" icon={<BarChart2 size={14} className="text-[#3b5bdb]" />}>
        {quota ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[#3c4149]">Aujourd'hui</span>
                  <span className="font-mono text-[12px] font-bold" style={{ color: quotaColor }}>
                    {quota.used_today} / {quota.limit_daily}
                  </span>
                </div>
                <div className="h-2.5 bg-[#f4f5f7] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(quotaPct, 100)}%`, background: quotaColor }}
                  />
                </div>
                <div className="text-[10.5px] text-[#8a919e] mt-1">{quotaPct}% utilise</div>
              </div>

              {/* Monthly */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[#3c4149]">Ce mois</span>
                  <span className="font-mono text-[12px] font-bold" style={{ color: quotaMonthPct >= 90 ? "var(--red)" : "var(--accent)" }}>
                    {quota.used_month} / {quota.limit_month}
                  </span>
                </div>
                <div className="h-2.5 bg-[#f4f5f7] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(quotaMonthPct, 100)}%`, background: quotaMonthPct >= 90 ? "var(--red)" : "var(--accent)" }}
                  />
                </div>
                <div className="text-[10.5px] text-[#8a919e] mt-1">{quotaMonthPct}% utilise</div>
              </div>
            </div>

            {/* Per-sport breakdown */}
            {quota.by_sport.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#8a919e] uppercase tracking-wide mb-2">Repartition par sport</p>
                <div className="flex flex-col gap-2">
                  {quota.by_sport.map((s) => {
                    const pct = quota.used_today > 0 ? Math.round((s.calls / quota.used_today) * 100) : 0;
                    const SPORT_COLORS: Record<string, string> = {
                      football: "#12b76a",
                      tennis: "#3b5bdb",
                      basketball: "#f04438",
                      baseball: "#f79009",
                      rugby: "#7c3aed",
                      pmu: "#8a919e",
                    };
                    const color = SPORT_COLORS[s.sport] || "#8a919e";
                    return (
                      <div key={s.sport} className="flex items-center gap-3">
                        <span className="text-[11.5px] capitalize text-[#3c4149] font-medium w-20 shrink-0">{s.sport}</span>
                        <div className="flex-1 h-2 bg-[#f4f5f7] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(pct, 2)}%`, background: color }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-[#8a919e] w-16 text-right">{s.calls} appels</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-[#b0b7c3] text-center py-4">Donnees de quota indisponibles</p>
        )}
      </SectionCard>

      {/* ── Section 4: Betting Analytics ── */}
      <SectionCard title="Analytique paris par sport" icon={<TrendingUp size={14} className="text-[#3b5bdb]" />}>
        {analytics.length === 0 ? (
          <p className="text-[12px] text-[#b0b7c3] text-center py-4">Aucune donnee disponible</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e3e6eb]">
                  {["Sport", "Paris 7j", "Paris 30j", "ROI", "CLV moyen", "Utilisateurs actifs"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[11px] font-semibold text-[#8a919e] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.map((row) => (
                  <tr key={row.sport} className="border-b border-[#f0f1f3] last:border-0 hover:bg-[#fafbfc] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#111318] capitalize">{row.sport}</td>
                    <td className="py-2.5 px-3 font-mono text-[#3c4149]">{row.bets_7d}</td>
                    <td className="py-2.5 px-3 font-mono text-[#3c4149]">{row.bets_30d}</td>
                    <td className="py-2.5 px-3 font-mono font-bold" style={{ color: row.roi_pct == null ? "var(--text-muted)" : row.roi_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {row.roi_pct != null ? `${row.roi_pct >= 0 ? "+" : ""}${row.roi_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#3c4149]">
                      {row.avg_clv != null ? `${row.avg_clv >= 0 ? "+" : ""}${(row.avg_clv * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <Users size={11} className="text-[#8a919e]" />
                        <span className="font-mono text-[#3c4149]">{row.active_users}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 5: Users ── */}
      <SectionCard
        title="Utilisateurs"
        icon={<Users size={14} className="text-[#3b5bdb]" />}
        action={
          users.length > 0 ? (
            <span className="font-mono text-[11px] text-[#8a919e]">{users.length} compte{users.length > 1 ? "s" : ""}</span>
          ) : undefined
        }
      >
        {users.length === 0 ? (
          <p className="text-[12px] text-[#b0b7c3] text-center py-4">Aucun utilisateur</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e3e6eb]">
                  {["Email", "Tier", "Paris", "Settled", "ROI", "P&L", "Sports", "Derniere activite", "Inscription"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[11px] font-semibold text-[#8a919e] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[#f0f1f3] last:border-0 hover:bg-[#fafbfc] transition-colors">
                    <td className="py-2.5 px-3 text-[#111318] font-medium">
                      <div className="flex items-center gap-1.5">
                        {u.email}
                        {u.is_admin && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#3b5bdb]/10 text-[#3b5bdb]">Admin</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                        u.tier === "premium" ? "bg-[#7c3aed]/10 text-[#7c3aed]" :
                        u.tier === "pro" ? "bg-[#3b5bdb]/10 text-[#3b5bdb]" :
                        "bg-[#f4f5f7] text-[#8a919e]"
                      }`}>
                        {u.tier}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#3c4149]">{u.total_bets}</td>
                    <td className="py-2.5 px-3 font-mono text-[#3c4149]">{u.settled_bets}</td>
                    <td className="py-2.5 px-3 font-mono font-bold" style={{
                      color: u.roi_pct == null ? "var(--text-muted)" : u.roi_pct >= 0 ? "var(--green)" : "var(--red)"
                    }}>
                      {u.roi_pct != null ? `${u.roi_pct >= 0 ? "+" : ""}${u.roi_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold" style={{
                      color: u.pnl >= 0 ? "var(--green)" : "var(--red)"
                    }}>
                      {u.pnl !== 0 ? `${u.pnl >= 0 ? "+" : ""}${u.pnl.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-[#3c4149]">
                      {u.favorite_sports.length > 0 ? u.favorite_sports.map((s) => (
                        <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-[#f4f5f7] text-[#3c4149] mr-1 capitalize">{s}</span>
                      )) : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#8a919e]">{fmtTs(u.last_bet_at)}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#8a919e]">{fmtTs(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 6: AI Analyste ── */}
      <SectionCard title="IA Analyste" icon={<MessageCircle size={14} className="text-[#7c3aed]" />}>
        {aiStats ? (
          <div className="flex flex-col gap-5">
            {/* KPIs grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Conversations", value: String(aiStats.total_conversations), sub: `${aiStats.conversations_7d} cette semaine`, color: "#7c3aed" },
                { label: "Messages 24h", value: String(aiStats.messages_24h), sub: `${aiStats.messages_7d} cette semaine`, color: "#3b5bdb" },
                { label: "Utilisateurs actifs", value: String(aiStats.active_ai_users), sub: "7 derniers jours", color: "#12b76a" },
                { label: "Moy. msg/conv", value: String(aiStats.avg_msgs_per_conv), sub: `${aiStats.user_messages} user / ${aiStats.assistant_messages} IA`, color: "#f79009" },
              ].map((kpi) => (
                <div key={kpi.label} className="flex flex-col gap-1 p-3 rounded-xl border border-[#e3e6eb] bg-[#fafbfc]">
                  <span className="text-[10.5px] font-semibold text-[#8a919e] uppercase tracking-wide">{kpi.label}</span>
                  <span className="text-[22px] font-extrabold font-mono" style={{ color: kpi.color }}>{kpi.value}</span>
                  <span className="text-[10.5px] text-[#b0b7c3]">{kpi.sub}</span>
                </div>
              ))}
            </div>

            {/* Per-user usage today */}
            {aiStats.per_user_usage.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#8a919e] uppercase tracking-wide mb-2">Usage quotidien par utilisateur</p>
                <div className="flex flex-col gap-1.5">
                  {aiStats.per_user_usage.map((u) => (
                    <div key={u.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#fafbfc] border border-[#e3e6eb]">
                      <span className="text-[12px] text-[#111318] font-medium flex-1 min-w-0 truncate">{u.email}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.tier === "premium" ? "bg-[#7c3aed]/10 text-[#7c3aed]" :
                        u.tier === "pro" ? "bg-[#3b5bdb]/10 text-[#3b5bdb]" :
                        "bg-[#f4f5f7] text-[#8a919e]"
                      }`}>
                        {u.tier}
                      </span>
                      <span className="font-mono text-[12px] font-bold text-[#7c3aed]">{u.used_today} msg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-[#b0b7c3] text-center py-4">Donnees IA indisponibles</p>
        )}
      </SectionCard>

      {/* ── Section 7: Alerts ── */}
      {(() => {
        const filteredAlerts = alerts
          .filter((a) => alertFilter === "ALL" || a.severity === alertFilter)
          .filter((a) => !showUnreadOnly || !readAlertIds.has(a.id));
        const unreadCount = alerts.filter((a) => !readAlertIds.has(a.id)).length;
        const unreadCritical = alerts.filter((a) => !readAlertIds.has(a.id) && (a.severity === "CRITICAL" || a.severity === "WARNING")).length;

        return (
          <SectionCard
            title="Alertes actives"
            icon={<AlertTriangle size={14} className="text-[#f79009]" />}
            action={
              <div className="flex items-center gap-2">
                {unreadCritical > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#f04438] text-white">
                    {unreadCritical}
                  </span>
                )}
                {unreadCount > 0 && unreadCount !== unreadCritical && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#f79009] text-white">
                    {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            }
          >
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2.5 py-3 text-[12.5px] text-[#12b76a]">
                <CheckCircle size={15} />
                Aucune alerte active — tout fonctionne normalement
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Filters bar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    {([
                      { key: "ALL" as const, label: "Tous", count: alerts.length },
                      { key: "CRITICAL" as const, label: "Critique", count: alerts.filter((a) => a.severity === "CRITICAL").length },
                      { key: "WARNING" as const, label: "Alerte", count: alerts.filter((a) => a.severity === "WARNING").length },
                      { key: "INFO" as const, label: "Info", count: alerts.filter((a) => a.severity === "INFO").length },
                    ]).map((f) => {
                      const isActive = alertFilter === f.key;
                      const colorMap = { ALL: "#3b5bdb", CRITICAL: "#f04438", WARNING: "#f79009", INFO: "#3b5bdb" };
                      const color = colorMap[f.key];
                      return (
                        <button
                          key={f.key}
                          onClick={() => setAlertFilter(f.key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border transition-all cursor-pointer"
                          style={{
                            background: isActive ? `${color}12` : "transparent",
                            borderColor: isActive ? `${color}33` : "#e3e6eb",
                            color: isActive ? color : "#8a919e",
                          }}
                        >
                          {f.label}
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold"
                            style={{
                              background: isActive ? `${color}20` : "#f4f5f7",
                              color: isActive ? color : "#8a919e",
                            }}
                          >
                            {f.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle unread only */}
                    <button
                      onClick={() => setShowUnreadOnly((v) => !v)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer"
                      style={{
                        background: showUnreadOnly ? "#3b5bdb12" : "transparent",
                        borderColor: showUnreadOnly ? "#3b5bdb33" : "#e3e6eb",
                        color: showUnreadOnly ? "#3b5bdb" : "#8a919e",
                      }}
                    >
                      {showUnreadOnly ? <EyeOff size={12} /> : <Eye size={12} />}
                      {showUnreadOnly ? "Non lues" : "Toutes"}
                    </button>

                    {/* Mark all as read */}
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAlertsRead}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#e3e6eb] text-[#8a919e] hover:text-[#3b5bdb] hover:border-[#3b5bdb33] transition-all cursor-pointer bg-transparent"
                      >
                        <CheckCheck size={12} />
                        Tout marquer lu
                      </button>
                    )}
                  </div>
                </div>

                {/* Alert list */}
                {filteredAlerts.length === 0 ? (
                  <div className="flex items-center gap-2.5 py-4 text-[12.5px] text-[#8a919e] justify-center">
                    <CheckCircle size={15} />
                    Aucune alerte pour ce filtre
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredAlerts.map((alert) => {
                      const cfg = alertSeverityConfig(alert.severity);
                      const Icon = alert.severity === "CRITICAL" ? XCircle : AlertCircle;
                      const isRead = readAlertIds.has(alert.id);
                      return (
                        <div
                          key={alert.id}
                          className="flex items-start gap-3 p-3 rounded-xl border transition-all"
                          style={{
                            background: isRead ? "var(--bg-surface)" : cfg.bg,
                            borderColor: isRead ? "#e3e6eb" : `${cfg.text}22`,
                            opacity: isRead ? 0.6 : 1,
                          }}
                        >
                          {/* Unread dot */}
                          <div className="flex flex-col items-center gap-1.5 shrink-0 mt-0.5">
                            <Icon size={14} style={{ color: isRead ? "#b0b7c3" : cfg.text }} />
                            {!isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#3b5bdb] shrink-0" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  background: isRead ? "#f4f5f7" : cfg.bg,
                                  color: isRead ? "#8a919e" : cfg.text,
                                  border: `1px solid ${isRead ? "#e3e6eb" : cfg.text + "33"}`,
                                }}
                              >
                                {cfg.label}
                              </span>
                              {alert.sport && (
                                <span className="text-[10px] text-[#8a919e] capitalize">{alert.sport}</span>
                              )}
                              <span className="text-[10px] text-[#b0b7c3] ml-auto shrink-0">{fmtTs(alert.timestamp)}</span>
                            </div>
                            <p className="text-[12px] leading-snug" style={{ color: isRead ? "#8a919e" : "#3c4149" }}>
                              {alert.message}
                            </p>
                          </div>
                          {/* Toggle read/unread button */}
                          <button
                            onClick={() => toggleAlertRead(alert.id)}
                            className="shrink-0 mt-0.5 p-1.5 rounded-lg border border-transparent hover:border-[#e3e6eb] hover:bg-[#f4f5f7] transition-all cursor-pointer bg-transparent"
                            title={isRead ? "Marquer non lu" : "Marquer lu"}
                          >
                            {isRead ? (
                              <EyeOff size={12} className="text-[#b0b7c3]" />
                            ) : (
                              <Eye size={12} className="text-[#8a919e]" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        );
      })()}

      {/* ── Section 6: Recent Errors ── */}
      <SectionCard
        title="Erreurs recentes"
        icon={<XCircle size={14} className="text-[#f04438]" />}
        action={
          errors.length > 0 ? (
            <span className="font-mono text-[11px] text-[#8a919e]">{errors.length} entree{errors.length > 1 ? "s" : ""}</span>
          ) : undefined
        }
      >
        {errors.length === 0 ? (
          <div className="flex items-center gap-2.5 py-3 text-[12.5px] text-[#12b76a]">
            <CheckCircle size={15} />
            Aucune erreur recente
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            <div className="max-h-[340px] overflow-y-auto rounded-lg border border-[#e3e6eb] bg-[#fafbfc]">
              {visibleErrors.map((err, i) => (
                <div
                  key={i}
                  className="flex gap-3 px-4 py-2.5 border-b border-[#f0f1f3] last:border-0 hover:bg-[#f4f5f7] transition-colors"
                >
                  <div className="shrink-0 mt-0.5">
                    <XCircle size={12} className="text-[#f04438] opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[10.5px] text-[#8a919e]">{fmtTs(err.timestamp)}</span>
                      {err.sport && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[rgba(59,91,219,0.08)] text-[#3b5bdb] capitalize">{err.sport}</span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#3c4149] leading-snug font-mono break-all">{err.message}</p>
                    {err.traceback && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-[#8a919e] cursor-pointer hover:text-[#3c4149]">Traceback</summary>
                        <pre className="text-[9.5px] text-[#8a919e] mt-1 overflow-x-auto whitespace-pre-wrap leading-relaxed">{err.traceback}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {errors.length > 5 && (
              <button
                onClick={() => setErrorsExpanded((v) => !v)}
                className="flex items-center gap-1.5 mt-2 text-[12px] text-[#3b5bdb] font-medium bg-transparent border-none cursor-pointer hover:underline self-start"
              >
                {errorsExpanded ? (
                  <><ChevronUp size={13} /> Voir moins</>
                ) : (
                  <><ChevronDown size={13} /> Voir {errors.length - 5} de plus</>
                )}
              </button>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
