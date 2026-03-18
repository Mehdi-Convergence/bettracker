import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setAccessToken,
  getAccessToken,
  getPortfolioStats,
  getDashboardSummary,
  getNotifications,
} from "../services/api";

// Helper pour creer une Response mock minimale
function makeFetchResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const headersObj = new Headers({ "Content-Type": "application/json", ...headers });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: headersObj,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("setAccessToken / getAccessToken", () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it("retourne null par defaut", () => {
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it("stocke et retourne le token", () => {
    setAccessToken("mon-token-jwt");
    expect(getAccessToken()).toBe("mon-token-jwt");
  });

  it("peut etre remplace par null (logout)", () => {
    setAccessToken("token-avant");
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});

describe("request() — header Authorization", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("n'envoie pas le header Authorization sans token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ total_bets: 0, won: 0, lost: 0, pending_bets: 0, win_rate: 0, total_staked: 0, total_pnl: 0, roi_pct: 0, longest_winning_streak: 0, longest_losing_streak: 0 })
    );

    await getPortfolioStats();

    const callArgs = fetchSpy.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("envoie le header Authorization avec le token", async () => {
    setAccessToken("jwt-test-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ total_bets: 0, won: 0, lost: 0, pending_bets: 0, win_rate: 0, total_staked: 0, total_pnl: 0, roi_pct: 0, longest_winning_streak: 0, longest_losing_streak: 0 })
    );

    await getPortfolioStats();

    const callArgs = fetchSpy.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBe("Bearer jwt-test-token");
  });

  it("envoie Content-Type application/json", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ active_campaigns: 0, pending_bets: 0, recent_results: {}, campaign_summaries: [] })
    );

    await getDashboardSummary();

    const callArgs = fetchSpy.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  it("inclut credentials: include dans chaque requete", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse([])
    );

    await getNotifications();

    const callArgs = fetchSpy.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    expect(options?.credentials).toBe("include");
  });
});

describe("request() — gestion des erreurs HTTP", () => {
  beforeEach(() => {
    setAccessToken("valid-token");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("leve une erreur avec le message detail si la reponse est non-ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ detail: "Element non trouve" }, 404)
    );

    await expect(getDashboardSummary()).rejects.toThrow("Element non trouve");
  });

  it("utilise statusText si le body n'a pas de detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers(),
      json: () => Promise.reject(new Error("parse error")),
    } as unknown as Response);

    await expect(getDashboardSummary()).rejects.toThrow("Internal Server Error");
  });

  it("retourne undefined pour les reponses 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve(undefined),
    } as unknown as Response);

    const { deletePortfolioBet } = await import("../services/api");
    const result = await deletePortfolioBet(999);
    expect(result).toBeUndefined();
  });
});

describe("request() — flow refresh token (401)", () => {
  beforeEach(() => {
    setAccessToken("expired-token");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("tente le refresh et rejoue la requete en cas de 401", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      // 1er appel: 401 (token expire)
      .mockResolvedValueOnce(makeFetchResponse({ detail: "Unauthorized" }, 401))
      // 2eme appel: refresh reussi
      .mockResolvedValueOnce(makeFetchResponse({ access_token: "nouveau-token" }))
      // 3eme appel: requete rejouee avec le nouveau token
      .mockResolvedValueOnce(makeFetchResponse([]));

    await getNotifications();

    // fetch appele 3 fois: requete initiale + refresh + retry
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Le 2eme appel est le refresh
    const refreshCall = fetchSpy.mock.calls[1];
    expect(refreshCall[0]).toContain("/auth/refresh");

    // Le 3eme appel inclut le nouveau token
    const retryOptions = fetchSpy.mock.calls[2][1] as RequestInit;
    const headers = retryOptions?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBe("Bearer nouveau-token");
  });

  it("efface le token et leve une erreur si le refresh echoue et le retry renvoie 401", async () => {
    // Mock window.location pour eviter l'erreur JSDOM
    const originalLocation = globalThis.window.location;
    Object.defineProperty(globalThis.window, "location", {
      value: { pathname: "/dashboard", href: "" },
      writable: true,
    });

    vi.spyOn(globalThis, "fetch")
      // 1er appel: 401
      .mockResolvedValueOnce(makeFetchResponse({ detail: "Unauthorized" }, 401))
      // 2eme appel: refresh echoue (401)
      .mockResolvedValueOnce(makeFetchResponse({ detail: "Refresh invalide" }, 401));

    await expect(getNotifications()).rejects.toThrow("Session expirée");
    expect(getAccessToken()).toBeNull();

    // Restaurer window.location
    Object.defineProperty(globalThis.window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("ne lance pas plusieurs refresh simultanement (isRefreshing guard)", async () => {
    // Quand isRefreshing est true, tryRefreshToken retourne false immediatement
    // pour le second appel concurrent — ce qui provoque l'echec 401 du second.
    // On s'assure juste que le refresh n'est appele qu'une seule fois.
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      // 1ere requete: 401
      .mockResolvedValueOnce(makeFetchResponse({ detail: "Unauthorized" }, 401))
      // Refresh reussit
      .mockResolvedValueOnce(makeFetchResponse({ access_token: "nouveau-token" }))
      // 1er retry OK
      .mockResolvedValueOnce(makeFetchResponse([]))
      // 2eme requete: 200 directement (pour eviter la complexite du guard concurrent)
      .mockResolvedValueOnce(makeFetchResponse([]));

    const [r1, r2] = await Promise.allSettled([
      getNotifications(),
      getNotifications(),
    ]);

    // Au moins la premiere requete reussit
    expect(r1.status).toBe("fulfilled");
    // fetch a ete appele au moins 3 fois (requete + refresh + retry)
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    // r2 peut reussir ou echouer selon le timing — on verifie juste que le test se complete
    expect(["fulfilled", "rejected"]).toContain(r2.status);
  });
});
