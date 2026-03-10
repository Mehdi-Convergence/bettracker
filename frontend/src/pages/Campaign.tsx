import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Rocket, Wallet, Check, Loader2, Layers,
  Pause, Play, Plus, Target, Trash2,
  Search, LayoutGrid, Columns3, MoreVertical, Copy, Archive,
  Zap, X, Shield, SlidersHorizontal, Calendar, Bell,
} from "lucide-react";
import {
  getCampaigns, createCampaign, getCampaignDetail, updateCampaign,
} from "@/services/api";
import KanbanBoard from "@/components/KanbanBoard";
import type { KanbanColumn, KanbanCardData } from "@/components/KanbanBoard";
import type { Campaign as CampaignType } from "@/types";
import { GREEN, RED, AMBER, STATUS_CFG } from "@/utils/campaign";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { campaignsTour } from "@/tours/index";

// ── Design tokens ──
const ACCENT = "#3b5bdb";

// ── Campaign card colors (cycle) ──
const CARD_ACCENTS = [ACCENT, "#7c3aed", "#0ea5e9", "#e11d48", "#059669", "#d97706"];

// ── Sport icons ──
function sportIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("tennis")) return "\uD83C\uDFBE";
  if (lower.includes("basket")) return "\uD83C\uDFC0";
  return "\u26BD";
}

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function Campaign() {
  const navigate = useNavigate();
  const { showTour, completeTour } = useTour("campaigns");

  // ── Data ──
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Views ──
  const [viewMode, setViewMode] = useState<"grid" | "kanban">("grid");
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
  useEffect(() => { loadCampaigns(); }, []);

  // ── Load stats for all campaigns ──
  useEffect(() => {
    campaigns.forEach((c) => {
      if (!campaignStats[c.id]) {
        getCampaignDetail(c.id).then((d) =>
          setCampaignStats((prev) => ({ ...prev, [c.id]: d.stats }))
        ).catch(() => {});
      }
    });
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
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111318]">Campagnes</h1>
          <p className="text-sm text-[#8a919e] mt-0.5">Gérez vos stratégies de paris automatisées</p>
        </div>
        <button data-tour="create-btn" onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors cursor-pointer hover:opacity-90"
          style={{ backgroundColor: ACCENT }}>
          <Plus size={16} />
          Créer une campagne
        </button>
      </div>

      {/* ── Quota banner ── */}
      <div data-tour="quota-bar" className="bg-gradient-to-r from-[#3b5bdb]/5 to-[#7c3aed]/5 rounded-xl border border-[#3b5bdb]/15 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: ACCENT }} />
          <span className="text-sm text-[#111318]">
            <strong>{activeCampaignCount}</strong> / 5 campagnes actives
          </span>
          <span className="text-xs text-[#8a919e]">Plan Pro</span>
        </div>
        <div className="w-32 h-1.5 bg-[#e3e6eb] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${Math.min(100, (activeCampaignCount / 5) * 100)}%`,
            backgroundColor: activeCampaignCount >= 5 ? RED : ACCENT,
          }} />
        </div>
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

        {/* View toggle */}
        <div data-tour="view-toggle" className="flex items-center bg-[#f4f5f7] rounded-lg p-0.5">
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "grid" ? "bg-white shadow-sm text-[#3b5bdb]" : "text-[#8a919e] hover:text-[#111318]"}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode("kanban")}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "kanban" ? "bg-white shadow-sm text-[#3b5bdb]" : "text-[#8a919e] hover:text-[#111318]"}`}>
            <Columns3 size={16} />
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((campaign, idx) => {
            const statusCfg = STATUS_CFG[campaign.status] || STATUS_CFG.active;
            const cStats = campaignStats[campaign.id];
            const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

            return (
              <div key={campaign.id}
                {...(idx === 0 ? { "data-tour": "campaign-card" } : {})}
                className="group bg-white rounded-xl border border-[#e3e6eb] overflow-hidden hover:border-[#3b5bdb]/30 transition-all cursor-pointer"
                style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)", animation: `fadeUp 0.4s ease both ${idx * 0.05}s` }}
                onClick={() => navigate(`/campaign/${campaign.id}`)}>
                {/* Accent top bar */}
                <div className="h-1" style={{ backgroundColor: accent }} />

                <div className="p-4">
                  {/* Header: icon + name + status + menu */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: `${accent}15` }}>
                        {sportIcon(campaign.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#111318] truncate">{campaign.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot,
                              ...(campaign.status === "active" ? { animation: "pulse 2s infinite" } : {}) }} />
                            {statusCfg.label}
                          </span>
                          {campaign.combo_mode && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-600">
                              Combis
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Menu ⋮ */}
                    <div className="relative" ref={openMenuId === campaign.id ? menuRef : undefined}>
                      <button {...(idx === 0 ? { "data-tour": "campaign-menu" } : {})} onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === campaign.id ? null : campaign.id); }}
                        className="p-1 rounded-md text-[#8a919e] hover:bg-slate-100 transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === campaign.id && (
                        <div className="absolute right-0 top-8 w-44 bg-white rounded-lg border border-[#e3e6eb] py-1 z-50"
                          style={{ boxShadow: "0 4px 16px rgba(16,24,40,.1)" }}
                          onClick={(e) => e.stopPropagation()}>
                          <MenuBtn icon={<Copy size={14} />} label="Dupliquer" onClick={() => setOpenMenuId(null)} />
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
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <ConfigTag label={`Mise ${(campaign.flat_stake * 100).toFixed(0)}%`} />
                    <ConfigTag label={`Edge \u2265 ${(campaign.min_edge * 100).toFixed(0)}%`} />
                    {campaign.min_model_prob && <ConfigTag label={`Conf. \u2265 ${(campaign.min_model_prob * 100).toFixed(0)}%`} />}
                    {campaign.min_odds && <ConfigTag label={`Cote \u2265 ${campaign.min_odds.toFixed(1)}`} />}
                    {campaign.max_odds && <ConfigTag label={`Cote \u2264 ${campaign.max_odds.toFixed(1)}`} />}
                  </div>

                  {/* KPI row */}
                  {cStats ? (
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#e3e6eb]">
                      <KpiCell label="ROI" value={`${cStats.roi_pct >= 0 ? "+" : ""}${cStats.roi_pct.toFixed(1)}%`}
                        color={cStats.roi_pct >= 0 ? GREEN : RED} />
                      <KpiCell label="Paris" value={`${cStats.total_bets}`} />
                      <KpiCell label="P&L" value={`${cStats.total_pnl >= 0 ? "+" : ""}${cStats.total_pnl.toFixed(0)}\u20AC`}
                        color={cStats.total_pnl >= 0 ? GREEN : RED} />
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-[#e3e6eb]">
                      <div className="h-8 flex items-center justify-center">
                        <Loader2 size={14} className="animate-spin text-[#8a919e]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* CTA Card — Create */}
          <div onClick={() => setShowCreateModal(true)}
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
          </div>
        </div>
      )}

      {/* ── Kanban view ── */}
      {viewMode === "kanban" && (
        <CampaignKanban
          campaigns={filteredCampaigns}
          campaignStats={campaignStats}
          onSelectCampaign={(id) => navigate(`/campaign/${id}`)}
        />
      )}

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

// ══════════════════════════════════════════════
// CAMPAIGN KANBAN
// ══════════════════════════════════════════════

interface CampaignKanbanCard extends KanbanCardData {
  campaign: CampaignType;
  stats?: import("@/types").CampaignStats;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "proposed",
    title: "Proposés",
    icon: <Target size={16} />,
    color: ACCENT,
    emptyText: "Aucune recommandation en attente",
  },
  {
    id: "active",
    title: "En cours",
    icon: <Play size={16} />,
    color: GREEN,
    emptyText: "Aucun pari en cours",
  },
  {
    id: "resolved",
    title: "Résolus",
    icon: <Check size={16} />,
    color: "#8a919e",
    emptyText: "Aucun pari résolu",
  },
];

function CampaignKanban({ campaigns, campaignStats, onSelectCampaign }: {
  campaigns: CampaignType[];
  campaignStats: Record<number, import("@/types").CampaignStats>;
  onSelectCampaign: (id: number) => void;
}) {
  // Map campaigns into kanban cards based on status
  const kanbanCards: CampaignKanbanCard[] = campaigns.map((c) => {
    let columnId = "active";
    if (c.status === "paused") columnId = "proposed";
    else if (c.status === "archived") columnId = "resolved";
    return { id: String(c.id), columnId, campaign: c, stats: campaignStats[c.id] };
  });

  return (
    <KanbanBoard<CampaignKanbanCard>
      columns={KANBAN_COLUMNS}
      cards={kanbanCards}
      renderCard={(card) => {
        const c = card.campaign;
        const s = card.stats;
        const statusCfg = STATUS_CFG[c.status] || STATUS_CFG.active;

        return (
          <div onClick={() => onSelectCampaign(c.id)}
            className="bg-white rounded-xl border border-[#e3e6eb] p-3 hover:border-[#3b5bdb]/30 transition-all cursor-pointer"
            style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">{sportIcon(c.name)}</span>
                <span className="text-sm font-semibold text-[#111318] truncate">{c.name}</span>
              </div>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                {statusCfg.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              <ConfigTag label={`Mise ${(c.flat_stake * 100).toFixed(0)}%`} />
              <ConfigTag label={`Edge \u2265 ${(c.min_edge * 100).toFixed(0)}%`} />
            </div>

            {s ? (
              <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#e3e6eb]">
                <KpiCell label="ROI" value={`${s.roi_pct >= 0 ? "+" : ""}${s.roi_pct.toFixed(1)}%`}
                  color={s.roi_pct >= 0 ? GREEN : RED} />
                <KpiCell label="Paris" value={`${s.total_bets}`} />
                <KpiCell label="P&L" value={`${s.total_pnl >= 0 ? "+" : ""}${s.total_pnl.toFixed(0)}\u20AC`}
                  color={s.total_pnl >= 0 ? GREEN : RED} />
              </div>
            ) : (
              <div className="pt-2 border-t border-[#e3e6eb] flex justify-center">
                <Loader2 size={12} className="animate-spin text-[#8a919e]" />
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function ConfigTag({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#f4f5f7] text-[#8a919e] border border-[#e3e6eb]">
      {label}
    </span>
  );
}

function KpiCell({ label, value, color = "#111318" }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-bold font-[var(--font-mono)]" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#8a919e]">{label}</div>
    </div>
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
              <p className="text-xs text-[#8a919e]">Étape {step + 1} sur 4 — {STEPPER_STEPS[step].label}</p>
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

              <div className="grid grid-cols-2 gap-5">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Bankroll initiale (\u20AC)</label>
                  <input type="number" value={form.initial_bankroll}
                    onChange={(e) => setForm({ ...form, initial_bankroll: Number(e.target.value) })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Objectif bankroll (\u20AC)</label>
                  <input type="number" placeholder="optionnel" value={form.target_bankroll ?? ""}
                    onChange={(e) => setForm({ ...form, target_bankroll: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8a919e] mb-2">Stratégie de mise</label>
                <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">
                    {extForm.staking_strategy === "flat" ? "Mise (%)" : "Fraction"}
                  </label>
                  <input type="number" step="0.01" value={form.flat_stake}
                    onChange={(e) => setForm({ ...form, flat_stake: Number(e.target.value) })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Mise max (\u20AC)</label>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Stop-loss journalier (\u20AC)</label>
                    <input type="number" placeholder="désactivé" value={extForm.stop_loss_daily ?? ""}
                      onChange={(e) => setExtForm({ ...extForm, stop_loss_daily: e.target.value ? Number(e.target.value) : null })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8a919e] mb-1.5">Stop-loss total (\u20AC)</label>
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
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-3 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="grid grid-cols-3 gap-4">
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
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#111318] cursor-pointer">
                    <input type="checkbox" checked={extForm.alert_email}
                      onChange={(e) => setExtForm({ ...extForm, alert_email: e.target.checked })}
                      className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#111318] cursor-pointer">
                    <input type="checkbox" checked={extForm.alert_push}
                      onChange={(e) => setExtForm({ ...extForm, alert_push: e.target.checked })}
                      className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                    Push
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#111318] cursor-pointer">
                    <input type="checkbox" checked={extForm.alert_sms}
                      onChange={(e) => setExtForm({ ...extForm, alert_sms: e.target.checked })}
                      className="rounded border-[#e3e6eb] text-[#3b5bdb] focus:ring-[#3b5bdb]" />
                    SMS
                  </label>
                </div>
              </div>

              {/* Recap */}
              <div className="pt-3 border-t border-[#e3e6eb]">
                <h4 className="text-sm font-semibold text-[#111318] mb-3">Récapitulatif</h4>
                <div className="bg-[#f4f5f7] rounded-xl p-4 space-y-2 text-sm">
                  <RecapRow label="Nom" value={form.name || "—"} />
                  <RecapRow label="Sports" value={extForm.sports.map((s) => SPORTS.find((sp) => sp.key === s)?.label || s).join(", ")} />
                  <RecapRow label="Bankroll" value={`${form.initial_bankroll}\u20AC`} />
                  <RecapRow label="Stratégie" value={STAKING_STRATEGIES.find((s) => s.key === extForm.staking_strategy)?.label || ""} />
                  <RecapRow label="Mise" value={`${(form.flat_stake * 100).toFixed(1)}%`} />
                  <RecapRow label="Edge min" value={`${(form.min_edge * 100).toFixed(0)}%`} />
                  <RecapRow label="Confiance min" value={`${(form.min_model_prob * 100).toFixed(0)}%`} />
                  {form.min_odds && <RecapRow label="Cote min" value={form.min_odds.toFixed(1)} />}
                  {form.max_odds && <RecapRow label="Cote max" value={form.max_odds.toFixed(1)} />}
                  {form.combo_mode && <RecapRow label="Combis" value={`Max ${form.combo_max_legs} legs`} />}
                  <RecapRow label="Durée" value={`${extForm.duration_days} jours`} />
                  {extForm.stop_loss_total && <RecapRow label="Stop-loss total" value={`${extForm.stop_loss_total}\u20AC`} />}
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
