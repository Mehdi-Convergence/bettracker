import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Plus, X, Loader2, Rocket,
  Search, Layers,
} from "lucide-react";
import {
  getPortfolioStats, getPortfolioBets, getCampaigns, createBet, aiScan,
} from "../services/api";
import { LEAGUE_INFO } from "../types";
import type { PortfolioStats, Bet, Campaign, AIScanMatch } from "../types";
import TeamAutocomplete from "../components/TeamAutocomplete";

type TabFilter = "all" | "manual" | number;
type FormMode = "manual" | "search";

interface ComboLeg {
  home_team: string;
  away_team: string;
  league: string;
  match_date: string;
  outcome_bet: string;
  odds: number;
}

export default function Portfolio() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Tab filter
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("manual");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addForm, setAddForm] = useState({
    home_team: "",
    away_team: "",
    league: "E0",
    match_date: new Date().toISOString().split("T")[0],
    outcome_bet: "H",
    odds_at_bet: "",
    stake: "",
  });

  // Combo
  const [isCombo, setIsCombo] = useState(false);
  const [comboLegs, setComboLegs] = useState<ComboLeg[]>([]);

  // Campaign assignment
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  // Scanner search
  const [scanQuery, setScanQuery] = useState("");
  const [scanResults, setScanResults] = useState<AIScanMatch[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanLoaded, setScanLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadBets();
  }, [activeTab]);

  async function loadData() {
    getPortfolioStats().then(setStats).catch(() => {});
    getCampaigns().then(setCampaigns).catch(() => {});
    loadBets();
  }

  async function loadBets() {
    const campaignId = activeTab === "all" ? undefined : activeTab === "manual" ? 0 : activeTab;
    getPortfolioBets(campaignId).then(setBets).catch(() => {});
  }

  function getCampaignName(id: number | null): string {
    if (id === null) return "Manuel";
    const c = campaigns.find((c) => c.id === id);
    return c ? c.name : `Campagne #${id}`;
  }

  // Scanner search
  async function handleScan() {
    setScanLoading(true);
    try {
      const res = await aiScan({ sport: "football", cacheOnly: true });
      setScanResults(res.matches);
      setScanLoaded(true);
    } catch {
      setScanResults([]);
    }
    setScanLoading(false);
  }

  function filteredScanResults(): AIScanMatch[] {
    if (!scanQuery.trim()) return scanResults;
    const q = scanQuery.toLowerCase();
    return scanResults.filter(
      (m) => (m.home_team ?? "").toLowerCase().includes(q) || (m.away_team ?? "").toLowerCase().includes(q)
    );
  }

  function selectScanMatch(match: AIScanMatch, outcome: string) {
    // Get best odds for this outcome from the odds dict
    const odds1x2 = (match.odds as Record<string, Record<string, Record<string, number>>>)?.["1x2"] ?? {};
    const outcomeOdds = odds1x2[outcome] ?? {};
    const bestOdds = Math.max(...Object.values(outcomeOdds).map(Number).filter(Boolean), 0);
    if (!bestOdds) return;

    if (isCombo) {
      setComboLegs((prev) => [
        ...prev,
        {
          home_team: match.home_team ?? "",
          away_team: match.away_team ?? "",
          league: match.league,
          match_date: match.date.split("T")[0],
          outcome_bet: outcome,
          odds: bestOdds,
        },
      ]);
    } else {
      setAddForm({
        home_team: match.home_team ?? "",
        away_team: match.away_team ?? "",
        league: match.league,
        match_date: match.date.split("T")[0],
        outcome_bet: outcome,
        odds_at_bet: String(bestOdds),
        stake: addForm.stake,
      });
      setFormMode("manual");
    }
  }

  // Combo helpers
  function addComboLeg() {
    if (!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet) return;
    setComboLegs((prev) => [
      ...prev,
      {
        home_team: addForm.home_team,
        away_team: addForm.away_team,
        league: addForm.league,
        match_date: addForm.match_date,
        outcome_bet: addForm.outcome_bet,
        odds: Number(addForm.odds_at_bet),
      },
    ]);
    setAddForm((f) => ({ ...f, home_team: "", away_team: "", odds_at_bet: "" }));
  }

  function removeComboLeg(idx: number) {
    setComboLegs((prev) => prev.filter((_, i) => i !== idx));
  }

  const combinedOdds = comboLegs.reduce((acc, leg) => acc * leg.odds, 1);

  // Submit
  async function handleAddBet() {
    setAdding(true);
    setAddError("");
    try {
      if (isCombo && comboLegs.length >= 2) {
        await createBet({
          home_team: comboLegs[0].home_team,
          away_team: comboLegs[0].away_team,
          league: comboLegs[0].league,
          match_date: comboLegs[0].match_date,
          outcome_bet: comboLegs[0].outcome_bet,
          odds_at_bet: Math.round(combinedOdds * 100) / 100,
          stake: Number(addForm.stake),
          is_combo: true,
          combo_legs: comboLegs.map((l) => ({
            home_team: l.home_team,
            away_team: l.away_team,
            league: l.league,
            match_date: l.match_date,
            outcome_bet: l.outcome_bet,
            odds: l.odds,
          })),
          campaign_id: selectedCampaignId,
        });
      } else {
        await createBet({
          home_team: addForm.home_team,
          away_team: addForm.away_team,
          league: addForm.league,
          match_date: addForm.match_date,
          outcome_bet: addForm.outcome_bet,
          odds_at_bet: Number(addForm.odds_at_bet),
          stake: Number(addForm.stake),
          is_combo: false,
          combo_legs: null,
          campaign_id: selectedCampaignId,
        });
      }
      // Reset
      setShowAddForm(false);
      setAddForm({
        home_team: "", away_team: "", league: "E0",
        match_date: new Date().toISOString().split("T")[0],
        outcome_bet: "H", odds_at_bet: "", stake: "",
      });
      setComboLegs([]);
      setIsCombo(false);
      setSelectedCampaignId(null);
      loadData();
    } catch (e) {
      setAddError((e as Error).message);
    }
    setAdding(false);
  }

  const canSubmit = isCombo
    ? comboLegs.length >= 2 && !!addForm.stake
    : !!addForm.home_team && !!addForm.away_team && !!addForm.odds_at_bet && !!addForm.stake;

  const showDisciplineAlert = stats && stats.longest_losing_streak >= 3;
  const leagueOptions = Object.entries(LEAGUE_INFO);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Portfolio</h2>
          <p className="text-gray-500 text-sm">Suivi consolide de tous vos paris</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
        >
          {showAddForm ? <X size={14} /> : <Plus size={14} />}
          {showAddForm ? "Annuler" : "Ajouter un pari"}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                formMode === "manual"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Plus size={12} /> Manuel
            </button>
            <button
              onClick={() => { setFormMode("search"); if (!scanLoaded) handleScan(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                formMode === "search"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Search size={12} /> Recherche
            </button>

            <div className="ml-auto flex items-center gap-3">
              {/* Combo toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCombo}
                  onChange={(e) => { setIsCombo(e.target.checked); if (!e.target.checked) setComboLegs([]); }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Layers size={12} className="text-gray-500" />
                <span className="text-xs text-gray-600">Combi</span>
              </label>
            </div>
          </div>

          {/* Search mode */}
          {formMode === "search" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  placeholder="Filtrer par equipe..."
                  className="flex-1 bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={handleScan}
                  disabled={scanLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
                >
                  {scanLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Scanner
                </button>
              </div>
              {scanLoaded && (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {filteredScanResults().length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Aucun match trouve</p>
                  ) : (
                    filteredScanResults().map((m, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 rounded-lg p-2.5 border border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-900">
                            {m.home_team} vs {m.away_team}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {LEAGUE_INFO[m.league]?.flag} {LEAGUE_INFO[m.league]?.name || m.league} - {m.date.split("T")[0]}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          {(["H", "D", "A"] as const).map((o) => {
                            const odds1x2 = (m.odds as Record<string, Record<string, Record<string, number>>>)?.["1x2"] ?? {};
                            const outcomeOdds = odds1x2[o] ?? {};
                            const bestOdds = Math.max(...Object.values(outcomeOdds).map(Number).filter(Boolean), 0);
                            if (!bestOdds) return null;
                            const edge = (m.edges ?? {})[o] ?? 0;
                            const isValue = edge > 0;
                            return (
                              <button
                                key={o}
                                onClick={() => selectScanMatch(m, o)}
                                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                                  isValue
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                                }`}
                              >
                                <div className="font-bold">{o === "H" ? "Dom" : o === "D" ? "Nul" : "Ext"}</div>
                                <div className="text-amber-600">{bestOdds.toFixed(2)}</div>
                                {isValue && (
                                  <div className="text-[9px] text-emerald-600">+{(edge * 100).toFixed(1)}%</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Combo legs list */}
          {isCombo && comboLegs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-700">
                Legs ({comboLegs.length}) - Cote combinee: <span className="text-amber-600 font-bold">{combinedOdds.toFixed(2)}</span>
              </p>
              {comboLegs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2 bg-blue-50 rounded px-2.5 py-1.5 text-xs">
                  <span className="text-gray-700 flex-1">
                    {leg.home_team} vs {leg.away_team} -
                    <span className={`ml-1 px-1 py-0.5 rounded font-bold text-[10px] ${
                      leg.outcome_bet === "H" ? "bg-blue-100 text-blue-700" :
                      leg.outcome_bet === "D" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>{leg.outcome_bet}</span>
                    <span className="ml-1 text-amber-600">@{leg.odds.toFixed(2)}</span>
                  </span>
                  <button onClick={() => removeComboLeg(i)} className="text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual form fields (always visible for filling in details) */}
          {(formMode === "manual" || isCombo) && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <TeamAutocomplete
                  label="Equipe dom."
                  value={addForm.home_team}
                  onChange={(v) => setAddForm({ ...addForm, home_team: v })}
                  placeholder="ex: Arsenal"
                />
                <TeamAutocomplete
                  label="Equipe ext."
                  value={addForm.away_team}
                  onChange={(v) => setAddForm({ ...addForm, away_team: v })}
                  placeholder="ex: Chelsea"
                />
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Ligue</label>
                  <select
                    value={addForm.league}
                    onChange={(e) => setAddForm({ ...addForm, league: e.target.value })}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    {leagueOptions.map(([code, info]) => (
                      <option key={code} value={code}>{info.flag} {info.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={addForm.match_date}
                    onChange={(e) => setAddForm({ ...addForm, match_date: e.target.value })}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Pari</label>
                  <select
                    value={addForm.outcome_bet}
                    onChange={(e) => setAddForm({ ...addForm, outcome_bet: e.target.value })}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="H">Dom (H)</option>
                    <option value="D">Nul (D)</option>
                    <option value="A">Ext (A)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Cote</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ex: 1.85"
                    value={addForm.odds_at_bet}
                    onChange={(e) => setAddForm({ ...addForm, odds_at_bet: e.target.value })}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Mise (EUR)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ex: 10"
                    value={addForm.stake}
                    onChange={(e) => setAddForm({ ...addForm, stake: e.target.value })}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Campaign selector */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-400">Campagne :</label>
                  <select
                    value={selectedCampaignId ?? ""}
                    onChange={(e) => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}
                    className="bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Sans campagne</option>
                    {campaigns.filter((c) => c.status === "active").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {isCombo && (
                  <button
                    onClick={addComboLeg}
                    disabled={!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    <Plus size={12} /> Ajouter leg
                  </button>
                )}

                <button
                  onClick={handleAddBet}
                  disabled={adding || !canSubmit}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
                >
                  {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {adding ? "Envoi..." : "Enregistrer"}
                </button>
              </div>
            </div>
          )}

          {addError && (
            <div className="text-xs text-red-600">{addError}</div>
          )}
        </div>
      )}

      {/* Discipline alert */}
      {showDisciplineAlert && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-500" size={20} />
          <div>
            <p className="text-amber-800 font-semibold">Attention - Serie de {stats!.longest_losing_streak} pertes</p>
            <p className="text-amber-600 text-sm">Prenez une pause, revisez votre strategie avant de continuer.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Profit/Perte"
            value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}EUR`}
            icon={stats.total_pnl >= 0 ? TrendingUp : TrendingDown}
            color={stats.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"}
          />
          <StatCard
            label="Taux de reussite"
            value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "-"}
            icon={TrendingUp}
            color="text-blue-600"
          />
          <StatCard
            label="ROI"
            value={stats.total_staked > 0 ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "-"}
            icon={TrendingUp}
            color={stats.roi_pct >= 0 ? "text-emerald-600" : "text-red-500"}
          />
          <StatCard
            label="Paris total"
            value={`${stats.total_bets}`}
            icon={Layers}
            color="text-gray-700"
          />
        </div>
      )}

      {/* Mini stats */}
      {stats && (stats.won > 0 || stats.lost > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat label="En attente" value={`${stats.pending_bets}`} />
          <MiniStat label="Gagnes" value={`${stats.won}`} color="text-emerald-600" />
          <MiniStat label="Perdus" value={`${stats.lost}`} color="text-red-500" />
          <MiniStat label="Total mise" value={`${stats.total_staked.toFixed(0)}EUR`} />
        </div>
      )}

      {/* Bets table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-gray-900 font-semibold mb-3">Historique des paris</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")} label="Tout" />
            <TabButton active={activeTab === "manual"} onClick={() => setActiveTab("manual")} label="Manuel" />
            {campaigns.map((c) => (
              <TabButton
                key={c.id}
                active={activeTab === c.id}
                onClick={() => setActiveTab(c.id)}
                label={c.name}
                icon={<Rocket size={10} />}
              />
            ))}
          </div>
        </div>

        {bets.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {activeTab === "all"
              ? "Aucun pari enregistre. Utilisez le Scanner, la Campagne, ou ajoutez manuellement."
              : "Aucun pari dans cette categorie."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Match</th>
                  <th className="p-3 font-medium">Pari</th>
                  <th className="p-3 text-right font-medium">Cote</th>
                  <th className="p-3 text-right font-medium">Mise</th>
                  <th className="p-3 text-center font-medium">Statut</th>
                  <th className="p-3 text-right font-medium">P/L</th>
                  <th className="p-3 text-center font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-400 text-xs">{b.match_date.split("T")[0]}</td>
                    <td className="p-3 text-gray-900 text-xs">
                      {b.home_team} vs {b.away_team}
                      {b.league && LEAGUE_INFO[b.league] && (
                        <span className="text-gray-400 ml-1">{LEAGUE_INFO[b.league].flag}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        b.outcome_bet === "H" ? "bg-blue-100 text-blue-700" :
                        b.outcome_bet === "D" ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {b.outcome_bet}
                      </span>
                    </td>
                    <td className="p-3 text-right text-amber-600 font-medium">{b.odds_at_bet.toFixed(2)}</td>
                    <td className="p-3 text-right text-gray-700">{b.stake.toFixed(2)}EUR</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        b.result === "won" ? "bg-emerald-100 text-emerald-700" :
                        b.result === "lost" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {b.result === "won" ? "Gagne" : b.result === "lost" ? "Perdu" : "En cours"}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-semibold ${
                      b.profit_loss === null ? "text-gray-400" :
                      b.profit_loss >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {b.profit_loss !== null ? `${b.profit_loss >= 0 ? "+" : ""}${b.profit_loss.toFixed(2)}EUR` : "-"}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        b.campaign_id
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {b.campaign_id ? (
                          <span className="flex items-center gap-0.5 justify-center">
                            <Rocket size={8} />
                            {getCampaignName(b.campaign_id)}
                          </span>
                        ) : "Manuel"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Sub-components -----

function TabButton({ active, onClick, label, icon }: {
  active: boolean; onClick: () => void; label: string; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-blue-500 text-white"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

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
