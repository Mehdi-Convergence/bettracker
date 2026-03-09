import { useEffect, useState, useMemo } from "react";
import {
  Rocket, TrendingUp, TrendingDown, Wallet, RefreshCw, Check, Loader2,
  Pause, Play, Settings, Plus, Target, Trash2, ChevronDown, ChevronUp, Layers,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  getCampaigns, createCampaign, getCampaignDetail, getCampaignRecommendations,
  acceptCampaignRecommendation, getCampaignHistory, updateCampaign,
  getCampaignBets, updateCampaignBet, deleteCampaignBet,
} from "@/services/api";
import { LEAGUE_INFO } from "@/types";
import { PageHeader, Button, Alert, Card, Badge } from "@/components/ui";
import type {
  Campaign as CampaignType, CampaignDetail, CampaignRecommendation,
  CampaignRecommendationsResponse, BankrollPoint,
} from "@/types";

export default function Campaign() {
  // Data
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [recos, setRecos] = useState<CampaignRecommendationsResponse | null>(null);
  const [history, setHistory] = useState<BankrollPoint[]>([]);
  const [bets, setBets] = useState<import("@/types").Bet[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(false);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [demoMode] = useState(false);
  const [showBets, setShowBets] = useState(false);
  const [updatingBetId, setUpdatingBetId] = useState<number | null>(null);
  const [deletingBetId, setDeletingBetId] = useState<number | null>(null);
  const [recoDatePreset, setRecoDatePreset] = useState("7j");

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

  useEffect(() => { loadCampaigns(); }, []);
  useEffect(() => {
    if (activeCampaign) {
      loadDetail(activeCampaign.id);
      loadRecommendations(activeCampaign.id);
      loadHistory(activeCampaign.id);
      loadBets(activeCampaign.id);
    }
  }, [activeCampaign?.id]);

  async function loadCampaigns() {
    setLoading(true);
    try { const data = await getCampaigns(); setCampaigns(data); if (data.length === 0) setShowCreate(true); }
    catch { setError("Impossible de charger les campagnes."); }
    setLoading(false);
  }
  async function loadDetail(id: number) { try { setDetail(await getCampaignDetail(id)); } catch { /* silent */ } }
  async function loadRecommendations(id: number) {
    setRecsLoading(true);
    try { setRecos(await getCampaignRecommendations(id, demoMode)); } catch { /* silent */ }
    setRecsLoading(false);
  }
  async function loadHistory(id: number) { try { setHistory(await getCampaignHistory(id)); } catch { /* silent */ } }
  async function loadBets(id: number) { try { setBets(await getCampaignBets(id)); } catch { /* silent */ } }

  async function handleUpdateBet(betId: number, result: string) {
    if (!activeCampaign) return;
    setUpdatingBetId(betId);
    try {
      const updated = await updateCampaignBet(activeCampaign.id, betId, result);
      setBets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      loadDetail(activeCampaign.id);
      loadHistory(activeCampaign.id);
    } catch { setError("Impossible de mettre a jour le pari."); }
    setUpdatingBetId(null);
  }

  async function handleDeleteBet(betId: number) {
    if (!activeCampaign) return;
    setDeletingBetId(betId);
    try {
      await deleteCampaignBet(activeCampaign.id, betId);
      setBets((prev) => prev.filter((b) => b.id !== betId));
      loadDetail(activeCampaign.id);
      loadHistory(activeCampaign.id);
    } catch { setError("Impossible de supprimer le pari."); }
    setDeletingBetId(null);
  }

  async function handleCreate() {
    setCreating(true); setError("");
    try { await createCampaign(form); setShowCreate(false); await loadCampaigns(); }
    catch (e) { setError((e as Error).message); }
    setCreating(false);
  }

  async function handleAccept(reco: CampaignRecommendation, idx: number) {
    if (!activeCampaign) return;
    setAcceptingIdx(idx);
    try {
      await acceptCampaignRecommendation(activeCampaign.id, {
        home_team: reco.home_team, away_team: reco.away_team, league: reco.league,
        match_date: reco.date, outcome: reco.outcome, odds: reco.best_odds, stake: reco.suggested_stake,
      });
      if (recos) setRecos({ ...recos, recommendations: recos.recommendations.filter((_, i) => i !== idx) });
      loadDetail(activeCampaign.id);
      loadHistory(activeCampaign.id);
    } catch { setError("Impossible d'enregistrer le pari."); }
    setAcceptingIdx(null);
  }

  async function handleTogglePause() {
    if (!activeCampaign) return;
    const newStatus = activeCampaign.status === "active" ? "paused" : "active";
    try { await updateCampaign(activeCampaign.id, { status: newStatus }); await loadCampaigns(); }
    catch { setError("Impossible de modifier le statut."); }
  }

  function handleSkip(idx: number) {
    if (!recos) return;
    setRecos({ ...recos, recommendations: recos.recommendations.filter((_, i) => i !== idx) });
  }

  const stats = detail?.stats;
  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  // Date filter for recommendations
  const filteredRecos = useMemo(() => {
    if (!recos) return [];
    const all = recos.recommendations;
    const now = new Date();
    const cutoff = new Date(now);
    if (recoDatePreset === "auj") cutoff.setDate(cutoff.getDate() + 1);
    else if (recoDatePreset === "48h") cutoff.setDate(cutoff.getDate() + 2);
    else if (recoDatePreset === "72h") cutoff.setDate(cutoff.getDate() + 3);
    else if (recoDatePreset === "7j") cutoff.setDate(cutoff.getDate() + 7);
    else if (recoDatePreset === "1m") cutoff.setDate(cutoff.getDate() + 30);
    else return all;
    return all.filter((r) => { const d = new Date(r.date); return d >= now && d <= cutoff; });
  }, [recos, recoDatePreset]);

  // Combo suggestions
  const combos = useMemo(() => {
    if (!activeCampaign?.combo_mode || filteredRecos.length < 2) return [];
    const maxLegs = activeCampaign.combo_max_legs ?? 2;
    const minOdds = activeCampaign.combo_min_odds ?? 1.5;
    const maxOdds = activeCampaign.combo_max_odds ?? 10.0;
    const topN = activeCampaign.combo_top_n ?? 3;
    const pool = filteredRecos.slice(0, 12);
    function getCombinations<T>(arr: T[], k: number): T[][] {
      if (k === 1) return arr.map((x) => [x]);
      const res: T[][] = [];
      for (let i = 0; i <= arr.length - k; i++) getCombinations(arr.slice(i + 1), k - 1).forEach((c) => res.push([arr[i], ...c]));
      return res;
    }
    const result: { legs: CampaignRecommendation[]; combinedOdds: number; combinedProb: number }[] = [];
    for (let size = 2; size <= Math.min(maxLegs, pool.length); size++) {
      for (const combo of getCombinations(pool, size)) {
        const combinedOdds = combo.reduce((acc, r) => acc * r.best_odds, 1);
        if (combinedOdds >= minOdds && combinedOdds <= maxOdds) {
          const combinedProb = combo.reduce((acc, r) => acc * r.model_prob, 1);
          result.push({ legs: combo, combinedOdds, combinedProb });
        }
      }
    }
    result.sort((a, b) => b.combinedProb * b.combinedOdds - a.combinedProb * a.combinedOdds);
    return result.slice(0, topN);
  }, [filteredRecos, activeCampaign]);

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
        <PageHeader title="Campagne" description="Creez votre strategie automatisee" />

        <Card padding="lg" className="max-w-3xl">
          <h3 className="text-slate-900 font-semibold mb-4 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" />
            Nouvelle campagne
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nom de la campagne</label>
              <input type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`${inputCls} max-w-xs`}
                placeholder="ex: Strategie Alpha" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Bankroll (EUR)</label>
                <input type="number" value={form.initial_bankroll}
                  onChange={(e) => setForm({ ...form, initial_bankroll: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mise (%)</label>
                <input type="number" step="0.01" value={form.flat_stake}
                  onChange={(e) => setForm({ ...form, flat_stake: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Edge min</label>
                <input type="number" step="0.01" value={form.min_edge}
                  onChange={(e) => setForm({ ...form, min_edge: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Confiance min</label>
                <input type="number" step="0.05" value={form.min_model_prob}
                  onChange={(e) => setForm({ ...form, min_model_prob: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cote min</label>
                <input type="number" step="0.1" placeholder="vide = tout" value={form.min_odds ?? ""}
                  onChange={(e) => setForm({ ...form, min_odds: e.target.value ? Number(e.target.value) : null })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cote max</label>
                <input type="number" step="0.1" placeholder="vide = tout" value={form.max_odds ?? ""}
                  onChange={(e) => setForm({ ...form, max_odds: e.target.value ? Number(e.target.value) : null })}
                  className={inputCls} />
              </div>
            </div>

            {/* Combo mode */}
            <div className="pt-3 border-t border-slate-200">
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-3 cursor-pointer">
                <input type="checkbox" checked={form.combo_mode}
                  onChange={(e) => setForm({ ...form, combo_mode: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                Mode Combis
              </label>
              {form.combo_mode && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Max legs</label>
                    <input type="number" min={2} max={4} value={form.combo_max_legs}
                      onChange={(e) => setForm({ ...form, combo_max_legs: Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Cote min combo</label>
                    <input type="number" step="0.1" value={form.combo_min_odds}
                      onChange={(e) => setForm({ ...form, combo_min_odds: Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Cote max combo</label>
                    <input type="number" step="0.1" value={form.combo_max_odds}
                      onChange={(e) => setForm({ ...form, combo_max_odds: Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Top N par jour</label>
                    <input type="number" min={1} max={5} value={form.combo_top_n}
                      onChange={(e) => setForm({ ...form, combo_top_n: Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            {/* Target */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Objectif bankroll (optionnel)</label>
              <input type="number" placeholder="ex: 500" value={form.target_bankroll ?? ""}
                onChange={(e) => setForm({ ...form, target_bankroll: e.target.value ? Number(e.target.value) : null })}
                className={`${inputCls} w-40`} />
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <Button onClick={handleCreate} loading={creating} disabled={!form.name.trim()}
              icon={<Rocket size={16} />}>
              {creating ? "Creation..." : "Creer la campagne"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ----- ACTIVE CAMPAIGN DASHBOARD -----
  const outcomeLabel = (o: string) => o === "H" ? "Dom" : o === "D" ? "Nul" : "Ext";
  const outcomeBadgeVariant = (o: string) => o === "H" ? "blue" as const : o === "D" ? "amber" as const : "red" as const;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return (
    <div className="space-y-6">
      <PageHeader title="Campagne" description="Votre strategie automatisee" />

      {/* Campaign header bar */}
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Rocket size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-900 font-semibold">{activeCampaign.name}</span>
              <Badge variant={activeCampaign.status === "active" ? "emerald" : "slate"} size="xs">
                {activeCampaign.status === "active" ? "Active" : "Pause"}
              </Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Mise {(activeCampaign.flat_stake * 100).toFixed(0)}% · Edge min {(activeCampaign.min_edge * 100).toFixed(0)}%
              {activeCampaign.min_model_prob && ` · Confiance ${(activeCampaign.min_model_prob * 100).toFixed(0)}%`}
              {activeCampaign.target_bankroll && ` · Objectif ${activeCampaign.target_bankroll}EUR`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleTogglePause}
            icon={activeCampaign.status === "active" ? <Pause size={12} /> : <Play size={12} />}>
            {activeCampaign.status === "active" ? "Pause" : "Reprendre"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowConfig(!showConfig)}
            icon={<Settings size={12} />}>
            Config
          </Button>
        </div>
      </Card>

      {/* Config panel */}
      {showConfig && (
        <Card>
          <h3 className="text-slate-900 font-semibold mb-3 text-sm">Parametres de la strategie</h3>
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
        </Card>
      )}

      {/* Stats cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <LocalStatCard label="Bankroll actuelle" value={`${stats.current_bankroll.toFixed(0)}EUR`}
              icon={Wallet} color="text-amber-500" />
            <LocalStatCard label="Profit/Perte"
              value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}EUR`}
              icon={stats.total_pnl >= 0 ? TrendingUp : TrendingDown}
              color={stats.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"} />
            <LocalStatCard label="Taux de reussite"
              value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "—"}
              icon={Target} color="text-blue-600" />
            <LocalStatCard label="ROI"
              value={stats.total_staked > 0 ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "—"}
              icon={TrendingUp} color={stats.roi_pct >= 0 ? "text-emerald-600" : "text-red-500"} />
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
        <Card>
          <h3 className="text-slate-900 font-semibold mb-3">Evolution de la bankroll</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} />
                <Line type="monotone" dataKey="bankroll" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Recommendations */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-slate-900 font-semibold">Recommandations</h3>
              {recos && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {filteredRecos.length} affiché{filteredRecos.length > 1 ? "s" : ""} · {recos.recommendations.length} détecté{recos.recommendations.length > 1 ? "s" : ""} sur {recos.total_scanned} matchs
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => activeCampaign && loadRecommendations(activeCampaign.id)}
              loading={recsLoading} icon={<RefreshCw size={12} />}>
              Actualiser
            </Button>
          </div>
          {/* Date presets */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
            {(["auj", "48h", "72h", "7j", "1m", "tout"] as const).map((p) => (
              <button key={p} onClick={() => setRecoDatePreset(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  recoDatePreset === p ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {p === "auj" ? "Auj." : p === "tout" ? "Tout" : p}
              </button>
            ))}
          </div>
        </div>

        {recsLoading && !recos ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        ) : recos && filteredRecos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Aucune recommandation sur cette période. Élargissez la fenêtre ou ajustez vos paramètres.
          </div>
        ) : recos ? (
          <div className="divide-y divide-slate-100">
            {filteredRecos.map((reco, idx) => {
              const info = LEAGUE_INFO[reco.league];
              const fmtDate = reco.date.includes("T")
                ? new Date(reco.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : reco.date;
              const isAccepting = acceptingIdx === idx;

              return (
                <div key={`${reco.home_team}-${reco.away_team}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-semibold text-sm">{reco.home_team} vs {reco.away_team}</span>
                        <Badge variant={outcomeBadgeVariant(reco.outcome)} size="xs">
                          {outcomeLabel(reco.outcome)}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {info ? `${info.flag} ${info.name}` : reco.league} · {fmtDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <div className="text-amber-600 font-bold text-lg">{reco.best_odds.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">{reco.bookmaker}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600 font-bold text-sm">{(reco.model_prob * 100).toFixed(0)}%</div>
                        <div className="text-[10px] text-slate-400">modele</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600 font-bold text-sm">+{(reco.edge * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-slate-400">edge</div>
                      </div>
                      <div className="text-center bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
                        <div className="text-slate-900 font-bold text-sm">{reco.suggested_stake.toFixed(2)}EUR</div>
                        <div className="text-[10px] text-slate-400">mise</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button size="sm" onClick={() => handleAccept(reco, idx)} loading={isAccepting}
                        icon={<Check size={12} />}>
                        {isAccepting ? "..." : "Accepter"}
                      </Button>
                      <button onClick={() => handleSkip(idx)}
                        className="px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
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

      {/* Combo suggestions */}
      {activeCampaign.combo_mode && combos.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <Layers size={16} className="text-purple-500" />
            <div>
              <h3 className="text-slate-900 font-semibold">Combis suggérés</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {combos.length} combi{combos.length > 1 ? "s" : ""} · {activeCampaign.combo_max_legs} legs max · cotes {activeCampaign.combo_min_odds?.toFixed(1)}–{activeCampaign.combo_max_odds?.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {combos.map((combo, ci) => {
              const suggestedStake = recos ? round2(recos.current_bankroll * activeCampaign.flat_stake) : 0;
              return (
                <div key={ci} className="p-4 hover:bg-purple-50/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      {combo.legs.map((leg, li) => {
                        const info = LEAGUE_INFO[leg.league];
                        const fmtDate = leg.date.includes("T")
                          ? new Date(leg.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : leg.date;
                        return (
                          <div key={li} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-300 shrink-0 font-mono">{li + 1}.</span>
                            <span className="font-medium text-slate-800 truncate">{leg.home_team} vs {leg.away_team}</span>
                            <Badge variant={outcomeBadgeVariant(leg.outcome)} size="xs">
                              {outcomeLabel(leg.outcome)}
                            </Badge>
                            <span className="text-amber-600 font-semibold shrink-0">@ {leg.best_odds.toFixed(2)}</span>
                            <span className="text-slate-400 shrink-0">{info ? `${info.flag} ${info.name}` : leg.league} · {fmtDate}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <div className="text-purple-600 font-bold text-lg">{combo.combinedOdds.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">cote combi</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600 font-bold text-sm">{(combo.combinedProb * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-slate-400">prob</div>
                      </div>
                      <div className="text-center bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
                        <div className="text-slate-900 font-bold text-sm">{suggestedStake.toFixed(2)}EUR</div>
                        <div className="text-[10px] text-slate-400">mise</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bets list */}
      {bets.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <button onClick={() => setShowBets((v) => !v)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
            <div>
              <span className="text-slate-900 font-semibold">Mes paris</span>
              <span className="ml-2 text-xs text-slate-400">
                {bets.filter((b) => b.result === "pending").length} en attente · {bets.length} total
              </span>
            </div>
            {showBets ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>

          {showBets && (
            <div className="border-t border-slate-100">
              <div className="divide-y divide-slate-50">
                {bets.map((bet) => {
                  const isPending = bet.result === "pending";
                  const isUpdating = updatingBetId === bet.id;
                  const isDeleting = deletingBetId === bet.id;
                  const fmtDate = bet.match_date.includes("T")
                    ? new Date(bet.match_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
                    : bet.match_date.slice(0, 10);
                  const info = LEAGUE_INFO[bet.league];

                  return (
                    <div key={bet.id} className={`px-4 py-3 flex items-center gap-3 ${isDeleting ? "opacity-40" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400 shrink-0">{fmtDate}</span>
                          <span className="text-sm text-slate-900 font-medium truncate">
                            {bet.home_team} vs {bet.away_team}
                          </span>
                          <Badge variant={outcomeBadgeVariant(bet.outcome_bet)} size="xs">
                            {outcomeLabel(bet.outcome_bet)}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {info ? `${info.flag} ${info.name}` : bet.league} · cote {bet.odds_at_bet.toFixed(2)} · mise {bet.stake.toFixed(2)}EUR
                        </div>
                      </div>

                      {isPending ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isUpdating ? (
                            <Loader2 size={14} className="animate-spin text-slate-400" />
                          ) : (
                            <>
                              <button onClick={() => handleUpdateBet(bet.id, "won")}
                                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer">
                                Gagne
                              </button>
                              <button onClick={() => handleUpdateBet(bet.id, "lost")}
                                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-200 cursor-pointer">
                                Perdu
                              </button>
                              <button onClick={() => handleUpdateBet(bet.id, "void")}
                                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors border border-slate-200 cursor-pointer">
                                Annule
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={bet.result === "won" ? "emerald" : bet.result === "void" ? "slate" : "red"} size="sm">
                            {bet.result === "won" ? "Gagne" : bet.result === "void" ? "Annule" : "Perdu"}
                          </Badge>
                          {bet.profit_loss !== null && (
                            <span className={`text-sm font-bold ${bet.profit_loss >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {bet.profit_loss >= 0 ? "+" : ""}{bet.profit_loss.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}

                      <button onClick={() => handleDeleteBet(bet.id)} disabled={isDeleting || isUpdating}
                        className="shrink-0 p-1.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}

// ----- Sub-components (kept local as backup) -----

function LocalStatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, color = "text-slate-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-sm text-slate-900 font-medium">{value}</div>
    </div>
  );
}
