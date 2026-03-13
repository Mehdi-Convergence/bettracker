import { useState, useMemo, useEffect } from "react";
import {
  Search, AlertTriangle, Filter, Calendar, Clock, HelpCircle,
  X, Eye, Star, ChevronDown, Trophy, RefreshCw,
  ScanSearch, TrendingUp, Shield, CheckCircle2,
} from "lucide-react";
import { aiScan, pmuScan } from "@/services/api";
import TicketBuilder from "@/components/TicketBuilder";
import AIScanMatchDetailPanel from "@/components/AIScanMatchDetailPanel";
import PMURaceCard from "@/components/PMURaceCard";
import PMURaceDetailPanel from "@/components/PMURaceDetailPanel";
import type { ValueBet, Ticket, AIScanMatch, PMURaceCard as PMURaceCardType } from "@/types";
import { LEAGUE_INFO } from "@/types";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { scannerTour } from "@/tours/index";

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const ALL_LEAGUE_CODES = Object.keys(LEAGUE_INFO);
const DIV1_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 1);
const DIV2_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 2);
const CUP_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === 0);
const EUR_CODES = ALL_LEAGUE_CODES.filter((c) => LEAGUE_INFO[c].division === -1);

/* ── Tennis circuits (static, like LEAGUE_INFO for football) ── */
interface TennisCircuit {
  code: string;
  name: string;
  emoji: string;
  patterns: string[];
  knownTournaments: string[];
}

const TENNIS_CIRCUITS: TennisCircuit[] = [
  {
    code: "GS", name: "Grand Chelem", emoji: "🏆",
    patterns: ["australian open", "roland garros", "french open", "wimbledon", "us open"],
    knownTournaments: ["Australian Open", "Roland Garros", "Wimbledon", "US Open"],
  },
  {
    code: "ATP", name: "ATP", emoji: "🎾",
    patterns: ["atp"],
    knownTournaments: [
      "ATP Indian Wells", "ATP Miami Open", "ATP Monte Carlo", "ATP Madrid Open",
      "ATP Italian Open", "ATP Canadian Open", "ATP Cincinnati", "ATP Shanghai",
      "ATP Paris Masters", "ATP Barcelona", "ATP Halle", "ATP Queen's Club",
      "ATP Hamburg", "ATP Washington", "ATP Beijing", "ATP Vienna",
      "ATP Basel", "ATP Brisbane", "ATP Adelaide", "ATP Auckland",
      "ATP Doha", "ATP Dubai", "ATP Marseille", "ATP Rotterdam",
      "ATP Rio de Janeiro", "ATP Buenos Aires", "ATP Acapulco",
      "ATP Lyon", "ATP Geneva", "ATP Stuttgart", "ATP Eastbourne",
      "ATP Atlanta", "ATP Los Cabos", "ATP Umag", "ATP Gstaad",
      "ATP Kitzbuhel", "ATP Winston-Salem", "ATP Chengdu", "ATP Zhuhai",
      "ATP Tokyo", "ATP Stockholm", "ATP Antwerp", "ATP Moscow",
      "ATP St. Petersburg", "ATP Metz", "ATP Sofia", "ATP Astana",
      "ATP Florence", "ATP Naples", "ATP Tel Aviv", "ATP Nitto ATP Finals",
    ],
  },
  {
    code: "WTA", name: "WTA", emoji: "🎾",
    patterns: ["wta"],
    knownTournaments: [
      "WTA Indian Wells", "WTA Miami Open", "WTA Madrid Open", "WTA Italian Open",
      "WTA Canadian Open", "WTA Cincinnati", "WTA Beijing", "WTA Wuhan",
      "WTA Dubai", "WTA Doha", "WTA Stuttgart", "WTA Rome",
      "WTA San Diego", "WTA Guadalajara", "WTA Zhengzhou", "WTA Tokyo",
      "WTA Brisbane", "WTA Adelaide", "WTA Hobart", "WTA Auckland",
      "WTA Lyon", "WTA Monterrey", "WTA Bogota", "WTA Charleston",
      "WTA Istanbul", "WTA Strasbourg", "WTA Nottingham", "WTA Birmingham",
      "WTA Eastbourne", "WTA Bad Homburg", "WTA Budapest", "WTA Palermo",
      "WTA Prague", "WTA Lausanne", "WTA San Jose", "WTA Washington",
      "WTA Cleveland", "WTA Granby", "WTA Chicago", "WTA Portoroz",
      "WTA Ostrava", "WTA Moscow", "WTA Cluj-Napoca", "WTA Tenerife",
      "WTA Courmayeur", "WTA Linz", "WTA Transylvania", "WTA WTA Finals",
    ],
  },
  {
    code: "CHALLENGER", name: "Challengers", emoji: "🔸",
    patterns: ["challenger"],
    knownTournaments: [],
  },
  {
    code: "ITF", name: "ITF", emoji: "🔹",
    patterns: ["itf"],
    knownTournaments: [],
  },
];
const LEAGUE_INFO_BY_NAME: Record<string, import("@/types").LeagueInfo> = Object.fromEntries(
  Object.values(LEAGUE_INFO).map((v) => [v.name, v])
);

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

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

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
      <HelpCircle size={11} className="text-[#8a919e] hover:text-[#111318] inline" />
    </span>
  );
}

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


/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

