import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setAccessToken, getAccessToken } from "../services/api";

interface User {
  id: number;
  email: string;
  display_name: string;
  tier: string;
  is_active: boolean;
  is_admin?: boolean;
  trial_ends_at: string | null;
  created_at: string;
  onboarding_completed: boolean;
  visited_modules: string[];
  email_verified: boolean;
  totp_enabled?: boolean;
  email_2fa_enabled?: boolean;
  preferred_2fa_method?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface TwoFactorRequired {
  requires_2fa: true;
  login_token: string;
  available_methods?: string[];
  preferred_method?: string;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void | TwoFactorRequired>;
  login2FAVerify: (login_token: string, code: string, method?: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { display_name?: string; email?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = "/api";

async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
  }
  return res.json();
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setState({ user: null, token: null, loading: false });
  }, []);

  // Tente un silent refresh via le cookie httpOnly au chargement
  const refreshUser = useCallback(async () => {
    // 1. Si on a deja un access token en memoire, essaie de charger le profil
    const currentToken = getAccessToken();
    if (currentToken) {
      try {
        const user = await apiGet<User>("/auth/me", currentToken);
        setState({ user, token: currentToken, loading: false });
        return;
      } catch {
        // access token expire, on tente le refresh via cookie
      }
    }

    // 2. Silent refresh via cookie httpOnly
    try {
      const data = await apiPost<{ access_token: string }>("/auth/refresh", undefined);
      setAccessToken(data.access_token);
      const user = await apiGet<User>("/auth/me", data.access_token);
      setState({ user, token: data.access_token, loading: false });
    } catch {
      // Pas de session valide
      clearAuth();
    }
  }, [clearAuth]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<void | TwoFactorRequired> => {
    const data = await apiPost<{ access_token?: string; user?: User; requires_2fa?: boolean; login_token?: string; available_methods?: string[]; preferred_method?: string }>(
      "/auth/login",
      { email, password }
    );

    // Cas 2FA : retourner l'info pour que le composant Login puisse afficher le champ code
    if (data.requires_2fa && data.login_token) {
      return { requires_2fa: true, login_token: data.login_token, available_methods: data.available_methods, preferred_method: data.preferred_method };
    }

    if (!data.access_token) throw new Error("Token manquant");
    setAccessToken(data.access_token);
    // Le cookie refresh_token est pose par le backend (httpOnly)
    const user = await apiGet<User>("/auth/me", data.access_token);
    setState({ user, token: data.access_token, loading: false });
  };

  const login2FAVerify = async (login_token: string, code: string, method: string = "totp"): Promise<void> => {
    const data = await apiPost<{ access_token: string; user: User }>("/auth/2fa/login", { login_token, code, method });
    setAccessToken(data.access_token);
    const user = await apiGet<User>("/auth/me", data.access_token);
    setState({ user, token: data.access_token, loading: false });
  };

  const register = async (email: string, password: string, displayName: string) => {
    await apiPost("/auth/register", { email, password, display_name: displayName });
    await login(email, password);
  };

  const logout = async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await fetch(`${BASE}/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Logout local meme si l'API echoue
    }
    clearAuth();
  };

  const updateProfile = async (data: { display_name?: string; email?: string }) => {
    const token = getAccessToken();
    if (!token) throw new Error("Non authentifie");
    const res = await fetch(`${BASE}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    await refreshUser();
  };

  const deleteAccount = async () => {
    const token = getAccessToken();
    if (!token) throw new Error("Non authentifie");
    const res = await fetch(`${BASE}/auth/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ ...state, login, login2FAVerify, register, logout, refreshUser, updateProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
