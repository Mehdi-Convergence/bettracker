import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Rocket, Wallet, Check, Loader2, Layers,
  Pause, Play, Plus, Trash2,
  Search, MoreVertical, Copy, Archive,
  X, Shield, SlidersHorizontal, Calendar, Bell,
} from "lucide-react";
import {
  getCampaigns, createCampaign, getCampaignDetail, updateCampaign,
} from "@/services/api";
import type { Campaign as CampaignType } from "@/types";
import { GREEN, RED, STATUS_CFG } from "@/utils/campaign";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { campaignsTour } from "@/tours/index";
import { usePreview } from "@/contexts/PreviewContext";

// ── Demo data for preview mode ──
const DEMO_CAMPAIGNS: CampaignType[] = [
  { id: 1, name: "Value Bets Ligue 1", status: "active", initial_bankroll: 500, flat_stake: 0.05, min_edge: 0.03, min_model_prob: 0.55, min_odds: 1.5, max_odds: 3.5, allowed_outcomes: null, excluded_leagues: null, combo_mode: false, combo_max_legs: 2, combo_min_odds: 1.8, combo_max_odds: 3.0, combo_top_n: 2, target_bankroll: 1000, created_at: "2026-01-15T10:00:00Z" },
  { id: 2, name: "Over 2.5 Premier League", status: "active", initial_bankroll: 300, flat_stake: 0.04, min_edge: 0.025, min_model_prob: 0.52, min_odds: 1.6, max_odds: 2.8, allowed_outcomes: null, excluded_leagues: null, combo_mode: false, combo_max_legs: 2, combo_min_odds: 1.8, combo_max_odds: 3.0, combo_top_n: 2, target_bankroll: null, created_at: "2026-02-01T14:30:00Z" },
  { id: 3, name: "BTTS Bundesliga", status: "active", initial_bankroll: 400, flat_stake: 0.06, min_edge: 0.035, min_model_prob: 0.58, min_odds: 1.7, max_odds: 2.5, allowed_outcomes: null, excluded_leagues: null, combo_mode: false, combo_max_legs: 2, combo_min_odds: 1.8, combo_max_odds: 3.0, combo_top_n: 2, target_bankroll: 800, created_at: "2026-02-10T09:00:00Z" },
  { id: 4, name: "Asian Handicap Serie A", status: "paused", initial_bankroll: 250, flat_stake: 0.03, min_edge: 0.02, min_model_prob: 0.50, min_odds: 1.4, max_odds: 4.0, allowed_outcomes: null, excluded_leagues: null, combo_mode: false, combo_max_legs: 2, combo_min_odds: 1.8, combo_max_odds: 3.0, combo_top_n: 2, target_bankroll: null, created_at: "2026-03-01T16:00:00Z" },
];

const DEMO_STATS: Record<number, import("@/types").CampaignStats> = {
  1: { total_bets: 47, pending_bets: 3, won: 28, lost: 16, win_rate: 63.6, total_staked: 1175, total_pnl: 184.5, roi_pct: 15.7, current_bankroll: 684.5, longest_winning_streak: 7, longest_losing_streak: 3, avg_clv: 2.1, max_drawdown_pct: 8.2, max_drawdown_amount: 41, ev_expected: 165, algo_stats: null, manual_stats: null },
  2: { total_bets: 32, pending_bets: 2, won: 18, lost: 12, win_rate: 60.0, total_staked: 384, total_pnl: 96.2, roi_pct: 25.1, current_bankroll: 396.2, longest_winning_streak: 5, longest_losing_streak: 4, avg_clv: 1.8, max_drawdown_pct: 12.1, max_drawdown_amount: 36.3, ev_expected: 88, algo_stats: null, manual_stats: null },
  3: { total_bets: 28, pending_bets: 1, won: 18, lost: 9, win_rate: 66.7, total_staked: 672, total_pnl: 210.8, roi_pct: 31.4, current_bankroll: 610.8, longest_winning_streak: 8, longest_losing_streak: 2, avg_clv: 3.2, max_drawdown_pct: 5.6, max_drawdown_amount: 22.4, ev_expected: 195, algo_stats: null, manual_stats: null },
  4: { total_bets: 19, pending_bets: 0, won: 9, lost: 10, win_rate: 47.4, total_staked: 142.5, total_pnl: -18.3, roi_pct: -12.8, current_bankroll: 231.7, longest_winning_streak: 3, longest_losing_streak: 5, avg_clv: -0.8, max_drawdown_pct: 18.4, max_drawdown_amount: 46, ev_expected: -12, algo_stats: null, manual_stats: null },
};

// ── Design tokens ──
const ACCENT = "#3b5bdb";

