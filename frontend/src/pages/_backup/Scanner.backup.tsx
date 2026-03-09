import { useState, useMemo, useEffect } from "react";
import { Search, AlertTriangle, Filter, Calendar, Clock, HelpCircle, GripVertical, X, Eye, Star, ChevronDown, Trophy, RefreshCw } from "lucide-react";
import { aiScan } from "../services/api";
import TicketBuilder from "../components/TicketBuilder";
import AIScanMatchDetailPanel from "../components/AIScanMatchDetailPanel";
import type { ValueBet, Ticket, AIScanMatch } from "../types";
import { LEAGUE_INFO } from "../types";

const ALL_LEAGUE_CODES = Object.keys(LEAGUE_INFO);
const DIV1_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 1);
const DIV2_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 2);
const CUP_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 0);
const EUR_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === -1);
// Reverse lookup: API league name → LeagueInfo (for card display)
const LEAGUE_INFO_BY_NAME: Record<string, import("../types").LeagueInfo> = Object.fromEntries(
  Object.values(LEAGUE_INFO).map((v) => [v.name, v])
);

// Group leagues by country for the selector
const LEAGUES_BY_COUNTRY: { country: string; flag: string; leagues: { code: string; name: string; division: number }[] }[] = (() => {
  const map = new Map<string, { flag: string; leagues: { code: string; name: string; division: number }[] }>();
  for (const [code, info] of Object.entries(LEAGUE_INFO)) {
    if (!map.has(info.country)) map.set(info.country, { flag: info.flag, leagues: [] });
    map.get(info.country)!.leagues.push({ code, name: info.name, division: info.division });
  }
  for (const v of map.values()) v.leagues.sort((a, b) => a.division - b.division);
  return [...map.entries()].map(([country, v]) => ({ country, flag: v.flag, leagues: v.leagues }));
})();

type SortKey = "edge" | "date" | "league" | "prob";

function parseBetDate(raw: string): { dateStr: string; timeStr: string | null; hour: number | null } {
  if (raw.includes("T")) {
    const d = new Date(raw);
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { dateStr, timeStr, hour: d.getHours() };
  }
  return { dateStr: raw.slice(0, 10), timeStr: null, hour: null };
}

function Tip({ text }: { text: string }) {
  return (
    <span className="inline-block ml-1 cursor-help" title={text}>
      <HelpCircle size={11} className="text-gray-400 hover:text-gray-600 inline" />
    </span>
  );
}

