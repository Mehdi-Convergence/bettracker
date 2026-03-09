import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Plus, X, Loader2, Rocket,
  Search, Layers,
} from "lucide-react";
import {
  getPortfolioStats, getPortfolioBets, getCampaigns, createBet, aiScan,
} from "@/services/api";
import { LEAGUE_INFO } from "@/types";
import { PageHeader, Button, Alert, Badge } from "@/components/ui";
import type { PortfolioStats, Bet, Campaign, AIScanMatch } from "@/types";
import TeamAutocomplete from "@/components/TeamAutocomplete";

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

  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("manual");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addForm, setAddForm] = useState({
    home_team: "", away_team: "", league: "E0",
    match_date: new Date().toISOString().split("T")[0],
    outcome_bet: "H", odds_at_bet: "", stake: "",
  });

  const [isCombo, setIsCombo] = useState(false);
  const [comboLegs, setComboLegs] = useState<ComboLeg[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const [scanQuery, setScanQuery] = useState("");
  const [scanResults, setScanResults] = useState<AIScanMatch[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanLoaded, setScanLoaded] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadBets(); }, [activeTab]);

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

  async function handleScan() {
    setScanLoading(true);
    try { const res = await aiScan({ sport: "football", cacheOnly: true }); setScanResults(res.matches); setScanLoaded(true); }
    catch { setScanResults([]); }
    setScanLoading(false);
  }

  function filteredScanResults(): AIScanMatch[] {
    if (!scanQuery.trim()) return scanResults;
    const q = scanQuery.toLowerCase();
    return scanResults.filter((m) => (m.home_team ?? "").toLowerCase().includes(q) || (m.away_team ?? "").toLowerCase().includes(q));
  }

  function selectScanMatch(match: AIScanMatch, outcome: string) {
    const odds1x2 = (match.odds as Record<string, Record<string, Record<string, number>>>)?.["1x2"] ?? {};
    const outcomeOdds = odds1x2[outcome] ?? {};
    const bestOdds = Math.max(...Object.values(outcomeOdds).map(Number).filter(Boolean), 0);
    if (!bestOdds) return;
    if (isCombo) {
      setComboLegs((prev) => [...prev, {
        home_team: match.home_team ?? "", away_team: match.away_team ?? "",
        league: match.league, match_date: match.date.split("T")[0],
        outcome_bet: outcome, odds: bestOdds,
      }]);
    } else {
      setAddForm({
        home_team: match.home_team ?? "", away_team: match.away_team ?? "",
        league: match.league, match_date: match.date.split("T")[0],
        outcome_bet: outcome, odds_at_bet: String(bestOdds), stake: addForm.stake,
      });
      setFormMode("manual");
    }
  }

  function addComboLeg() {
    if (!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet) return;
    setComboLegs((prev) => [...prev, {
      home_team: addForm.home_team, away_team: addForm.away_team,
      league: addForm.league, match_date: addForm.match_date,
      outcome_bet: addForm.outcome_bet, odds: Number(addForm.odds_at_bet),
    }]);
    setAddForm((f) => ({ ...f, home_team: "", away_team: "", odds_at_bet: "" }));
  }

  function removeComboLeg(idx: number) { setComboLegs((prev) => prev.filter((_, i) => i !== idx)); }

  const combinedOdds = comboLegs.reduce((acc, leg) => acc * leg.odds, 1);

  async function handleAddBet() {
    setAdding(true); setAddError("");
    try {
      if (isCombo && comboLegs.length >= 2) {
        await createBet({
          home_team: comboLegs[0].home_team, away_team: comboLegs[0].away_team,
          league: comboLegs[0].league, match_date: comboLegs[0].match_date,
          outcome_bet: comboLegs[0].outcome_bet,
          odds_at_bet: Math.round(combinedOdds * 100) / 100,
          stake: Number(addForm.stake), is_combo: true,
          combo_legs: comboLegs.map((l) => ({
            home_team: l.home_team, away_team: l.away_team, league: l.league,
            match_date: l.match_date, outcome_bet: l.outcome_bet, odds: l.odds,
          })),
          campaign_id: selectedCampaignId,
        });
      } else {
        await createBet({
          home_team: addForm.home_team, away_team: addForm.away_team,
          league: addForm.league, match_date: addForm.match_date,
          outcome_bet: addForm.outcome_bet, odds_at_bet: Number(addForm.odds_at_bet),
          stake: Number(addForm.stake), is_combo: false, combo_legs: null,
          campaign_id: selectedCampaignId,
        });
      }
      setShowAddForm(false);
      setAddForm({ home_team: "", away_team: "", league: "E0", match_date: new Date().toISOString().split("T")[0], outcome_bet: "H", odds_at_bet: "", stake: "" });
      setComboLegs([]); setIsCombo(false); setSelectedCampaignId(null);
      loadData();
    } catch (e) { setAddError((e as Error).message); }
    setAdding(false);
  }

  const canSubmit = isCombo
    ? comboLegs.length >= 2 && !!addForm.stake
    : !!addForm.home_team && !!addForm.away_team && !!addForm.odds_at_bet && !!addForm.stake;

  const showDisciplineAlert = stats && stats.longest_losing_streak >= 3;
  const leagueOptions = Object.entries(LEAGUE_INFO);
  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Suivi consolide de tous vos paris"
        actions={
          <Button onClick={() => setShowAddForm(!showAddForm)}
            icon={showAddForm ? <X size={14} /> : <Plus size={14} />}>
            {showAddForm ? "Annuler" : "Ajouter un pari"}
          </Button>
        }
      />

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button onClick={() => setFormMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                formMode === "manual" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              <Plus size={12} /> Manuel
            </button>
            <button onClick={() => { setFormMode("search"); if (!scanLoaded) handleScan(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                formMode === "search" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              <Search size={12} /> Recherche
            </button>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={isCombo}
                  onChange={(e) => { setIsCombo(e.target.checked); if (!e.target.checked) setComboLegs([]); }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <Layers size={12} className="text-slate-500" />
                <span className="text-xs text-slate-600">Combi</span>
              </label>
            </div>
          </div>

          {/* Search mode */}
          {formMode === "search" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="text" value={scanQuery} onChange={(e) => setScanQuery(e.target.value)}
                  placeholder="Filtrer par equipe..."
                  className={`flex-1 ${inputCls}`} />
                <Button size="sm" onClick={handleScan} loading={scanLoading} icon={<Search size={12} />}>
                  Scanner
                </Button>
              </div>
              {scanLoaded && (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {filteredScanResults().length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">Aucun match trouve</p>
                  ) : (
                    filteredScanResults().map((m, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-900">{m.home_team} vs {m.away_team}</span>
                          <span className="text-[10px] text-slate-400">
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
                              <button key={o} onClick={() => selectScanMatch(m, o)}
                                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                                  isValue
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                }`}>
                                <div className="font-bold">{o === "H" ? "Dom" : o === "D" ? "Nul" : "Ext"}</div>
                                <div className="text-amber-600">{bestOdds.toFixed(2)}</div>
                                {isValue && <div className="text-[9px] text-emerald-600">+{(edge * 100).toFixed(1)}%</div>}
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
              <p className="text-xs font-medium text-slate-700">
                Legs ({comboLegs.length}) - Cote combinee: <span className="text-amber-600 font-bold">{combinedOdds.toFixed(2)}</span>
              </p>
              {comboLegs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2 bg-blue-50 rounded px-2.5 py-1.5 text-xs">
                  <span className="text-slate-700 flex-1">
                    {leg.home_team} vs {leg.away_team} -
                    <Badge variant={leg.outcome_bet === "H" ? "blue" : leg.outcome_bet === "D" ? "amber" : "red"} size="xs" className="ml-1">
                      {leg.outcome_bet}
                    </Badge>
                    <span className="ml-1 text-amber-600">@{leg.odds.toFixed(2)}</span>
                  </span>
                  <button onClick={() => removeComboLeg(i)} className="text-slate-400 hover:text-red-500 cursor-pointer">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual form fields */}
          {(formMode === "manual" || isCombo) && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <TeamAutocomplete label="Equipe dom." value={addForm.home_team}
                  onChange={(v) => setAddForm({ ...addForm, home_team: v })} placeholder="ex: Arsenal" />
                <TeamAutocomplete label="Equipe ext." value={addForm.away_team}
                  onChange={(v) => setAddForm({ ...addForm, away_team: v })} placeholder="ex: Chelsea" />
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Ligue</label>
                  <select value={addForm.league} onChange={(e) => setAddForm({ ...addForm, league: e.target.value })}
                    className={inputCls}>
                    {leagueOptions.map(([code, info]) => (
                      <option key={code} value={code}>{info.flag} {info.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Date</label>
                  <input type="date" value={addForm.match_date}
                    onChange={(e) => setAddForm({ ...addForm, match_date: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Pari</label>
                  <select value={addForm.outcome_bet}
                    onChange={(e) => setAddForm({ ...addForm, outcome_bet: e.target.value })}
                    className={inputCls}>
                    <option value="H">Dom (H)</option>
                    <option value="D">Nul (D)</option>
                    <option value="A">Ext (A)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Cote</label>
                  <input type="number" step="0.01" placeholder="ex: 1.85" value={addForm.odds_at_bet}
                    onChange={(e) => setAddForm({ ...addForm, odds_at_bet: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Mise (EUR)</label>
                  <input type="number" step="0.01" placeholder="ex: 10" value={addForm.stake}
                    onChange={(e) => setAddForm({ ...addForm, stake: e.target.value })}
                    className={inputCls} />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-400">Campagne :</label>
                  <select value={selectedCampaignId ?? ""}
                    onChange={(e) => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">Sans campagne</option>
                    {campaigns.filter((c) => c.status === "active").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {isCombo && (
                  <Button variant="secondary" size="sm" onClick={addComboLeg}
                    disabled={!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet}
                    icon={<Plus size={12} />}>
                    Ajouter leg
                  </Button>
                )}

                <Button size="sm" className="ml-auto" onClick={handleAddBet} loading={adding} disabled={!canSubmit}
                  icon={<Plus size={12} />}>
                  {adding ? "Envoi..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}

          {addError && <div className="text-xs text-red-600">{addError}</div>}
        </div>
      )}

      {/* Discipline alert */}
      {showDisciplineAlert && (
        <Alert variant="warning">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <div>
              <p className="text-amber-800 font-semibold">Attention - Serie de {stats!.longest_losing_streak} pertes</p>
              <p className="text-amber-600 text-sm">Prenez une pause, revisez votre strategie avant de continuer.</p>
            </div>
          </div>
        </Alert>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <LocalStatCard label="Profit/Perte"
            value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}EUR`}
            icon={stats.total_pnl >= 0 ? TrendingUp : TrendingDown}
            color={stats.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"} />
          <LocalStatCard label="Taux de reussite"
            value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "-"}
            icon={TrendingUp} color="text-blue-600" />
          <LocalStatCard label="ROI"
            value={stats.total_staked > 0 ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "-"}
            icon={TrendingUp} color={stats.roi_pct >= 0 ? "text-emerald-600" : "text-red-500"} />
          <LocalStatCard label="Paris total" value={`${stats.total_bets}`}
            icon={Layers} color="text-slate-700" />
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
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold mb-3">Historique des paris</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")} label="Tout" />
            <TabButton active={activeTab === "manual"} onClick={() => setActiveTab("manual")} label="Manuel" />
            {campaigns.map((c) => (
              <TabButton key={c.id} active={activeTab === c.id} onClick={() => setActiveTab(c.id)}
                label={c.name} icon={<Rocket size={10} />} />
            ))}
          </div>
        </div>

        {bets.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {activeTab === "all"
              ? "Aucun pari enregistre. Utilisez le Scanner, la Campagne, ou ajoutez manuellement."
              : "Aucun pari dans cette categorie."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
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
                  <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-slate-400 text-xs">{b.match_date.split("T")[0]}</td>
                    <td className="p-3 text-slate-900 text-xs">
                      {b.home_team} vs {b.away_team}
                      {b.league && LEAGUE_INFO[b.league] && (
                        <span className="text-slate-400 ml-1">{LEAGUE_INFO[b.league].flag}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={b.outcome_bet === "H" ? "blue" : b.outcome_bet === "D" ? "amber" : "red"} size="xs">
                        {b.outcome_bet}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-amber-600 font-medium">{b.odds_at_bet.toFixed(2)}</td>
                    <td className="p-3 text-right text-slate-700">{b.stake.toFixed(2)}EUR</td>
                    <td className="p-3 text-center">
                      <Badge variant={b.result === "won" ? "emerald" : b.result === "lost" ? "red" : "slate"} size="xs">
                        {b.result === "won" ? "Gagne" : b.result === "lost" ? "Perdu" : "En cours"}
                      </Badge>
                    </td>
                    <td className={`p-3 text-right font-semibold ${
                      b.profit_loss === null ? "text-slate-400" :
                      b.profit_loss >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {b.profit_loss !== null ? `${b.profit_loss >= 0 ? "+" : ""}${b.profit_loss.toFixed(2)}EUR` : "-"}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={b.campaign_id ? "blue" : "slate"} size="xs">
                        {b.campaign_id ? (
                          <span className="flex items-center gap-0.5 justify-center">
                            <Rocket size={8} />
                            {getCampaignName(b.campaign_id)}
                          </span>
                        ) : "Manuel"}
                      </Badge>
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

// ----- Sub-components (kept local as backup) -----

function TabButton({ active, onClick, label, icon }: {
  active: boolean; onClick: () => void; label: string; icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
        active ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
      }`}>
      {icon}
      {label}
    </button>
  );
}

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
