const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const msg = typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
      : res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

// Scanner
export function scanValueBets(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<import("../types").ScanResponse>(`/scanner/value-bets${qs}`);
}

// Multi-Market Scanner (Betclic)
export function scanMultiMarket(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<import("../types").MultiMarketScanResponse>(`/scanner/matches${qs}`);
}

export function scanLiveMatches() {
  return request<import("../types").MultiMarketScanResponse>("/scanner/live");
}

// Combos
export function generateCombos(body: unknown) {
  return request<import("../types").Combo[]>("/combos/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function simulateCombo(body: unknown) {
  return request<{ combined_odds: number; combined_prob: number; ev: number; stake: number; potential_gain: number; num_legs: number }>("/combos/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Backtest
export function runBacktest(body: unknown) {
  return request<import("../types").BacktestResponse>("/backtest/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Portfolio
export function getPortfolioBets(campaignId?: number | null) {
  const params = new URLSearchParams();
  if (campaignId !== undefined && campaignId !== null) {
    params.set("campaign_id", String(campaignId));
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<import("../types").Bet[]>(`/portfolio/bets${qs}`);
}

export function createBet(body: unknown) {
  return request<import("../types").Bet>("/portfolio/bets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPortfolioStats() {
  return request<import("../types").PortfolioStats>("/portfolio/stats");
}

// Team autocomplete
export function searchTeams(q: string) {
  return request<string[]>(`/teams/search?q=${encodeURIComponent(q)}`);
}

// Team players (scraped data)
export function getTeamPlayers(team: string, league: string, force = false) {
  const params = new URLSearchParams({ team, league });
  if (force) params.set("force", "true");
  return request<import("../types").TeamPlayersResponse>(`/scanner/team-players?${params}`);
}

// Match details
export function getMatchDetails(body: { home_team: string; away_team: string; league: string; date: string }) {
  return request<import("../types").MatchDetail>("/scanner/match-details", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Matches
export function getMatches(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<{ total: number; matches: unknown[] }>(`/matches${qs}`);
}

// Campaigns
export function createCampaign(body: unknown) {
  return request<import("../types").Campaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getCampaigns() {
  return request<import("../types").Campaign[]>("/campaigns");
}

export function getCampaignDetail(id: number) {
  return request<import("../types").CampaignDetail>(`/campaigns/${id}`);
}

export function updateCampaign(id: number, body: unknown) {
  return request<import("../types").Campaign>(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function getCampaignRecommendations(id: number, demo?: boolean) {
  const qs = demo ? "?demo=true" : "";
  return request<import("../types").CampaignRecommendationsResponse>(
    `/campaigns/${id}/recommendations${qs}`
  );
}

export function acceptCampaignRecommendation(id: number, body: unknown) {
  return request<import("../types").Bet>(`/campaigns/${id}/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getCampaignHistory(id: number) {
  return request<import("../types").BankrollPoint[]>(`/campaigns/${id}/history`);
}

// AI Research (Claude Code powered)
export function aiScan(params: { sport: string; leagues?: string; timeframe?: string; force?: boolean; cacheOnly?: boolean }) {
  const qs = new URLSearchParams();
  qs.set("sport", params.sport);
  if (params.leagues) qs.set("leagues", params.leagues);
  if (params.timeframe) qs.set("timeframe", params.timeframe);
  if (params.force) qs.set("force", "true");
  if (params.cacheOnly) qs.set("cache_only", "true");
  return request<import("../types").AIScanResponse>(`/scanner/ai-scan?${qs}`);
}

export function aiResearch(params: { sport: string; home: string; away: string; competition: string; date: string; force?: boolean }) {
  const qs = new URLSearchParams();
  qs.set("sport", params.sport);
  qs.set("home", params.home);
  qs.set("away", params.away);
  qs.set("competition", params.competition);
  qs.set("date", params.date);
  if (params.force) qs.set("force", "true");
  return request<import("../types").AIResearchResponse>(`/scanner/ai-research?${qs}`);
}
