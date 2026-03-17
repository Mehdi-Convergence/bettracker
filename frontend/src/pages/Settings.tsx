import { useState, useEffect, useCallback } from "react";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Shield,
  ShieldCheck,
  KeyRound,
  Star,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Download,
  Trash2,
  Bell,
  CreditCard,
  X,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  changePassword,
  getUserStats,
  deleteAccount as apiDeleteAccount,
  logoutAll as apiLogoutAll,
  createCheckoutSession,
  createBillingPortalSession,
  setup2FA,
  verify2FA,
  disable2FA,
} from "@/services/api";
import { Toggle } from "@/components/ui";
import type { UserStats } from "@/types";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { settingsTour } from "@/tours/index";

/* ── Design tokens ── */
const C = {
  bg: "var(--bg-primary)",
  white: "var(--bg-card)",
  surface: "var(--bg-surface)",
  border: "var(--border-color)",
  border2: "var(--border-strong)",
  text: "var(--text-primary)",
  text2: "var(--text-secondary)",
  muted: "var(--text-muted)",
  muted2: "var(--text-muted2)",
  accent: "var(--accent)",
  accentBg: "var(--accent-bg)",
  accentBd: "var(--accent-border)",
  green: "var(--green)",
  greenBg: "var(--green-bg)",
  red: "var(--red)",
  redBg: "var(--red-bg)",
  amber: "var(--amber)",
  amberBg: "var(--amber-bg)",
  radius: "12px",
};

type Tab = "compte" | "securite" | "plan" | "danger";

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

