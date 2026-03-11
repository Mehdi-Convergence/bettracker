import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Target,
  Pause, Play, MoreVertical, Copy, Archive, Trash2, Loader2,
  Check, RefreshCw, ChevronDown, ChevronUp, Plus, X,
  LayoutList, Columns3, AlertTriangle, Shield,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  getCampaignDetail, getCampaignRecommendations, getCampaignHistory,
  getCampaignBets, acceptCampaignRecommendation, updateCampaign,
  updateCampaignBet, deleteCampaignBet,
} from "@/services/api";
import { LEAGUE_INFO } from "@/types";
import { Badge } from "@/components/ui";
import KanbanBoard from "@/components/KanbanBoard";
import type { KanbanColumn, KanbanCardData } from "@/components/KanbanBoard";
import type {
  CampaignDetail as CampaignDetailType,
  CampaignRecommendation, CampaignRecommendationsResponse, BankrollPoint, Bet,
} from "@/types";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { GREEN, RED, AMBER, STATUS_CFG, outcomeLabel, outcomeBadgeVariant } from "@/utils/campaign";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { campaignDetailTour } from "@/tours/index";

// ── Design tokens ──
const ACCENT = "#3b5bdb";
const PURPLE = "#7c3aed";

// ══════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════
export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const campaignId = Number(id);
  const { setLabel } = useBreadcrumb();
  const { showTour, completeTour } = useTour("campaign-detail");

  // ── Data ──
  const [detail, setDetail] = useState<CampaignDetailType | null>(null);
  const [recos, setRecos] = useState<CampaignRecommendationsResponse | null>(null);
  const [_history, setHistory] = useState<BankrollPoint[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);

  // ── UI ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recsLoading, setRecsLoading] = useState(false);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [updatingBetId, setUpdatingBetId] = useState<number | null>(null);
  const [deletingBetId, setDeletingBetId] = useState<number | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7j" | "14j" | "tout">("tout");
  const [ticketView, setTicketView] = useState<"kanban" | "list">("kanban");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [ticketSourceFilter, setTicketSourceFilter] = useState<string>("all");
  const [showParams, setShowParams] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const campaign = detail?.campaign;
  const stats = detail?.stats;

  // ── Set breadcrumb ──
  useEffect(() => {
    if (campaign) setLabel(campaign.name);
    return () => setLabel(null);
  }, [campaign, setLabel]);

  // ── Load all data ──
  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    Promise.all([
      getCampaignDetail(campaignId),
      getCampaignRecommendations(campaignId),
      getCampaignHistory(campaignId),
      getCampaignBets(campaignId),
    ]).then(([d, r, h, b]) => {
      setDetail(d);
      setRecos(r);
      setHistory(h);
      setBets(b);
    }).catch(() => setError("Impossible de charger la campagne."))
      .finally(() => setLoading(false));
  }, [campaignId]);

  // ── Actions ──
  async function refreshRecos() {
    setRecsLoading(true);
    try { setRecos(await getCampaignRecommendations(campaignId)); } catch { /* silent */ }
    setRecsLoading(false);
  }

  async function handleAccept(reco: CampaignRecommendation, idx: number) {
    setAcceptingIdx(idx);
    try {
      const bet = await acceptCampaignRecommendation(campaignId, {
        home_team: reco.home_team, away_team: reco.away_team, league: reco.league,
        match_date: reco.date, outcome: reco.outcome, odds: reco.best_odds, stake: reco.suggested_stake,
      });
      setBets((prev) => [bet, ...prev]);
      if (recos) setRecos({ ...recos, recommendations: recos.recommendations.filter((_, i) => i !== idx) });
      const d = await getCampaignDetail(campaignId);
      setDetail(d);
    } catch { setError("Impossible d'enregistrer le pari."); }
    setAcceptingIdx(null);
  }

  function handleSkip(idx: number) {
    if (!recos) return;
    setRecos({ ...recos, recommendations: recos.recommendations.filter((_, i) => i !== idx) });
  }

  async function handleUpdateBet(betId: number, result: string) {
    setUpdatingBetId(betId);
    try {
      const updated = await updateCampaignBet(campaignId, betId, result);
      setBets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      const d = await getCampaignDetail(campaignId);
      setDetail(d);
      setHistory(await getCampaignHistory(campaignId));
    } catch { setError("Impossible de mettre à jour le pari."); }
    setUpdatingBetId(null);
  }

  async function handleDeleteBet(betId: number) {
    setDeletingBetId(betId);
    try {
      await deleteCampaignBet(campaignId, betId);
      setBets((prev) => prev.filter((b) => b.id !== betId));
      const d = await getCampaignDetail(campaignId);
      setDetail(d);
      setHistory(await getCampaignHistory(campaignId));
    } catch { setError("Impossible de supprimer le pari."); }
    setDeletingBetId(null);
  }

  async function handleTogglePause() {
    if (!campaign) return;
    const newStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await updateCampaign(campaignId, { status: newStatus });
      const d = await getCampaignDetail(campaignId);
      setDetail(d);
    } catch { setError("Impossible de modifier le statut."); }
    setShowMenu(false);
  }

  // ── Computed ──
  const settledBets = useMemo(() => bets.filter((b) => b.result === "won" || b.result === "lost"), [bets]);

  // Bankroll chart data with algo/manual split
  const chartData = useMemo(() => {
    if (!settledBets.length || !campaign) return [];

    const sorted = [...settledBets].sort((a, b) => a.match_date.localeCompare(b.match_date));
    const dailyMap: Record<string, { algo: number; manual: number }> = {};
    for (const b of sorted) {
      const d = b.match_date.slice(0, 10);
      if (!dailyMap[d]) dailyMap[d] = { algo: 0, manual: 0 };
      const pnl = b.profit_loss || 0;
      if (b.source === "manual") dailyMap[d].manual += pnl;
      else dailyMap[d].algo += pnl;
    }

    const dates = Object.keys(dailyMap).sort();
    let cumAlgo = campaign.initial_bankroll;
    let cumManual = campaign.initial_bankroll;
    const points = dates.map((d) => {
      cumAlgo += dailyMap[d].algo;
      cumManual += dailyMap[d].manual;
      return { date: d, algo: Math.round(cumAlgo * 100) / 100, manuel: Math.round(cumManual * 100) / 100 };
    });

    // Apply period filter
    if (chartPeriod !== "tout" && points.length > 0) {
      const days = chartPeriod === "7j" ? 7 : 14;
      return points.slice(-days);
    }
    return points;
  }, [settledBets, campaign, chartPeriod]);

  // Filtered bets for tickets section
  const filteredBets = useMemo(() => {
    let list = bets;
    if (ticketStatusFilter !== "all") {
      list = list.filter((b) => b.result === ticketStatusFilter);
    }
    if (ticketSourceFilter !== "all") {
      list = list.filter((b) => (b.source || "algo") === ticketSourceFilter);
    }
    return list;
  }, [bets, ticketStatusFilter, ticketSourceFilter]);

  // Ticket distribution
  const ticketDistribution = useMemo(() => {
    const won = bets.filter((b) => b.result === "won").length;
    const lost = bets.filter((b) => b.result === "lost").length;
    const pending = bets.filter((b) => b.result === "pending").length;
    const voided = bets.filter((b) => b.result === "void").length;
    const total = Math.max(bets.length, 1);
    return { won, lost, pending, voided, total };
  }, [bets]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} style={{ color: ACCENT }} />
      </div>
    );
  }

  if (!campaign || !stats) {
    return (
      <div className="text-center py-20">
        <p className="text-[#8a919e]">Campagne introuvable.</p>
        <button onClick={() => navigate("/campaign")}
          className="mt-3 text-sm text-[#3b5bdb] hover:underline cursor-pointer">
          Retour aux campagnes
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CFG[campaign.status] || STATUS_CFG.active;
  const isArchived = campaign.status === "archived";

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════ */}
      {/* STATUS BANNERS */}
      {/* ═══════════════════════════════════════════ */}
      {campaign.status === "paused" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 flex-1">Campagne en pause. Les tickets ne sont plus générés.</span>
          <button onClick={handleTogglePause}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer">
            <Play size={12} /> Reprendre
          </button>
        </div>
      )}
      {campaign.status === "stoploss" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <Shield size={16} className="text-red-600 shrink-0" />
          <span className="text-sm text-red-800 flex-1">Campagne arrêtée : stop-loss atteint.</span>
        </div>
      )}
      {isArchived && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 border border-slate-200">
          <Archive size={16} className="text-slate-500 shrink-0" />
          <span className="text-sm text-slate-600 flex-1">Campagne archivée : consultation seule.</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ZONE 1 — HEADER */}
      {/* ═══════════════════════════════════════════ */}
      <div className="flex items-center gap-3" data-tour="campaign-header">
        <button onClick={() => navigate("/campaign")}
          className="w-8 h-8 rounded-lg bg-white border border-[#e3e6eb] flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
          style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
          <ArrowLeft size={16} className="text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold text-[#111318] truncate">{campaign.name}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: statusCfg.dot,
                ...(campaign.status === "active" ? { animation: "pulse 2s infinite" } : {}),
              }} />
              {statusCfg.label}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3b5bdb]/10 text-[#3b5bdb]">
              ALGO
            </span>
          </div>
          <p className="text-xs text-[#8a919e] mt-0.5">
            Football · Edge {"\u2265"} {(campaign.min_edge * 100).toFixed(0)}% · Mise {(campaign.flat_stake * 100).toFixed(0)}%
            {campaign.target_bankroll && ` · Objectif ${campaign.target_bankroll}\u20AC`}
          </p>
        </div>
        {!isArchived && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleTogglePause}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#e3e6eb] text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              {campaign.status === "active" ? <Pause size={14} /> : <Play size={14} />}
              {campaign.status === "active" ? "Pause" : "Reprendre"}
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg bg-white border border-[#e3e6eb] text-[#8a919e] hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
                <MoreVertical size={16} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-10 w-44 bg-white rounded-lg border border-[#e3e6eb] py-1 z-50"
                  style={{ boxShadow: "0 4px 16px rgba(16,24,40,.1)" }}>
                  <MenuBtn icon={<Copy size={14} />} label="Dupliquer" onClick={() => setShowMenu(false)} />
                  <MenuBtn icon={<Archive size={14} />} label="Archiver" onClick={() => setShowMenu(false)} />
                  <div className="border-t border-[#e3e6eb] my-1" />
                  <MenuBtn icon={<Trash2 size={14} />} label="Supprimer" onClick={() => setShowMenu(false)} danger />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ZONE 2 — KPI STRIP (8 metrics) */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" data-tour="stats-cards">
        <KpiCard label="ROI"
          value={stats.total_staked > 0 ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "\u2014"}
          color={stats.roi_pct >= 0 ? GREEN : RED} />
        <KpiCard label="CLV moyen"
          value={stats.avg_clv != null ? `${stats.avg_clv >= 0 ? "+" : ""}${stats.avg_clv.toFixed(1)}%` : "\u2014"}
          color={stats.avg_clv != null && stats.avg_clv >= 0 ? GREEN : RED} />
        <KpiCard label="Taux r\u00e9ussite"
          value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "\u2014"}
          color={ACCENT} />
        <KpiCard label="Mise totale"
          value={`${stats.total_staked.toFixed(0)}\u20AC`}
          color="#111318" />
        <KpiCard label="Gain net"
          value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}\u20AC`}
          color={stats.total_pnl >= 0 ? GREEN : RED} />
        <KpiCard label="BK courante"
          value={`${stats.current_bankroll.toFixed(0)}\u20AC`}
          color={AMBER} />
        <KpiCard label="Drawdown max"
          value={stats.max_drawdown_pct > 0 ? `-${stats.max_drawdown_pct.toFixed(1)}%` : "0%"}
          color={stats.max_drawdown_pct > 5 ? RED : "#111318"} />
        <KpiCard label="EV attendu"
          value={`${stats.ev_expected >= 0 ? "+" : ""}${stats.ev_expected.toFixed(2)}\u20AC`}
          color={stats.ev_expected >= 0 ? GREEN : RED} />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ZONE 3 — BODY SPLIT */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">

        {/* ── LEFT: Performance ── */}
        <div className="space-y-5">
          {/* Bankroll chart */}
          <div className="bg-white rounded-xl border border-[#e3e6eb] p-4" data-tour="bankroll-chart" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#111318] font-semibold text-sm">Courbe bankroll</h3>
              <div className="flex items-center gap-1 bg-[#f4f5f7] rounded-lg p-0.5" data-tour="period-selector">
                {(["7j", "14j", "tout"] as const).map((p) => (
                  <button key={p} onClick={() => setChartPeriod(p)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      chartPeriod === p ? "bg-white text-[#3b5bdb] shadow-sm" : "text-[#8a919e] hover:text-[#111318]"
                    }`}>
                    {p === "tout" ? "Tout" : p}
                  </button>
                ))}
              </div>
            </div>
            {chartData.length > 1 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e6eb" />
                    <XAxis dataKey="date" stroke="#8a919e" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8a919e" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e3e6eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", fontSize: 12 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="algo" name="Algo" stroke={ACCENT} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="manuel" name="Manuel" stroke={PURPLE} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-[#8a919e]">
                Pas assez de données pour afficher la courbe.
              </div>
            )}
          </div>

          {/* Algo vs Manual */}
          {(stats.algo_stats || stats.manual_stats) && (
            <div className="bg-white rounded-xl border border-[#e3e6eb] p-4" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              <h3 className="text-[#111318] font-semibold text-sm mb-3">Algo vs Manuel</h3>
              <div className="grid grid-cols-2 gap-4">
                <SourceBlock label="Algo" color={ACCENT} stats={stats.algo_stats} />
                <SourceBlock label="Manuel" color={PURPLE} stats={stats.manual_stats} />
              </div>
            </div>
          )}

          {/* Ticket distribution */}
          <div className="bg-white rounded-xl border border-[#e3e6eb] p-4" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
            <h3 className="text-[#111318] font-semibold text-sm mb-3">Répartition tickets</h3>
            <div className="space-y-2">
              <DistBar label="Gagnés" count={ticketDistribution.won} total={ticketDistribution.total} color={GREEN} />
              <DistBar label="Perdus" count={ticketDistribution.lost} total={ticketDistribution.total} color={RED} />
              <DistBar label="En cours" count={ticketDistribution.pending} total={ticketDistribution.total} color={AMBER} />
              <DistBar label="Annulés" count={ticketDistribution.voided} total={ticketDistribution.total} color="#8a919e" />
            </div>
          </div>

          {/* Streaks */}
          <div className="bg-white rounded-xl border border-[#e3e6eb] p-4" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
            <h3 className="text-[#111318] font-semibold text-sm mb-3">Séries</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-lg font-bold font-[var(--font-mono)]" style={{ color: GREEN }}>{stats.longest_winning_streak}</div>
                <div className="text-[10px] text-[#8a919e]">Série gagnante max</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50 border border-red-100">
                <div className="text-lg font-bold font-[var(--font-mono)]" style={{ color: RED }}>{stats.longest_losing_streak}</div>
                <div className="text-[10px] text-[#8a919e]">Série perdante max</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Recommendations + Tickets ── */}
        <div className="space-y-5">
          {/* Recommendations (shown first) */}
          {recos && recos.recommendations.length > 0 && (
            <div className="bg-white rounded-xl border border-[#e3e6eb]" data-tour="recommendations" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              <div className="p-4 border-b border-[#e3e6eb] flex items-center justify-between">
                <div>
                  <h3 className="text-[#111318] font-semibold text-sm">Recommandations</h3>
                  <p className="text-xs text-[#8a919e]">{recos.recommendations.length} proposition{recos.recommendations.length > 1 ? "s" : ""}</p>
                </div>
                <button onClick={refreshRecos}
                  className="text-xs text-[#8a919e] hover:text-[#111318] cursor-pointer inline-flex items-center gap-1">
                  <RefreshCw size={12} className={recsLoading ? "animate-spin" : ""} /> Actualiser
                </button>
              </div>
              <div className="divide-y divide-[#f4f5f7]">
                {recos.recommendations.map((reco, idx) => (
                  <RecoRow key={`${reco.home_team}-${reco.away_team}-${idx}`}
                    reco={reco} idx={idx} accepting={acceptingIdx === idx}
                    onAccept={handleAccept} onSkip={handleSkip} />
                ))}
              </div>
            </div>
          )}

          {/* Tickets */}
          <div className="space-y-0" data-tour="tickets-section">
            {/* Tickets header */}
            <div className="bg-white rounded-t-xl border border-[#e3e6eb] px-4 py-3" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[#111318] font-semibold text-sm">Tickets</h3>
                  <p className="text-xs text-[#8a919e]">{bets.length} ticket{bets.length > 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* View toggle */}
                  <div className="flex items-center bg-[#f4f5f7] rounded-lg p-0.5" data-tour="tickets-view-toggle">
                    <button onClick={() => setTicketView("kanban")}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${ticketView === "kanban" ? "bg-white shadow-sm text-[#3b5bdb]" : "text-[#8a919e]"}`}>
                      <Columns3 size={14} />
                    </button>
                    <button onClick={() => setTicketView("list")}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${ticketView === "list" ? "bg-white shadow-sm text-[#3b5bdb]" : "text-[#8a919e]"}`}>
                      <LayoutList size={14} />
                    </button>
                  </div>
                  {!isArchived && (
                    <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#e3e6eb] text-[#8a919e] hover:text-[#111318] hover:bg-slate-50 transition-colors cursor-pointer">
                      <Plus size={12} /> Ticket manuel
                    </button>
                  )}
                </div>
              </div>
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-[#f4f5f7] rounded-lg p-0.5">
                  {[
                    { key: "all", label: "Tous" },
                    { key: "pending", label: "En cours" },
                    { key: "won", label: "Gagnés" },
                    { key: "lost", label: "Perdus" },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setTicketStatusFilter(f.key)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                        ticketStatusFilter === f.key ? "bg-white text-[#3b5bdb] shadow-sm" : "text-[#8a919e]"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <select value={ticketSourceFilter} onChange={(e) => setTicketSourceFilter(e.target.value)}
                  className="px-2 py-1 rounded-lg text-[11px] bg-white border border-[#e3e6eb] text-[#8a919e] cursor-pointer focus:outline-none">
                  <option value="all">Algo + Manuel</option>
                  <option value="algo">Algo</option>
                  <option value="manual">Manuel</option>
                </select>
                <span className="text-[11px] text-[#8a919e] ml-auto">{filteredBets.length} résultat{filteredBets.length > 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Ticket content */}
            <div className="bg-white rounded-b-xl border border-x border-b border-t-0 border-[#e3e6eb]" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              {ticketView === "kanban" ? (
                <div className="p-4">
                  <TicketKanban
                    bets={filteredBets}
                    recos={recos?.recommendations || []}
                    isArchived={isArchived}
                    acceptingIdx={acceptingIdx}
                    updatingBetId={updatingBetId}
                    deletingBetId={deletingBetId}
                    onAccept={handleAccept}
                    onSkip={handleSkip}
                    onUpdateBet={handleUpdateBet}
                    onDeleteBet={handleDeleteBet}
                  />
                </div>
              ) : (
                <TicketTable
                  bets={filteredBets}
                  isArchived={isArchived}
                  updatingBetId={updatingBetId}
                  deletingBetId={deletingBetId}
                  onUpdateBet={handleUpdateBet}
                  onDeleteBet={handleDeleteBet}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ZONE 4 — RECAP PARAMS (collapsible) */}
      {/* ═══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#e3e6eb]" data-tour="campaign-params" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
        <button onClick={() => setShowParams(!showParams)}
          className="w-full p-4 flex items-center justify-between hover:bg-[#f4f5f7]/50 transition-colors cursor-pointer">
          <span className="text-[#111318] font-semibold text-sm">Paramètres de la campagne</span>
          {showParams ? <ChevronUp size={16} className="text-[#8a919e]" /> : <ChevronDown size={16} className="text-[#8a919e]" />}
        </button>
        {showParams && (
          <div className="px-4 pb-4 border-t border-[#e3e6eb]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <ParamBlock title="Identité">
                <ParamRow label="Nom" value={campaign.name} />
                <ParamRow label="Sport" value="Football" />
                <ParamRow label="Statut" value={statusCfg.label} />
              </ParamBlock>
              <ParamBlock title="Bankroll & Mise">
                <ParamRow label="Bankroll initiale" value={`${campaign.initial_bankroll}\u20AC`} />
                <ParamRow label="Mise" value={`${(campaign.flat_stake * 100).toFixed(0)}% BK`} />
                {campaign.target_bankroll && <ParamRow label="Objectif" value={`${campaign.target_bankroll}\u20AC`} />}
              </ParamBlock>
              <ParamBlock title="Filtres">
                <ParamRow label="Edge min" value={`${(campaign.min_edge * 100).toFixed(0)}%`} />
                {campaign.min_model_prob && <ParamRow label="Confiance min" value={`${(campaign.min_model_prob * 100).toFixed(0)}%`} />}
                {campaign.min_odds && <ParamRow label="Cote min" value={campaign.min_odds.toFixed(2)} />}
                {campaign.max_odds && <ParamRow label="Cote max" value={campaign.max_odds.toFixed(2)} />}
              </ParamBlock>
              {campaign.combo_mode && (
                <ParamBlock title="Combis">
                  <ParamRow label="Mode" value="Activé" />
                  <ParamRow label="Legs max" value={String(campaign.combo_max_legs)} />
                  <ParamRow label="Cote combi" value={`${campaign.combo_min_odds.toFixed(1)} – ${campaign.combo_max_odds.toFixed(1)}`} />
                  <ParamRow label="Top N" value={String(campaign.combo_top_n)} />
                </ParamBlock>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 text-sm border bg-red-50 text-red-800 border-red-200 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {showTour && <SpotlightTour steps={campaignDetailTour} onComplete={completeTour} />}
    </div>
  );
}

// ══════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-[#e3e6eb]" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
      <p className="text-[10px] text-[#8a919e] mb-1">{label}</p>
      <p className="text-lg font-bold font-[var(--font-mono)]" style={{ color }}>{value}</p>
    </div>
  );
}

function SourceBlock({ label, color, stats }: {
  label: string; color: string; stats: import("@/types").SourceSubStats | null;
}) {
  if (!stats || stats.total_bets === 0) {
    return (
      <div className="rounded-lg border border-[#e3e6eb] p-3 opacity-50">
        <div className="text-xs font-semibold mb-2" style={{ color }}>{label}</div>
        <p className="text-xs text-[#8a919e]">Aucun ticket</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[#e3e6eb] p-3">
      <div className="text-xs font-semibold mb-2" style={{ color }}>{label}</div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-[#8a919e]">ROI</span><span className="font-semibold font-[var(--font-mono)]" style={{ color: stats.roi_pct >= 0 ? GREEN : RED }}>{stats.roi_pct >= 0 ? "+" : ""}{stats.roi_pct.toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-[#8a919e]">Tickets</span><span className="font-semibold">{stats.total_bets}</span></div>
        <div className="flex justify-between"><span className="text-[#8a919e]">Réussite</span><span className="font-semibold">{(stats.win_rate * 100).toFixed(0)}%</span></div>
        <div className="flex justify-between"><span className="text-[#8a919e]">CLV moy.</span><span className="font-semibold font-[var(--font-mono)]">{stats.avg_clv != null ? `${stats.avg_clv >= 0 ? "+" : ""}${stats.avg_clv.toFixed(1)}%` : "\u2014"}</span></div>
        <div className="flex justify-between"><span className="text-[#8a919e]">Mise tot.</span><span className="font-semibold font-[var(--font-mono)]">{stats.total_staked.toFixed(0)}\u20AC</span></div>
      </div>
    </div>
  );
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#8a919e] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#f4f5f7] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold text-[#111318] w-8 text-right font-[var(--font-mono)]">{count}</span>
    </div>
  );
}

function ParamBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#111318] mb-2 pb-1 border-b border-[#e3e6eb]">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#8a919e]">{label}</span>
      <span className="text-[#111318] font-medium">{value}</span>
    </div>
  );
}

function MenuBtn({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer ${
        danger ? "text-red-600 hover:bg-red-50" : "text-[#111318] hover:bg-[#f4f5f7]"
      }`}>
      <span className={danger ? "text-red-400" : "text-[#8a919e]"}>{icon}</span>
      {label}
    </button>
  );
}

function RecoRow({ reco, idx, accepting, onAccept, onSkip }: {
  reco: CampaignRecommendation; idx: number; accepting: boolean;
  onAccept: (r: CampaignRecommendation, i: number) => void;
  onSkip: (i: number) => void;
}) {
  const info = LEAGUE_INFO[reco.league];
  const fmtDate = reco.date.includes("T")
    ? new Date(reco.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : reco.date;
  return (
    <div className="p-3 hover:bg-[#f4f5f7]/50 transition-colors flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#111318] font-medium">{reco.home_team} vs {reco.away_team}</span>
          <Badge variant={outcomeBadgeVariant(reco.outcome)} size="xs">{outcomeLabel(reco.outcome)}</Badge>
        </div>
        <div className="text-[11px] text-[#8a919e] mt-0.5">
          {info ? `${info.flag} ${info.name}` : reco.league} · {fmtDate}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-bold font-[var(--font-mono)]" style={{ color: AMBER }}>{reco.best_odds.toFixed(2)}</span>
        <span className="text-xs font-semibold font-[var(--font-mono)]" style={{ color: GREEN }}>+{(reco.edge * 100).toFixed(1)}%</span>
        <span className="text-xs font-semibold font-[var(--font-mono)]">{reco.suggested_stake.toFixed(2)}\u20AC</span>
        <button onClick={() => onAccept(reco, idx)} disabled={accepting}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-60"
          style={{ backgroundColor: ACCENT }}
          {...(idx === 0 ? { "data-tour": "accept-btn" } : {})}>
          {accepting ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          {accepting ? "..." : "Valider"}
        </button>
        <button onClick={() => onSkip(idx)}
          className="px-2 py-1 rounded-lg text-[11px] text-[#8a919e] hover:text-[#111318] hover:bg-slate-100 transition-colors cursor-pointer">
          Ignorer
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// TICKET KANBAN
// ══════════════════════════════════════════════

interface TicketCard extends KanbanCardData {
  bet?: Bet;
  reco?: CampaignRecommendation;
  recoIdx?: number;
}

const TICKET_COLUMNS: KanbanColumn[] = [
  { id: "proposed", title: "Proposés", icon: <Target size={16} />, color: ACCENT, emptyText: "Aucune proposition" },
  { id: "pending", title: "En cours", icon: <Loader2 size={16} />, color: AMBER, emptyText: "Aucun pari en cours" },
  { id: "resolved", title: "Résolus", icon: <Check size={16} />, color: GREEN, emptyText: "Aucun pari résolu" },
];

function TicketKanban({ bets, recos, isArchived, acceptingIdx, updatingBetId, deletingBetId, onAccept, onSkip, onUpdateBet, onDeleteBet }: {
  bets: Bet[];
  recos: CampaignRecommendation[];
  isArchived: boolean;
  acceptingIdx: number | null;
  updatingBetId: number | null;
  deletingBetId: number | null;
  onAccept: (r: CampaignRecommendation, i: number) => void;
  onSkip: (i: number) => void;
  onUpdateBet: (id: number, result: string) => void;
  onDeleteBet: (id: number) => void;
}) {
  const cards: TicketCard[] = [
    // Recommendations → proposed
    ...recos.map((r, i) => ({
      id: `reco-${i}`,
      columnId: "proposed",
      reco: r,
      recoIdx: i,
    })),
    // Bets
    ...bets.map((b) => ({
      id: `bet-${b.id}`,
      columnId: b.result === "pending" ? "pending" : "resolved",
      bet: b,
    })),
  ];

  return (
    <KanbanBoard<TicketCard>
      columns={TICKET_COLUMNS}
      cards={cards}
      renderCard={(card) => {
        // Recommendation card
        if (card.reco) {
          const reco = card.reco;
          const idx = card.recoIdx!;
          const info = LEAGUE_INFO[reco.league];
          const accepting = acceptingIdx === idx;
          return (
            <div className="bg-white rounded-xl border border-[#e3e6eb] p-3" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-[#111318] truncate">{reco.home_team} vs {reco.away_team}</span>
                <Badge variant={outcomeBadgeVariant(reco.outcome)} size="xs">{outcomeLabel(reco.outcome)}</Badge>
              </div>
              <div className="text-[10px] text-[#8a919e] mb-2">
                {info ? `${info.flag} ${info.name}` : reco.league}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm font-[var(--font-mono)]" style={{ color: AMBER }}>{reco.best_odds.toFixed(2)}</span>
                <span className="text-[10px] font-semibold font-[var(--font-mono)]" style={{ color: GREEN }}>+{(reco.edge * 100).toFixed(1)}%</span>
                <span className="text-[10px] font-[var(--font-mono)] text-[#8a919e]">{reco.suggested_stake.toFixed(2)}\u20AC</span>
              </div>
              {!isArchived && (
                <div className="flex gap-1.5">
                  <button onClick={() => onAccept(reco, idx)} disabled={accepting}
                    className="flex-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-white transition-colors cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: ACCENT }}>
                    {accepting ? "..." : "Valider"}
                  </button>
                  <button onClick={() => onSkip(idx)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold text-[#8a919e] hover:bg-slate-100 transition-colors cursor-pointer">
                    Ignorer
                  </button>
                </div>
              )}
            </div>
          );
        }

        // Bet card
        const bet = card.bet!;
        const info = LEAGUE_INFO[bet.league];
        const isPending = bet.result === "pending";
        const isUpdating = updatingBetId === bet.id;
        const isDeleting = deletingBetId === bet.id;
        const fmtDate = bet.match_date.includes("T")
          ? new Date(bet.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
          : bet.match_date.slice(0, 10);

        return (
          <div className={`bg-white rounded-xl border border-[#e3e6eb] p-3 ${isDeleting ? "opacity-40" : ""}`}
            style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-[#111318] truncate">{bet.home_team} vs {bet.away_team}</span>
              <Badge variant={outcomeBadgeVariant(bet.outcome_bet)} size="xs">{outcomeLabel(bet.outcome_bet)}</Badge>
            </div>
            <div className="text-[10px] text-[#8a919e] mb-2">
              {info ? `${info.flag} ${info.name}` : bet.league} · {fmtDate} · {bet.odds_at_bet.toFixed(2)}
            </div>

            {isPending && !isArchived ? (
              <div className="flex gap-1.5">
                {isUpdating ? (
                  <Loader2 size={12} className="animate-spin text-[#8a919e]" />
                ) : (
                  <>
                    <button onClick={() => onUpdateBet(bet.id, "won")}
                      className="flex-1 px-2 py-1 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer">
                      Gagné
                    </button>
                    <button onClick={() => onUpdateBet(bet.id, "lost")}
                      className="flex-1 px-2 py-1 rounded text-[10px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 cursor-pointer">
                      Perdu
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <Badge variant={bet.result === "won" ? "emerald" : bet.result === "void" ? "slate" : "red"} size="xs">
                  {bet.result === "won" ? "Gagné" : bet.result === "void" ? "Annulé" : "Perdu"}
                </Badge>
                {bet.profit_loss != null && (
                  <span className="text-xs font-bold font-[var(--font-mono)]" style={{ color: bet.profit_loss >= 0 ? GREEN : RED }}>
                    {bet.profit_loss >= 0 ? "+" : ""}{bet.profit_loss.toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {/* Source tag */}
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                bet.source === "manual" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
              }`}>
                {bet.source === "manual" ? "MANUEL" : "ALGO"}
              </span>
              {!isArchived && (
                <button onClick={() => onDeleteBet(bet.id)} disabled={isDeleting || isUpdating}
                  className="p-1 rounded text-[#8a919e] hover:text-red-400 hover:bg-red-50 transition-colors cursor-pointer">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}

// ══════════════════════════════════════════════
// TICKET TABLE
// ══════════════════════════════════════════════

function TicketTable({ bets, isArchived, updatingBetId, deletingBetId, onUpdateBet, onDeleteBet }: {
  bets: Bet[];
  isArchived: boolean;
  updatingBetId: number | null;
  deletingBetId: number | null;
  onUpdateBet: (id: number, result: string) => void;
  onDeleteBet: (id: number) => void;
}) {
  if (bets.length === 0) {
    return <div className="p-8 text-center text-sm text-[#8a919e]">Aucun ticket.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#e3e6eb] text-[#8a919e]">
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-left px-3 py-2 font-medium">Match</th>
            <th className="text-left px-3 py-2 font-medium">Issue</th>
            <th className="text-right px-3 py-2 font-medium">Cote</th>
            <th className="text-right px-3 py-2 font-medium">Mise</th>
            <th className="text-left px-3 py-2 font-medium">Résultat</th>
            <th className="text-right px-3 py-2 font-medium">G/P</th>
            <th className="text-right px-3 py-2 font-medium">Edge</th>
            <th className="text-left px-3 py-2 font-medium">Tag</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => {
            const isPending = bet.result === "pending";
            const isUpdating = updatingBetId === bet.id;
            const isDeleting = deletingBetId === bet.id;
            const info = LEAGUE_INFO[bet.league];
            const fmtDate = bet.match_date.includes("T")
              ? new Date(bet.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
              : bet.match_date.slice(0, 10);

            return (
              <tr key={bet.id} className={`border-b border-[#f4f5f7] hover:bg-[#f4f5f7]/50 transition-colors ${isDeleting ? "opacity-40" : ""}`}>
                <td className="px-3 py-2.5 text-[#8a919e]">{fmtDate}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[#111318] font-medium">{bet.home_team} vs {bet.away_team}</div>
                  <div className="text-[10px] text-[#8a919e]">{info ? `${info.flag} ${info.name}` : bet.league}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={outcomeBadgeVariant(bet.outcome_bet)} size="xs">{outcomeLabel(bet.outcome_bet)}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-[var(--font-mono)] font-semibold" style={{ color: AMBER }}>
                  {bet.odds_at_bet.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-[var(--font-mono)]">{bet.stake.toFixed(2)}\u20AC</td>
                <td className="px-3 py-2.5">
                  {isPending ? (
                    isUpdating ? (
                      <Loader2 size={12} className="animate-spin text-[#8a919e]" />
                    ) : !isArchived ? (
                      <div className="flex gap-1">
                        <button onClick={() => onUpdateBet(bet.id, "won")}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer">G</button>
                        <button onClick={() => onUpdateBet(bet.id, "lost")}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 cursor-pointer">P</button>
                      </div>
                    ) : (
                      <Badge variant="amber" size="xs">En cours</Badge>
                    )
                  ) : (
                    <Badge variant={bet.result === "won" ? "emerald" : bet.result === "void" ? "slate" : "red"} size="xs">
                      {bet.result === "won" ? "Gagné" : bet.result === "void" ? "Annulé" : "Perdu"}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-[var(--font-mono)] font-semibold"
                  style={{ color: bet.profit_loss != null ? (bet.profit_loss >= 0 ? GREEN : RED) : "#8a919e" }}>
                  {bet.profit_loss != null ? `${bet.profit_loss >= 0 ? "+" : ""}${bet.profit_loss.toFixed(2)}` : "\u2014"}
                </td>
                <td className="px-3 py-2.5 text-right font-[var(--font-mono)]" style={{ color: GREEN }}>
                  {bet.edge_at_bet != null ? `+${(bet.edge_at_bet * 100).toFixed(1)}%` : "\u2014"}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    bet.source === "manual" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    {bet.source === "manual" ? "MAN" : "ALGO"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {!isArchived && (
                    <button onClick={() => onDeleteBet(bet.id)} disabled={isDeleting || isUpdating}
                      className="p-1 rounded text-[#8a919e] hover:text-red-400 hover:bg-red-50 transition-colors cursor-pointer">
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
