import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/services/api";

export default function OnboardingModal() {
  const { user, refreshUser } = useAuth();
  const [bankroll, setBankroll] = useState(500);
  const [stakePct, setStakePct] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const firstName = user?.display_name?.split(" ")[0] || "";

  const handleSubmit = async () => {
    if (bankroll < 10) {
      setError("La bankroll doit être d'au moins 10€");
      return;
    }
    if (stakePct < 0.5 || stakePct > 20) {
      setError("La mise doit être entre 0.5% et 20%");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.completeOnboarding(bankroll, stakePct);
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await api.skipOnboarding();
      await refreshUser();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: "40px 44px 32px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "#4f8cff",
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" width="18" height="18">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#111318" }}>
            Bet<span style={{ color: "#4f8cff" }}>Tracker</span>
          </span>
        </div>

        {/* Welcome */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111318", margin: "0 0 6px" }}>
          Bienvenue{firstName ? `, ${firstName}` : ""} !
        </h2>
        <p style={{ fontSize: 14, color: "#5a6170", margin: "0 0 28px", lineHeight: 1.5 }}>
          Configurez votre bankroll et mise par défaut pour commencer. Vous pourrez les modifier plus tard dans les paramètres.
        </p>

        {/* Bankroll */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111318", marginBottom: 6 }}>
            Bankroll initiale (€)
          </label>
          <input
            type="number"
            value={bankroll}
            onChange={(e) => setBankroll(Number(e.target.value))}
            min={10}
            placeholder="500"
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid #e3e6eb",
              borderRadius: 8,
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#4f8cff")}
            onBlur={(e) => (e.target.style.borderColor = "#e3e6eb")}
          />
          <p style={{ fontSize: 12, color: "#8a919e", margin: "4px 0 0" }}>
            Le capital total que vous dédiez aux paris sportifs
          </p>
        </div>

        {/* Stake */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111318", marginBottom: 6 }}>
            Mise par défaut (% de la bankroll)
          </label>
          <input
            type="number"
            value={stakePct}
            onChange={(e) => setStakePct(Number(e.target.value))}
            min={0.5}
            max={20}
            step={0.5}
            placeholder="2"
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid #e3e6eb",
              borderRadius: 8,
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#4f8cff")}
            onBlur={(e) => (e.target.style.borderColor = "#e3e6eb")}
          />
          <p style={{ fontSize: 12, color: "#8a919e", margin: "4px 0 0" }}>
            Pourcentage de votre bankroll misé par pari (recommandé : 1-3%)
          </p>
        </div>

        {error && (
          <p style={{ color: "#f04438", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 0",
            background: "#4f8cff",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
            marginBottom: 12,
          }}
        >
          {loading ? "..." : "Commencer"}
        </button>

        {/* Skip */}
        <button
          onClick={handleSkip}
          disabled={loading}
          style={{
            width: "100%",
            padding: "8px 0",
            background: "transparent",
            color: "#8a919e",
            border: "none",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Configurer plus tard
        </button>
      </div>
    </div>,
    document.body
  );
}