/* ── Password strength ── */
function getStrength(v: string): number {
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12) s++;
  if (/[A-Z]/.test(v) && /[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s;
}

const STRENGTH_LABELS = ["", "Faible", "Moyen", "Fort", "Très fort"];
const STRENGTH_COLORS = ["", C.red, C.amber, C.green, C.green];

/* ── Plans — aligne avec la landing page ── */
const PLANS: { id: string; name: string; priceMonthly: string; priceAnnual: string; annualTotal: string; annualSaving: string; period: string; desc?: string; badge?: string; features: { text: string; ok: boolean; bold?: boolean; soon?: boolean }[] }[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: "0€",
    priceAnnual: "0€",
    annualTotal: "",
    annualSaving: "",
    period: "7 jours",
    desc: "Acces a toutes les fonctionnalites pendant 7 jours. Aucune carte bancaire requise.",
    features: [
      { text: "Scanner IA illimite", ok: true },
      { text: "Portfolio", ok: true },
      { text: "Dashboard", ok: true },
      { text: "Backtest", ok: true },
      { text: "Campagnes", ok: true },
      { text: "Partage de tickets", ok: true },
      { text: "Export CSV", ok: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: "29€",
    priceAnnual: "23€",
    annualTotal: "276€/an",
    annualSaving: "economisez 72€",
    period: "/mois",
    badge: "Le plus populaire",
    desc: "L'algo analyse tous les matchs pour vous. Placez selon les recommandations, au bon moment.",
    features: [
      { text: "Scanner IA illimite", ok: true, bold: true },
      { text: "Portfolio", ok: true },
      { text: "Dashboard", ok: true },
      { text: "Backtest", ok: true },
      { text: "Partage de tickets", ok: true },
      { text: "Campagnes", ok: false },
      { text: "Export CSV", ok: false },
    ],
  },
  {
    id: "premium",
    name: "Elite",
    priceMonthly: "69€",
    priceAnnual: "55€",
    annualTotal: "660€/an",
    annualSaving: "economisez 168€",
    period: "/mois",
    desc: "L'algo tourne en automatique via les Campagnes. L'IA analyse. Vous supervisez.",
    features: [
      { text: "Tout le Pro inclus", ok: true },
      { text: "Campagnes illimitees", ok: true, bold: true },
      { text: "IA Analyste", ok: true, bold: true, soon: true },
      { text: "Support prioritaire", ok: true },
      { text: "Acces prioritaire nouvelles features", ok: true },
      { text: "Export CSV", ok: true },
    ],
  },
];

export default function Settings() {
  const { user, updateProfile, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "billing" || t === "plan") return "plan";
    if (t === "securite") return "securite";
    if (t === "danger") return "danger";
    return "compte";
  });
  const [billingSuccess, setBillingSuccess] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("success") === "1";
  });
  const { showTour, completeTour } = useTour("settings");

  const fireConfetti = useCallback(() => {
    const duration = 2500;
    const end = Date.now() + duration;
    const colors = ["#3b5bdb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    // Big initial burst
    confetti({ particleCount: 100, spread: 100, origin: { y: 0.6 }, colors });
    frame();
  }, []);

  useEffect(() => {
    if (billingSuccess) {
      refreshUser();
      fireConfetti();
      const timer = setTimeout(() => setBillingSuccess(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [billingSuccess, refreshUser, fireConfetti]);

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Toggles (local state for now)
  // TODO: public_profile n'existe pas dans UserPreferences — toggle desactive jusqu'a implementation backend
  const [publicProfile] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [matchAlerts, setMatchAlerts] = useState(true);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({});

  // User stats
  const [stats, setStats] = useState<UserStats | null>(null);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Save feedback
  const [saved, setSaved] = useState(false);

  // Billing
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [billingError, setBillingError] = useState("");

  // 2FA states
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "disable">("idle");
  const [twoFaQr, setTwoFaQr] = useState("");
  const [twoFaSecret, setTwoFaSecret] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaDisablePwd, setTwoFaDisablePwd] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaSuccess, setTwoFaSuccess] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  useEffect(() => {
    getUserStats().then(setStats).catch(() => {});
  }, []);

  const initials = getInitials(user?.display_name || "U");

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr("");
    setProfileMsg("");
    setProfileLoading(true);
    try {
      const updates: { display_name?: string; email?: string } = {};
      if (displayName !== user?.display_name) updates.display_name = displayName;
      if (email !== user?.email) updates.email = email;
      if (Object.keys(updates).length === 0) {
        setProfileMsg("Aucune modification");
        setProfileLoading(false);
        return;
      }
      await updateProfile(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setProfileErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePwdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr("");
    setPwdMsg("");
    if (newPwd.length < 8) { setPwdErr("Min. 8 caractères"); return; }
    if (newPwd !== confirmPwd) { setPwdErr("Les mots de passe ne correspondent pas"); return; }
    setPwdLoading(true);
    try {
      await changePassword({ current_password: currentPwd, new_password: newPwd });
      setPwdMsg("Mot de passe modifié avec succès");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: unknown) {
      setPwdErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFaError(""); setTwoFaSuccess(""); setTwoFaLoading(true);
    try {
      const data = await setup2FA();
      setTwoFaQr(data.qr_code);
      setTwoFaSecret(data.secret);
      setTwoFaStep("setup");
      setTwoFaCode("");
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Erreur");
    } finally { setTwoFaLoading(false); }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaError(""); setTwoFaLoading(true);
    try {
      await verify2FA(twoFaCode);
      setTwoFaSuccess("Double authentification activee avec succes !");
      setTwoFaStep("idle");
      setTwoFaCode("");
      refreshUser();
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Code invalide");
    } finally { setTwoFaLoading(false); }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaError(""); setTwoFaLoading(true);
    try {
      await disable2FA(twoFaDisablePwd, twoFaCode);
      setTwoFaSuccess("Double authentification desactivee.");
      setTwoFaStep("idle");
      setTwoFaCode(""); setTwoFaDisablePwd("");
      refreshUser();
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Erreur");
    } finally { setTwoFaLoading(false); }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await apiDeleteAccount();
      logout();
      navigate("/login");
    } catch {
      setDeleteLoading(false);
    }
  };

  const handleUpgrade = async (tier: "pro" | "premium") => {
    setBillingError("");
    setBillingLoading(tier);
    try {
      const { url } = await createCheckoutSession(tier, billing);
      window.location.href = url;
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : "Erreur Stripe");
      setBillingLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setBillingError("");
    setBillingLoading("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : "Erreur Stripe");
      setBillingLoading(null);
    }
  };

  const handleExport = async () => {
    try {
      const data = await getUserStats();
      const json = JSON.stringify({ user: { email: user?.email, display_name: user?.display_name, tier: user?.tier }, stats: data }, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bettracker-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silencieux
    }
  };

  const handleResetStats = async () => {
    if (!window.confirm("Remettre le ROI et l'historique à zéro ? Cette action est irréversible.")) return;
    // Route non disponible — informer l'utilisateur
    alert("La réinitialisation des statistiques n'est pas encore disponible.");
  };

  const handleRevokeAll = async () => {
    if (!window.confirm("Révoquer toutes les sessions actives ? Vous serez déconnecté.")) return;
    try {
      await apiLogoutAll();
      logout();
      navigate("/login");
    } catch {
      // silencieux
    }
  };

  const strength = getStrength(newPwd);
  const tierLabel = user?.tier === "premium" ? "Elite" : user?.tier === "pro" ? "Pro" : "Free";

  const TABS: { id: Tab; label: string }[] = [
    { id: "compte", label: "Compte" },
    { id: "securite", label: "Sécurité" },
    { id: "plan", label: "Plan & Facturation" },
    { id: "danger", label: "Confidentialité" },
  ];

  const togglePwd = (field: string) => setShowPwd((p) => ({ ...p, [field]: !p[field] }));

  const inputCls = "w-full py-2.5 px-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[13.5px] text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:bg-[var(--bg-card)] focus:shadow-[0_0_0_3px_var(--accent-bg)] placeholder:text-[var(--text-muted2)]";
  const inputWithIconCls = inputCls + " pl-[34px]";
  const labelCls = "text-[11.5px] font-semibold text-[var(--text-secondary)] tracking-wide";
  const sectionTitleCls = "text-[12.5px] font-bold text-[var(--text-secondary)] mb-3 pb-2.5 border-b border-[var(--border-color)] flex items-center gap-2";

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--text-primary)]">Mon profil</h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-1">Gérez vos informations, sécurité et abonnement</p>
      </div>

      <div className="flex flex-col md:grid gap-4" style={{ gridTemplateColumns: "252px 1fr" }}>
        {/* ── LEFT: Avatar Card ── */}
        <div data-tour="profile-card" className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm overflow-hidden animate-fade-up">
          <div className="p-5 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative w-20 h-20 mb-3.5">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-[26px] font-extrabold text-white cursor-pointer"
                style={{ background: "linear-gradient(135deg, #3b5bdb, #7c3aed)" }}
              >
                {initials}
              </div>
            </div>
            <div className="text-[16px] font-extrabold tracking-tight">{user?.display_name}</div>
            <div className="text-[11.5px] text-[var(--accent)] mt-0.5">@{user?.display_name?.replace(/\s+/g, "")}</div>
            <div
              className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
              style={{ background: C.accentBg, border: `1px solid ${C.accentBd}`, color: C.accent }}
            >
              <Star size={9} />
              {tierLabel}
            </div>

            {/* Stats */}
            <div className="w-full mt-4 pt-3.5 border-t border-[var(--border-color)] flex flex-col gap-2.5">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--text-muted)]">Membre depuis</span>
                <span className="font-semibold text-[var(--text-secondary)]">{stats?.member_since || "—"}</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--text-muted)]">Tickets validés</span>
                <span className="font-semibold text-[var(--green)]">{stats?.total_bets ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--text-muted)]">ROI global</span>
                <span className="font-semibold text-[var(--green)]">
                  {stats ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--text-muted)]">Statut</span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: C.greenBg, color: C.green }}
                >
                  Actif
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Tabs Card ── */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.05s" }}>
          {/* Tab bar */}
          <div className="flex border-b border-[var(--border-color)] px-1.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map((t) => {
              const tourMap: Record<string, string> = {
                compte: "tab-account",
                securite: "tab-security",
                plan: "tab-plan",
                danger: "tab-privacy",
              };
              return (
                <button
                  key={t.id}
                  data-tour={tourMap[t.id]}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-3.5 text-[13px] font-medium cursor-pointer border-b-2 -mb-px transition-all whitespace-nowrap bg-transparent border-x-0 border-t-0 ${
                    tab === t.id
                      ? "text-[var(--accent)] border-b-[var(--accent)] font-semibold"
                      : "text-[var(--text-muted)] border-b-transparent hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ── Tab: Compte ── */}
          {tab === "compte" && (
            <form onSubmit={handleProfileSubmit} className="p-5 space-y-3.5">
              <div className={sectionTitleCls}>
                <User size={13} /> Identité
              </div>

              {profileMsg && (
                <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.greenBg, color: C.green }}>{profileMsg}</div>
              )}
              {profileErr && (
                <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.redBg, color: C.red }}>{profileErr}</div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Pseudo public</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted2)] pointer-events-none" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputWithIconCls}
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Adresse e-mail</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted2)] pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputWithIconCls}
                  />
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">La modification de l'email nécessite une confirmation par lien.</p>
              </div>

              {/* Preferences */}
              <div className="border-t border-[var(--border-color)] pt-3.5 mt-1">
                <div className={sectionTitleCls}>
                  <Bell size={13} /> Préférences & notifications
                </div>
                <div className="flex flex-col">
                  {/* TODO: public_profile n'existe pas encore dans UserPreferences backend — a connecter via updatePreferences() quand le champ sera ajoute */}
                  <div className="flex items-center gap-3 py-3 border-b border-[var(--border-color)]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[var(--text-primary)]">Profil public</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Pseudo et ROI visibles par la communauté</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={publicProfile} onChange={() => {}} disabled />
                      <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">Bientot disponible</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-3 border-b border-[var(--border-color)]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[var(--text-primary)]">Résumé hebdomadaire</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Synthèse de vos performances chaque lundi</div>
                    </div>
                    <Toggle checked={weeklyDigest} onChange={setWeeklyDigest} />
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[var(--text-primary)]">Alertes matchs scannés</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Notification au coup d'envoi d'un match scanné</div>
                    </div>
                    <Toggle checked={matchAlerts} onChange={setMatchAlerts} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3.5 border-t border-[var(--border-color)] mt-1">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-[var(--text-muted)] text-[13px] font-medium cursor-pointer hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="px-[18px] py-2.5 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-all shadow-[0_1px_3px_rgba(59,91,219,0.3)] hover:translate-y-[-1px] hover:shadow-[0_4px_12px_rgba(59,91,219,0.3)] disabled:opacity-70"
                  style={{ background: saved ? C.green : C.accent }}
                >
                  <Check size={13} />
                  {saved ? "Sauvegardé !" : "Enregistrer"}
                </button>
              </div>
            </form>
          )}

          {/* ── Tab: Sécurité ── */}
          {tab === "securite" && (
            <form onSubmit={handlePwdSubmit} className="p-5 space-y-3.5">
              <div className={sectionTitleCls}>
                <Lock size={13} /> Mot de passe
              </div>

              {pwdMsg && (
                <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.greenBg, color: C.green }}>{pwdMsg}</div>
              )}
              {pwdErr && (
                <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.redBg, color: C.red }}>{pwdErr}</div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Mot de passe actuel</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted2)] pointer-events-none" />
                  <input
                    type={showPwd.current ? "text" : "password"}
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    className={inputWithIconCls + " pr-9"}
                    required
                  />
                  <button type="button" onClick={() => togglePwd("current")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-muted2)] hover:text-[var(--text-primary)] transition-colors p-0">
                    {showPwd.current ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted2)] pointer-events-none" />
                    <input
                      type={showPwd.new ? "text" : "password"}
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className={inputWithIconCls + " pr-9"}
                      placeholder="Min. 8 car."
                    />
                    <button type="button" onClick={() => togglePwd("new")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-muted2)] hover:text-[var(--text-primary)] transition-colors p-0">
                      {showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {/* Strength meter */}
                  <div className="flex gap-[3px] mt-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex-1 h-0.5 rounded-sm transition-colors"
                        style={{ background: i <= strength ? STRENGTH_COLORS[strength] : C.border }}
                      />
                    ))}
                  </div>
                  {newPwd && (
                    <span className="text-[11px] mt-0.5" style={{ color: STRENGTH_COLORS[strength] }}>
                      {STRENGTH_LABELS[strength]}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Confirmer</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted2)] pointer-events-none" />
                    <input
                      type={showPwd.confirm ? "text" : "password"}
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className={inputWithIconCls + " pr-9"}
                      placeholder="Répéter"
                    />
                    <button type="button" onClick={() => togglePwd("confirm")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-muted2)] hover:text-[var(--text-primary)] transition-colors p-0">
                      {showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security settings */}
              <div className="border-t border-[var(--border-color)] pt-3.5 mt-1">
                <div className={sectionTitleCls}>
                  <Shield size={13} /> Sécurité du compte
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3 py-3 border-b border-[var(--border-color)]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[var(--text-primary)]">Alertes de connexion suspecte</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Email si connexion depuis un nouvel appareil</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={false} onChange={() => {}} disabled />
                      <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">Bientot disponible</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[var(--text-primary)]">Sessions actives</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        1 appareil.<button type="button" onClick={handleRevokeAll} className="bg-transparent border-none cursor-pointer text-[var(--accent)] font-medium p-0 text-[12px]">Tout révoquer</button>
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: C.accentBg, color: C.accent }}
                    >
                      1 active
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3.5 border-t border-[var(--border-color)] mt-1">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-[var(--text-muted)] text-[13px] font-medium cursor-pointer hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-[18px] py-2.5 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-all shadow-[0_1px_3px_rgba(59,91,219,0.3)] hover:translate-y-[-1px] hover:shadow-[0_4px_12px_rgba(59,91,219,0.3)] disabled:opacity-70"
                  style={{ background: C.accent }}
                >
                  Mettre à jour
                </button>
              </div>
            </form>
          )}

          {/* ── Tab: Sécurité — 2FA section ── */}
          {tab === "securite" && (
            <div className="p-5 border-t border-[var(--border-color)]">
              <div className={sectionTitleCls}>
                <ShieldCheck size={13} /> Double authentification (2FA)
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 mb-4">Protegez votre compte avec une application d'authentification (Google Authenticator, Authy, etc.).</p>

              {twoFaSuccess && (
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-[13px] font-medium text-[var(--green)] mb-4" style={{ background: "var(--green-bg)", border: "1px solid rgba(18,183,106,0.2)" }}>
                  <Check size={15} className="shrink-0" /> {twoFaSuccess}
                </div>
              )}
              {twoFaError && twoFaStep === "idle" && (
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-[13px] font-medium text-[var(--red)] mb-4" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                  <X size={15} className="shrink-0" /> {twoFaError}
                </div>
              )}

              {/* Idle state */}
              {twoFaStep === "idle" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: user?.totp_enabled ? "var(--green-bg)" : "var(--red-bg)" }}>
                      <KeyRound size={18} style={{ color: user?.totp_enabled ? C.green : C.red }} />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">{user?.totp_enabled ? "2FA activee" : "2FA desactivee"}</div>
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{user?.totp_enabled ? "Votre compte est protege par une app d'authentification." : "Activez le 2FA pour securiser votre compte."}</div>
                    </div>
                  </div>
                  {user?.totp_enabled ? (
                    <button onClick={() => { setTwoFaStep("disable"); setTwoFaError(""); setTwoFaSuccess(""); setTwoFaCode(""); setTwoFaDisablePwd(""); }}
                      className="px-4 py-2 rounded-lg border border-[rgba(240,68,56,0.25)] bg-transparent text-[var(--red)] text-[13px] font-semibold cursor-pointer transition-all hover:bg-[var(--red-bg)]">
                      Desactiver
                    </button>
                  ) : (
                    <button onClick={handleSetup2FA} disabled={twoFaLoading}
                      className="px-4 py-2 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-70"
                      style={{ background: C.accent }}>
                      <QrCode size={14} /> Activer
                    </button>
                  )}
                </div>
              )}

              {/* Setup state — QR code */}
              {twoFaStep === "setup" && (
                <form onSubmit={handleVerify2FA} className="space-y-4">
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                    {twoFaQr && <img src={`data:image/png;base64,${twoFaQr}`} alt="QR Code 2FA" className="w-[180px] h-[180px]" />}
                    <div className="text-center">
                      <div className="text-[12px] text-[var(--text-muted)] mb-1">Ou entrez cette cle manuellement :</div>
                      <code className="text-[13px] font-mono font-bold text-[var(--accent)] bg-[var(--bg-card)] px-3 py-1.5 rounded border border-[var(--border-color)] select-all">{twoFaSecret}</code>
                    </div>
                  </div>
                  {twoFaError && (
                    <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.redBg, color: C.red }}>{twoFaError}</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Code a 6 chiffres</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                      className={inputCls} placeholder="000000" autoFocus style={{ letterSpacing: "6px", textAlign: "center", fontSize: "18px", fontFamily: "monospace" }} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setTwoFaStep("idle"); setTwoFaError(""); }}
                      className="px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-[var(--text-muted)] text-[13px] font-medium cursor-pointer">Annuler</button>
                    <button type="submit" disabled={twoFaCode.length !== 6 || twoFaLoading}
                      className="px-4 py-2.5 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer disabled:opacity-70" style={{ background: C.accent }}>Verifier</button>
                  </div>
                </form>
              )}

              {/* Disable state */}
              {twoFaStep === "disable" && (
                <form onSubmit={handleDisable2FA} className="space-y-3.5">
                  {twoFaError && (
                    <div className="px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.redBg, color: C.red }}>{twoFaError}</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Mot de passe actuel</label>
                    <input type="password" value={twoFaDisablePwd} onChange={(e) => setTwoFaDisablePwd(e.target.value)} className={inputCls} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Code 2FA actuel</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                      className={inputCls} placeholder="000000" style={{ letterSpacing: "6px", textAlign: "center", fontSize: "18px", fontFamily: "monospace" }} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setTwoFaStep("idle"); setTwoFaError(""); }}
                      className="px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-transparent text-[var(--text-muted)] text-[13px] font-medium cursor-pointer">Annuler</button>
                    <button type="submit" disabled={twoFaCode.length !== 6 || !twoFaDisablePwd || twoFaLoading}
                      className="px-4 py-2.5 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer disabled:opacity-70" style={{ background: "var(--red)" }}>Desactiver</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── Tab: Plan & Facturation ── */}
          {tab === "plan" && (
            <div className="p-5">
              {billingSuccess && (
                <div className="mb-4 px-3.5 py-2.5 rounded-lg border text-[12.5px] font-medium flex items-center gap-2" style={{ background: C.greenBg, borderColor: "rgba(18,183,106,0.15)", color: C.green }}>
                  <Check size={15} /> Paiement reussi ! Votre abonnement est actif.
                </div>
              )}
              <div className={sectionTitleCls}>
                <Star size={13} /> Abonnement
                <span
                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: C.accentBg, color: C.accent }}
                >
                  {tierLabel} actif
                </span>
              </div>

              {/* Toggle Mensuel / Annuel */}
              <div className="flex items-center justify-center mb-4">
                <div
                  className="inline-flex items-center gap-0 rounded-full p-[3px]"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}
                >
                  <button
                    type="button"
                    onClick={() => setBilling("monthly")}
                    className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer border-none"
                    style={{
                      background: billing === "monthly" ? C.white : "transparent",
                      color: billing === "monthly" ? C.text : C.muted,
                      boxShadow: billing === "monthly" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Mensuel
                  </button>
                  <button
                    type="button"
                    onClick={() => setBilling("annual")}
                    className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer border-none flex items-center gap-1.5"
                    style={{
                      background: billing === "annual" ? C.white : "transparent",
                      color: billing === "annual" ? C.text : C.muted,
                      boxShadow: billing === "annual" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Annuel
                    <span
                      className="px-1.5 py-px rounded text-[9px] font-bold"
                      style={{ background: C.greenBg, color: C.green }}
                    >
                      -20%
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                {PLANS.map((plan) => {
                  const isCurrent = plan.id === user?.tier;
                  const isElite = plan.id === "premium";
                  const isFree = plan.id === "free";
                  const displayPrice = billing === "annual" && !isFree ? plan.priceAnnual : plan.priceMonthly;
                  return (
                    <div
                      key={plan.id}
                      className="flex flex-col border rounded-[10px] p-[18px_16px] transition-all relative hover:shadow-md hover:-translate-y-px"
                      style={{
                        borderWidth: "1.5px",
                        borderColor: isCurrent ? C.accentBd : isElite ? "rgba(124,58,237,0.25)" : C.border,
                        background: isCurrent
                          ? `linear-gradient(160deg, ${C.accentBg}, ${C.white})`
                          : isElite
                            ? `linear-gradient(160deg, rgba(124,58,237,0.05), ${C.white})`
                            : C.surface,
                      }}
                    >
                      {isCurrent && (
                        <div className="absolute -top-px right-3 px-2.5 py-0.5 rounded-b-[7px] text-[9px] font-bold tracking-wider uppercase text-white" style={{ background: C.accent }}>
                          Actuel
                        </div>
                      )}
                      {isElite && !isCurrent && (
                        <div className="absolute -top-px right-3 px-2.5 py-0.5 rounded-b-[7px] text-[9px] font-bold tracking-wider uppercase text-white" style={{ background: "#7c3aed" }}>
                          Elite
                        </div>
                      )}
                      <div className="text-[14px] font-bold text-[var(--text-primary)]">{plan.name}</div>
                      <div className="flex items-baseline gap-0.5 mt-1.5">
                        <span className="text-[24px] font-extrabold tracking-tight text-[var(--text-primary)]">{displayPrice}</span>
                        <span className="text-[12px] text-[var(--text-muted)]">{isFree ? plan.period : plan.period}</span>
                      </div>
                      {billing === "annual" && !isFree && plan.annualTotal && (
                        <div className="text-[10.5px] mt-0.5" style={{ color: C.green }}>
                          {plan.annualTotal} — {plan.annualSaving}
                        </div>
                      )}
                      {plan.desc && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-2 leading-snug">{plan.desc}</p>
                      )}
                      <ul className="list-none flex flex-col gap-1.5 p-0 m-0 mt-2.5 flex-1">
                        {plan.features.map((f) => (
                          <li key={f.text} className="text-[12px] text-[var(--text-muted)] flex items-center gap-1.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold shrink-0"
                              style={{
                                background: f.ok ? C.greenBg : C.surface,
                                color: f.ok ? C.green : C.muted2,
                              }}
                            >
                              {f.ok ? "\u2713" : "\u2715"}
                            </span>
                            <span className={f.bold ? "font-semibold text-[var(--text-primary)]" : ""}>
                              {f.text}
                              {f.soon && <span className="ml-1 px-1 py-px rounded text-[8px] font-bold bg-[rgba(124,58,237,0.08)] text-[#7c3aed]">Bientot</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <button
                        disabled={isCurrent || billingLoading !== null}
                        onClick={() => {
                          if (!isCurrent && (plan.id === "pro" || plan.id === "premium")) {
                            handleUpgrade(plan.id as "pro" | "premium");
                          }
                        }}
                        className="w-full mt-3.5 py-2.5 rounded-[7px] text-[12px] font-semibold transition-all"
                        style={{
                          cursor: isCurrent || billingLoading !== null ? "default" : "pointer",
                          opacity: billingLoading === plan.id ? 0.7 : 1,
                          border: isCurrent ? "none" : isElite ? "none" : `1.5px solid ${C.border}`,
                          background: isCurrent ? C.accent : isElite ? "#7c3aed" : C.white,
                          color: isCurrent || isElite ? "#fff" : C.muted,
                        }}
                      >
                        {billingLoading === plan.id
                          ? "Redirection..."
                          : isCurrent
                            ? "Plan actuel"
                            : isElite
                              ? "Passer a Elite →"
                              : plan.id === "pro"
                                ? "Passer a Pro →"
                                : "Retrograder"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Erreur billing */}
              {billingError && (
                <div className="mt-3 px-3.5 py-2.5 rounded-lg text-[12px] text-[var(--red)]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.15)" }}>
                  {billingError}
                </div>
              )}

              {/* Gestion abonnement Stripe */}
              <div className="flex items-center gap-2.5 px-3.5 py-3 mt-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[12px] text-[var(--text-muted)]">
                <CreditCard size={14} className="text-[var(--text-muted)] shrink-0" />
                {user?.tier !== "free" ? (
                  <>
                    Abonnement actif ·
                    <button
                      onClick={handleManageBilling}
                      disabled={billingLoading !== null}
                      className="bg-transparent border-none cursor-pointer text-[var(--accent)] font-medium p-0 text-[12px] ml-1"
                      style={{ opacity: billingLoading === "portal" ? 0.7 : 1 }}
                    >
                      {billingLoading === "portal" ? "Redirection..." : "Gérer via Stripe →"}
                    </button>
                  </>
                ) : (
                  <span>Paiement sécurisé via Stripe</span>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Confidentialité / Danger ── */}
          {tab === "danger" && (
            <div className="p-5">
              <div className={sectionTitleCls} style={{ color: C.red, borderBottomColor: "rgba(240,68,56,0.15)" }}>
                <AlertTriangle size={13} /> Zone de danger
              </div>

              <div className="flex items-center justify-between py-3.5 border-b border-[var(--border-color)] gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">Exporter mes données</div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Téléchargez tickets, historique et campagnes au format JSON.</div>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] bg-transparent text-[var(--text-muted)] text-[12px] font-medium cursor-pointer hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-all whitespace-nowrap flex items-center gap-1.5"
                >
                  <Download size={12} /> Exporter .json
                </button>
              </div>

              <div className="flex items-center justify-between py-3.5 border-b border-[var(--border-color)] gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">Réinitialiser les statistiques</div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Remet le ROI et l'historique à zéro. Irréversible.</div>
                </div>
                <button
                  type="button"
                  onClick={handleResetStats}
                  className="px-4 py-2 rounded-lg border bg-transparent text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)]"
                  style={{ borderColor: "rgba(240,68,56,0.25)", color: C.red }}
                >
                  Réinitialiser
                </button>
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold" style={{ color: C.red }}>Supprimer le compte</div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Suppression immédiate. Irréversible, aucun remboursement.</div>
                </div>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 rounded-lg border bg-transparent text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] flex items-center gap-1.5"
                    style={{ borderColor: "rgba(240,68,56,0.25)", color: C.red }}
                  >
                    <Trash2 size={12} /> Supprimer le compte
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className="px-4 py-2 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 disabled:opacity-70"
                      style={{ background: C.red }}
                    >
                      <Trash2 size={12} /> Confirmer
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {showTour && <SpotlightTour steps={settingsTour} onComplete={completeTour} />}
    </div>
  );
}
