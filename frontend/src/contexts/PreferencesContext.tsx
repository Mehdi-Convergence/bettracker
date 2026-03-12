import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getPreferences, updatePreferences as apiUpdatePreferences } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import type { UserPreferences } from "@/types";

interface PreferencesContextValue {
  preferences: UserPreferences | null;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const DEFAULT_PREFS: UserPreferences = {
  initial_bankroll: 1000,
  default_stake: 30,
  stake_as_percentage: false,
  stake_percentage: 2,
  daily_stop_loss: 10,
  stop_loss_unit: "pct",
  low_bankroll_alert: 200,
  notif_new_ticket: true,
  notif_stop_loss: true,
  notif_smart_stop: true,
  notif_campaign_ending: true,
  notif_low_bankroll: true,
  share_pseudo: "",
  share_show_stake: false,
  share_show_gain_euros: true,
  share_show_bookmaker: true,
  share_show_clv: true,
  theme: "light",
  language: "fr",
  currency: "EUR",
  odds_format: "decimal",
  default_tickets_view: "kanban",
  default_campaigns_view: "grid",
};

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // auto : se base sur la preferece systeme
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  const load = useCallback(async () => {
    try {
      const prefs = await getPreferences();
      setPreferences(prefs);
      applyTheme(prefs.theme ?? "light");
    } catch {
      // Echec silencieux — l'utilisateur n'est peut-etre pas encore connecte
    }
  }, []);

  useEffect(() => {
    if (user) {
      load();
    } else {
      setPreferences(null);
    }
  }, [user, load]);

  // Ecoute les changements de preference systeme pour le theme "auto"
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (preferences?.theme === "auto") {
        applyTheme("auto");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [preferences?.theme]);

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const updated = await apiUpdatePreferences(patch);
    setPreferences(updated);
    if (patch.theme !== undefined) {
      applyTheme(updated.theme ?? "light");
    }
  }, []);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue & { prefs: UserPreferences } {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return {
    ...ctx,
    prefs: ctx.preferences ?? DEFAULT_PREFS,
  };
}
