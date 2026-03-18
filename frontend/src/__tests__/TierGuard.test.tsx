import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TierGuard, userHasTier } from "../components/TierGuard";
import { AuthProvider } from "../contexts/AuthContext";
import { setAccessToken } from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(tier: string, trialEndsAt: string | null = null) {
  return {
    id: 1,
    email: "user@example.com",
    display_name: "Test",
    tier,
    is_active: true,
    trial_ends_at: trialEndsAt,
    created_at: "2024-01-01T00:00:00",
    onboarding_completed: true,
    visited_modules: [],
    email_verified: true,
  };
}

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// Rend TierGuard avec un vrai AuthProvider dont la session est pre-initialisee
// via un token deja pose en memoire et un mock de fetch /auth/me.
async function renderWithAuth(
  user: ReturnType<typeof makeUser> | null,
  minTier: "pro" | "premium"
) {
  if (user) {
    setAccessToken("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse(user)
    );
  } else {
    setAccessToken(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse({ detail: "Unauthorized" }, 401)
    );
  }

  const result = render(
    <MemoryRouter>
      <AuthProvider>
        <TierGuard minTier={minTier}>
          <div data-testid="protected-content">Contenu protege</div>
        </TierGuard>
      </AuthProvider>
    </MemoryRouter>
  );

  // Attendre la fin de l'initialisation du contexte Auth
  await waitFor(() => {
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled();
  });

  return result;
}

// ---------------------------------------------------------------------------
// Tests de la fonction utilitaire userHasTier()
// ---------------------------------------------------------------------------

describe("userHasTier() — fonction utilitaire", () => {
  it("autorise un utilisateur pro a acceder au tier pro", () => {
    expect(userHasTier("pro", "pro", null)).toBe(true);
  });

  it("autorise un utilisateur premium a acceder au tier pro", () => {
    expect(userHasTier("premium", "pro", null)).toBe(true);
  });

  it("autorise un utilisateur premium a acceder au tier premium", () => {
    expect(userHasTier("premium", "premium", null)).toBe(true);
  });

  it("refuse un utilisateur free sans trial pour le tier pro", () => {
    expect(userHasTier("free", "pro", null)).toBe(false);
  });

  it("refuse un utilisateur free sans trial pour le tier premium", () => {
    expect(userHasTier("free", "premium", null)).toBe(false);
  });

  it("refuse un utilisateur pro pour le tier premium", () => {
    expect(userHasTier("pro", "premium", null)).toBe(false);
  });

  it("autorise un utilisateur free en trial actif pour le tier pro", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    expect(userHasTier("free", "pro", futureDate)).toBe(true);
  });

  it("autorise un utilisateur free en trial actif pour le tier premium", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    expect(userHasTier("free", "premium", futureDate)).toBe(true);
  });

  it("refuse un utilisateur free dont le trial est expire", () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    expect(userHasTier("free", "pro", pastDate)).toBe(false);
  });

  it("gere un tier inconnu comme niveau 0 (free)", () => {
    expect(userHasTier("unknown_tier", "pro", null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests du composant React TierGuard
// ---------------------------------------------------------------------------

describe("TierGuard — composant React", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken(null);
  });

  it("retourne null si l'utilisateur n'est pas connecte", async () => {
    await renderWithAuth(null, "pro");
    await waitFor(() => {
      const content = screen.queryByTestId("protected-content");
      const overlay = screen.queryByText(/Module reserve au plan/i);
      expect(content).toBeNull();
      expect(overlay).toBeNull();
    });
  });

  it("affiche le contenu directement si le tier est suffisant (pro -> pro)", async () => {
    await renderWithAuth(makeUser("pro"), "pro");
    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Module reserve au plan/i)).not.toBeInTheDocument();
  });

  it("affiche le contenu directement si le tier est suffisant (premium -> premium)", async () => {
    await renderWithAuth(makeUser("premium"), "premium");
    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Module reserve au plan/i)).not.toBeInTheDocument();
  });

  it("affiche le contenu directement si le tier est premium et le requis est pro", async () => {
    await renderWithAuth(makeUser("premium"), "pro");
    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Module reserve au plan/i)).not.toBeInTheDocument();
  });

  it("affiche le contenu en trial actif (free avec trial valide)", async () => {
    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString();
    await renderWithAuth(makeUser("free", futureDate), "premium");
    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Module reserve au plan/i)).not.toBeInTheDocument();
  });

  it("affiche l'overlay si le tier est insuffisant (free -> pro)", async () => {
    await renderWithAuth(makeUser("free"), "pro");
    await waitFor(() => {
      expect(screen.getByText(/Module reserve au plan/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Passer au plan/i)).toBeInTheDocument();
    // Le contenu est rendu en preview derriere l'overlay
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("affiche l'overlay si le tier est insuffisant (pro -> premium)", async () => {
    await renderWithAuth(makeUser("pro"), "premium");
    await waitFor(() => {
      expect(screen.getByText(/Passer au plan Elite/i)).toBeInTheDocument();
    });
  });

  it("affiche l'overlay si le trial est expire (free avec trial expire)", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    await renderWithAuth(makeUser("free", pastDate), "pro");
    await waitFor(() => {
      expect(screen.getByText(/Module reserve au plan/i)).toBeInTheDocument();
    });
  });

  it("ferme l'overlay via le bouton Explorer en mode demo", async () => {
    await renderWithAuth(makeUser("free"), "pro");
    await waitFor(() => {
      expect(screen.getByText(/Module reserve au plan/i)).toBeInTheDocument();
    });

    const demoButton = screen.getByRole("button", { name: /Explorer en mode demo/i });
    fireEvent.click(demoButton);

    await waitFor(() => {
      expect(screen.queryByText(/Module reserve au plan/i)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("le lien upgrade pointe vers /settings?tab=plan", async () => {
    await renderWithAuth(makeUser("free"), "pro");
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Passer au plan/i })).toBeInTheDocument();
    });

    const upgradeLink = screen.getByRole("link", { name: /Passer au plan/i });
    expect(upgradeLink).toHaveAttribute("href", "/settings?tab=plan");
  });
});
