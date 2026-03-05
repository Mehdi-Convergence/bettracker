import { useEffect, useState } from "react";
import {
  Rocket, TrendingUp, TrendingDown, Wallet, RefreshCw, Check, Loader2,
  Pause, Play, Settings, Plus, Target,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  getCampaigns, createCampaign, getCampaignDetail, getCampaignRecommendations,
  acceptCampaignRecommendation, getCampaignHistory, updateCampaign,
} from "../services/api";
import { LEAGUE_INFO } from "../types";
import type {
  Campaign as CampaignType, CampaignDetail, CampaignRecommendation,
  CampaignRecommendationsResponse, BankrollPoint,
} from "../types";

export default function Campaign() {
  // Data
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [recos, setRecos] = useState<CampaignRecommendationsResponse | null>(null);
  const [history, setHistory] = useState<BankrollPoint[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(false);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [demoMode] = useState(true);

  // Form state
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

  const activeCampaign = campaigns.find((c) => c.status === "active") || campaigns[0] || null;

  // Load on mount
  useEffect(() => {
    loadCampaigns();
  }, []);

  // Load detail when active campaign changes
  useEffect(() => {
    if (activeCampaign) {
      loadDetail(activeCampaign.id);
      loadRecommendations(activeCampaign.id);
      loadHistory(activeCampaign.id);
    }
  }, [activeCampaign?.id]);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const data = await getCampaigns();
      setCampaigns(data);
      if (data.length === 0) setShowCreate(true);
    } catch {
      setError("Impossible de charger les campagnes.");
    }
    setLoading(false);
  }

  async function loadDetail(id: number) {
    try {
      const data = await getCampaignDetail(id);
      setDetail(data);
    } catch {
      // silent
    }
  }

  async function loadRecommendations(id: number) {
    setRecsLoading(true);
    try {
      const data = await getCampaignRecommendations(id, demoMode);
      setRecos(data);
    } catch {
      // silent
    }
    setRecsLoading(false);
  }

  async function loadHistory(id: number) {
    try {
      const data = await getCampaignHistory(id);
      setHistory(data);
    } catch {
      // silent
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      await createCampaign(form);
      setShowCreate(false);
      await loadCampaigns();
    } catch (e) {
      setError((e as Error).message);
    }
    setCreating(false);
  }

  async function handleAccept(reco: CampaignRecommendation, idx: number) {
    if (!activeCampaign) return;
    setAcceptingIdx(idx);
    try {
      await acceptCampaignRecommendation(activeCampaign.id, {
        home_team: reco.home_team,
        away_team: reco.away_team,
        league: reco.league,
        match_date: reco.date,
        outcome: reco.outcome,
        odds: reco.best_odds,
        stake: reco.suggested_stake,
      });
      // Remove from list
      if (recos) {
        setRecos({
          ...recos,
          recommendations: recos.recommendations.filter((_, i) => i !== idx),
        });
      }
      // Refresh stats
      loadDetail(activeCampaign.id);
      loadHistory(activeCampaign.id);
    } catch {
      setError("Impossible d'enregistrer le pari.");
    }
    setAcceptingIdx(null);
  }

  async function handleTogglePause() {
    if (!activeCampaign) return;
    const newStatus = activeCampaign.status === "active" ? "paused" : "active";
    try {
      await updateCampaign(activeCampaign.id, { status: newStatus });
      await loadCampaigns();
    } catch {
      setError("Impossible de modifier le statut.");
    }
  }

  function handleSkip(idx: number) {
    if (!recos) return;
    setRecos({
      ...recos,
      recommendations: recos.recommendations.filter((_, i) => i !== idx),
    });
  }

  const stats = detail?.stats;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  // ----- CREATE FORM -----
  if (showCreate || !activeCampaign) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campagne</h2>
          <p className="text-gray-500 text-sm">Creez votre strategie automatisee</p>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm max-w-3xl">
          <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" />
            Nouvelle campagne
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom de la campagne</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="ex: Strategie Alpha"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bankroll (EUR)</label>
                <input
                  type="number"
                  value={form.initial_bankroll}
                  onChange={(e) => setForm({ ...form, initial_bankroll: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mise (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.flat_stake}
                  onChange={(e) => setForm({ ...form, flat_stake: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Edge min</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.min_edge}
                  onChange={(e) => setForm({ ...form, min_edge: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confiance min</label>
                <input
                  type="number"
                  step="0.05"
                  value={form.min_model_prob}
                  onChange={(e) => setForm({ ...form, min_model_prob: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cote min</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="vide = tout"
                  value={form.min_odds ?? ""}
                  onChange={(e) => setForm({ ...form, min_odds: e.target.value ? Number(e.target.value) : null })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cote max</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="vide = tout"
                  value={form.max_odds ?? ""}
                  onChange={(e) => setForm({ ...form, max_odds: e.target.value ? Number(e.target.value) : null })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Combo mode */}
            <div className="pt-3 border-t border-gray-200">
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.combo_mode}
                  onChange={(e) => setForm({ ...form, combo_mode: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Mode Combis
              </label>
              {form.combo_mode && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max legs</label>
                    <input
                      type="number" min={2} max={4}
                      value={form.combo_max_legs}
                      onChange={(e) => setForm({ ...form, combo_max_legs: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cote min combo</label>
                    <input
                      type="number" step="0.1"
                      value={form.combo_min_odds}
                      onChange={(e) => setForm({ ...form, combo_min_odds: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cote max combo</label>
                    <input
                      type="number" step="0.1"
                      value={form.combo_max_odds}
                      onChange={(e) => setForm({ ...form, combo_max_odds: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Top N par jour</label>
                    <input
                      type="number" min={1} max={5}
                      value={form.combo_top_n}
                      onChange={(e) => setForm({ ...form, combo_top_n: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Target */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Objectif bankroll (optionnel)</label>
              <input
                type="number"
                placeholder="ex: 500"
                value={form.target_bankroll ?? ""}
                onChange={(e) => setForm({ ...form, target_bankroll: e.target.value ? Number(e.target.value) : null })}
                className="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg text-sm flex items-center gap-2 font-semibold shadow-sm transition-colors"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
              {creating ? "Creation..." : "Creer la campagne"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- ACTIVE CAMPAIGN DASHBOARD -----
  const outcomeLabel = (o: string) => o === "H" ? "Dom" : o === "D" ? "Nul" : "Ext";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campagne</h2>
          <p className="text-gray-500 text-sm">Votre strategie automatisee</p>
        </div>
      </div>

      {/* Campaign header bar */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Rocket size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-gray-900 font-semibold">{activeCampaign.name}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                activeCampaign.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {activeCampaign.status === "active" ? "Active" : "Pause"}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Mise {(activeCampaign.flat_stake * 100).toFixed(0)}% · Edge min {(activeCampaign.min_edge * 100).toFixed(0)}%
              {activeCampaign.min_model_prob && ` · Confiance ${(activeCampaign.min_model_prob * 100).toFixed(0)}%`}
              {activeCampaign.target_bankroll && ` · Objectif ${activeCampaign.target_bankroll}EUR`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {activeCampaign.status === "active" ? <Pause size={12} /> : <Play size={12} />}
            {activeCampaign.status === "active" ? "Pause" : "Reprendre"}
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <Settings size={12} />
            Config
          </button>
        </div>
      </div>

      {/* Config panel (collapsible) */}
      {showConfig && (
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <h3 className="text-gray-900 font-semibold mb-3 text-sm">Parametres de la strategie</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
            <ConfigItem label="Bankroll initiale" value={`${activeCampaign.initial_bankroll} EUR`} />
            <ConfigItem label="Mise" value={`${(activeCampaign.flat_stake * 100).toFixed(1)}%`} />
            <ConfigItem label="Edge min" value={`${(activeCampaign.min_edge * 100).toFixed(1)}%`} />
            <ConfigItem label="Confiance min" value={activeCampaign.min_model_prob ? `${(activeCampaign.min_model_prob * 100).toFixed(0)}%` : "—"} />
            <ConfigItem label="Cote min" value={activeCampaign.min_odds?.toFixed(2) ?? "—"} />
            <ConfigItem label="Cote max" value={activeCampaign.max_odds?.toFixed(2) ?? "—"} />
            <ConfigItem label="Mode combo" value={activeCampaign.combo_mode ? "Oui" : "Non"} />
            {activeCampaign.target_bankroll && <ConfigItem label="Objectif" value={`${activeCampaign.target_bankroll} EUR`} />}
          </div>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Bankroll actuelle"
              value={`${stats.current_bankroll.toFixed(0)}EUR`}
              icon={Wallet}
              color="text-amber-500"
            />
            <StatCard
              label="Profit/Perte"
              value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}EUR`}
              icon={stats.total_pnl >= 0 ? TrendingUp : TrendingDown}
              color={stats.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"}
            />
            <StatCard
              label="Taux de reussite"
              value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "—"}
              icon={Target}
              color="text-blue-600"
            />
            <StatCard
              label="ROI"
              value={stats.total_staked > 0 ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "—"}
              icon={TrendingUp}
              color={stats.roi_pct >= 0 ? "text-emerald-600" : "text-red-500"}
            />
          </div>

          {(stats.won > 0 || stats.lost > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MiniStat label="Paris total" value={`${stats.total_bets}`} />
              <MiniStat label="En attente" value={`${stats.pending_bets}`} />
              <MiniStat label="Gagnes" value={`${stats.won}`} color="text-emerald-600" />
              <MiniStat label="Perdus" value={`${stats.lost}`} color="text-red-500" />
              <MiniStat label="Total mise" value={`${stats.total_staked.toFixed(0)}EUR`} />
            </div>
          )}
        </>
      )}

      {/* Bankroll chart */}
      {history.length > 1 && (
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <h3 className="text-gray-900 font-semibold mb-3">Evolution de la bankroll</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
                />
                <Line type="monotone" dataKey="bankroll" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-gray-900 font-semibold">Recommandations du jour</h3>
            {recos && (
              <p className="text-xs text-gray-400 mt-0.5">
                {recos.recommendations.length} pari{recos.recommendations.length > 1 ? "s" : ""} detecte{recos.recommendations.length > 1 ? "s" : ""} sur {recos.total_scanned} matchs scannes
              </p>
            )}
          </div>
          <button
            onClick={() => activeCampaign && loadRecommendations(activeCampaign.id)}
            disabled={recsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <RefreshCw size={12} className={recsLoading ? "animate-spin" : ""} />
            Actualiser
          </button>
        </div>

        {recsLoading && !recos ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        ) : recos && recos.recommendations.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Aucune recommandation pour le moment. Revenez plus tard ou ajustez vos parametres.
          </div>
        ) : recos ? (
          <div className="divide-y divide-gray-100">
            {recos.recommendations.map((reco, idx) => {
              const info = LEAGUE_INFO[reco.league];
              const fmtDate = reco.date.includes("T")
                ? new Date(reco.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : reco.date;
              const isAccepting = acceptingIdx === idx;

              return (
                <div key={`${reco.home_team}-${reco.away_team}-${idx}`} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-semibold text-sm">{reco.home_team} vs {reco.away_team}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          reco.outcome === "H" ? "bg-blue-100 text-blue-700" :
                          reco.outcome === "D" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {outcomeLabel(reco.outcome)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {info ? `${info.flag} ${info.name}` : reco.league} · {fmtDate}
                      </div>
                    </div>

                    {/* Odds + stats */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <div className="text-amber-600 font-bold text-lg">{reco.best_odds.toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400">{reco.bookmaker}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600 font-bold text-sm">{(reco.model_prob * 100).toFixed(0)}%</div>
                        <div className="text-[10px] text-gray-400">modele</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600 font-bold text-sm">+{(reco.edge * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-gray-400">edge</div>
                      </div>
                      <div className="text-center bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
                        <div className="text-gray-900 font-bold text-sm">{reco.suggested_stake.toFixed(2)}EUR</div>
                        <div className="text-[10px] text-gray-400">mise</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => handleAccept(reco, idx)}
                        disabled={isAccepting}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isAccepting
                            ? "bg-blue-400 text-white cursor-wait"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {isAccepting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {isAccepting ? "..." : "Accepter"}
                      </button>
                      <button
                        onClick={() => handleSkip(idx)}
                        className="px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Passer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}
    </div>
  );
}

// ----- Sub-components -----

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, color = "text-gray-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-sm text-gray-900 font-medium">{value}</div>
    </div>
  );
}