export default function Scanner() {
  const { showTour, completeTour } = useTour("scanner");

  /* ── State ── */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [sports, setSports] = useState<Set<"football" | "tennis" | "nba" | "rugby" | "mlb" | "pmu">>(new Set(["football"]));

  function toggleSport(s: "football" | "tennis" | "nba" | "rugby" | "mlb" | "pmu") {
    setSports(prev => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s); // toujours au moins 1 sport actif
      } else {
        next.add(s);
      }
      return next;
    });
  }
  const [aiMatches, setAiMatches] = useState<AIScanMatch[]>([]);
  const [aiDuration, setAiDuration] = useState(0);

  // PMU state
  const [pmuRaces, setPmuRaces] = useState<PMURaceCardType[]>([]);
  const [pmuLoading, setPmuLoading] = useState(false);
  const [pmuExpandedRace, setPmuExpandedRace] = useState<string | null>(null);
  const [pmuDetailRace, setPmuDetailRace] = useState<{ race: PMURaceCardType; runnerIndex: number } | null>(null);
  const [pmuRaceTypeFilter, setPmuRaceTypeFilter] = useState<string>("all");
  const [pmuHasScanned, setPmuHasScanned] = useState(false);

  // Auto-load cached scan on mount
  useEffect(() => {
    handleAIScan(false, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tickets
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
  const [excludedTournaments, setExcludedTournaments] = useState<Set<string>>(new Set());
  const [showCircuits, setShowCircuits] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); });
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("prob");
  const [datePreset, setDatePreset] = useState<string>("48h");
  const [minEdge, setMinEdge] = useState<string>("");
  const [minOdds, setMinOdds] = useState<string>("");
  const [maxOdds, setMaxOdds] = useState<string>("");
  // New filters
  const [hideInTicket, setHideInTicket] = useState(false);
  const [minDataScore] = useState<string>("");
  const [valueOnlyFilter, setValueOnlyFilter] = useState(false);
  const [nbaConference, setNbaConference] = useState<"all" | "est" | "ouest">("all");

  /* ── Scan ── */
  async function handleAIScan(forceRefresh = false, silent = false) {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const timeframeMap: Record<string, string> = { today: "24h", "48h": "48h", "72h": "72h", week: "1w" };
      // Exclure PMU du scan normal (PMU a son propre endpoint)
      const sportList = [...sports].filter(s => s !== "pmu");
      if (sportList.length === 0) {
        if (!silent) setLoading(false);
        return;
      }
      const results = await Promise.all(
        sportList.map(s => aiScan({
          sport: s,
          leagues: s === "tennis" ? "ATP,WTA" : s === "nba" ? "NBA" : s === "rugby" ? "Rugby" : s === "mlb" ? "MLB" : "",
          timeframe: timeframeMap[datePreset] || "48h",
          force: forceRefresh || undefined,
          cacheOnly: silent || undefined,
        }))
      );
      const matches = results.flatMap(d => d.matches ?? []);
      const first = results[0];
      if (matches.length > 0 || !silent) {
        setAiMatches(matches);
        setAiDuration(first.research_duration_seconds);
        setIsCached(first.cached);
        setCachedAt(first.cached_at);
        setHasScanned(matches.length > 0);
      }
    } catch (e) {
      if (!silent) setError((e as Error).message);
    }
    if (!silent) setLoading(false);
  }

  async function handlePMUScan(forceRefresh = false) {
    setPmuLoading(true);
    setError("");
    try {
      const data = await pmuScan(forceRefresh || undefined);
      setPmuRaces(data.races ?? []);
      setPmuHasScanned(true);
    } catch (e) {
      setError((e as Error).message);
    }
    setPmuLoading(false);
  }

  /* ── Filtered + sorted AI matches ── */
  const filteredAiMatches = useMemo(() => {
    let result = aiMatches.filter((am) => !hiddenMatches.has(
      am.sport === "tennis" ? `${am.player1}_${am.player2}` : `${am.home_team}_${am.away_team}`
    ));


    // League display filter (football only)
    if (sports.has("football") && activeLeagues.size < ALL_LEAGUE_CODES.length) {
      const activeNames = new Set(
        ALL_LEAGUE_CODES.filter((c) => activeLeagues.has(c)).map((c) => LEAGUE_INFO[c]?.name).filter(Boolean)
      );
      result = result.filter((am) => am.sport !== "football" || !am.league || activeNames.has(am.league));
    }

    // Circuit/tournament filter (tennis only)
    if (sports.has("tennis") && excludedTournaments.size > 0) {
      result = result.filter((am) => {
        if (am.sport !== "tennis") return true;
        return !excludedTournaments.has(am.league || "");
      });
    }

    // NBA conference filter
    if (sports.has("nba") && nbaConference !== "all") {
      const NBA_EAST = new Set(["Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls","Cleveland Cavaliers","Detroit Pistons","Indiana Pacers","Miami Heat","Milwaukee Bucks","New York Knicks","Orlando Magic","Philadelphia 76ers","Toronto Raptors","Washington Wizards"]);
      const NBA_WEST = new Set(["Dallas Mavericks","Denver Nuggets","Golden State Warriors","Houston Rockets","LA Clippers","Los Angeles Lakers","Memphis Grizzlies","Minnesota Timberwolves","New Orleans Pelicans","Oklahoma City Thunder","Phoenix Suns","Portland Trail Blazers","Sacramento Kings","San Antonio Spurs","Utah Jazz"]);
      result = result.filter((am) => {
        if (am.sport !== "nba") return true;
        const conf = nbaConference === "est" ? NBA_EAST : NBA_WEST;
        return conf.has(am.home_team || "") || conf.has(am.away_team || "");
      });
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

    // Value bets only filter
    if (valueOnlyFilter) {
      result = result.filter((am) => {
        const maxEdge = Math.max(...Object.values(am.edges ?? {}), 0);
        return maxEdge > 0;
      });
    }

    // Min data score filter
    if (minDataScore) {
      const minD = Number(minDataScore);
      result = result.filter((am) => {
        const maxPts = am.sport === "tennis" ? 18 : 20;
        return (am.data_score ?? 0) * maxPts >= minD;
      });
    }

    // Hide in-ticket filter
    if (hideInTicket) {
      result = result.filter((am) => {
        const isFootball = am.sport === "football";
        const home = isFootball ? (am.home_team || "") : (am.player1 || "");
        const away = isFootball ? (am.away_team || "") : (am.player2 || "");
        const prefix = `${home}_${away}_`;
        return !tickets.some((t) => t.legs.some((l) => l.id.startsWith(prefix)));
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
  }, [aiMatches, searchTeam, activeLeagues, excludedTournaments, sports, dateFrom, dateTo, timeFrom, timeTo, sortBy, hiddenMatches, minEdge, minOdds, maxOdds, valueOnlyFilter, minDataScore, hideInTicket, tickets]);

  /* ── League management ── */
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

  /* ── Tennis circuit grouping (static base + dynamic from matches) ── */
  const tennisByCircuit = useMemo(() => {
    // Collect tournament names actually present in scan results
    const scannedTournaments = new Set<string>();
    for (const am of aiMatches) {
      if (am.sport === "tennis" && am.league) scannedTournaments.add(am.league);
    }

    const groups: { code: string; name: string; emoji: string; tournaments: string[]; hasMatches: Set<string> }[] = [];
    const coveredTournaments = new Set<string>();

    for (const c of TENNIS_CIRCUITS) {
      // Start with known tournaments
      const tournamentSet = new Set(c.knownTournaments);
      // Add any scanned tournaments matching this circuit's patterns
      for (const t of scannedTournaments) {
        if (c.patterns.some((p) => t.toLowerCase().includes(p))) {
          tournamentSet.add(t);
          coveredTournaments.add(t);
        }
      }
      // For circuits with known tournaments, always show
      // For empty circuits (Challengers/ITF) only show if matches exist
      if (tournamentSet.size > 0) {
        const hasMatches = new Set([...tournamentSet].filter((t) => scannedTournaments.has(t)));
        groups.push({ code: c.code, name: c.name, emoji: c.emoji, tournaments: [...tournamentSet].sort(), hasMatches });
      }
    }

    // Any unknown tournaments
    const unknowns = [...scannedTournaments].filter((t) => !coveredTournaments.has(t));
    if (unknowns.length > 0) {
      groups.push({ code: "OTHER", name: "Autres", emoji: "🎾", tournaments: unknowns.sort(), hasMatches: new Set(unknowns) });
    }

    return groups;
  }, [aiMatches]);

  const allTennisNames = useMemo(() => {
    return tennisByCircuit.flatMap((g) => g.tournaments);
  }, [tennisByCircuit]);

  const activeTennisCount = allTennisNames.length - excludedTournaments.size;

  function toggleTournament(name: string) {
    const next = new Set(excludedTournaments);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExcludedTournaments(next);
  }
  function toggleCircuitGroup(tournaments: string[]) {
    const allExcluded = tournaments.every((t) => excludedTournaments.has(t));
    const next = new Set(excludedTournaments);
    if (allExcluded) tournaments.forEach((t) => next.delete(t));
    else tournaments.forEach((t) => next.add(t));
    setExcludedTournaments(next);
  }
  function toggleAllTournaments() {
    if (excludedTournaments.size === 0) setExcludedTournaments(new Set(allTennisNames));
    else setExcludedTournaments(new Set());
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
  }

  /* ── AI match -> TicketLeg conversion ── */
  function aiMatchToLeg(am: AIScanMatch, outcome: string): import("@/types").TicketLeg | null {
    const isTennisSport = am.sport === "tennis";
    const isFootballOrRugby = am.sport === "football" || am.sport === "rugby";
    const home = isTennisSport ? (am.player1 || "") : (am.home_team || "");
    const away = isTennisSport ? (am.player2 || "") : (am.away_team || "");
    const rawOddsBase = isFootballOrRugby
      ? (am.odds?.["1x2"] as Record<string, unknown> | undefined)
      : (am.odds?.["winner"] as Record<string, unknown> | undefined);
    // MLB uses "winner" market with Home/Away outcomes — already handled above

    const allBks = extractBkOdds(rawOddsBase?.[outcome]);
    const best = Object.entries(allBks).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const [bkName, odds] = best;

    const modelProbs: Record<string, number | null> = {
      H: am.model_prob_home, D: am.model_prob_draw, A: am.model_prob_away,
      P1: am.model_prob_home, P2: am.model_prob_away,
      Home: am.model_prob_home, Away: am.model_prob_away,
    };
    const mlProb = modelProbs[outcome] ?? null;

    return {
      id: `${home}_${away}_${outcome}`,
      home_team: home, away_team: away,
      league: am.league, date: am.date, outcome,
      odds,
      model_prob: mlProb != null ? mlProb : (odds > 0 ? 1 / odds : 0),
      bookmaker: bkName, all_odds: allBks,
      sport: am.sport,
    };
  }

  function isAiOutcomeInTicket(am: AIScanMatch, outcome: string): boolean {
    const home = am.sport === "tennis" ? (am.player1 || "") : (am.home_team || "");
    const away = am.sport === "tennis" ? (am.player2 || "") : (am.away_team || "");
    const id = `${home}_${away}_${outcome}`;
    return tickets.some((t) => t.legs.some((l) => l.id === id));
  }

  function toggleAiOutcomeInTicket(am: AIScanMatch, outcome: string) {
    const leg = aiMatchToLeg(am, outcome);
    if (!leg) return;
    setTickets((prev) => {
      const updated = [...prev];
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
      model_prob: leg.model_prob, implied_prob: leg.odds > 0 ? 1 / leg.odds : 0,
      edge: am.edges?.[outcome] ?? 0, best_odds: leg.odds, bookmaker: leg.bookmaker,
    };
    e.dataTransfer.setData("application/json", JSON.stringify(vb));
    e.dataTransfer.effectAllowed = "copy";
  }

  /* ── Computed stats ── */
  const valueBetCount = useMemo(() => {
    return filteredAiMatches.filter((am) => Math.max(...Object.values(am.edges ?? {}), 0) > 0).length;
  }, [filteredAiMatches]);

  const avgEdge = useMemo(() => {
    const edges = filteredAiMatches
      .map((am) => Math.max(...Object.values(am.edges ?? {}), 0))
      .filter((e) => e > 0);
    if (edges.length === 0) return 0;
    return edges.reduce((a, b) => a + b, 0) / edges.length;
  }, [filteredAiMatches]);

  /** Check if any outcome of a match is in any ticket */
  function isMatchInAnyTicket(am: AIScanMatch): boolean {
    const isFootball = am.sport === "football";
    const home = isFootball ? (am.home_team || "") : (am.player1 || "");
    const away = isFootball ? (am.away_team || "") : (am.player2 || "");
    const prefix = `${home}_${away}_`;
    return tickets.some((t) => t.legs.some((l) => l.id.startsWith(prefix)));
  }

  /* ── Ticket builder callbacks ── */
  const ticketCallbacks = {
    tickets,
    activeTicketIdx,
    onSetActiveTicket: setActiveTicketIdx,
    onAddTicket: () => {
      const n = tickets.length + 1;
      setTickets([...tickets, { id: `ticket-${n}`, name: `Ticket ${n}`, legs: [], stake: 10, bookmaker: null }]);
      setActiveTicketIdx(tickets.length);
    },
    onRemoveTicket: (idx: number) => {
      const updated = tickets.filter((_, i) => i !== idx);
      setTickets(updated);
      if (activeTicketIdx >= updated.length) setActiveTicketIdx(Math.max(0, updated.length - 1));
    },
    onRemoveLeg: (ticketIdx: number, legId: string) => {
      const updated = [...tickets];
      updated[ticketIdx] = { ...updated[ticketIdx], legs: updated[ticketIdx].legs.filter((l) => l.id !== legId) };
      setTickets(updated);
    },
    onUpdateStake: (ticketIdx: number, stake: number) => {
      const updated = [...tickets];
      updated[ticketIdx] = { ...updated[ticketIdx], stake };
      setTickets(updated);
    },
    onDropBet: (b: ValueBet) => {
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
        const updated = [...prev];
        if (updated.length === 0) updated.push({ id: "ticket-1", name: "Ticket 1", legs: [], stake: 10, bookmaker: null });
        const idx = activeTicketIdx >= updated.length ? 0 : activeTicketIdx;
        const ticket = { ...updated[idx] };
        const id = `${b.home_team}_${b.away_team}_${b.outcome}`;
        if (!ticket.legs.some((l) => l.id === id)) {
          const prefix = `${b.home_team}_${b.away_team}_`;
          ticket.legs = ticket.legs.filter((l) => !l.id.startsWith(prefix));
          const leg: import("@/types").TicketLeg = {
            id, home_team: b.home_team, away_team: b.away_team,
            league: b.league, date: b.date, outcome: b.outcome,
            odds: b.best_odds, model_prob: b.model_prob, bookmaker: b.bookmaker, all_odds: allOdds,
          };
          ticket.legs = [...ticket.legs, leg];
        }
        updated[idx] = ticket;
        return updated;
      });
    },
    onUpdateLegOutcome: (ticketIdx: number, legId: string, newOutcome: string) => {
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
    },
    onUpdateBookmaker: (ticketIdx: number, bk: string | null) => {
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
    },
  };

  /* ── Group matches by day ── */
  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div className="-mx-6 -my-5 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">

      {/* ═══ TOP: Header + Filters + Action bar (full width) ═══ */}

      {/* Scanner Header */}
      <div className="shrink-0 px-5 pt-2.5 pb-2 bg-white border-b border-[#e3e6eb]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#3b5bdb]/10 flex items-center justify-center">
              <ScanSearch size={16} className="text-[#3b5bdb]" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#111318]">Scanner</h2>
              <p className="text-[#8a919e] text-[12px]">Detecter les value bets sur les matchs a venir</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {valueBetCount > 0 && (
              <span className="flex items-center gap-1.5 bg-[#12b76a]/10 text-[#12b76a] text-[11px] font-bold px-2.5 py-1 rounded-full border border-[#12b76a]/20">
                <TrendingUp size={11} />
                {valueBetCount} value bet{valueBetCount > 1 ? "s" : ""}
              </span>
            )}
            {avgEdge > 0 && (
              <span className="text-[11px] font-mono font-bold text-[#3b5bdb] bg-[#3b5bdb]/8 px-2 py-1 rounded-full">
                Edge moy. +{(avgEdge * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 bg-white border-b border-[#e3e6eb]">
        {/* Row 1: Sport + Search + Period + Time + Edge + Odds */}
        <div className="px-5 py-2.5 border-b border-[#f0f1f3]">
          <div className="flex gap-2.5 items-end flex-wrap">
            {/* Sport pills */}
            <div data-tour="sport-toggle">
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">Sport</label>
              <div className="flex gap-1">
                {(["football", "tennis", "nba", "rugby", "mlb", "pmu"] as const).map((s) => (
                  <button key={s} onClick={() => toggleSport(s)}
                    className={`px-3 py-[5px] rounded-full text-[11.5px] font-semibold transition-all ${
                      sports.has(s)
                        ? "bg-[#3b5bdb] text-white shadow-sm"
                        : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"
                    }`}>
                    {s === "football" ? "⚽ Football" : s === "tennis" ? "🎾 Tennis" : s === "nba" ? "🏀 NBA" : s === "rugby" ? "🏉 Rugby" : s === "mlb" ? "⚾ MLB" : "🐎 PMU"}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">
                {sports.has("tennis") && !sports.has("football") ? "Joueur" : sports.has("football") && !sports.has("tennis") ? "Equipe" : "Equipe / Joueur"}
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#b0b7c3]" />
                <input type="text"
                  placeholder={sports.has("tennis") && !sports.has("football") ? "Djokovic, Alcaraz..." : sports.has("football") && !sports.has("tennis") ? "Arsenal, PSG..." : "Arsenal, Djokovic..."}
                  value={searchTeam} onChange={(e) => setSearchTeam(e.target.value)}
                  className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg pl-8 pr-3 py-[5px] text-[12px] text-[#111318] w-full focus:ring-2 focus:ring-[#3b5bdb]/30 focus:border-[#3b5bdb] outline-none" />
              </div>
            </div>

            {/* Period pills */}
            <div data-tour="date-presets">
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">
                <Calendar size={9} className="inline mr-0.5" />Periode
              </label>
              <div className="flex gap-1">
                {(["today", "48h", "72h", "week"] as const).map((p) => (
                  <button key={p} onClick={() => applyDatePreset(p)}
                    className={`px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${
                      datePreset === p
                        ? "bg-[#3b5bdb] text-white shadow-sm"
                        : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"
                    }`}>
                    {p === "today" ? "Auj." : p === "week" ? "7j" : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom dates */}
            <div className="flex gap-1.5">
              <div>
                <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">Du</label>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(""); }}
                  className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318]" />
              </div>
              <div>
                <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">Au</label>
                <input type="date" value={dateTo}
                  min={dateFrom}
                  max={(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })()}
                  onChange={(e) => { setDateTo(e.target.value); setDatePreset(""); }}
                  className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318]" />
              </div>
            </div>

            {/* Time range */}
            <div className="flex gap-1.5">
              <div>
                <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">
                  <Clock size={9} className="inline mr-0.5" />De
                </label>
                <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318]" />
              </div>
              <div>
                <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">
                  <Clock size={9} className="inline mr-0.5" />A
                </label>
                <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318]" />
              </div>
            </div>

            <div className="h-6 w-px bg-[#e3e6eb]" />

            {/* Edge + Odds */}
            <div>
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">
                Edge min %<Tip text="Ecart entre la probabilite estimee et la cote implicite. Ex : modele 48%, cote implique 40% = edge +8%." />
              </label>
              <input type="number" step="1" min="0" placeholder="%" value={minEdge} onChange={(e) => setMinEdge(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318] w-14" />
            </div>
            <div>
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">Cote min</label>
              <input type="number" step="0.1" min="1" placeholder="1.3" value={minOdds} onChange={(e) => setMinOdds(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318] w-16" />
            </div>
            <div>
              <label className="block text-[9.5px] text-[#8a919e] uppercase tracking-[0.08em] font-semibold mb-1">Cote max</label>
              <input type="number" step="0.1" min="1" placeholder="3.0" value={maxOdds} onChange={(e) => setMaxOdds(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318] w-16" />
            </div>
          </div>
        </div>

        {/* Row 2: Leagues + toggle filters */}
        <div data-tour="filters" className="px-5 py-2.5">
          {/* Football filter bar */}
          {sports.has("football") && (
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <button
                onClick={() => setShowLeagues(!showLeagues)}
                className="flex items-center gap-1.5 bg-[#f4f5f7] border border-[#e3e6eb] rounded-full px-3 py-[5px] text-[12px] text-[#111318] hover:bg-[#eceef1] transition-colors"
              >
                <Trophy size={12} className="text-[#3b5bdb]" />
                <span className="font-semibold">Competitions</span>
                <span className="text-[10px] text-[#3b5bdb] bg-[#3b5bdb]/10 px-1.5 py-0.5 rounded-full font-bold">
                  {activeLeagues.size}/{ALL_LEAGUE_CODES.length}
                </span>
                <ChevronDown size={12} className={`text-[#8a919e] transition-transform ${showLeagues ? "rotate-180" : ""}`} />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={toggleAllLeagues} className="text-[10px] text-[#3b5bdb] hover:text-[#2b4bc7] font-semibold px-2 py-1 rounded-md hover:bg-[#3b5bdb]/8 transition-colors">
                  {activeLeagues.size === ALL_LEAGUE_CODES.length ? "Aucun" : "Tous"}
                </button>
                <button onClick={() => setLeagueGroup(DIV1_CODES)} className="text-[10px] text-[#3b5bdb] font-semibold px-2 py-1 rounded-md hover:bg-[#3b5bdb]/8 transition-colors">
                  {DIV1_CODES.every((c) => activeLeagues.has(c)) ? "- Div 1" : "+ Div 1"}
                </button>
                <button onClick={() => setLeagueGroup(DIV2_CODES)} className="text-[10px] text-[#3b5bdb] font-semibold px-2 py-1 rounded-md hover:bg-[#3b5bdb]/8 transition-colors">
                  {DIV2_CODES.every((c) => activeLeagues.has(c)) ? "- Div 2" : "+ Div 2"}
                </button>
                <button onClick={() => setLeagueGroup(CUP_CODES)} className="text-[10px] text-[#f79009] font-semibold px-2 py-1 rounded-md hover:bg-[#f79009]/8 transition-colors">
                  {CUP_CODES.every((c) => activeLeagues.has(c)) ? "- Coupes" : "+ Coupes"}
                </button>
                <button onClick={() => setLeagueGroup(EUR_CODES)} className="text-[10px] text-purple-600 font-semibold px-2 py-1 rounded-md hover:bg-purple-50 transition-colors">
                  {EUR_CODES.every((c) => activeLeagues.has(c)) ? "- Europe" : "+ Europe"}
                </button>
              </div>
              {!showLeagues && activeLeagues.size < ALL_LEAGUE_CODES.length && activeLeagues.size > 0 && (
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {[...activeLeagues].slice(0, 6).map((code) => {
                    const info = LEAGUE_INFO[code];
                    return (
                      <span key={code} className="text-[10px] text-[#111318] bg-[#f4f5f7] px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-[#e3e6eb]">
                        {info.flag} {info.name}
                        <X size={8} className="text-[#8a919e] hover:text-[#f04438] cursor-pointer" onClick={() => toggleLeague(code)} />
                      </span>
                    );
                  })}
                  {activeLeagues.size > 6 && <span className="text-[10px] text-[#8a919e]">+{activeLeagues.size - 6}</span>}
                </div>
              )}
              {!sports.has("tennis") && (
                <>
                  <div className="h-5 w-px bg-[#e3e6eb]" />
                  <button data-tour="value-toggle" onClick={() => setValueOnlyFilter(!valueOnlyFilter)}
                    className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${valueOnlyFilter ? "bg-[#12b76a] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                    <TrendingUp size={10} /> Value bets
                  </button>
                  <button onClick={() => setHideInTicket(!hideInTicket)}
                    className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${hideInTicket ? "bg-[#3b5bdb] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                    <Shield size={10} /> Masquer en ticket
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tennis filter bar */}
          {sports.has("tennis") && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowCircuits(!showCircuits)}
                className="flex items-center gap-1.5 bg-[#f4f5f7] border border-[#e3e6eb] rounded-full px-3 py-[5px] text-[12px] text-[#111318] hover:bg-[#eceef1] transition-colors"
              >
                <Trophy size={12} className="text-[#f79009]" />
                <span className="font-semibold">Circuits</span>
                <span className="text-[10px] text-[#f79009] bg-[#f79009]/10 px-1.5 py-0.5 rounded-full font-bold">
                  {activeTennisCount}/{allTennisNames.length}
                </span>
                <ChevronDown size={12} className={`text-[#8a919e] transition-transform ${showCircuits ? "rotate-180" : ""}`} />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={toggleAllTournaments}
                  className="text-[10px] text-[#f79009] hover:text-[#d97706] font-semibold px-2 py-1 rounded-md hover:bg-[#f79009]/8 transition-colors">
                  {excludedTournaments.size === 0 ? "Aucun" : "Tous"}
                </button>
                {tennisByCircuit.map((g) => {
                  const allActive = g.tournaments.every((t) => !excludedTournaments.has(t));
                  return (
                    <button key={g.code} onClick={() => toggleCircuitGroup(g.tournaments)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors ${allActive ? "text-[#f79009] hover:bg-[#f79009]/8" : "text-[#b0b7c3] hover:text-[#f79009] hover:bg-[#f79009]/8"}`}>
                      {allActive ? `- ${g.name}` : `+ ${g.name}`}
                    </button>
                  );
                })}
              </div>
              {!showCircuits && excludedTournaments.size > 0 && excludedTournaments.size < allTennisNames.length && (
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {allTennisNames.filter((t) => !excludedTournaments.has(t)).slice(0, 6).map((name) => (
                    <span key={name} className="text-[10px] text-[#111318] bg-[#f4f5f7] px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-[#e3e6eb]">
                      {name}
                      <X size={8} className="text-[#8a919e] hover:text-[#f04438] cursor-pointer" onClick={() => toggleTournament(name)} />
                    </span>
                  ))}
                  {activeTennisCount > 6 && <span className="text-[10px] text-[#8a919e]">+{activeTennisCount - 6}</span>}
                </div>
              )}
              <div className="h-5 w-px bg-[#e3e6eb]" />
              <button data-tour="value-toggle" onClick={() => setValueOnlyFilter(!valueOnlyFilter)}
                className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${valueOnlyFilter ? "bg-[#12b76a] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                <TrendingUp size={10} /> Value bets
              </button>
              <button onClick={() => setHideInTicket(!hideInTicket)}
                className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${hideInTicket ? "bg-[#3b5bdb] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                <Shield size={10} /> Masquer en ticket
              </button>
            </div>
          )}


          {/* NBA filter bar */}
          {sports.has("nba") && (
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <div className="flex items-center gap-1.5 bg-[#f4f5f7] border border-[#e3e6eb] rounded-full px-3 py-[5px]">
                <span className="text-[12px]">🏀</span>
                <span className="text-[12px] font-semibold text-[#111318]">Conference</span>
              </div>
              <div className="flex items-center gap-1">
                {(["all", "est", "ouest"] as const).map((c) => (
                  <button key={c} onClick={() => setNbaConference(c)}
                    className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full transition-all ${nbaConference === c ? "bg-[#f97316] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                    {c === "all" ? "Toutes" : c === "est" ? "Est" : "Ouest"}
                  </button>
                ))}
              </div>
              <div className="h-5 w-px bg-[#e3e6eb]" />
              <button data-tour="value-toggle" onClick={() => setValueOnlyFilter(!valueOnlyFilter)}
                className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${valueOnlyFilter ? "bg-[#12b76a] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                <TrendingUp size={10} /> Value bets
              </button>
              <button onClick={() => setHideInTicket(!hideInTicket)}
                className={`flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold transition-all ${hideInTicket ? "bg-[#3b5bdb] text-white" : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"}`}>
                <Shield size={10} /> Masquer en ticket
              </button>
            </div>
          )}

          {/* PMU filter bar */}
          {sports.has("pmu") && (
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <div className="flex items-center gap-1.5 bg-[#f4f5f7] border border-[#e3e6eb] rounded-full px-3 py-[5px]">
                <span className="text-[12px]">🐎</span>
                <span className="text-[12px] font-semibold text-[#111318]">Type</span>
              </div>
              <div className="flex items-center gap-1">
                {(["all", "Plat", "Trot", "Obstacle"] as const).map((t) => (
                  <button key={t} onClick={() => setPmuRaceTypeFilter(t)}
                    className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full transition-all ${
                      pmuRaceTypeFilter === t
                        ? "bg-[#3b5bdb] text-white"
                        : "bg-[#f4f5f7] text-[#8a919e] hover:text-[#111318]"
                    }`}>
                    {t === "all" ? "Toutes" : t}
                  </button>
                ))}
              </div>
              {pmuRaces.length > 0 && (
                <span className="text-[11px] text-[#8a919e]">
                  <span className="text-[#111318] font-semibold">{
                    pmuRaceTypeFilter === "all"
                      ? pmuRaces.length
                      : pmuRaces.filter(r => r.race_type === pmuRaceTypeFilter).length
                  }</span> course{pmuRaces.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Leagues dropdown panel */}
          {/* Leagues dropdown panel (football) */}
          {showLeagues && sports.has("football") && (
            <div className="mt-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                      <span className="text-[11px] font-semibold text-[#111318] group-hover:text-[#3b5bdb] transition-colors">{country}</span>
                      <div className={`w-3 h-3 rounded border ml-auto flex items-center justify-center transition-colors ${
                        allActive ? "bg-[#3b5bdb] border-[#3b5bdb]" : someActive ? "bg-[#3b5bdb]/30 border-[#3b5bdb]" : "border-[#cdd1d9]"
                      }`}>
                        {allActive && <span className="text-white text-[8px] font-bold">v</span>}
                        {someActive && !allActive && <span className="text-[#3b5bdb] text-[7px] font-bold">-</span>}
                      </div>
                    </button>
                    <div className="space-y-0.5 pl-6">
                      {leagues.map((l) => (
                        <button key={l.code} onClick={() => toggleLeague(l.code)}
                          className="flex items-center gap-2 w-full py-0.5 group/league">
                          <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                            activeLeagues.has(l.code) ? "bg-[#3b5bdb] border-[#3b5bdb]" : "border-[#cdd1d9] group-hover/league:border-[#3b5bdb]"
                          }`}>
                            {activeLeagues.has(l.code) && <span className="text-white text-[8px] font-bold">v</span>}
                          </div>
                          <span className={`text-[11px] transition-colors ${
                            activeLeagues.has(l.code) ? "text-[#111318] font-medium" : "text-[#8a919e] group-hover/league:text-[#111318]"
                          }`}>{l.name}</span>
                          {l.division === 2 && <span className="text-[8px] text-[#b0b7c3] ml-auto">D2</span>}
                          {l.division === 0 && <span className="text-[8px] text-[#f79009] ml-auto">Coupe</span>}
                          {l.division === -1 && <span className="text-[8px] text-purple-400 ml-auto">EUR</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Circuits dropdown panel (tennis) — circuit → tournaments */}
          {showCircuits && sports.has("tennis") && (
            <div className="mt-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-xl p-4">
              {tennisByCircuit.length === 0 ? (
                <span className="text-[11px] text-[#8a919e]">Aucun tournoi. Lancez un scan tennis pour voir les tournois actifs</span>
              ) : (
                <div className="flex gap-6">
                  {tennisByCircuit.map((g) => {
                    const activeCount = g.tournaments.filter((t) => !excludedTournaments.has(t)).length;
                    const allActive = activeCount === g.tournaments.length;
                    const someActive = activeCount > 0;
                    // Grand Chelem = 1 col, ATP/WTA = 3 cols, others = 1 col
                    const useTripleCols = g.tournaments.length > 8;
                    const colSpan = useTripleCols ? "flex-[3]" : "flex-[1]";
                    // Split tournaments into 3 columns for large circuits
                    const third = Math.ceil(g.tournaments.length / 3);
                    const col1 = useTripleCols ? g.tournaments.slice(0, third) : g.tournaments;
                    const col2 = useTripleCols ? g.tournaments.slice(third, third * 2) : [];
                    const col3 = useTripleCols ? g.tournaments.slice(third * 2) : [];

                    const renderTournament = (t: string) => {
                      const isActive = !excludedTournaments.has(t);
                      const hasMatch = g.hasMatches.has(t);
                      return (
                        <button key={t} onClick={() => toggleTournament(t)}
                          className="flex items-center gap-1.5 w-full py-[2px] group/tournament">
                          <div className={`w-3 h-3 shrink-0 rounded border flex items-center justify-center transition-colors ${
                            isActive ? "bg-[#f79009] border-[#f79009]" : "border-[#cdd1d9] group-hover/tournament:border-[#f79009]"
                          }`}>
                            {isActive && <span className="text-white text-[8px] font-bold">✓</span>}
                          </div>
                          <span className={`text-[10.5px] truncate transition-colors ${
                            isActive ? "text-[#111318] font-medium" : "text-[#8a919e] group-hover/tournament:text-[#111318]"
                          }`}>{t}</span>
                          {hasMatch && <span className="w-1.5 h-1.5 rounded-full bg-[#12b76a] ml-auto shrink-0" title="Matchs disponibles" />}
                        </button>
                      );
                    };

                    return (
                      <div key={g.code} className={`${colSpan} min-w-0`}>
                        {/* Circuit header */}
                        <button
                          onClick={() => toggleCircuitGroup(g.tournaments)}
                          className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-[#e3e6eb] w-full group"
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                            allActive ? "bg-[#f79009] border-[#f79009]" : someActive ? "bg-[#f79009]/30 border-[#f79009]" : "border-[#cdd1d9]"
                          }`}>
                            {allActive && <span className="text-white text-[8px] font-bold">✓</span>}
                            {someActive && !allActive && <span className="text-[#f79009] text-[7px] font-bold">-</span>}
                          </div>
                          <span className="text-sm">{g.emoji}</span>
                          <span className="text-[11px] font-bold text-[#111318] group-hover:text-[#f79009] transition-colors">{g.name}</span>
                          <span className="text-[9px] text-[#8a919e] ml-auto whitespace-nowrap">({activeCount}/{g.tournaments.length})</span>
                        </button>
                        {/* Tournament list */}
                        {useTripleCols ? (
                          <div className="flex gap-3">
                            <div className="flex-1 min-w-0">{col1.map(renderTournament)}</div>
                            <div className="flex-1 min-w-0">{col2.map(renderTournament)}</div>
                            <div className="flex-1 min-w-0">{col3.map(renderTournament)}</div>
                          </div>
                        ) : (
                          <div>{col1.map(renderTournament)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="shrink-0 px-5 py-2 bg-[#f4f5f7] border-b border-[#e3e6eb] flex items-center gap-3">
        {sports.has("pmu") && !sports.has("football") && !sports.has("tennis") && !sports.has("nba") && !sports.has("rugby") && !sports.has("mlb") ? (
          // Mode PMU exclusif
          <button
            onClick={() => handlePMUScan(pmuHasScanned)}
            disabled={pmuLoading}
            className="bg-[#3b5bdb] hover:bg-[#2b4bc7] disabled:bg-[#b0b7c3] text-white px-4 py-[6px] rounded-lg text-[12px] flex items-center gap-1.5 font-semibold shadow-sm transition-colors"
          >
            <Search size={13} />
            {pmuLoading ? "Scan PMU..." : "Scanner PMU"}
          </button>
        ) : (
          <>
            <button data-tour="refresh-btn" onClick={() => handleAIScan(!hasScanned)} disabled={loading}
              className="bg-[#3b5bdb] hover:bg-[#2b4bc7] disabled:bg-[#b0b7c3] text-white px-4 py-[6px] rounded-lg text-[12px] flex items-center gap-1.5 font-semibold shadow-sm transition-colors">
              <Search size={13} />
              {loading ? "Scan..." : "Scanner"}
            </button>
            {sports.has("pmu") && (
              <button
                onClick={() => handlePMUScan(pmuHasScanned)}
                disabled={pmuLoading}
                className="px-3 py-[6px] rounded-lg text-[11px] flex items-center gap-1.5 bg-white text-[#3b5bdb] border border-[#3b5bdb]/30 hover:bg-[#3b5bdb]/5 transition-colors disabled:opacity-50"
              >
                <Search size={12} />
                {pmuLoading ? "Scan PMU..." : "Scanner PMU"}
              </button>
            )}
          </>
        )}
        {hasScanned && isCached && cachedAt && (
          <button onClick={() => handleAIScan(true)} disabled={loading}
            className="px-3 py-[6px] rounded-lg text-[11px] flex items-center gap-1.5 bg-white text-[#8a919e] border border-[#e3e6eb] hover:bg-[#3b5bdb]/5 hover:text-[#3b5bdb] hover:border-[#3b5bdb]/30 transition-colors disabled:opacity-50"
            title="Forcer un nouveau scan live">
            <RefreshCw size={12} />
            Actualiser
          </button>
        )}

        {/* Cache status */}
        {hasScanned && (
          <>
            {isCached ? (
              <span className="flex items-center gap-1 text-[10px] bg-white text-[#8a919e] px-2 py-1 rounded-full border border-[#e3e6eb]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#b0b7c3]" />
                Cache {cachedAt && (() => {
                  const ago = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000);
                  return ago < 1 ? "< 1 min" : `${ago} min`;
                })()}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] bg-[#12b76a]/10 text-[#12b76a] px-2 py-1 rounded-full border border-[#12b76a]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#12b76a]" />
                Live
              </span>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Results count */}
          {hasScanned && (
            <span className="text-[11px] text-[#8a919e]">
              <span className="text-[#111318] font-semibold">{filteredAiMatches.length}</span> match{filteredAiMatches.length !== 1 ? "s" : ""}
              {filteredAiMatches.length !== aiMatches.length && (
                <span className="text-[#b0b7c3]"> / {aiMatches.length}</span>
              )}
            </span>
          )}
          {aiDuration > 0 && !isCached && (
            <span className="text-[10px] text-[#b0b7c3]">{aiDuration.toFixed(0)}s</span>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="text-[#8a919e]" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-white border border-[#e3e6eb] rounded-lg px-2 py-[5px] text-[11px] text-[#111318] font-medium focus:ring-2 focus:ring-[#3b5bdb]/30 outline-none">
              <option value="prob">Probabilite</option>
              <option value="edge">Edge</option>
              <option value="date">Date</option>
              <option value="league">Ligue</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM: Results (left) + Ticket (right), resizable ═══ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Match list / PMU Race list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 scanner-scroll">
          {error && (
            <div className="bg-[#f04438]/8 border border-[#f04438]/20 rounded-xl p-3 flex items-center gap-2 text-[#f04438] text-[12px] mb-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* ── PMU mode ── */}
          {sports.has("pmu") && !sports.has("football") && !sports.has("tennis") && !sports.has("nba") && !sports.has("rugby") && !sports.has("mlb") ? (
            <>
              {pmuLoading && (
                <div className="text-center py-12 text-[#8a919e]">
                  <ScanSearch size={28} className="mx-auto mb-3 text-[#b0b7c3] animate-pulse" />
                  <p className="text-[13px]">Scan des courses PMU en cours...</p>
                </div>
              )}
              {!pmuLoading && pmuRaces.length > 0 && (
                <div className="space-y-1.5">
                  {pmuRaces
                    .filter((r) => pmuRaceTypeFilter === "all" || r.race_type === pmuRaceTypeFilter)
                    .map((race) => (
                      <PMURaceCard
                        key={race.race_id}
                        race={race}
                        expanded={pmuExpandedRace === race.race_id}
                        onToggle={() => setPmuExpandedRace(prev => prev === race.race_id ? null : race.race_id)}
                        onSelectRunner={(r, idx) => setPmuDetailRace({ race: r, runnerIndex: idx })}
                      />
                    ))
                  }
                </div>
              )}
              {!pmuLoading && pmuHasScanned && pmuRaces.length === 0 && (
                <div className="text-center py-12 text-[#8a919e]">Aucune course trouvee. Relancez un scan PMU.</div>
              )}
              {!pmuLoading && !pmuHasScanned && (
                <div className="text-center py-16 text-[#8a919e]">
                  <ScanSearch size={32} className="mx-auto mb-3 text-[#b0b7c3]" />
                  <p className="text-[13px] font-medium">Cliquez sur Scanner PMU pour charger les courses du jour</p>
                </div>
              )}
            </>
          ) : (
            /* ── Matchs normaux ── */
            <>
              {hiddenMatches.size > 0 && (
                <button onClick={() => setHiddenMatches(new Set())}
                  className="text-[11px] text-[#3b5bdb] hover:text-[#2b4bc7] flex items-center gap-1 font-semibold mb-1">
                  <Eye size={12} /> Afficher les {hiddenMatches.size} matchs masques
                </button>
              )}

              {/* PMU races en supplement si mode mixte */}
              {sports.has("pmu") && pmuRaces.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[11px] font-bold text-[#8a919e] uppercase tracking-wider">Courses PMU</span>
                    <span className="text-[10px] text-[#b0b7c3]">{pmuRaces.length} course{pmuRaces.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-1.5">
                    {pmuRaces
                      .filter((r) => pmuRaceTypeFilter === "all" || r.race_type === pmuRaceTypeFilter)
                      .slice(0, 5)
                      .map((race) => (
                        <PMURaceCard
                          key={race.race_id}
                          race={race}
                          expanded={pmuExpandedRace === race.race_id}
                          onToggle={() => setPmuExpandedRace(prev => prev === race.race_id ? null : race.race_id)}
                          onSelectRunner={(r, idx) => setPmuDetailRace({ race: r, runnerIndex: idx })}
                        />
                      ))
                    }
                  </div>
                  <div className="h-px bg-[#e3e6eb] mt-3 mb-2" />
                </div>
              )}

              {/* Match cards — flat list, date in each card */}
              <div className="space-y-1.5">
                {filteredAiMatches.map((am, i) => (
                  <MatchCard
                    key={`${am.home_team || am.player1}_${am.away_team || am.player2}_${i}`}
                    dataTour={i === 0 ? "match-card" : undefined}
                    am={am}
                    cardBk={cardBk}
                    setCardBk={setCardBk}
                    isAiOutcomeInTicket={isAiOutcomeInTicket}
                    toggleAiOutcomeInTicket={toggleAiOutcomeInTicket}
                    handleAIMatchDragStart={handleAIMatchDragStart}
                    setDetailMatch={setDetailMatch}
                    setHiddenMatches={setHiddenMatches}
                    isInTicket={isMatchInAnyTicket(am)}
                    isSelected={detailMatch?.am === am}
                  />
                ))}
              </div>

              {hasScanned && aiMatches.length === 0 && !loading && (
                <div className="text-center py-12 text-[#8a919e]">Aucun match trouve. Essayez d'autres filtres ou relancez un scan.</div>
              )}
              {filteredAiMatches.length === 0 && aiMatches.length > 0 && !loading && (
                <div className="text-center py-12 text-[#8a919e]">
                  Aucun match avec ces filtres.
                  <span className="block mt-1 text-[11px] text-[#b0b7c3]">({aiMatches.length} matchs en memoire)</span>
                </div>
              )}
              {!hasScanned && !loading && (
                <div className="text-center py-16 text-[#8a919e]">
                  <ScanSearch size={32} className="mx-auto mb-3 text-[#b0b7c3]" />
                  <p className="text-[13px] font-medium">Selectionnez vos filtres puis cliquez sur Scanner</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[#3b5bdb]/20 active:bg-[#3b5bdb]/30 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const container = e.currentTarget.parentElement;
            const ticketEl = container?.querySelector("[data-ticket-panel]") as HTMLElement | null;
            if (!ticketEl) return;
            const startW = ticketEl.offsetWidth;
            const onMove = (ev: MouseEvent) => {
              const delta = startX - ev.clientX;
              const newW = Math.max(200, Math.min(600, startW + delta));
              ticketEl.style.width = `${newW}px`;
              ticketEl.style.minWidth = `${newW}px`;
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />

        {/* Ticket Builder */}
        <div data-ticket-panel data-tour="ticket-tab" className="w-[420px] min-w-[420px] shrink-0 border-l border-[#e3e6eb] bg-white overflow-hidden">
          <TicketBuilder {...ticketCallbacks} />
        </div>
      </div>

      {/* ═══ DETAIL PANEL (420px, slide-in from right, overlaps everything) ═══ */}
      {detailMatch && (
        <div data-tour="detail-panel" className="fixed top-14 right-0 w-[420px] h-[calc(100vh-3.5rem)] z-50 animate-slide-in">
          <AIScanMatchDetailPanel
            am={detailMatch.am}
            home={detailMatch.home}
            away={detailMatch.away}
            onClose={() => setDetailMatch(null)}
            inline
          />
        </div>
      )}

      {/* ═══ PMU DETAIL PANEL ═══ */}
      {pmuDetailRace && (
        <PMURaceDetailPanel
          race={pmuDetailRace.race}
          runnerIndex={pmuDetailRace.runnerIndex}
          onClose={() => setPmuDetailRace(null)}
        />
      )}

      {showTour && <SpotlightTour steps={scannerTour} onComplete={completeTour} />}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   MatchCard sub-component
   ═══════════════════════════════════════════════════════════════════ */

function MatchCard({
  am, cardBk, setCardBk,
  isAiOutcomeInTicket, toggleAiOutcomeInTicket, handleAIMatchDragStart,
  setDetailMatch, setHiddenMatches, isInTicket, isSelected, dataTour,
}: {
  am: AIScanMatch;
  cardBk: Record<string, string>;
  setCardBk: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isAiOutcomeInTicket: (am: AIScanMatch, outcome: string) => boolean;
  toggleAiOutcomeInTicket: (am: AIScanMatch, outcome: string) => void;
  handleAIMatchDragStart: (e: React.DragEvent, am: AIScanMatch, outcome: string) => void;
  setDetailMatch: (d: { am: AIScanMatch; home: string; away: string } | null) => void;
  setHiddenMatches: React.Dispatch<React.SetStateAction<Set<string>>>;
  isInTicket: boolean;
  isSelected: boolean;
  dataTour?: string;
}) {
  const isFootball = am.sport === "football";
  const isNBA = am.sport === "nba";
  const isMLB = am.sport === "mlb";
  const isRugby = am.sport === "rugby";
  const isTennis = am.sport === "tennis";
  const isBinary = isNBA || isMLB; // sports with only Home/Away outcomes
  const home = isTennis ? (am.player1 || "?") : (am.home_team || "?");
  const away = isTennis ? (am.player2 || "?") : (am.away_team || "?");
  const info = isFootball ? (LEAGUE_INFO_BY_NAME[am.league] ?? null) : null;
  const { dateStr, timeStr } = am.date ? parseBetDate(am.date) : { dateStr: "", timeStr: null };
  const matchKey = `${home}_${away}`;

  const rawOddsBase = isFootball || isRugby
    ? (am.odds?.["1x2"] as Record<string, unknown> | undefined)
    : (am.odds?.["winner"] as Record<string, unknown> | undefined);
  const outcomeKeys = isFootball || isRugby ? ["H", "D", "A"] : isBinary ? ["Home", "Away"] : ["P1", "P2"];

  const bkMaps: Record<string, Record<string, number>> = {};
  for (const k of outcomeKeys) bkMaps[k] = extractBkOdds(rawOddsBase?.[k]);

  function bestOddsForKey(k: string): { odds: number; bk: string } {
    const map = bkMaps[k] || {};
    let best = { odds: 0, bk: "" };
    for (const [bk, o] of Object.entries(map)) { if (o > best.odds) best = { odds: o, bk }; }
    return best;
  }

  const outcomes = isFootball || isRugby
    ? (["H", "D", "A"] as const).map((k) => {
        const { odds, bk } = bestOddsForKey(k);
        return { key: k, label: k === "H" ? home : k === "D" ? "Nul" : away, odds, bk };
      })
    : isBinary
      ? (["Home", "Away"] as const).map((k) => {
          const { odds, bk } = bestOddsForKey(k);
          return { key: k, label: k === "Home" ? home : away, odds, bk };
        })
      : (["P1", "P2"] as const).map((k) => {
          const { odds, bk } = bestOddsForKey(k);
          return { key: k, label: k === "P1" ? home : away, odds, bk };
        });

  const modelProbs: Record<string, number> = isFootball || isRugby
    ? { H: am.model_prob_home ?? 0, D: am.model_prob_draw ?? 0, A: am.model_prob_away ?? 0 }
    : isBinary
      ? { Home: am.model_prob_home ?? 0, Away: am.model_prob_away ?? 0 }
      : { P1: am.model_prob_home ?? 0, P2: am.model_prob_away ?? 0 };

  const bestOutcome = outcomes.filter(o => o.odds > 0).reduce(
    (best, o) => {
      const prob = modelProbs[o.key] || (o.odds > 0 ? 1/o.odds : 0);
      const bestProb = best ? (modelProbs[best.key] || (best.odds > 0 ? 1/best.odds : 0)) : 0;
      return prob > bestProb ? o : best;
    },
    null as typeof outcomes[0] | null
  );

  const maxPts = am.sport === "tennis" ? 18 : am.sport === "nba" || am.sport === "mlb" ? 6 : am.sport === "rugby" ? 7 : 20;
  const dataScore = Math.round((am.data_score ?? 0) * maxPts);
  const confidence = Math.max(am.model_prob_home ?? 0, am.model_prob_draw ?? 0, am.model_prob_away ?? 0) * 100;

  // Injury count
  const injuryCount = ((am.key_absences_home as string[] | undefined)?.length ?? 0) + ((am.key_absences_away as string[] | undefined)?.length ?? 0);

  const cardBorder = isSelected
    ? "border-[#3b5bdb] shadow-[0_0_0_3px_rgba(59,91,219,.07)]"
    : isInTicket
      ? "border-l-[3px] border-l-[#12b76a] border-[#e3e6eb]"
      : "border-[#e3e6eb] hover:border-[#cdd1d9]";

  return (
    <div
      data-tour={dataTour}
      className={`bg-white rounded-xl border-[1.5px] transition-all group overflow-hidden ${cardBorder}`}
      style={{ boxShadow: "0 1px 4px rgba(16,24,40,.06), 0 4px 16px rgba(16,24,40,.06)" }}
    >
      {/* ── Top: mc-info + mc-conf + mc-outcomes ── */}
      <div className="flex items-stretch">
        {/* mc-info */}
        <div className="w-[200px] min-w-[200px] shrink-0 px-3 py-2 border-r border-[#f0f1f3]">
          {/* Line 1: time + date */}
          <div className="flex items-center gap-1.5">
            {timeStr && <span className="text-[#111318] text-[11px] font-semibold font-mono">{timeStr}</span>}
            {dateStr && <span className="text-[#b0b7c3] text-[10px] font-mono">{dateStr}</span>}
          </div>
          {/* Line 2: league/competition */}
          <div className="text-[#8a919e] text-[10px] truncate mt-0.5">
            {isFootball
              ? (info ? `${info.flag} ${info.name}` : am.league)
              : isTennis
                ? (am.surface ? <><span className="text-[#f79009] font-medium">{am.surface}</span> · {am.league}</> : am.league)
                : isNBA
                  ? <><span className="text-[#f97316] font-medium">NBA</span> · {am.venue ? am.venue : am.league}</>
                  : isMLB
                    ? <><span className="text-[#ea580c] font-medium">MLB</span> · {am.venue ? am.venue : am.league}</>
                    : am.league
            }
          </div>
          {/* Line 3: teams */}
          <button
            onClick={() => setDetailMatch({ am, home, away })}
            className="text-[#111318] font-bold text-[13px] truncate hover:text-[#3b5bdb] text-left transition-colors mt-0.5 w-full"
            title="Voir les details"
          >
            {home} <span className="text-[#b0b7c3] font-normal text-[11px]">vs</span> {away}
          </button>
          {/* Line 4: data score + injuries + eye */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
              am.data_quality === "green" ? "bg-[#12b76a]/10 text-[#12b76a]" :
              am.data_quality === "yellow" ? "bg-[#f79009]/10 text-[#f79009]" :
              "bg-[#f04438]/10 text-[#f04438]"
            }`} title={`Score qualite donnees : ${dataScore}/${maxPts}`}>
              {dataScore}/{maxPts}
            </span>
            {injuryCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-[#f04438]/10 text-[#f04438]"
                title="Joueurs absents / blesses">
                +{injuryCount} blesse{injuryCount > 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={() => setDetailMatch({ am, home, away })}
              className="shrink-0 text-[#b0b7c3] opacity-0 group-hover:opacity-100 hover:text-[#3b5bdb] transition-all p-0.5"
              title="Voir les details"
            >
              <Eye size={12} />
            </button>
          </div>
        </div>

        {/* mc-conf (confidence zone) */}
        <div
          {...(dataTour ? { "data-tour": "confidence-stars" } : {})}
          className="w-[100px] min-w-[100px] shrink-0 flex flex-col items-center justify-center border-r border-[#f0f1f3] cursor-grab active:cursor-grabbing"
          draggable={bestOutcome != null && bestOutcome.odds > 0}
          onDragStart={(e) => bestOutcome && handleAIMatchDragStart(e, am, bestOutcome.key)}
        >
          {bestOutcome && bestOutcome.odds > 0 ? (
            <>
              <div className="text-[24px] font-extrabold text-[#111318] leading-none font-mono">
                {confidence.toFixed(0)}%
              </div>
              <div className="text-[10px] font-semibold text-[#8a919e] mt-0.5">Confiance</div>
              <div className="text-[10px] font-semibold text-[#111318] mt-0.5 truncate max-w-[90px]">
                {bestOutcome.label}
              </div>
              {am.edges?.[bestOutcome.key] != null && (
                <div className={`text-[9px] font-bold font-mono mt-0.5 ${am.edges[bestOutcome.key] > 0 ? "text-[#12b76a]" : "text-[#8a919e]"}`}>
                  {am.edges[bestOutcome.key] > 0 ? "+" : ""}{(am.edges[bestOutcome.key] * 100).toFixed(1)}%
                </div>
              )}
            </>
          ) : (
            <span className="text-[#b0b7c3] text-[11px]">N/A</span>
          )}
        </div>

        {/* mc-outcomes */}
        <div {...(dataTour ? { "data-tour": "outcome-buttons" } : {})} className={`grid flex-1 min-w-0 ${isFootball || isRugby ? "grid-cols-3" : "grid-cols-2"}`}>
          {outcomes.map(({ key, label, odds, bk }) => {
            const inTicket = isAiOutcomeInTicket(am, key);
            const noOdds = !odds;
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
                className={`flex flex-col items-center text-center px-2 py-2 border-r border-[#f0f1f3] last:border-r-0 transition-all cursor-pointer ${
                  noOdds ? "opacity-30 cursor-not-allowed" :
                  inTicket ? "bg-[#3b5bdb]/5" :
                  isFavorite ? "bg-[#12b76a]/4" : "hover:bg-[#f4f5f7]"
                }`}
                onClick={() => !noOdds && toggleAiOutcomeInTicket(am, key)}
                draggable={!noOdds}
                onDragStart={(e) => !noOdds && handleAIMatchDragStart(e, am, key)}
              >
                <div className={`text-[11px] font-semibold truncate w-full ${
                  inTicket ? "text-[#3b5bdb]" : isFavorite ? "text-[#12b76a]" : "text-[#111318]"
                }`}>
                  {label}
                  {isFavorite && <Star size={9} className="inline ml-0.5 text-[#f79009] fill-[#f79009]" />}
                </div>
                <div className={`text-[17px] font-bold mt-1 font-mono ${noOdds ? "text-[#b0b7c3]" : "text-[#111318]"}`}>
                  {noOdds ? "-" : displayOdds.toFixed(2)}
                </div>
                {!noOdds && sortedBks.length > 0 && (
                  <select
                    {...(dataTour && isFavorite ? { "data-tour": "bookmaker-select" } : {})}
                    value={pickedBk || ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); setCardBk((prev) => ({ ...prev, [bkKey]: e.target.value || "" })); }}
                    className="mt-1 bg-[#f4f5f7] border border-[#e3e6eb] rounded text-[9px] text-[#8a919e] px-1 py-0.5 w-full max-w-[100px] cursor-pointer hover:border-[#cdd1d9] outline-none"
                  >
                    <option value="">{displayBk || "IA"}</option>
                    {sortedBks.map(([b, o]) => (
                      <option key={b} value={b}>{b} ({o.toFixed(2)})</option>
                    ))}
                  </select>
                )}
                {!noOdds && modelProbPct && (
                  <div {...(dataTour && isFavorite ? { "data-tour": "edge-display" } : {})} className="flex items-center gap-1 mt-1">
                    <span className={`text-[10px] font-semibold font-mono ${isFavorite ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                      {modelProbPct}%
                    </span>
                    {edge !== null && (
                      <span className={`text-[9px] font-mono ${edge > 0 ? "text-[#12b76a]" : "text-[#8a919e]"}`}>
                        ({edge > 0 ? "+" : ""}{(edge * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                )}
                {/* Movement placeholder */}
                {!noOdds && (
                  <span className="text-[8px] text-[#b0b7c3] mt-0.5">→ stable</span>
                )}
                {inTicket && (
                  <CheckCircle2 size={12} className="text-[#12b76a] mt-0.5" />
                )}
              </div>
            );
          })}
        </div>

        {/* Hide button */}
        <div className="shrink-0 flex flex-col items-center justify-center px-1.5">
          <button
            onClick={() => setHiddenMatches((prev) => new Set(prev).add(matchKey))}
            className="text-[#b0b7c3] hover:text-[#f04438] opacity-0 group-hover:opacity-100 transition-all"
            title="Masquer"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Bottom row — football ── */}
      {isFootball && (am.form_home || am.form_away || am.position_home != null || am.lambda_home != null || am.context || am.motivation) && (
        <div className="px-3 py-1.5 border-t border-[#f0f1f3] bg-[#f9fafb] flex flex-wrap items-center gap-3">
          {(am.form_home || am.form_away) && (
            <div className="flex items-center gap-1">
              {am.form_home && (
                <span className="text-[10px] font-mono font-bold tracking-wider">
                  {am.form_home.split("").map((c, j) => (
                    <span key={j} className={c === "V" ? "text-[#12b76a]" : c === "D" ? "text-[#f04438]" : "text-[#8a919e]"}>{c}</span>
                  ))}
                </span>
              )}
              {am.form_home && am.form_away && <span className="text-[#e3e6eb] text-[10px] font-bold mx-0.5">|</span>}
              {am.form_away && (
                <span className="text-[10px] font-mono font-bold tracking-wider">
                  {am.form_away.split("").map((c, j) => (
                    <span key={j} className={c === "V" ? "text-[#12b76a]" : c === "D" ? "text-[#f04438]" : "text-[#8a919e]"}>{c}</span>
                  ))}
                </span>
              )}
            </div>
          )}
          {am.position_home != null && am.position_away != null && (
            <span className="text-[10px] text-[#8a919e] font-medium">#{am.position_home} vs #{am.position_away}</span>
          )}
          {am.lambda_home != null && (
            <span className="text-[9px] text-purple-500 font-mono" title="Buts attendus (Poisson)">&#955; {am.lambda_home} / {am.lambda_away}</span>
          )}
          {(am.context || am.motivation) && (
            <span className="text-[10px] text-[#8a919e] italic truncate max-w-xs">
              {am.context || am.motivation}
            </span>
          )}
        </div>
      )}

      {/* ── Bottom row — MLB ── */}
      {isMLB && (am.starter_home_name || am.starter_away_name || am.home_runs_avg_10 != null || am.away_runs_avg_10 != null) && (
        <div className="px-3 py-1.5 border-t border-[#f0f1f3] bg-[#f9fafb] flex flex-wrap items-center gap-x-3 gap-y-1">
          {(am.starter_home_name || am.starter_away_name) && (
            <span className="text-[10px] text-[#8a919e] font-medium" title="Lanceurs partants">
              {am.starter_home_name ?? "?"} vs {am.starter_away_name ?? "?"}
            </span>
          )}
          {am.home_runs_avg_10 != null && am.away_runs_avg_10 != null && (
            <span className="text-[10px] text-[#3b5bdb]" title="Runs marques / 10 matchs">
              R/m {am.home_runs_avg_10.toFixed(1)} | {am.away_runs_avg_10.toFixed(1)}
            </span>
          )}
          {am.home_runs_allowed_10 != null && am.away_runs_allowed_10 != null && (
            <span className="text-[10px] text-[#b0b7c3]" title="Runs encaisses / 10 matchs">
              RA/m {am.home_runs_allowed_10.toFixed(1)} | {am.away_runs_allowed_10.toFixed(1)}
            </span>
          )}
        </div>
      )}

      {/* ── Bottom row — tennis ── */}
      {!isFootball && !isMLB && (am.ranking_p1 != null || am.form_home || am.p1_surface_record || am.p1_serve_pct != null || am.h2h_surface || am.h2h_last3?.length) && (
        <div className="px-3 py-1.5 border-t border-[#f0f1f3] bg-[#f9fafb] flex flex-wrap items-center gap-x-3 gap-y-1">
          {am.ranking_p1 != null && am.ranking_p2 != null && (
            <span className="text-[10px] text-[#8a919e] font-medium" title="Classement ATP/WTA">
              #{am.ranking_p1} vs #{am.ranking_p2}
            </span>
          )}
          {(am.form_home || am.form_away) && (
            <div className="flex items-center gap-1">
              {am.form_home && (
                <span className="text-[10px] font-mono font-bold tracking-wider" title={`Forme ${home}`}>
                  {am.form_home.split("").map((c, j) => (
                    <span key={j} className={c === "V" ? "text-[#12b76a]" : c === "D" ? "text-[#f04438]" : "text-[#8a919e]"}>{c}</span>
                  ))}
                </span>
              )}
              {am.form_home && am.form_away && <span className="text-[#e3e6eb] text-[10px] font-bold mx-0.5">|</span>}
              {am.form_away && (
                <span className="text-[10px] font-mono font-bold tracking-wider" title={`Forme ${away}`}>
                  {am.form_away.split("").map((c, j) => (
                    <span key={j} className={c === "V" ? "text-[#12b76a]" : c === "D" ? "text-[#f04438]" : "text-[#8a919e]"}>{c}</span>
                  ))}
                </span>
              )}
            </div>
          )}
          {(am.p1_surface_record || am.p2_surface_record) && (
            <span className="text-[10px] text-[#f79009]" title={`Bilan sur ${am.surface || "surface"}`}>
              {am.surface && <span className="font-semibold">{am.surface} </span>}
              {am.p1_surface_record || "?"} | {am.p2_surface_record || "?"}
            </span>
          )}
          {am.p1_serve_pct != null && am.p2_serve_pct != null && (
            <span className="text-[10px] text-[#3b5bdb]" title="% jeux de service gagnes">
              Serv. {am.p1_serve_pct}% | {am.p2_serve_pct}%
            </span>
          )}
          {am.p1_return_pct != null && am.p2_return_pct != null && (
            <span className="text-[10px] text-indigo-500" title="% retours gagnes">
              Ret. {am.p1_return_pct}% | {am.p2_return_pct}%
            </span>
          )}
          {am.p1_aces_avg != null && am.p2_aces_avg != null && (
            <span className="text-[10px] text-[#8a919e]" title="Aces par match">
              Aces {am.p1_aces_avg.toFixed(1)} | {am.p2_aces_avg.toFixed(1)}
            </span>
          )}
          {(am.p1_season_record || am.p2_season_record) && (
            <span className="text-[10px] text-[#b0b7c3]" title="Bilan saison">
              Saison {am.p1_season_record || "?"} | {am.p2_season_record || "?"}
            </span>
          )}
          {am.p1_rest_days != null && am.p2_rest_days != null && (
            <span className="text-[10px] text-[#b0b7c3]" title="Jours de repos">
              Repos {am.p1_rest_days}j | {am.p2_rest_days}j
            </span>
          )}
          {am.h2h_surface && (
            <span className="text-[10px] text-[#f79009] font-medium" title="H2H sur cette surface">
              H2H {am.h2h_surface}
            </span>
          )}
          {am.h2h_last3?.length > 0 && (
            <span className="text-[10px] text-[#8a919e]" title="3 derniers H2H">
              {am.h2h_last3.join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