// ── Campaign card colors (cycle) ──
const CARD_ACCENTS = [ACCENT, "#7c3aed", "#0ea5e9", "#e11d48", "#059669", "#d97706"];

// ── Sport icons ──
function sportIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("tennis")) return "\uD83C\uDFBE";
  if (lower.includes("basket")) return "\uD83C\uDFC0";
  if (lower.includes("pmu") || lower.includes("course") || lower.includes("cheval")) return "\uD83D\uDC0E";
  return "\u26BD";
}

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function Campaign() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showTour, completeTour } = useTour("campaigns");
  const { isPreview } = usePreview();

  // ── Data ──
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Views ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Stepper step ──
  const [stepperStep, setStepperStep] = useState(0);

  // ── Form state (create) — fields supported by backend ──
  const [form, setForm] = useState({
    name: "Strategie Alpha",
    initial_bankroll: 200,
    flat_stake: 0.05,
    min_edge: 0.02,
    min_model_prob: 0.55,
    min_odds: null as number | null,
    max_odds: null as number | null,
    combo_mode: false,
    combo_max_legs: 2,
    combo_min_odds: 1.8,
    combo_max_odds: 3.0,
    combo_top_n: 2,
    target_bankroll: null as number | null,
  });

  // ── Extended form (UI-only, not persisted yet) ──
  const [extForm, setExtForm] = useState({
    description: "",
    sports: ["football"] as string[],
    icon: "\u26BD",
    color: ACCENT,
    staking_strategy: "flat" as "flat" | "pct_bankroll" | "kelly_half" | "kelly_dynamic",
    max_stake: null as number | null,
    stop_loss_daily: null as number | null,
    stop_loss_total: null as number | null,
    smart_stop: 5,
    clv_rule: false,
    stake_variation: 0,
    data_quality_min: 12,
    bet_types: ["1X2"] as string[],
    anti_duplicate: true,
    max_same_player: 3,
    start_date: "",
    duration_days: 30,
    frequency: "daily" as "daily" | "continuous",
    active_days: [1, 2, 3, 4, 5, 6, 7] as number[],
    alert_email: true,
    alert_push: false,
    alert_sms: false,
  });

  // ── Detail campaign stats map ──
  const [campaignStats, setCampaignStats] = useState<Record<number, import("@/types").CampaignStats>>({});

  // ── Load campaigns ──
  useEffect(() => {
    if (isPreview) {
      setCampaigns(DEMO_CAMPAIGNS);
      setCampaignStats(DEMO_STATS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await getCampaigns();
        if (!cancelled) setCampaigns(data);
      } catch {
        if (!cancelled) setError("Impossible de charger les campagnes.");
      }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [isPreview]);

  // ── Handle duplicate from CampaignDetail navigation ──
  useEffect(() => {
    if (isPreview) return;
    const state = location.state as { duplicateFrom?: CampaignType } | null;
    if (state?.duplicateFrom) {
      handleDuplicate(state.duplicateFrom);
      // Clear state to avoid re-triggering on back navigation
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // ── Load stats for all campaigns ──
  useEffect(() => {
    if (isPreview) return;
    let cancelled = false;
    campaigns.forEach((c) => {
      if (!campaignStats[c.id]) {
        getCampaignDetail(c.id).then((d) => {
          if (!cancelled) setCampaignStats((prev) => ({ ...prev, [c.id]: d.stats }));
        }).catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [campaigns]);

  // ── Close menu on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId !== null) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  // ── API calls ──
  async function loadCampaigns() {
    setLoading(true);
    try { setCampaigns(await getCampaigns()); }
    catch { setError("Impossible de charger les campagnes."); }
    setLoading(false);
  }
  async function handleCreate() {
    setCreating(true); setError("");
    try {
      await createCampaign(form);
      setShowCreateModal(false);
      await loadCampaigns();
    } catch (e) { setError((e as Error).message); }
    setCreating(false);
  }

  async function handleTogglePause(campaignId: number, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try { await updateCampaign(campaignId, { status: newStatus }); await loadCampaigns(); }
    catch { setError("Impossible de modifier le statut."); }
    setOpenMenuId(null);
  }

  function handleDuplicate(campaign: typeof campaigns[0]) {
    setForm({
      name: `${campaign.name} (copie)`,
      initial_bankroll: campaign.initial_bankroll,
      flat_stake: campaign.flat_stake,
      min_edge: campaign.min_edge,
      min_model_prob: campaign.min_model_prob ?? 0.55,
      min_odds: campaign.min_odds ?? null,
      max_odds: campaign.max_odds ?? null,
      combo_mode: campaign.combo_mode ?? false,
      combo_max_legs: campaign.combo_max_legs ?? 2,
      combo_min_odds: campaign.combo_min_odds ?? 1.8,
      combo_max_odds: campaign.combo_max_odds ?? 3.0,
      combo_top_n: campaign.combo_top_n ?? 2,
      target_bankroll: campaign.target_bankroll ?? null,
    });
    setStepperStep(0);
    setShowCreateModal(true);
    setOpenMenuId(null);
  }

  // ── Filtered campaigns ──
  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, statusFilter, searchQuery]);

  const activeCampaignCount = campaigns.filter((c) => c.status === "active").length;

  // ══════════════════════════════════════════════
  // LOADING STATE
  // ══════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} style={{ color: ACCENT }} />
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // GRID VIEW
  // ══════════════════════════════════════════════
  const inputCls = "w-full bg-white border border-[#e3e6eb] rounded-lg px-3 py-1.5 text-sm text-[#111318] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-[#3b5bdb]";

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111318]">Campagnes</h1>
          <p className="text-sm text-[#8a919e] mt-0.5">Gérez vos stratégies de paris automatisées</p>
        </div>
        <button data-tour="create-btn" onClick={() => !isPreview && setShowCreateModal(true)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${isPreview ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
          style={{ backgroundColor: ACCENT }}
          disabled={isPreview}>
          <Plus size={16} />
          Créer une campagne
        </button>
      </div>


      {/* ── Search + Filter + View Toggle ── */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div data-tour="search-bar" className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a919e]" />
          <input type="text" placeholder="Rechercher une campagne..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white border border-[#e3e6eb] text-[#111318] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb]/30 focus:border-[#3b5bdb] placeholder:text-[#8a919e]"
            style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }} />
        </div>

        {/* Filter pills */}
        <div data-tour="status-filters" className="flex items-center gap-1 bg-[#f4f5f7] rounded-lg p-0.5">
          {([
            { key: "all", label: "Toutes" },
            { key: "active", label: "Actives" },
            { key: "paused", label: "En pause" },
            { key: "archived", label: "Archivées" },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                statusFilter === f.key
                  ? "bg-white text-[#3b5bdb] shadow-sm"
                  : "text-[#8a919e] hover:text-[#111318]"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((campaign, idx) => {
            const statusCfg = STATUS_CFG[campaign.status] || STATUS_CFG.active;
            const cStats = campaignStats[campaign.id];
            const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

            const winRate = cStats ? cStats.win_rate : 0;
            const isPositive = cStats ? cStats.total_pnl >= 0 : true;

            return (
              <div key={campaign.id}
                {...(idx === 0 ? { "data-tour": "campaign-card" } : {})}
                className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
                style={{
                  background: "linear-gradient(135deg, #fff 0%, #fafbff 100%)",
                  boxShadow: "0 1px 3px rgba(16,24,40,.04), 0 4px 12px rgba(16,24,40,.03)",
                  border: "1px solid #e8eaef",
                  animation: `fadeUp 0.4s ease both ${idx * 0.05}s`,
                }}
                onClick={() => !isPreview && navigate(`/campaign/${campaign.id}`)}>

                {/* Accent gradient top */}
                <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />

                {/* Glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
                  style={{ boxShadow: `0 0 0 1px ${accent}30, 0 8px 32px ${accent}12` }} />

                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}08)`, border: `1px solid ${accent}15` }}>
                        {sportIcon(campaign.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-[#111318] truncate leading-tight">{campaign.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot,
                              ...(campaign.status === "active" ? { animation: "pulse 2s infinite" } : {}) }} />
                            {statusCfg.label}
                          </span>
                          {campaign.combo_mode && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-600">
                              Combis
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Menu */}
                    <div className="relative" ref={openMenuId === campaign.id ? menuRef : undefined}>
                      <button {...(idx === 0 ? { "data-tour": "campaign-menu" } : {})} onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === campaign.id ? null : campaign.id); }}
                        className="p-1.5 rounded-lg text-[#b0b7c3] hover:bg-[#f4f5f7] hover:text-[#8a919e] transition-all cursor-pointer opacity-0 group-hover:opacity-100">
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === campaign.id && (
                        <div className="absolute right-0 top-9 w-44 bg-white rounded-xl border border-[#e3e6eb] py-1 z-50"
                          style={{ boxShadow: "0 8px 24px rgba(16,24,40,.12)" }}
                          onClick={(e) => e.stopPropagation()}>
                          <MenuBtn icon={<Copy size={14} />} label="Dupliquer" onClick={() => handleDuplicate(campaign)} />
                          <MenuBtn icon={campaign.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                            label={campaign.status === "active" ? "Mettre en pause" : "Reprendre"}
                            onClick={() => handleTogglePause(campaign.id, campaign.status)} />
                          <MenuBtn icon={<Archive size={14} />} label="Archiver" onClick={() => setOpenMenuId(null)} />
                          <div className="border-t border-[#e3e6eb] my-1" />
                          <MenuBtn icon={<Trash2 size={14} />} label="Supprimer" danger onClick={() => setOpenMenuId(null)} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Config tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <ConfigTag label={`Mise ${(campaign.flat_stake * 100).toFixed(0)}%`} accent={accent} />
                    <ConfigTag label={`Edge \u2265 ${(campaign.min_edge * 100).toFixed(0)}%`} accent={accent} />
                    {campaign.min_model_prob && <ConfigTag label={`Conf. \u2265 ${(campaign.min_model_prob * 100).toFixed(0)}%`} accent={accent} />}
                    {campaign.min_odds && <ConfigTag label={`Cote \u2265 ${campaign.min_odds.toFixed(1)}`} accent={accent} />}
                    {campaign.max_odds && <ConfigTag label={`Cote \u2264 ${campaign.max_odds.toFixed(1)}`} accent={accent} />}
                  </div>

                  {/* KPIs */}
                  {cStats ? (
                    <div className="rounded-xl p-3.5" style={{ background: "linear-gradient(135deg, #f8f9fc, #f4f5f7)" }}>
                      {/* Win rate bar */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[10px] font-semibold text-[#8a919e] uppercase tracking-wider">Win rate</span>
                        <span className="text-[11px] font-bold" style={{ color: winRate >= 55 ? GREEN : winRate >= 45 ? "#f79009" : RED }}>
                          {winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#e8eaef] mb-3.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(winRate, 100)}%`,
                            background: winRate >= 55 ? `linear-gradient(90deg, ${GREEN}, ${GREEN}cc)` : winRate >= 45 ? "linear-gradient(90deg, #f79009, #fbbf24)" : `linear-gradient(90deg, ${RED}, ${RED}cc)`,
                          }} />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-[17px] font-extrabold font-[var(--font-mono)] leading-none" style={{ color: isPositive ? GREEN : RED }}>
                            {cStats.roi_pct >= 0 ? "+" : ""}{cStats.roi_pct.toFixed(1)}%
                          </div>
                          <div className="text-[10px] font-medium text-[#8a919e] mt-1">ROI</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[17px] font-extrabold font-[var(--font-mono)] leading-none text-[#111318]">
                            {cStats.total_bets}
                          </div>
                          <div className="text-[10px] font-medium text-[#8a919e] mt-1">Paris</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[17px] font-extrabold font-[var(--font-mono)] leading-none" style={{ color: isPositive ? GREEN : RED }}>
                            {cStats.total_pnl >= 0 ? "+" : ""}{cStats.total_pnl.toFixed(0)}&euro;
                          </div>
                          <div className="text-[10px] font-medium text-[#8a919e] mt-1">P&amp;L</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #f8f9fc, #f4f5f7)" }}>
                      <div className="h-12 flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-[#b0b7c3]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* CTA Card — Create */}
          {!isPreview && <div onClick={() => setShowCreateModal(true)}
            className="rounded-xl border-2 border-dashed border-[#e3e6eb] hover:border-[#3b5bdb]/40 flex flex-col items-center justify-center py-10 cursor-pointer transition-all group"
            style={{ minHeight: 200 }}>
            <div className="w-12 h-12 rounded-xl bg-[#f4f5f7] group-hover:bg-[#3b5bdb]/10 flex items-center justify-center transition-colors mb-3">
              <Plus size={24} className="text-[#8a919e] group-hover:text-[#3b5bdb] transition-colors" />
            </div>
            <span className="text-sm font-semibold text-[#8a919e] group-hover:text-[#3b5bdb] transition-colors">
              Créer une campagne
            </span>
            <span className="text-xs text-[#8a919e] mt-1">
              {5 - activeCampaignCount} emplacement{5 - activeCampaignCount > 1 ? "s" : ""} disponible{5 - activeCampaignCount > 1 ? "s" : ""}
            </span>
          </div>}
        </div>

      {/* ══════════════════════════════════════════════ */}
      {/* CREATE MODAL — 4-STEP STEPPER */}
      {/* ══════════════════════════════════════════════ */}
      {showCreateModal && (
        <CreateStepperModal
          step={stepperStep}
          setStep={setStepperStep}
          form={form}
          setForm={setForm}
          extForm={extForm}
          setExtForm={setExtForm}
          inputCls={inputCls}
          creating={creating}
          error={error}
          onClose={() => { setShowCreateModal(false); setStepperStep(0); }}
          onCreate={handleCreate}
        />
      )}

      {error && !showCreateModal && (
        <div className="rounded-xl p-3 text-sm border bg-red-50 text-red-800 border-red-200">{error}</div>
      )}

      {showTour && <SpotlightTour steps={campaignsTour} onComplete={completeTour} />}
    </div>
  );
}

// ══════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════



function ConfigTag({ label, accent }: { label: string; accent?: string }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
      style={{
        background: accent ? `${accent}08` : "#f4f5f7",
        color: accent ? `${accent}cc` : "#8a919e",
        border: `1px solid ${accent ? `${accent}15` : "#e3e6eb"}`,
      }}>
      {label}
    </span>
  );
}


function MenuBtn({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors cursor-pointer ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-[#111318] hover:bg-[#f4f5f7]"
      }`}>
      <span className={danger ? "text-red-400" : "text-[#8a919e]"}>{icon}</span>
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════
// STEPPER MODAL
// ══════════════════════════════════════════════

const STEPPER_STEPS = [
  { label: "Identité & Sport", icon: <Rocket size={16} /> },
  { label: "Bankroll & Mise", icon: <Wallet size={16} /> },
  { label: "Filtres & Combis", icon: <SlidersHorizontal size={16} /> },
  { label: "Planning & Récap", icon: <Calendar size={16} /> },
];

const SPORTS = [
  { key: "football", label: "Football", icon: "\u26BD" },
  { key: "tennis", label: "Tennis", icon: "\uD83C\uDFBE" },
  { key: "basket", label: "Basketball", icon: "\uD83C\uDFC0" },
  { key: "mlb", label: "Baseball", icon: "\u26BE" },
  { key: "pmu", label: "Courses PMU", icon: "\uD83D\uDC0E" },
];

const STAKING_STRATEGIES = [
  { key: "flat", label: "Mise fixe", desc: "Pourcentage fixe de la bankroll initiale" },
  { key: "pct_bankroll", label: "% Bankroll", desc: "Pourcentage de la bankroll courante" },
  { key: "kelly_half", label: "Kelly ½", desc: "Demi-critère de Kelly conservateur" },
  { key: "kelly_dynamic", label: "Kelly dynamique", desc: "Kelly adapté selon la confiance" },
] as const;

const BET_TYPES = ["1X2", "Double chance", "BTTS", "Over/Under 2.5", "Handicap", "Corners", "Mi-temps"];

const ACCENT_COLORS = [ACCENT, "#7c3aed", "#0ea5e9", "#e11d48", "#059669", "#d97706", "#6366f1", "#ec4899"];
const CAMPAIGN_ICONS = ["\u26BD", "\uD83C\uDFBE", "\uD83C\uDFC0", "\uD83C\uDFC6", "\uD83D\uDE80", "\uD83D\uDCCA", "\uD83C\uDFAF", "\u2B50"];

interface StepperProps {
  step: number;
  setStep: (s: number) => void;
  form: {
    name: string; initial_bankroll: number; flat_stake: number; min_edge: number;
    min_model_prob: number; min_odds: number | null; max_odds: number | null;
    combo_mode: boolean; combo_max_legs: number; combo_min_odds: number; combo_max_odds: number;
    combo_top_n: number; target_bankroll: number | null;
  };
  setForm: (f: StepperProps["form"]) => void;
  extForm: {
    description: string; sports: string[]; icon: string; color: string;
    staking_strategy: "flat" | "pct_bankroll" | "kelly_half" | "kelly_dynamic";
    max_stake: number | null; stop_loss_daily: number | null; stop_loss_total: number | null;
    smart_stop: number; clv_rule: boolean; stake_variation: number;
    data_quality_min: number; bet_types: string[]; anti_duplicate: boolean; max_same_player: number;
    start_date: string; duration_days: number; frequency: "daily" | "continuous";
    active_days: number[]; alert_email: boolean; alert_push: boolean; alert_sms: boolean;
  };
  setExtForm: (f: StepperProps["extForm"]) => void;
  inputCls: string;
  creating: boolean;
  error: string;
  onClose: () => void;
  onCreate: () => void;
}

function CreateStepperModal({ step, setStep, form, setForm, extForm, setExtForm, inputCls, creating, error, onClose, onCreate }: StepperProps) {
  const isLastStep = step === 3;

  function toggleSport(key: string) {
    setExtForm({
      ...extForm,
      sports: extForm.sports.includes(key)
        ? extForm.sports.filter((s) => s !== key)
        : [...extForm.sports, key],
    });
  }

  function toggleBetType(bt: string) {
    setExtForm({
      ...extForm,
      bet_types: extForm.bet_types.includes(bt)
        ? extForm.bet_types.filter((b) => b !== bt)
        : [...extForm.bet_types, bt],
    });
  }

  function toggleDay(d: number) {
    setExtForm({
      ...extForm,
      active_days: extForm.active_days.includes(d)
        ? extForm.active_days.filter((x) => x !== d)
        : [...extForm.active_days, d].sort(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col"
        style={{ boxShadow: "0 4px 32px rgba(16,24,40,.15)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#e3e6eb] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${ACCENT}15` }}>
              <Rocket size={18} style={{ color: ACCENT }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#111318]">Nouvelle campagne</h2>
              <p className="text-xs text-[#8a919e]">Étape {step + 1} sur 4 : {STEPPER_STEPS[step].label}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a919e] hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Stepper bar */}
        <div className="px-6 py-3 border-b border-[#e3e6eb] shrink-0">
          <div className="flex items-center gap-1">
            {STEPPER_STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <button onClick={() => i <= step && setStep(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    i === step
                      ? "bg-[#3b5bdb]/10 text-[#3b5bdb]"
                      : i < step
                        ? "text-[#12b76a] cursor-pointer hover:bg-emerald-50"
                        : "text-[#8a919e]"
                  }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i === step ? "bg-[#3b5bdb] text-white"
                      : i < step ? "bg-[#12b76a] text-white" : "bg-[#e3e6eb] text-[#8a919e]"
                  }`}>
                    {i < step ? <Check size={10} /> : i + 1}
                  </span>
                  <span className="hidden md:inline">{s.label}</span>
                </button>
                {i < 3 && <div className={`flex-1 h-0.5 mx-1 rounded-full ${i < step ? "bg-[#12b76a]" : "bg-[#e3e6eb]"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── STEP 1: Identité & Sport ── */}
          {step === 0 && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Nom de la campagne</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls} placeholder="ex: Strategie Alpha Value" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Description (optionnel)</label>
                <textarea value={extForm.description}
                  onChange={(e) => setExtForm({ ...extForm, description: e.target.value })}
                  className={`${inputCls} resize-none`} rows={2}
                  placeholder="Décrivez votre stratégie en quelques mots..." />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-2">Sports</label>
                <div className="flex flex-wrap gap-2">
                  {SPORTS.map((sp) => (
                    <button key={sp.key} onClick={() => toggleSport(sp.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                        extForm.sports.includes(sp.key)
                          ? "border-[#3b5bdb] bg-[#3b5bdb]/10 text-[#3b5bdb]"
                          : "border-[#e3e6eb] text-[#8a919e] hover:border-[#3b5bdb]/40"
                      }`}>
                      <span>{sp.icon}</span> {sp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-2">Icône</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPAIGN_ICONS.map((ic) => (
                      <button key={ic} onClick={() => setExtForm({ ...extForm, icon: ic })}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-all cursor-pointer ${
                          extForm.icon === ic ? "border-[#3b5bdb] bg-[#3b5bdb]/10" : "border-[#e3e6eb] hover:border-[#3b5bdb]/40"
                        }`}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-2">Couleur accent</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCENT_COLORS.map((c) => (
                      <button key={c} onClick={() => setExtForm({ ...extForm, color: c })}
                        className={`w-9 h-9 rounded-lg border-2 transition-all cursor-pointer ${
                          extForm.color === c ? "border-[#111318] scale-110" : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: Bankroll & Mise ── */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Bankroll initiale (€)</label>
                  <input type="number" value={form.initial_bankroll}
                    onChange={(e) => setForm({ ...form, initial_bankroll: Number(e.target.value) })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Objectif bankroll (€)</label>
                  <input type="number" placeholder="optionnel" value={form.target_bankroll ?? ""}
                    onChange={(e) => setForm({ ...form, target_bankroll: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-2">Stratégie de mise</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STAKING_STRATEGIES.map((st) => (
                    <button key={st.key} onClick={() => setExtForm({ ...extForm, staking_strategy: st.key })}
                      className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        extForm.staking_strategy === st.key
                          ? "border-[#3b5bdb] bg-[#3b5bdb]/5"
                          : "border-[#e3e6eb] hover:border-[#3b5bdb]/30"
                      }`}>
                      <div className="text-sm font-semibold text-[#111318]">{st.label}</div>
                      <div className="text-xs text-[#8a919e] mt-0.5">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    {extForm.staking_strategy === "flat" ? "Mise (%)" : "Fraction"}
                  </label>
                  <input type="number" step="0.01" value={form.flat_stake}
                    onChange={(e) => setForm({ ...form, flat_stake: Number(e.target.value) })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Mise max (€)</label>
                  <input type="number" placeholder="illimité" value={extForm.max_stake ?? ""}
                    onChange={(e) => setExtForm({ ...extForm, max_stake: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Variation mise (±%)</label>
                  <input type="number" value={extForm.stake_variation}
                    onChange={(e) => setExtForm({ ...extForm, stake_variation: Number(e.target.value) })}
                    className={inputCls} />
                </div>
              </div>

              <div className="pt-3 border-t border-[#e3e6eb]">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-red-500" />
                  <span className="text-sm font-semibold text-[#111318]">Protection du capital</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Stop-loss journalier (€)</label>
                    <input type="number" placeholder="désactivé" value={extForm.stop_loss_daily ?? ""}
                      onChange={(e) => setExtForm({ ...extForm, stop_loss_daily: e.target.value ? Number(e.target.value) : null })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Stop-loss total (€)</label>
                    <input type="number" placeholder="désactivé" value={extForm.stop_loss_total ?? ""}
                      onChange={(e) => setExtForm({ ...extForm, stop_loss_total: e.target.value ? Number(e.target.value) : null })}
                      className={inputCls} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    Arrêt intelligent après <strong className="text-[#111318]">{extForm.smart_stop}</strong> pertes consécutives
                  </label>
                  <input type="range" min={2} max={15} value={extForm.smart_stop}
                    onChange={(e) => setExtForm({ ...extForm, smart_stop: Number(e.target.value) })}
                    className="w-full accent-[#3b5bdb]" />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#111318] mt-3 cursor-pointer">
                  <input type="checkbox" checked={extForm.clv_rule}
                    onChange={(e) => setExtForm({ ...extForm, clv_rule: e.target.checked })}
                    className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                  Arrêter si CLV négatif sur 50 derniers paris
                </label>
              </div>
            </>
          )}

          {/* ── STEP 3: Filtres & Combis ── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    Confiance min : <strong className="text-[#111318]">{(form.min_model_prob * 100).toFixed(0)}%</strong>
                  </label>
                  <input type="range" min={0.40} max={0.85} step={0.01} value={form.min_model_prob}
                    onChange={(e) => setForm({ ...form, min_model_prob: Number(e.target.value) })}
                    className="w-full accent-[#3b5bdb]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    Edge min : <strong className="text-[#111318]">{(form.min_edge * 100).toFixed(0)}%</strong>
                  </label>
                  <input type="range" min={0} max={0.15} step={0.005} value={form.min_edge}
                    onChange={(e) => setForm({ ...form, min_edge: Number(e.target.value) })}
                    className="w-full accent-[#3b5bdb]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Cote min</label>
                  <input type="number" step="0.1" placeholder="tout" value={form.min_odds ?? ""}
                    onChange={(e) => setForm({ ...form, min_odds: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Cote max</label>
                  <input type="number" step="0.1" placeholder="tout" value={form.max_odds ?? ""}
                    onChange={(e) => setForm({ ...form, max_odds: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    Qualité données min : <strong className="text-[#111318]">{extForm.data_quality_min}/20</strong>
                  </label>
                  <input type="range" min={5} max={20} value={extForm.data_quality_min}
                    onChange={(e) => setExtForm({ ...extForm, data_quality_min: Number(e.target.value) })}
                    className="w-full accent-[#3b5bdb]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-2">Types de paris</label>
                <div className="flex flex-wrap gap-2">
                  {BET_TYPES.map((bt) => (
                    <button key={bt} onClick={() => toggleBetType(bt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        extForm.bet_types.includes(bt)
                          ? "border-[#3b5bdb] bg-[#3b5bdb]/10 text-[#3b5bdb]"
                          : "border-[#e3e6eb] text-[#8a919e] hover:border-[#3b5bdb]/40"
                      }`}>
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-[#111318] cursor-pointer">
                  <input type="checkbox" checked={extForm.anti_duplicate}
                    onChange={(e) => setExtForm({ ...extForm, anti_duplicate: e.target.checked })}
                    className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                  Anti-doublon
                </label>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Max même joueur/équipe</label>
                  <input type="number" min={1} max={10} value={extForm.max_same_player}
                    onChange={(e) => setExtForm({ ...extForm, max_same_player: Number(e.target.value) })}
                    className={inputCls} />
                </div>
              </div>

              {/* Combis */}
              <div className="pt-3 border-t border-[#e3e6eb]">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#111318] mb-3 cursor-pointer">
                  <input type="checkbox" checked={form.combo_mode}
                    onChange={(e) => setForm({ ...form, combo_mode: e.target.checked })}
                    className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                  <Layers size={14} className="text-purple-500" />
                  Mode Combis
                </label>
                {form.combo_mode && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Max legs</label>
                      <input type="number" min={2} max={4} value={form.combo_max_legs}
                        onChange={(e) => setForm({ ...form, combo_max_legs: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Cote min combo</label>
                      <input type="number" step="0.1" value={form.combo_min_odds}
                        onChange={(e) => setForm({ ...form, combo_min_odds: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Cote max combo</label>
                      <input type="number" step="0.1" value={form.combo_max_odds}
                        onChange={(e) => setForm({ ...form, combo_max_odds: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Top N / jour</label>
                      <input type="number" min={1} max={5} value={form.combo_top_n}
                        onChange={(e) => setForm({ ...form, combo_top_n: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STEP 4: Planning & Récap ── */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Date de début</label>
                  <input type="date" value={extForm.start_date}
                    onChange={(e) => setExtForm({ ...extForm, start_date: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Durée (jours)</label>
                  <input type="number" min={1} value={extForm.duration_days}
                    onChange={(e) => setExtForm({ ...extForm, duration_days: Number(e.target.value) })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Fréquence</label>
                  <div className="flex gap-2">
                    {(["daily", "continuous"] as const).map((f) => (
                      <button key={f} onClick={() => setExtForm({ ...extForm, frequency: f })}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          extForm.frequency === f
                            ? "border-[#3b5bdb] bg-[#3b5bdb]/10 text-[#3b5bdb]"
                            : "border-[#e3e6eb] text-[#8a919e]"
                        }`}>
                        {f === "daily" ? "Quotidien" : "Continu"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-2">Jours actifs</label>
                <div className="flex gap-2">
                  {([
                    { d: 1, l: "L" }, { d: 2, l: "M" }, { d: 3, l: "Me" }, { d: 4, l: "J" },
                    { d: 5, l: "V" }, { d: 6, l: "S" }, { d: 7, l: "D" },
                  ] as const).map(({ d, l }) => (
                    <button key={d} onClick={() => toggleDay(d)}
                      className={`w-9 h-9 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        extForm.active_days.includes(d)
                          ? "border-[#3b5bdb] bg-[#3b5bdb]/10 text-[#3b5bdb]"
                          : "border-[#e3e6eb] text-[#8a919e]"
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts */}
              <div className="pt-3 border-t border-[#e3e6eb]">
                <div className="flex items-center gap-2 mb-3">
                  <Bell size={14} style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold text-[#111318]">Alertes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                    <Bell size={12} /> In-app
                  </span>
                  <span className="text-xs text-slate-400">Stop-loss, bankroll basse, smart stop</span>
                </div>
              </div>

              {/* Recap */}
              <div className="pt-3 border-t border-[#e3e6eb]">
                <h4 className="text-sm font-semibold text-[#111318] mb-3">Récapitulatif</h4>
                <div className="bg-[#f4f5f7] rounded-xl p-4 space-y-2 text-sm">
                  <RecapRow label="Nom" value={form.name || "—"} />
                  <RecapRow label="Sports" value={extForm.sports.map((s) => SPORTS.find((sp) => sp.key === s)?.label || s).join(", ")} />
                  <RecapRow label="Bankroll" value={`${form.initial_bankroll}€`} />
                  <RecapRow label="Stratégie" value={STAKING_STRATEGIES.find((s) => s.key === extForm.staking_strategy)?.label || ""} />
                  <RecapRow label="Mise" value={`${(form.flat_stake * 100).toFixed(1)}%`} />
                  <RecapRow label="Edge min" value={`${(form.min_edge * 100).toFixed(0)}%`} />
                  <RecapRow label="Confiance min" value={`${(form.min_model_prob * 100).toFixed(0)}%`} />
                  {form.min_odds && <RecapRow label="Cote min" value={form.min_odds.toFixed(1)} />}
                  {form.max_odds && <RecapRow label="Cote max" value={form.max_odds.toFixed(1)} />}
                  {form.combo_mode && <RecapRow label="Combis" value={`Max ${form.combo_max_legs} legs`} />}
                  <RecapRow label="Durée" value={`${extForm.duration_days} jours`} />
                  {extForm.stop_loss_total && <RecapRow label="Stop-loss total" value={`${extForm.stop_loss_total}€`} />}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg p-3 text-sm border bg-red-50 text-red-800 border-red-200">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e3e6eb] shrink-0">
          <button onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#8a919e] hover:bg-slate-100 transition-colors cursor-pointer">
            {step > 0 ? "Retour" : "Annuler"}
          </button>
          <button onClick={() => isLastStep ? onCreate() : setStep(step + 1)}
            disabled={creating || (step === 0 && !form.name.trim())}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors cursor-pointer hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}>
            {isLastStep ? (
              creating ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />
            ) : null}
            {isLastStep ? (creating ? "Création..." : "Créer la campagne") : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#8a919e]">{label}</span>
      <span className="font-medium text-[#111318]">{value}</span>
    </div>
  );
}