export default function Scanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [sport, setSport] = useState<"football" | "tennis">("football");
  const [aiMatches, setAiMatches] = useState<AIScanMatch[]>([]);
  const [aiDuration, setAiDuration] = useState(0);

  // On mount: auto-load last cached scan silently
  useEffect(() => {
    handleAIScan(false, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticket builder
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicketIdx, setActiveTicketIdx] = useState(0);
  const [hiddenMatches, setHiddenMatches] = useState<Set<string>>(new Set());

  // Per-outcome bookmaker selection on cards
  const [cardBk, setCardBk] = useState<Record<string, string>>({});
  const [showLeagues, setShowLeagues] = useState(false);

  // Detail side panel
  const [detailMatch, setDetailMatch] = useState<{ am: AIScanMatch; home: string; away: string } | null>(null);

  // Filters
  const [searchTeam, setSearchTeam] = useState("");
  const [activeLeagues, setActiveLeagues] = useState<Set<string>>(new Set(ALL_LEAGUE_CODES));
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); });
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("prob");
  const [datePreset, setDatePreset] = useState<string>("48h");
  const [minEdge, setMinEdge] = useState<string>("");
  const [minOdds, setMinOdds] = useState<string>("");
  const [maxOdds, setMaxOdds] = useState<string>("");

  async function handleAIScan(forceRefresh = false, silent = false) {
    if (!silent) { setLoading(true); setError(""); }
    try {
      // Always scan all leagues → stable cache key, league selector = display filter only
      const timeframeMap: Record<string, string> = { today: "24h", "48h": "48h", "72h": "72h", week: "1w", month: "1m" };
      const data = await aiScan({
        sport,
        leagues: sport === "tennis" ? "ATP,WTA" : "",
        timeframe: timeframeMap[datePreset] || "48h",
        force: forceRefresh || undefined,
        cacheOnly: silent || undefined,
      });
      const matches = data.matches ?? [];
      if (matches.length > 0 || !silent) {
        setAiMatches(matches);
        setAiDuration(data.research_duration_seconds);
        setIsCached(data.cached);
        setCachedAt(data.cached_at);
        setHasScanned(matches.length > 0);
      }
    } catch (e) {
      if (!silent) setError((e as Error).message);
    }
    if (!silent) setLoading(false);
  }

  // Filtered + sorted AI matches
  const filteredAiMatches = useMemo(() => {
    let result = aiMatches.filter((am) => !hiddenMatches.has(
      am.sport === "football" ? `${am.home_team}_${am.away_team}` : `${am.player1}_${am.player2}`
    ));

    // League display filter (football only) — compare league names since API returns names not codes
    if (sport === "football" && activeLeagues.size < ALL_LEAGUE_CODES.length) {
      const activeNames = new Set(
        ALL_LEAGUE_CODES.filter((c) => activeLeagues.has(c)).map((c) => LEAGUE_INFO[c]?.name).filter(Boolean)
      );
      result = result.filter((am) => am.sport !== "football" || !am.league || activeNames.has(am.league));
    }

    if (searchTeam.trim()) {
      const q = searchTeam.toLowerCase();
      result = result.filter((am) => {
        const fields = [am.home_team, am.away_team, am.player1, am.player2, am.league].filter(Boolean);
        return fields.some((f) => f!.toLowerCase().includes(q));
      });
    }

    // Date filter
    if (dateFrom) result = result.filter((am) => !am.date || parseBetDate(am.date).dateStr >= dateFrom);
    if (dateTo) result = result.filter((am) => !am.date || parseBetDate(am.date).dateStr <= dateTo);

    // Time filter
    if (timeFrom) {
      const tf = Number(timeFrom.replace(":", ""));
      result = result.filter((am) => {
        if (!am.date) return true;
        const { hour } = parseBetDate(am.date);
        if (hour === null) return true;
        return hour * 100 + new Date(am.date).getMinutes() >= tf;
      });
    }
    if (timeTo) {
      const tt = Number(timeTo.replace(":", ""));
      result = result.filter((am) => {
        if (!am.date) return true;
        const { hour } = parseBetDate(am.date);
        if (hour === null) return true;
        return hour * 100 + new Date(am.date).getMinutes() <= tt;
      });
    }

    // Edge filter
    if (minEdge) {
      const minE = Number(minEdge) / 100;
      result = result.filter((am) => {
        const maxEdge = Math.max(...Object.values(am.edges ?? {}), 0);
        return maxEdge >= minE;
      });
    }

    // Odds filter
    if (minOdds || maxOdds) {
      const minO = minOdds ? Number(minOdds) : null;
      const maxO = maxOdds ? Number(maxOdds) : null;
      result = result.filter((am) => {
        const isFootball = am.sport === "football";
        const rawOdds = isFootball
          ? (am.odds?.["1x2"] as Record<string, unknown> | undefined)
          : (am.odds?.["winner"] as Record<string, unknown> | undefined);
        if (!rawOdds) return true;
        const keys = isFootball ? ["H", "D", "A"] : ["P1", "P2"];
        return keys.some((k) => {
          const val = rawOdds[k];
          let best = 0;
          if (val && typeof val === "object" && !Array.isArray(val)) {
            best = Math.max(...Object.values(val as Record<string, number>).map(Number).filter(Boolean));
          } else {
            best = Number(val || 0);
          }
          if (!best) return false;
          if (minO && best < minO) return false;
          if (maxO && best > maxO) return false;
          return true;
        });
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "prob": {
          const pa = Math.max(a.model_prob_home ?? 0, a.model_prob_draw ?? 0, a.model_prob_away ?? 0);
          const pb = Math.max(b.model_prob_home ?? 0, b.model_prob_draw ?? 0, b.model_prob_away ?? 0);
          return pb - pa;
        }
        case "edge": {
          const ea = Math.max(...Object.values(a.edges ?? {}), 0);
          const eb = Math.max(...Object.values(b.edges ?? {}), 0);
          return eb - ea;
        }
        case "league": return (a.league || "").localeCompare(b.league || "");
        case "date": return (a.date || "").localeCompare(b.date || "");
        default: return 0;
      }
    });

    return result;
  }, [aiMatches, searchTeam, activeLeagues, sport, dateFrom, dateTo, timeFrom, timeTo, sortBy, hiddenMatches, minEdge, minOdds, maxOdds]);

  function toggleLeague(code: string) {
    const next = new Set(activeLeagues);
    if (next.has(code)) next.delete(code); else next.add(code);
    setActiveLeagues(next);
  }
  function setLeagueGroup(codes: string[]) {
    const allActive = codes.every((c) => activeLeagues.has(c));
    const next = new Set(activeLeagues);
    if (allActive) codes.forEach((c) => next.delete(c));
    else codes.forEach((c) => next.add(c));
    setActiveLeagues(next);
  }
  function toggleAllLeagues() {
    if (activeLeagues.size === ALL_LEAGUE_CODES.length) setActiveLeagues(new Set());
    else setActiveLeagues(new Set(ALL_LEAGUE_CODES));
  }

  function applyDatePreset(preset: string) {
    setDatePreset(preset);
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const from = fmt(today);
    const add = (days: number) => { const d = new Date(today); d.setDate(d.getDate() + days); return fmt(d); };
    if (preset === "today") { setDateFrom(from); setDateTo(from); return; }
    if (preset === "48h") { setDateFrom(from); setDateTo(add(2)); return; }
    if (preset === "72h") { setDateFrom(from); setDateTo(add(3)); return; }
    if (preset === "week") { setDateFrom(from); setDateTo(add(7)); return; }
    if (preset === "month") { setDateFrom(from); setDateTo(add(30)); return; }
  }

  // AI match -> TicketLeg conversion
  function aiMatchToLeg(am: AIScanMatch, outcome: string): import("../types").TicketLeg | null {
    const isFootball = am.sport === "football";
    const home = isFootball ? (am.home_team || "") : (am.player1 || "");
    const away = isFootball ? (am.away_team || "") : (am.player2 || "");
    const rawOddsBase = isFootball
      ? (am.odds?.["1x2"] as Record<string, unknown> | undefined)
      : (am.odds?.["winner"] as Record<string, unknown> | undefined);

    function extractBkOdds(val: unknown): Record<string, number> {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const res: Record<string, number> = {};
        for (const [bk, o] of Object.entries(val as Record<string, unknown>)) {
          const n = Number(o); if (n > 0) res[bk] = n;
        }
        return res;
      }
      const n = Number(val);
      return n > 0 ? { "IA": n } : {};
    }

    const allBks = extractBkOdds(rawOddsBase?.[outcome]);
    const best = Object.entries(allBks).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const [bkName, odds] = best;

    return {
      id: `${home}_${away}_${outcome}`,
      home_team: home, away_team: away,
      league: am.league, date: am.date, outcome,
      odds, model_prob: odds > 0 ? 1 / odds : 0,
      bookmaker: bkName, all_odds: allBks,
    };
  }

  function isAiOutcomeInTicket(am: AIScanMatch, outcome: string): boolean {
    const isFootball = am.sport === "football";
    const home = isFootball ? (am.home_team || "") : (am.player1 || "");
    const away = isFootball ? (am.away_team || "") : (am.player2 || "");
    const id = `${home}_${away}_${outcome}`;
    return tickets.some((t) => t.legs.some((l) => l.id === id));
  }

  function toggleAiOutcomeInTicket(am: AIScanMatch, outcome: string) {
    const leg = aiMatchToLeg(am, outcome);
    if (!leg) return;
    setTickets((prev) => {
      let updated = [...prev];
      if (updated.length === 0) updated.push({ id: "ticket-1", name: "Ticket 1", legs: [], stake: 10, bookmaker: null });
      const idx = activeTicketIdx >= updated.length ? 0 : activeTicketIdx;
      const ticket = { ...updated[idx] };
      const prefix = `${leg.home_team}_${leg.away_team}_`;
      if (ticket.legs.some((l) => l.id === leg.id)) {
        ticket.legs = ticket.legs.filter((l) => l.id !== leg.id);
      } else {
        ticket.legs = ticket.legs.filter((l) => !l.id.startsWith(prefix));
        ticket.legs = [...ticket.legs, leg];
      }
      updated[idx] = ticket;
      return updated;
    });
  }

  function handleAIMatchDragStart(e: React.DragEvent, am: AIScanMatch, outcome: string) {
    const leg = aiMatchToLeg(am, outcome);
    if (!leg) return;
    const vb: ValueBet = {
      home_team: leg.home_team, away_team: leg.away_team,
      league: leg.league, date: leg.date, outcome,
      model_prob: leg.model_prob, implied_prob: leg.model_prob,
      edge: am.edges?.[outcome] ?? 0, best_odds: leg.odds, bookmaker: leg.bookmaker,
    };
    e.dataTransfer.setData("application/json", JSON.stringify(vb));
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Scanner</h2>
          <p className="text-gray-500 text-sm">Detecter les value bets sur les matchs a venir</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 text-sm font-semibold">
            <Filter size={14} />
            Filtres
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Trier par</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="prob">Meilleure probabilite</option>
              <option value="edge">Meilleur edge</option>
              <option value="date">Date (plus proche)</option>
              <option value="league">Ligue (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Row 1: Sport + Search + Period + Time + Edge + Odds */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Sport</label>
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setSport("football")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sport === "football" ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>Football</button>
                <button onClick={() => setSport("tennis")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sport === "tennis" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>Tennis</button>
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">{sport === "tennis" ? "Joueur" : "Equipe"}</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder={sport === "tennis" ? "Djokovic, Alcaraz, Sinner..." : "Arsenal, PSG, Real Madrid..."}
                  value={searchTeam} onChange={(e) => setSearchTeam(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
                <Calendar size={9} className="inline mr-0.5" />Periode
              </label>
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                {(["today", "48h", "72h", "week", "month"] as const).map((p) => (
                  <button key={p} onClick={() => applyDatePreset(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      datePreset === p ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}>{p === "today" ? "Auj." : p === "week" ? "7j" : p === "month" ? "1m" : p}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Du</label>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(""); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Au</label>
                <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(""); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" />
              </div>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
                  <Clock size={9} className="inline mr-0.5" />De
                </label>
                <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
                  <Clock size={9} className="inline mr-0.5" />A
                </label>
                <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" />
              </div>
            </div>
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Edge min %<Tip text="Ecart entre la probabilite estimee et la cote implicite. Ex : modele 48%, cote implique 40% = edge +8%." /></label>
              <input type="number" step="1" min="0" placeholder="%" value={minEdge} onChange={(e) => setMinEdge(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 w-16" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Cote min</label>
              <input type="number" step="0.1" min="1" placeholder="ex: 1.3" value={minOdds} onChange={(e) => setMinOdds(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 w-20" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Cote max</label>
              <input type="number" step="0.1" min="1" placeholder="ex: 3.0" value={maxOdds} onChange={(e) => setMaxOdds(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 w-20" />
            </div>
          </div>
        </div>

        {/* Row 2: Leagues/Circuits selector */}
        <div className="px-4 py-3">
          {sport === "tennis" ? (
            <div className="flex items-center gap-3">
              <Trophy size={14} className="text-yellow-500" />
              <span className="text-sm font-medium text-gray-700">Circuits</span>
              <span className="text-xs text-gray-400">L'IA recherche automatiquement les matchs ATP, WTA et Challengers du moment.</span>
            </div>
          ) : (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLeagues(!showLeagues)}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Trophy size={14} className="text-blue-500" />
                <span className="font-medium">Competitions</span>
                <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full font-semibold">
                  {activeLeagues.size}/{ALL_LEAGUE_CODES.length}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showLeagues ? "rotate-180" : ""}`} />
              </button>
              <div className="flex items-center gap-1.5">
                <button onClick={toggleAllLeagues} className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
                  {activeLeagues.size === ALL_LEAGUE_CODES.length ? "Aucun" : "Tous"}
                </button>
                <button onClick={() => setLeagueGroup(DIV1_CODES)} className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
                  {DIV1_CODES.every((c) => activeLeagues.has(c)) ? "- Div 1" : "+ Div 1"}
                </button>
                <button onClick={() => setLeagueGroup(DIV2_CODES)} className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
                  {DIV2_CODES.every((c) => activeLeagues.has(c)) ? "- Div 2" : "+ Div 2"}
                </button>
                <button onClick={() => setLeagueGroup(CUP_CODES)} className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold px-2 py-1 rounded-md hover:bg-amber-50 transition-colors">
                  {CUP_CODES.every((c) => activeLeagues.has(c)) ? "- Coupes" : "+ Coupes"}
                </button>
                <button onClick={() => setLeagueGroup(EUR_CODES)} className="text-[10px] text-purple-600 hover:text-purple-700 font-semibold px-2 py-1 rounded-md hover:bg-purple-50 transition-colors">
                  {EUR_CODES.every((c) => activeLeagues.has(c)) ? "- Europe" : "+ Europe"}
                </button>
              </div>
              {!showLeagues && activeLeagues.size < ALL_LEAGUE_CODES.length && activeLeagues.size > 0 && (
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {[...activeLeagues].slice(0, 6).map((code) => {
                    const info = LEAGUE_INFO[code];
                    return (
                      <span key={code} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        {info.flag} {info.name}
                        <X size={8} className="text-gray-400 hover:text-red-400 cursor-pointer" onClick={() => toggleLeague(code)} />
                      </span>
                    );
                  })}
                  {activeLeagues.size > 6 && <span className="text-[10px] text-gray-400">+{activeLeagues.size - 6}</span>}
                </div>
              )}
            </div>

            {showLeagues && (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {LEAGUES_BY_COUNTRY.map(({ country, flag, leagues }) => {
                  const countryCodes = leagues.map((l) => l.code);
                  const allActive = countryCodes.every((c) => activeLeagues.has(c));
                  const someActive = countryCodes.some((c) => activeLeagues.has(c));
                  return (
                    <div key={country}>
                      <button
                        onClick={() => {
                          const next = new Set(activeLeagues);
                          if (allActive) countryCodes.forEach((c) => next.delete(c));
                          else countryCodes.forEach((c) => next.add(c));
                          setActiveLeagues(next);
                        }}
                        className="flex items-center gap-2 mb-1.5 w-full group"
                      >
                        <span className="text-base">{flag}</span>
                        <span className="text-xs font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">{country}</span>
                        <div className={`w-3 h-3 rounded border ml-auto flex items-center justify-center transition-colors ${
                          allActive ? "bg-blue-600 border-blue-600" : someActive ? "bg-blue-200 border-blue-400" : "border-gray-300"
                        }`}>
                          {allActive && <span className="text-white text-[8px] font-bold">v</span>}
                          {someActive && !allActive && <span className="text-blue-600 text-[7px] font-bold">-</span>}
                        </div>
                      </button>
                      <div className="space-y-0.5 pl-6">
                        {leagues.map((l) => (
                          <button key={l.code} onClick={() => toggleLeague(l.code)}
                            className="flex items-center gap-2 w-full py-0.5 group/league">
                            <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                              activeLeagues.has(l.code) ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover/league:border-blue-400"
                            }`}>
                              {activeLeagues.has(l.code) && <span className="text-white text-[8px] font-bold">v</span>}
                            </div>
                            <span className={`text-[11px] transition-colors ${
                              activeLeagues.has(l.code) ? "text-gray-700 font-medium" : "text-gray-400 group-hover/league:text-gray-600"
                            }`}>{l.name}</span>
                            {l.division === 2 && <span className="text-[8px] text-gray-300 ml-auto">D2</span>}
                            {l.division === 0 && <span className="text-[8px] text-amber-400 ml-auto">Coupe</span>}
                            {l.division === -1 && <span className="text-[8px] text-purple-400 ml-auto">EUR</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
          )}
        </div>
      </div>

      {/* Scan button */}
      <div className="flex flex-wrap gap-4 items-center">
        <button onClick={() => handleAIScan()} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 font-medium shadow-sm">
          <Search size={16} />
          {loading ? "Scan en cours..." : "Scanner les matchs"}
        </button>
        {hasScanned && isCached && cachedAt && (
          <button onClick={() => handleAIScan(true)} disabled={loading}
            className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 bg-gray-100 text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm disabled:opacity-50"
            title="Forcer un nouveau scan live">
            <RefreshCw size={14} />
            Actualiser
          </button>
        )}
        {hasScanned && (
          <span className="text-sm text-gray-500 flex items-center gap-2">
            {isCached ? (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Cache {cachedAt && (() => {
                  const ago = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000);
                  return ago < 1 ? "< 1 min" : `${ago} min`;
                })()}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            )}
            <span>
              <span className="text-gray-900 font-semibold">{filteredAiMatches.length}</span> match{filteredAiMatches.length !== 1 ? "s" : ""} affiches
              {filteredAiMatches.length !== aiMatches.length ? (
                <span className="text-gray-400"> · {aiMatches.length} au total ({({ today: "auj.", "48h": "48h", "72h": "72h", week: "7j", month: "1m" } as Record<string,string>)[datePreset] ?? datePreset})</span>
              ) : aiMatches.length > 0 ? (
                <span className="text-gray-400"> detectes</span>
              ) : null}
            </span>
          </span>
        )}
        {aiDuration > 0 && !isCached && (
          <span className="text-xs text-gray-400">Recherche en {aiDuration.toFixed(0)}s</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Results + Ticket Builder */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-2">
          {hiddenMatches.size > 0 && (
            <button onClick={() => setHiddenMatches(new Set())} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
              <Eye size={12} /> Afficher les {hiddenMatches.size} matchs masques
            </button>
          )}

          {/* Cache header */}
          {filteredAiMatches.length > 0 && isCached && cachedAt && (
            <div className="flex items-center gap-3 text-xs text-gray-400 mb-1">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Cache du {new Date(cachedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                <span className="text-gray-300">-</span>
                <span className="capitalize">{sport}</span>
              </span>
            </div>
          )}

          {/* Match cards */}
          {filteredAiMatches.map((am, i) => {
            const isFootball = am.sport === "football";
            const home = isFootball ? (am.home_team || "?") : (am.player1 || "?");
            const away = isFootball ? (am.away_team || "?") : (am.player2 || "?");
            const info = isFootball ? (LEAGUE_INFO_BY_NAME[am.league] ?? null) : null;
            const { dateStr, timeStr } = am.date ? parseBetDate(am.date) : { dateStr: "", timeStr: null };
            const matchKey = `${home}_${away}`;
            const odds1x2 = am.odds?.["1x2"] as Record<string, unknown> | undefined;
            const oddsWinner = am.odds?.["winner"] as Record<string, unknown> | undefined;

            function extractBkOdds(val: unknown): Record<string, number> {
              if (val && typeof val === "object" && !Array.isArray(val)) {
                const res: Record<string, number> = {};
                for (const [bk, o] of Object.entries(val as Record<string, unknown>)) {
                  const n = Number(o); if (n > 0) res[bk] = n;
                }
                return res;
              }
              const n = Number(val);
              return n > 0 ? { "IA": n } : {};
            }

            const bkMaps: Record<string, Record<string, number>> = {};
            const rawOddsBase = isFootball ? odds1x2 : oddsWinner;
            const outcomeKeys = isFootball ? ["H", "D", "A"] : ["P1", "P2"];
            for (const k of outcomeKeys) bkMaps[k] = extractBkOdds(rawOddsBase?.[k]);

            function bestOddsForKey(k: string): { odds: number; bk: string } {
              const map = bkMaps[k] || {};
              let best = { odds: 0, bk: "" };
              for (const [bk, o] of Object.entries(map)) { if (o > best.odds) best = { odds: o, bk }; }
              return best;
            }

            const outcomes = isFootball
              ? (["H", "D", "A"] as const).map((k) => {
                  const { odds, bk } = bestOddsForKey(k);
                  return { key: k, label: k === "H" ? home : k === "D" ? "Nul" : away, odds, bk };
                })
              : (["P1", "P2"] as const).map((k) => {
                  const { odds, bk } = bestOddsForKey(k);
                  return { key: k, label: k === "P1" ? home : away, odds, bk };
                });

            const modelProbs: Record<string, number> = isFootball
              ? { H: am.model_prob_home ?? 0, D: am.model_prob_draw ?? 0, A: am.model_prob_away ?? 0 }
              : { P1: am.model_prob_home ?? 0, P2: am.model_prob_away ?? 0 };

            const bestOutcome = outcomes.filter(o => o.odds > 0).reduce(
              (best, o) => {
                const prob = modelProbs[o.key] || (o.odds > 0 ? 1/o.odds : 0);
                const bestProb = best ? (modelProbs[best.key] || (best.odds > 0 ? 1/best.odds : 0)) : 0;
                return prob > bestProb ? o : best;
              },
              null as typeof outcomes[0] | null
            );

            const maxPts = am.sport === "tennis" ? 18 : 20;
            const qualityTip = `Fiabilite des donnees : ${Math.round((am.data_score ?? 0) * maxPts)}/${maxPts} `
              + `(${am.data_quality === "green" ? "donnees completes" : am.data_quality === "yellow" ? "partielles" : "minimales"})`;

            return (
              <div key={i} className="bg-white rounded-xl border shadow-sm transition-all group overflow-hidden border-gray-200 hover:border-gray-300 hover:shadow">
                <div className="flex items-stretch">
                  {/* Left: match info + recommendation */}
                  <div
                    className="flex items-center gap-2.5 w-[38%] min-w-[260px] shrink-0 px-3 py-2.5 border-r border-gray-100 cursor-grab active:cursor-grabbing rounded-l-xl"
                    draggable={bestOutcome != null && bestOutcome.odds > 0}
                    onDragStart={(e) => bestOutcome && handleAIMatchDragStart(e, am, bestOutcome.key)}
                  >
                    <div className="text-gray-300 group-hover:text-gray-400 shrink-0"><GripVertical size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailMatch({ am, home, away }); }}
                          className="text-gray-900 font-semibold text-sm truncate hover:text-blue-600 text-left"
                          title="Voir les details"
                        >
                          {home} vs {away}
                        </button>
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          am.data_quality === "green" ? "bg-emerald-100 text-emerald-700" :
                          am.data_quality === "yellow" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-600"
                        }`} title={qualityTip}>
                          {Math.round((am.data_score ?? 0) * maxPts)}/{maxPts}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailMatch({ am, home, away }); }}
                          className="shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors p-0.5"
                          title="Voir les details"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {timeStr && <span className="text-gray-900 text-xs font-medium">{timeStr}</span>}
                        <span className="text-gray-400 text-xs">{dateStr}</span>
                        <span className="text-gray-400 text-[10px]">-</span>
                        <span className="text-gray-500 text-[10px] truncate">
                          {isFootball
                            ? (info ? `${info.flag} ${info.name}` : am.league)
                            : am.surface ? <span className="text-yellow-600">{am.surface}</span> : am.league
                          }
                        </span>
                      </div>
                    </div>
                    {bestOutcome && bestOutcome.odds > 0 && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Star size={12} className="text-amber-500 fill-amber-500" />
                            <span className="text-emerald-700 font-bold text-xl leading-none">
                              {((modelProbs[bestOutcome.key] || 1/bestOutcome.odds) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-[10px] font-semibold text-gray-700 mt-0.5 truncate max-w-[90px]">{bestOutcome.label}</div>
                          {am.edges?.[bestOutcome.key] != null && (
                            <div className={`text-[9px] font-bold mt-0.5 ${am.edges[bestOutcome.key] > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                              edge {am.edges[bestOutcome.key] > 0 ? "+" : ""}{(am.edges[bestOutcome.key] * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Odds columns */}
                  <div className={`grid flex-1 min-w-0 ${isFootball ? "grid-cols-3" : "grid-cols-2"}`}>
                    {outcomes.map(({ key, label, odds, bk }) => {
                      const inTicket = isAiOutcomeInTicket(am, key);
                      const noOdds = !odds;
                      const impliedPct = odds > 0 ? (1 / odds * 100).toFixed(0) : null;
                      const isFavorite = bestOutcome?.key === key;
                      const edge = am.edges?.[key] ?? null;
                      const modelProb = modelProbs[key] ?? null;
                      const modelProbPct = modelProb ? (modelProb * 100).toFixed(0) : null;

                      const allBks = bkMaps[key] || {};
                      const bkKey = `ai_${home}_${away}_${key}`;
                      const pickedBk = cardBk[bkKey];
                      const displayOdds = pickedBk && allBks[pickedBk] ? allBks[pickedBk] : odds;
                      const displayBk = pickedBk || bk;
                      const sortedBks = Object.entries(allBks).sort((a, b) => b[1] - a[1]);

                      return (
                        <div key={key}
                          className={`flex flex-col items-center text-center px-2 py-2.5 border-r border-gray-100 last:border-r-0 transition-all cursor-pointer ${
                            noOdds ? "opacity-30 cursor-not-allowed" :
                            inTicket ? "bg-blue-50 hover:bg-blue-100" :
                            isFavorite ? "bg-emerald-50/60 hover:bg-emerald-50" : "bg-red-50/30 hover:bg-red-50/50"
                          }`}
                          onClick={() => !noOdds && toggleAiOutcomeInTicket(am, key)}
                          draggable={!noOdds}
                          onDragStart={(e) => !noOdds && handleAIMatchDragStart(e, am, key)}
                        >
                          <div className={`text-xs font-semibold truncate w-full ${
                            inTicket ? "text-blue-600" : isFavorite ? "text-emerald-700" : "text-gray-700"
                          }`}>
                            {label}
                            {isFavorite && <Star size={9} className="inline ml-0.5 text-amber-500 fill-amber-500" />}
                          </div>
                          <div className={`text-lg font-bold mt-1 ${noOdds ? "text-gray-300" : "text-gray-900"}`}>
                            {noOdds ? "-" : displayOdds.toFixed(2)}
                          </div>
                          {!noOdds && sortedBks.length > 0 && (
                            <select
                              value={pickedBk || ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { e.stopPropagation(); setCardBk((prev) => ({ ...prev, [bkKey]: e.target.value || "" })); }}
                              className="mt-1 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-500 px-1 py-0.5 w-full max-w-[110px] cursor-pointer hover:border-gray-400 outline-none"
                            >
                              <option value="">{displayBk || "IA"}</option>
                              {sortedBks.map(([b, o]) => (
                                <option key={b} value={b}>{b} ({o.toFixed(2)})</option>
                              ))}
                            </select>
                          )}
                          {!noOdds && (modelProbPct || impliedPct) && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className={`text-[10px] font-semibold ${isFavorite ? "text-emerald-600" : "text-red-400"}`}>
                                {modelProbPct ?? impliedPct}%
                              </span>
                              {edge !== null && (
                                <span className="text-[9px] text-gray-400">
                                  {edge > 0 ? "+" : ""}{(edge * 100).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          )}
                          {inTicket && <span className="mt-0.5 text-[8px] text-blue-500 font-medium">Dans le ticket</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: hide button */}
                  <div className="shrink-0 flex flex-col items-center justify-center px-1.5 py-2">
                    <button
                      onClick={() => setHiddenMatches((prev) => new Set(prev).add(matchKey))}
                      className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Masquer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Bottom info row — football */}
                {isFootball && (am.form_home || am.form_away || am.position_home != null || am.lambda_home != null || am.context || am.motivation) && (
                  <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-3">
                    {(am.form_home || am.form_away) && (
                      <div className="flex items-center gap-1">
                        {am.form_home && (
                          <span className="text-[10px] font-mono font-bold tracking-wider">
                            {am.form_home.split("").map((c, j) => (
                              <span key={j} className={c === "V" ? "text-green-600" : c === "D" ? "text-red-500" : "text-gray-400"}>{c}</span>
                            ))}
                          </span>
                        )}
                        {am.form_home && am.form_away && <span className="text-gray-300 text-xs font-bold mx-0.5">|</span>}
                        {am.form_away && (
                          <span className="text-[10px] font-mono font-bold tracking-wider">
                            {am.form_away.split("").map((c, j) => (
                              <span key={j} className={c === "V" ? "text-green-600" : c === "D" ? "text-red-500" : "text-gray-400"}>{c}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                    {am.position_home != null && am.position_away != null && (
                      <span className="text-[10px] text-gray-500 font-medium">#{am.position_home} vs #{am.position_away}</span>
                    )}
                    {am.lambda_home != null && (
                      <span className="text-[9px] text-purple-500" title="Buts attendus par notre modele">&#955; {am.lambda_home} / {am.lambda_away}</span>
                    )}
                    {(am.context || am.motivation) && (
                      <span className="text-[10px] text-gray-400 italic truncate max-w-xs">
                        {am.context || am.motivation}
                      </span>
                    )}
                  </div>
                )}
                {/* Bottom info row — tennis */}
                {!isFootball && (am.ranking_p1 != null || am.form_home || am.p1_surface_record || am.p1_serve_pct != null || am.h2h_surface || am.h2h_last3?.length) && (
                  <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {/* Rankings */}
                    {am.ranking_p1 != null && am.ranking_p2 != null && (
                      <span className="text-[10px] text-gray-500 font-medium" title="Classement ATP/WTA">
                        #{am.ranking_p1} vs #{am.ranking_p2}
                      </span>
                    )}
                    {/* Forme */}
                    {(am.form_home || am.form_away) && (
                      <div className="flex items-center gap-1">
                        {am.form_home && (
                          <span className="text-[10px] font-mono font-bold tracking-wider" title={`Forme ${home}`}>
                            {am.form_home.split("").map((c, j) => (
                              <span key={j} className={c === "V" ? "text-green-600" : c === "D" ? "text-red-500" : "text-gray-400"}>{c}</span>
                            ))}
                          </span>
                        )}
                        {am.form_home && am.form_away && <span className="text-gray-300 text-xs font-bold mx-0.5">|</span>}
                        {am.form_away && (
                          <span className="text-[10px] font-mono font-bold tracking-wider" title={`Forme ${away}`}>
                            {am.form_away.split("").map((c, j) => (
                              <span key={j} className={c === "V" ? "text-green-600" : c === "D" ? "text-red-500" : "text-gray-400"}>{c}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Surface record */}
                    {(am.p1_surface_record || am.p2_surface_record) && (
                      <span className="text-[10px] text-yellow-700" title={`Bilan sur ${am.surface || "surface"}`}>
                        {am.surface && <span className="text-yellow-600 font-semibold">{am.surface} </span>}
                        {am.p1_surface_record || "?"} | {am.p2_surface_record || "?"}
                      </span>
                    )}
                    {/* Serve % */}
                    {am.p1_serve_pct != null && am.p2_serve_pct != null && (
                      <span className="text-[10px] text-blue-600" title="% de jeux de service gagnés">
                        Serv. {am.p1_serve_pct}% | {am.p2_serve_pct}%
                      </span>
                    )}
                    {/* Return % */}
                    {am.p1_return_pct != null && am.p2_return_pct != null && (
                      <span className="text-[10px] text-indigo-500" title="% de retours gagnés">
                        Ret. {am.p1_return_pct}% | {am.p2_return_pct}%
                      </span>
                    )}
                    {/* Aces avg */}
                    {am.p1_aces_avg != null && am.p2_aces_avg != null && (
                      <span className="text-[10px] text-gray-500" title="Aces par match en moyenne">
                        Aces {am.p1_aces_avg.toFixed(1)} | {am.p2_aces_avg.toFixed(1)}
                      </span>
                    )}
                    {/* Season record */}
                    {(am.p1_season_record || am.p2_season_record) && (
                      <span className="text-[10px] text-gray-400" title="Bilan saison">
                        Saison {am.p1_season_record || "?"} | {am.p2_season_record || "?"}
                      </span>
                    )}
                    {/* Rest days */}
                    {am.p1_rest_days != null && am.p2_rest_days != null && (
                      <span className="text-[10px] text-gray-400" title="Jours de repos">
                        Repos {am.p1_rest_days}j | {am.p2_rest_days}j
                      </span>
                    )}
                    {/* H2H on surface */}
                    {am.h2h_surface && (
                      <span className="text-[10px] text-orange-600 font-medium" title="H2H sur cette surface">
                        H2H {am.h2h_surface}
                      </span>
                    )}
                    {/* H2H last 3 */}
                    {am.h2h_last3?.length > 0 && (
                      <span className="text-[10px] text-gray-400" title="3 derniers H2H">
                        {am.h2h_last3.join(" · ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hasScanned && aiMatches.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-400">Aucun match trouve. Essayez d'autres filtres ou relancez un scan.</div>
          )}
          {filteredAiMatches.length === 0 && aiMatches.length > 0 && !loading && (
            <div className="text-center py-8 text-gray-400">
              Aucun match avec ces filtres.
              <span className="block mt-1 text-xs">({aiMatches.length} matchs en memoire)</span>
            </div>
          )}
          {!hasScanned && !loading && (
            <div className="text-center py-8 text-gray-400">
              Selectionnez vos filtres puis cliquez sur Scanner.
            </div>
          )}
        </div>

        {/* Ticket builder */}
        {filteredAiMatches.length > 0 && (
          <TicketBuilder
            tickets={tickets}
            activeTicketIdx={activeTicketIdx}
            onSetActiveTicket={setActiveTicketIdx}
            onAddTicket={() => {
              const n = tickets.length + 1;
              setTickets([...tickets, { id: `ticket-${n}`, name: `Ticket ${n}`, legs: [], stake: 10, bookmaker: null }]);
              setActiveTicketIdx(tickets.length);
            }}
            onRemoveTicket={(idx) => {
              const updated = tickets.filter((_, i) => i !== idx);
              setTickets(updated);
              if (activeTicketIdx >= updated.length) setActiveTicketIdx(Math.max(0, updated.length - 1));
            }}
            onRemoveLeg={(ticketIdx, legId) => {
              const updated = [...tickets];
              updated[ticketIdx] = { ...updated[ticketIdx], legs: updated[ticketIdx].legs.filter((l) => l.id !== legId) };
              setTickets(updated);
            }}
            onUpdateStake={(ticketIdx, stake) => {
              const updated = [...tickets];
              updated[ticketIdx] = { ...updated[ticketIdx], stake };
              setTickets(updated);
            }}
            onDropBet={(b) => {
              // Look up all_odds from aiMatches
              const am = aiMatches.find((m) =>
                (m.home_team === b.home_team || m.player1 === b.home_team) &&
                (m.away_team === b.away_team || m.player2 === b.away_team)
              );
              let allOdds: Record<string, number> = { [b.bookmaker]: b.best_odds };
              if (am) {
                const isFootball = am.sport === "football";
                const rawOddsBase = isFootball
                  ? (am.odds?.["1x2"] as Record<string, unknown> | undefined)
                  : (am.odds?.["winner"] as Record<string, unknown> | undefined);
                const val = rawOddsBase?.[b.outcome];
                if (val && typeof val === "object" && !Array.isArray(val)) {
                  const res: Record<string, number> = {};
                  for (const [bk, o] of Object.entries(val as Record<string, unknown>)) {
                    const n = Number(o); if (n > 0) res[bk] = n;
                  }
                  if (Object.keys(res).length > 0) allOdds = res;
                }
              }
              setTickets((prev) => {
                let updated = [...prev];
                if (updated.length === 0) updated.push({ id: "ticket-1", name: "Ticket 1", legs: [], stake: 10, bookmaker: null });
                const idx = activeTicketIdx >= updated.length ? 0 : activeTicketIdx;
                const ticket = { ...updated[idx] };
                const id = `${b.home_team}_${b.away_team}_${b.outcome}`;
                if (!ticket.legs.some((l) => l.id === id)) {
                  const prefix = `${b.home_team}_${b.away_team}_`;
                  ticket.legs = ticket.legs.filter((l) => !l.id.startsWith(prefix));
                  const leg: import("../types").TicketLeg = {
                    id, home_team: b.home_team, away_team: b.away_team,
                    league: b.league, date: b.date, outcome: b.outcome,
                    odds: b.best_odds, model_prob: b.model_prob, bookmaker: b.bookmaker, all_odds: allOdds,
                  };
                  ticket.legs = [...ticket.legs, leg];
                }
                updated[idx] = ticket;
                return updated;
              });
            }}
            onUpdateLegOutcome={(ticketIdx, legId, newOutcome) => {
              setTickets((prev) => {
                const updated = [...prev];
                const ticket = { ...updated[ticketIdx] };
                const leg = ticket.legs.find((l) => l.id === legId);
                if (!leg) return prev;
                const am = aiMatches.find((m) =>
                  (m.home_team === leg.home_team || m.player1 === leg.home_team) &&
                  (m.away_team === leg.away_team || m.player2 === leg.away_team)
                );
                if (!am) return prev;
                const newLeg = aiMatchToLeg(am, newOutcome);
                if (!newLeg) return prev;
                ticket.legs = ticket.legs.map((l) => l.id === legId ? newLeg : l);
                updated[ticketIdx] = ticket;
                return updated;
              });
            }}
            onUpdateBookmaker={(ticketIdx, bk) => {
              setTickets((prev) => {
                const updated = [...prev];
                const ticket = { ...updated[ticketIdx], bookmaker: bk };
                ticket.legs = ticket.legs.map((leg) => {
                  if (bk === null) {
                    const best = Object.entries(leg.all_odds).reduce(
                      (acc, [k, v]) => (v > acc.odds ? { odds: v, bookmaker: k } : acc),
                      { odds: 0, bookmaker: "" }
                    );
                    return { ...leg, odds: best.odds, bookmaker: best.bookmaker };
                  }
                  const bkOdds = leg.all_odds[bk];
                  if (bkOdds) return { ...leg, odds: bkOdds, bookmaker: bk };
                  return { ...leg, odds: 0, bookmaker: bk };
                });
                updated[ticketIdx] = ticket;
                return updated;
              });
            }}
          />
        )}
      </div>

      {/* AI Scan Match Detail Panel */}
      {detailMatch && (
        <AIScanMatchDetailPanel
          am={detailMatch.am}
          home={detailMatch.home}
          away={detailMatch.away}
          onClose={() => setDetailMatch(null)}
        />
      )}
    </div>
  );
}
