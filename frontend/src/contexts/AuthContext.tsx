import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface User {
  id: number;
  email: string;
  display_name: string;
  tier: string;
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { display_name?: string; email?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = "/api";

async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
  }
  return res.json();
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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
    token: localStorage.getItem("access_token"),
    loading: true,
  });

  const setToken = (access: string, refresh: string) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
    setState((s) => ({ ...s, token: access }));
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setState({ user: null, token: null, loading: false });
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setState({ user: null, token: null, loading: false });
      return;
    }
    try {
      const user = await apiGet<User>("/auth/me", token);
      setState({ user, token, loading: false });
    } catch {
      // Try refresh
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const tokens = await apiPost<{ access_token: string; refresh_token: string }>(
            "/auth/refresh",
            { refresh_token: refreshToken },
          );
          setToken(tokens.access_token, tokens.refresh_token);
          const user = await apiGet<User>("/auth/me", tokens.access_token);
          setState({ user, token: tokens.access_token, loading: false });
          return;
        } catch {
          // Refresh failed
        }
      }
      clearAuth();
    }
  }, [clearAuth]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const tokens = await apiPost<{ access_token: string; refresh_token: string }>(
      "/auth/login",
      { email, password },
    );
    setToken(tokens.access_token, tokens.refresh_token);
    const user = await apiGet<User>("/auth/me", tokens.access_token);
    setState({ user, token: tokens.access_token, loading: false });
  };

  const register = async (email: string, password: string, displayName: string) => {
    await apiPost("/auth/register", { email, password, display_name: displayName });
    await login(email, password);
  };

  const logout = () => {
    clearAuth();
  };

  const updateProfile = async (data: { display_name?: string; email?: string }) => {
    const token = localStorage.getItem("access_token");
    if (!token) throw new Error("Non authentifie");
    const res = await fetch(`${BASE}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    await refreshUser();
  };

  const deleteAccount = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw new Error("Non authentifie");
    const res = await fetch(`${BASE}/auth/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, updateProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
