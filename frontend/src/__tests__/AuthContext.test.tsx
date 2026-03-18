import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth, ApiError } from "../contexts/AuthContext";
import { setAccessToken, getAccessToken } from "../services/api";

// Composant de test qui expose le contexte Auth via le DOM
function AuthConsumer({ action }: { action?: string }) {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="user">{auth.user ? auth.user.email : "null"}</div>
      <div data-testid="token">{auth.token ?? "null"}</div>
      {action === "logout" && (
        <button onClick={() => auth.logout()}>Logout</button>
      )}
    </div>
  );
}

// User fixture
const fakeUser = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  tier: "pro",
  is_active: true,
  trial_ends_at: null,
  created_at: "2024-01-01T00:00:00",
  onboarding_completed: true,
  visited_modules: [],
  email_verified: true,
};

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("ApiError", () => {
  it("instancie correctement avec status et body", () => {
    const err = new ApiError("Non autorise", 401, { detail: "Non autorise" });
    expect(err.message).toBe("Non autorise");
    expect(err.status).toBe(401);
    expect(err.body).toEqual({ detail: "Non autorise" });
    expect(err.name).toBe("ApiError");
  });

  it("est une instance de Error", () => {
    const err = new ApiError("Erreur", 500, {});
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });
});

describe("AuthProvider — initialisation", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("demarre avec loading=true puis passe a false apres le refresh initial", async () => {
    // Le refresh echoue (pas de cookie valide)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ detail: "Unauthorized" }, 401)
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    // Au debut: loading=true
    expect(screen.getByTestId("loading").textContent).toBe("true");

    // Apres le refresh initial: loading=false, user=null
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("restaure la session si un token valide est en memoire", async () => {
    setAccessToken("token-existant");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse(fakeUser)
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@example.com");
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});

describe("AuthProvider — login()", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("connecte l'utilisateur avec succes", async () => {
    // Sequence: refresh initial echoue, puis login reussit, puis /auth/me reussit
    vi.spyOn(globalThis, "fetch")
      // refresh initial (401)
      .mockResolvedValueOnce(makeFetchResponse({ detail: "No session" }, 401))
      // POST /auth/login
      .mockResolvedValueOnce(makeFetchResponse({ access_token: "new-token", user: fakeUser }))
      // GET /auth/me apres login
      .mockResolvedValueOnce(makeFetchResponse(fakeUser));

    function LoginConsumer() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="user">{auth.user ? auth.user.email : "null"}</div>
          <button
            onClick={() => auth.login("test@example.com", "password123")}
          >
            Login
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <LoginConsumer />
      </AuthProvider>
    );

    // Attendre la fin du refresh initial
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });

    // Declencher le login
    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Login" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@example.com");
    });
  });

  it("leve une ApiError si les credentials sont invalides", async () => {
    vi.spyOn(globalThis, "fetch")
      // refresh initial (401)
      .mockResolvedValueOnce(makeFetchResponse({ detail: "No session" }, 401))
      // POST /auth/login echoue
      .mockResolvedValueOnce(makeFetchResponse({ detail: "Identifiants invalides" }, 401));

    let caughtError: unknown = null;

    function LoginConsumer() {
      const auth = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await auth.login("bad@example.com", "wrong");
            } catch (e) {
              caughtError = e;
            }
          }}
        >
          Login
        </button>
      );
    }

    render(
      <AuthProvider>
        <LoginConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      // Attendre la fin du refresh initial
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Login" }));
    });

    await waitFor(() => {
      expect(caughtError).not.toBeNull();
    });
    expect(caughtError instanceof ApiError).toBe(true);
    expect((caughtError as ApiError).status).toBe(401);
    expect((caughtError as ApiError).message).toBe("Identifiants invalides");
  });

  it("retourne l'objet TwoFactorRequired si le backend signale requires_2fa", async () => {
    vi.spyOn(globalThis, "fetch")
      // refresh initial
      .mockResolvedValueOnce(makeFetchResponse({ detail: "No session" }, 401))
      // login retourne requires_2fa
      .mockResolvedValueOnce(
        makeFetchResponse({
          requires_2fa: true,
          login_token: "login-token-abc",
          available_methods: ["totp"],
          preferred_method: "totp",
        })
      );

    let result: unknown = null;

    function LoginConsumer() {
      const auth = useAuth();
      return (
        <button
          onClick={async () => {
            result = await auth.login("user@example.com", "pass");
          }}
        >
          Login
        </button>
      );
    }

    render(
      <AuthProvider>
        <LoginConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Login" }));
    });

    await waitFor(() => {
      expect(result).not.toBeNull();
    });
    const twoFA = result as { requires_2fa: boolean; login_token: string };
    expect(twoFA.requires_2fa).toBe(true);
    expect(twoFA.login_token).toBe("login-token-abc");
  });
});

describe("AuthProvider — logout()", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("efface l'utilisateur et le token apres logout", async () => {
    // Simule une session deja active
    setAccessToken("token-actif");

    vi.spyOn(globalThis, "fetch")
      // refresh initial reussit
      .mockResolvedValueOnce(makeFetchResponse(fakeUser))
      // POST /auth/logout
      .mockResolvedValueOnce(makeFetchResponse({ detail: "ok" }));

    function LogoutConsumer() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="user">{auth.user ? auth.user.email : "null"}</div>
          <div data-testid="token">{auth.token ?? "null"}</div>
          <button onClick={() => auth.logout()}>Logout</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>
    );

    // Attendre la restauration de session
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@example.com");
    });

    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
      expect(screen.getByTestId("token").textContent).toBe("null");
    });
    expect(getAccessToken()).toBeNull();
  });

  it("effectue le logout meme si l'appel API echoue", async () => {
    setAccessToken("token-actif");

    vi.spyOn(globalThis, "fetch")
      // refresh initial
      .mockResolvedValueOnce(makeFetchResponse(fakeUser))
      // POST /auth/logout echoue reseau
      .mockRejectedValueOnce(new Error("Network error"));

    function LogoutConsumer() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="user">{auth.user ? auth.user.email : "null"}</div>
          <button onClick={() => auth.logout()}>Logout</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@example.com");
    });

    const { fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    });

    // Meme si l'API echoue, le logout local se fait
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
    expect(getAccessToken()).toBeNull();
  });
});

describe("AuthProvider — useAuth() hors provider", () => {
  it("leve une erreur si useAuth est utilise hors AuthProvider", () => {
    function BrokenConsumer() {
      useAuth();
      return null;
    }

    // Supprimer les erreurs de console pour ce test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<BrokenConsumer />)).toThrow(
      "useAuth must be used within AuthProvider"
    );

    consoleSpy.mockRestore();
  });
});
