import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { getPortfolioStats, getPortfolioHistory } from "@/services/api";
import type { PortfolioStats, PortfolioHistoryPoint } from "@/types";

/* ── helpers ── */
const PERIODS = [
  { key: "30d", label: "30j", days: 30 },
  { key: "90d", label: "90j", days: 90 },
  { key: "6m", label: "6m", days: 180 },
  { key: "12m", label: "12m", days: 365 },
  { key: "all", label: "Tout", days: 0 },
] as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d: string): string {
  const dt = new Date(d);
  return `${dt.getDate()} ${dt.toLocaleString("fr-FR", { month: "short" })}`;
}

/* ── sub-components ── */

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">{title}</h2>
      {children}
    </div>
  );
}

function RoiCell({ value }: { value: number }) {
  const color = value >= 0 ? "text-emerald-600" : "text-red-500";
  return <span className={`font-semibold tabular-nums ${color}`}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function PnlCell({ value }: { value: number }) {
  const color = value >= 0 ? "text-emerald-600" : "text-red-500";
  return <span className={`font-semibold tabular-nums ${color}`}>{value >= 0 ? "+" : ""}{value.toFixed(2)}€</span>;
}

interface BreakdownTableProps {
  rows: { label: string; total_bets: number; won: number; lost: number; roi_pct: number; total_pnl: number }[];
  labelHeader: string;
}

function BreakdownTable({ rows, labelHeader }: BreakdownTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)] text-center py-6">Aucune donnée</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-color)]">
            <th className="pb-2 font-medium">{labelHeader}</th>
            <th className="pb-2 font-medium text-right">Paris</th>
            <th className="pb-2 font-medium text-right">Gagnés</th>
            <th className="pb-2 font-medium text-right">Perdus</th>
            <th className="pb-2 font-medium text-right">ROI%</th>
            <th className="pb-2 font-medium text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-surface)] transition-colors">
              <td className="py-2 font-medium text-[var(--text-secondary)] max-w-[160px] truncate">{row.label}</td>
              <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">{row.total_bets}</td>
              <td className="py-2 text-right text-emerald-600 tabular-nums">{row.won}</td>
              <td className="py-2 text-right text-red-500 tabular-nums">{row.lost}</td>
              <td className="py-2 text-right"><RoiCell value={row.roi_pct} /></td>
              <td className="py-2 text-right"><PnlCell value={row.total_pnl} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ANALYTICS PAGE
   ══════════════════════════════════════════════ */
export default function Analytics() {
  const [period, setPeriod] = useState<string>("30d");
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const { fromDate, toDate } = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period);
    if (p && p.days > 0) return { fromDate: daysAgo(p.days), toDate: todayStr() };
    return { fromDate: undefined, toDate: undefined };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getPortfolioStats(fromDate, toDate).catch(() => null),
      getPortfolioHistory(fromDate, toDate).catch(() => []),
    ]).then(([s, h]) => {
      if (cancelled) return;
      setStats(s as PortfolioStats | null);
      setHistory((h as PortfolioHistoryPoint[]) || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fromDate, toDate]);

  /* ── derived data ── */
  const bookmakerRows = useMemo(
    () =>
      (stats?.bookmaker_breakdown ?? []).map((r) => ({
        label: r.bookmaker,
        total_bets: r.total_bets,
        won: r.won,
        lost: r.lost,
        roi_pct: r.roi_pct,
        total_pnl: r.total_pnl,
      })),
    [stats]
  );

  const leagueRows = useMemo(
    () =>
      (stats?.league_breakdown ?? []).map((r) => ({
        label: r.league,
        total_bets: r.total_bets,
        won: r.won,
        lost: r.lost,
        roi_pct: r.roi_pct,
        total_pnl: r.total_pnl,
      })),
    [stats]
  );

  const sportRows = useMemo(
    () =>
      (stats?.sport_breakdown ?? []).map((r) => ({
        label: r.sport,
        total_bets: r.won + r.lost,
        won: r.won,
        lost: r.lost,
        roi_pct: r.roi_pct,
        total_pnl: r.pnl,
      })),
    [stats]
  );

  const marketChartData = useMemo(
    () =>
      (stats?.market_breakdown ?? []).map((r) => ({
        market: r.market,
        roi_pct: r.roi_pct,
        total_bets: r.total_bets,
      })),
    [stats]
  );

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--text-primary)]">Analytique</h1>
          <p className="text-[12.5px] text-[var(--text-muted)] mt-0.5">Performance historique detaillee</p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-[9px] p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none whitespace-nowrap ${
                period === p.key
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
                  : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── Section 1 : Evolution P&L ── */}
          <SectionCard title="Evolution P&L">
            {history.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">Aucune donnee sur cette periode</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    tickFormatter={fmtDate}
                    minTickGap={40}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}€`} width={48} />
                  <Tooltip
                    formatter={(value: number | undefined) => {
                      if (value == null) return ["", "P&L cumulatif"];
                      return [`${value.toFixed(2)}€`, "P&L cumulatif"];
                    }}
                    labelFormatter={(d: unknown) => fmtDate(String(d))}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative_pnl"
                    stroke="#3b5bdb"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* ── Section 2 : ROI par sport ── */}
          <SectionCard title="ROI par sport">
            {sportRows.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">Aucune donnee</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(60, sportRows.length * 48)}>
                <BarChart
                  data={sportRows}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} width={80} />
                  <Tooltip
                    formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: typeof sportRows[0] }) => {
                      if (value == null) return ["", "ROI"];
                      return [`${value.toFixed(2)}% (${entry.payload?.total_bets ?? 0} paris)`, "ROI"];
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="roi_pct" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, formatter: (v: unknown) => typeof v === "number" ? `${v.toFixed(1)}%` : "" }}>
                    {sportRows.map((entry, index) => (
                      <Cell key={index} fill={entry.roi_pct >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* ── Section 3 : Performance par bookmaker ── */}
          <SectionCard title="Performance par bookmaker">
            <BreakdownTable rows={bookmakerRows} labelHeader="Bookmaker" />
          </SectionCard>

          {/* ── Section 4 : Performance par ligue (top 10) ── */}
          <SectionCard title="Performance par ligue (top 10)">
            <BreakdownTable rows={leagueRows} labelHeader="Ligue" />
          </SectionCard>

          {/* ── Section 5 : Performance par marche ── */}
          <SectionCard title="Performance par marche">
            {marketChartData.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">Aucune donnee</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={marketChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="market" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: typeof marketChartData[0] }) => {
                      if (value == null) return ["", "ROI"];
                      return [`${value.toFixed(2)}% (${entry.payload?.total_bets ?? 0} paris)`, "ROI"];
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="roi_pct" radius={[4, 4, 0, 0]}>
                    {marketChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.roi_pct >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
