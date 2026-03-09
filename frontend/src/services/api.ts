const BASE = "/api";

let isRefreshing = false;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return false;
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;

  isRefreshing = true;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });

  // 401 → try refresh, then retry once
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem("access_token");
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${BASE}${path}`, { headers, ...options });
    }
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw new Error("Session expirée");
    }
  }

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

export function getPortfolioStats(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<import("../types").PortfolioStats>(`/portfolio/stats${qs}`);
}

export function getPortfolioHistory(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<import("../types").PortfolioHistoryPoint[]>(`/portfolio/history${qs}`);
}

export function getDashboardSummary() {
  return request<import("../types").DashboardSummary>("/dashboard/summary");
}

// Team autocomplete
export function searchTeams(q: string) {
  return request<string[]>(`/teams/search?q=${encodeURIComponent(q)}`);
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

export function getCampaignBets(id: number) {
  return request<import("../types").Bet[]>(`/campaigns/${id}/bets`);
}

export function updateCampaignBet(campaignId: number, betId: number, result: string) {
  return request<import("../types").Bet>(`/campaigns/${campaignId}/bets/${betId}`, {
    method: "PATCH",
    body: JSON.stringify({ result }),
  });
}

export function deleteCampaignBet(campaignId: number, betId: number) {
  return request<void>(`/campaigns/${campaignId}/bets/${betId}`, { method: "DELETE" });
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

// User stats
export function getUserStats() {
  return request<import("../types").UserStats>("/auth/stats");
}

// Account management
export function updateProfile(body: { display_name?: string; email?: string }) {
  return request<{ id: number; email: string; display_name: string; tier: string }>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function changePassword(body: { current_password: string; new_password: string }) {
  return request<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string) {
  return request<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function deleteAccount() {
  return request<{ message: string }>("/auth/me", { method: "DELETE" });
}
