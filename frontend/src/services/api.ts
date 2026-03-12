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
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Backtest
export function runBacktest(body: unknown) {
  return request<import("../types").BacktestResponse>("/backtest/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function saveBacktest(body: {
  name: string;
  sport: string;
  params: Record<string, unknown>;
  metrics: Record<string, unknown>;
  bets: Record<string, unknown>[];
  bankroll_curve: number[];
  config: Record<string, unknown>;
}) {
  return request<import("../types").SavedBacktestSummary>("/backtest/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getSavedBacktests() {
  return request<import("../types").SavedBacktestSummary[]>("/backtest/saved");
}

export function getSavedBacktest(id: number) {
  return request<import("../types").SavedBacktestFull>(`/backtest/saved/${id}`);
}

export function deleteSavedBacktest(id: number) {
  return request<void>(`/backtest/saved/${id}`, { method: "DELETE" });
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

export function getCampaignRecommendations(id: number) {
  return request<import("../types").CampaignRecommendationsResponse>(
    `/campaigns/${id}/recommendations`
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

export function getCampaignVersions(id: number) {
  return request<import("../types").CampaignVersionList>(`/campaigns/${id}/versions`);
}

export function getCampaignVersion(id: number, version: number) {
  return request<import("../types").CampaignVersion>(`/campaigns/${id}/versions/${version}`);
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

export function updatePortfolioBet(betId: number, result: string) {
  return request<import("../types").Bet>(`/portfolio/bets/${betId}`, {
    method: "PATCH",
    body: JSON.stringify({ result }),
  });
}

export function updateBetNote(betId: number, note: string) {
  return request<import("../types").Bet>(`/portfolio/bets/${betId}/note`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export function deletePortfolioBet(betId: number) {
  return request<void>(`/portfolio/bets/${betId}`, { method: "DELETE" });
}

// AI Research
export function aiScan(params: { sport: string; leagues?: string; timeframe?: string; force?: boolean; cacheOnly?: boolean }) {
  const qs = new URLSearchParams();
  qs.set("sport", params.sport);
  if (params.leagues) qs.set("leagues", params.leagues);
  if (params.timeframe) qs.set("timeframe", params.timeframe);
  if (params.force) qs.set("force", "true");
  if (params.cacheOnly) qs.set("cache_only", "true");
  return request<import("../types").AIScanResponse>(`/scanner/ai-scan?${qs}`);
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

// User preferences
export function getPreferences() {
  return request<import("../types").UserPreferences>("/settings/preferences");
}

export function updatePreferences(body: Partial<import("../types").UserPreferences>) {
  return request<import("../types").UserPreferences>("/settings/preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// Notifications
export function getNotifications() {
  return request<import("../types").AppNotification[]>("/notifications");
}

export function getUnreadCount() {
  return request<{ count: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: number) {
  return request<import("../types").AppNotification>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return request<void>("/notifications/read-all", { method: "POST" });
}

// Onboarding & Tour
export function completeOnboarding(bankroll: number, default_stake_pct: number) {
  return request<unknown>("/auth/onboarding", {
    method: "POST",
    body: JSON.stringify({ bankroll, default_stake_pct }),
  });
}

export function skipOnboarding() {
  return request<unknown>("/auth/onboarding/skip", { method: "POST" });
}

export function markTourVisited(module: string) {
  return request<{ message: string }>("/auth/tour-visited", {
    method: "POST",
    body: JSON.stringify({ module }),
  });
}

export function sendFeedback(message: string) {
  return request<{ ok: boolean; sent: boolean }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// Stripe
export function createCheckoutSession(tier: "pro" | "premium") {
  return request<{ url: string }>("/stripe/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

export function createBillingPortalSession() {
  return request<{ url: string }>("/stripe/portal", {
    method: "POST",
  });
}
