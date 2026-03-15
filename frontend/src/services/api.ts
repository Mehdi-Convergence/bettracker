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

// PMU
export function pmuScan(force?: boolean) {
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  const query = qs.toString() ? `?${qs}` : "";
  return request<import("../types").PMUScanResponse>(`/scanner/pmu${query}`);
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

export function logoutAll() {
  return request<{ message: string }>("/auth/logout-all", { method: "POST" });
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

// Odds history
export function getBetOddsHistory(betId: number) {
  return request<{ time: string; odds: number; event?: string }[]>(
    `/portfolio/bets/${betId}/odds-history`
  );
}

// AI Analyste
export async function* aiChatStream(
  message: string,
  conversationId?: number | null,
): AsyncGenerator<{ type: "token" | "done" | "error"; text?: string; conversationId?: number; usage?: Record<string, number>; message?: string }> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = JSON.stringify({
    message,
    conversation_id: conversationId ?? null,
  });

  const res = await fetch(`${BASE}/ai/chat`, { method: "POST", headers, body });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
      return;
    }
    // Retry with new token
    const newToken = localStorage.getItem("access_token");
    headers["Authorization"] = `Bearer ${newToken}`;
    const res2 = await fetch(`${BASE}/ai/chat`, { method: "POST", headers, body });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({ detail: res2.statusText }));
      yield { type: "error", message: typeof err.detail === "string" ? err.detail : res2.statusText };
      return;
    }
    const convId = parseInt(res2.headers.get("X-Conversation-Id") || "0");
    const reader = res2.body?.getReader();
    if (!reader) return;
    yield* readSSEStream(reader, convId);
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    yield { type: "error", message: typeof err.detail === "string" ? err.detail : res.statusText };
    return;
  }

  const convId = parseInt(res.headers.get("X-Conversation-Id") || "0");
  const reader = res.body?.getReader();
  if (!reader) return;
  yield* readSSEStream(reader, convId);
}

async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  conversationId: number,
): AsyncGenerator<{ type: "token" | "done" | "error"; text?: string; conversationId?: number; usage?: Record<string, number>; message?: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "token") {
          yield { type: "token", text: data.text, conversationId };
        } else if (data.type === "done") {
          yield { type: "done", conversationId, usage: data.usage };
        } else if (data.type === "error") {
          yield { type: "error", message: data.message, conversationId };
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

export function getAIConversations() {
  return request<import("../types").AIConversation[]>("/ai/conversations");
}

export function getAIConversationMessages(conversationId: number) {
  return request<import("../types").AIMessageData[]>(`/ai/conversations/${conversationId}/messages`);
}

export function deleteAIConversation(conversationId: number) {
  return request<{ ok: boolean }>(`/ai/conversations/${conversationId}`, { method: "DELETE" });
}

export function getAIRateLimit() {
  return request<import("../types").AIRateLimit>("/ai/rate-limit");
}

// Admin
export function getAdminSystem() {
  return request<import("../types").AdminSystemStatus>("/admin/system");
}

export function getAdminScans() {
  return request<import("../types").AdminScanStatus[]>("/admin/scans");
}

export function getAdminQuota() {
  return request<import("../types").AdminQuota>("/admin/quota");
}

export function getAdminAnalytics() {
  return request<import("../types").AdminSportAnalytics[]>("/admin/analytics/sports");
}

export function getAdminAlerts() {
  return request<import("../types").AdminAlert[]>("/admin/alerts");
}

export function getAdminErrors() {
  return request<import("../types").AdminError[]>("/admin/errors");
}

export function forceScan(sport: string) {
  return request<{ ok: boolean; message: string }>(`/admin/scan/${sport}/force`, { method: "POST" });
}
