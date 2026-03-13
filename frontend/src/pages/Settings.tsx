import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Shield,
  Star,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Download,
  Trash2,
  Bell,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  changePassword,
  getUserStats,
  deleteAccount as apiDeleteAccount,
  logoutAll as apiLogoutAll,
  createCheckoutSession,
  createBillingPortalSession,
} from "@/services/api";
import { Toggle } from "@/components/ui";
import type { UserStats } from "@/types";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { settingsTour } from "@/tours/index";

/* ── Design tokens ── */
const C = {
  bg: "#f4f5f7",
  white: "#ffffff",
  surface: "#f4f5f7",
  border: "#e3e6eb",
  border2: "#cdd1d9",
  text: "#111318",
  text2: "#3c4149",
  muted: "#8a919e",
  muted2: "#b0b7c3",
  accent: "#3b5bdb",
  accentBg: "rgba(59,91,219,0.07)",
  accentBd: "rgba(59,91,219,0.18)",
  green: "#12b76a",
  greenBg: "rgba(18,183,106,0.08)",
  red: "#f04438",
  redBg: "rgba(240,68,56,0.07)",
  amber: "#f79009",
  amberBg: "rgba(247,144,9,0.08)",
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

/* ── Plans ── */
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    features: [
      { text: "Accès complet 7 jours", ok: true },
      { text: "Scanner IA", ok: true },
      { text: "Portfolio & Dashboard", ok: true },
      { text: "Campagnes illimitées", ok: false },
      { text: "Export CSV", ok: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "29€",
    features: [
      { text: "Scanner IA illimité", ok: true },
      { text: "Portfolio & Dashboard", ok: true },
      { text: "Backtest", ok: true },
      { text: "Partage de tickets", ok: true },
      { text: "Campagnes illimitées", ok: false },
    ],
  },
  {
    id: "premium",
    name: "Elite",
    price: "69€",
    features: [
      { text: "Tout de Pro", ok: true },
      { text: "Campagnes illimitées", ok: true },
      { text: "IA Analyste (bientôt)", ok: true },
      { text: "Support prioritaire", ok: true },
      { text: "Accès nouvelles features", ok: true },
    ],
  },
];

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("compte");
  const { showTour, completeTour } = useTour("settings");

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Toggles (local state for now)
  const [publicProfile, setPublicProfile] = useState(false);
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
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [billingError, setBillingError] = useState("");

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
      const { url } = await createCheckoutSession(tier);
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

  const inputCls = "w-full py-2.5 px-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg text-[13.5px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
  const inputWithIconCls = inputCls + " pl-[34px]";
  const labelCls = "text-[11.5px] font-semibold text-[#3c4149] tracking-wide";
  const sectionTitleCls = "text-[12.5px] font-bold text-[#3c4149] mb-3 pb-2.5 border-b border-[#e3e6eb] flex items-center gap-2";

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#111318]">Mon profil</h1>
        <p className="text-[13px] text-[#8a919e] mt-1">Gérez vos informations, sécurité et abonnement</p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "252px 1fr" }}>
        {/* ── LEFT: Avatar Card ── */}
        <div data-tour="profile-card" className="bg-white border border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up">
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
            <div className="text-[11.5px] text-[#3b5bdb] mt-0.5">@{user?.display_name?.replace(/\s+/g, "")}</div>
            <div
              className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
              style={{ background: C.accentBg, border: `1px solid ${C.accentBd}`, color: C.accent }}
            >
              <Star size={9} />
              {tierLabel}
            </div>

            {/* Stats */}
            <div className="w-full mt-4 pt-3.5 border-t border-[#e3e6eb] flex flex-col gap-2.5">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[#8a919e]">Membre depuis</span>
                <span className="font-semibold text-[#3c4149]">{stats?.member_since || "—"}</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[#8a919e]">Tickets validés</span>
                <span className="font-semibold text-[#12b76a]">{stats?.total_bets ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[#8a919e]">ROI global</span>
                <span className="font-semibold text-[#12b76a]">
                  {stats ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[#8a919e]">Statut</span>
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
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.05s" }}>
          {/* Tab bar */}
          <div className="flex border-b border-[#e3e6eb] px-1.5">
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
                      ? "text-[#3b5bdb] border-b-[#3b5bdb] font-semibold"
                      : "text-[#8a919e] border-b-transparent hover:text-[#3c4149]"
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
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
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
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputWithIconCls}
                  />
                </div>
                <p className="text-[11px] text-[#8a919e] mt-0.5">La modification de l'email nécessite une confirmation par lien.</p>
              </div>

              {/* Preferences */}
              <div className="border-t border-[#e3e6eb] pt-3.5 mt-1">
                <div className={sectionTitleCls}>
                  <Bell size={13} /> Préférences & notifications
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3 py-3 border-b border-[#e3e6eb]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[#111318]">Profil public</div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">Pseudo et ROI visibles par la communauté</div>
                    </div>
                    <Toggle checked={publicProfile} onChange={setPublicProfile} />
                  </div>
                  <div className="flex items-center gap-3 py-3 border-b border-[#e3e6eb]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[#111318]">Résumé hebdomadaire</div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">Synthèse de vos performances chaque lundi</div>
                    </div>
                    <Toggle checked={weeklyDigest} onChange={setWeeklyDigest} />
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[#111318]">Alertes matchs scannés</div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">Notification au coup d'envoi d'un match scanné</div>
                    </div>
                    <Toggle checked={matchAlerts} onChange={setMatchAlerts} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3.5 border-t border-[#e3e6eb] mt-1">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[13px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] hover:bg-[#f4f5f7] transition-all"
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
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                  <input
                    type={showPwd.current ? "text" : "password"}
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    className={inputWithIconCls + " pr-9"}
                    required
                  />
                  <button type="button" onClick={() => togglePwd("current")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#b0b7c3] hover:text-[#111318] transition-colors p-0">
                    {showPwd.current ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type={showPwd.new ? "text" : "password"}
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className={inputWithIconCls + " pr-9"}
                      placeholder="Min. 10 car."
                    />
                    <button type="button" onClick={() => togglePwd("new")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#b0b7c3] hover:text-[#111318] transition-colors p-0">
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
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type={showPwd.confirm ? "text" : "password"}
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className={inputWithIconCls + " pr-9"}
                      placeholder="Répéter"
                    />
                    <button type="button" onClick={() => togglePwd("confirm")} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#b0b7c3] hover:text-[#111318] transition-colors p-0">
                      {showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security settings */}
              <div className="border-t border-[#e3e6eb] pt-3.5 mt-1">
                <div className={sectionTitleCls}>
                  <Shield size={13} /> Sécurité du compte
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3 py-3 border-b border-[#e3e6eb]">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[#111318]">Alertes de connexion suspecte</div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">Email si connexion depuis un nouvel appareil</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={false} onChange={() => {}} disabled />
                      <span className="text-[11px] text-[#8a919e] whitespace-nowrap">Bientot disponible</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium text-[#111318]">Sessions actives</div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">
                        1 appareil.<button type="button" onClick={handleRevokeAll} className="bg-transparent border-none cursor-pointer text-[#3b5bdb] font-medium p-0 text-[12px]">Tout révoquer</button>
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

              <div className="flex justify-end gap-2 pt-3.5 border-t border-[#e3e6eb] mt-1">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[13px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] hover:bg-[#f4f5f7] transition-all"
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

          {/* ── Tab: Plan & Facturation ── */}
          {tab === "plan" && (
            <div className="p-5">
              <div className={sectionTitleCls}>
                <Star size={13} /> Abonnement
                <span
                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: C.accentBg, color: C.accent }}
                >
                  {tierLabel} actif
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {PLANS.map((plan) => {
                  const isCurrent = plan.id === user?.tier;
                  const isElite = plan.id === "premium";
                  return (
                    <div
                      key={plan.id}
                      className="border rounded-[10px] p-[18px_16px] cursor-pointer transition-all relative hover:shadow-md hover:-translate-y-px"
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
                      <div className="text-[14px] font-bold text-[#111318]">{plan.name}</div>
                      <div className="flex items-baseline gap-0.5 mt-1.5 mb-2.5">
                        <span className="text-[24px] font-extrabold tracking-tight text-[#111318]">{plan.price}</span>
                        <span className="text-[12px] text-[#8a919e]">/mois</span>
                      </div>
                      <ul className="list-none flex flex-col gap-1.5 p-0 m-0">
                        {plan.features.map((f) => (
                          <li key={f.text} className="text-[12px] text-[#8a919e] flex items-center gap-1.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold shrink-0"
                              style={{
                                background: f.ok ? C.greenBg : C.surface,
                                color: f.ok ? C.green : C.muted2,
                              }}
                            >
                              {f.ok ? "✓" : "✕"}
                            </span>
                            {f.text}
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
                              ? "Passer à Elite →"
                              : plan.id === "pro"
                                ? "Passer à Pro →"
                                : "Rétrograder"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Erreur billing */}
              {billingError && (
                <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-[rgba(240,68,56,0.07)] border border-[rgba(240,68,56,0.15)] text-[12px] text-[#f04438]">
                  {billingError}
                </div>
              )}

              {/* Gestion abonnement Stripe */}
              <div className="flex items-center gap-2.5 px-3.5 py-3 mt-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg text-[12px] text-[#8a919e]">
                <CreditCard size={14} className="text-[#8a919e] shrink-0" />
                {user?.tier !== "free" ? (
                  <>
                    Abonnement actif ·
                    <button
                      onClick={handleManageBilling}
                      disabled={billingLoading !== null}
                      className="bg-transparent border-none cursor-pointer text-[#3b5bdb] font-medium p-0 text-[12px] ml-1"
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

              <div className="flex items-center justify-between py-3.5 border-b border-[#e3e6eb] gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold text-[#111318]">Exporter mes données</div>
                  <div className="text-[12px] text-[#8a919e] mt-0.5">Téléchargez tickets, historique et campagnes au format JSON.</div>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-4 py-2 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] hover:bg-[#f4f5f7] transition-all whitespace-nowrap flex items-center gap-1.5"
                >
                  <Download size={12} /> Exporter .json
                </button>
              </div>

              <div className="flex items-center justify-between py-3.5 border-b border-[#e3e6eb] gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold text-[#111318]">Réinitialiser les statistiques</div>
                  <div className="text-[12px] text-[#8a919e] mt-0.5">Remet le ROI et l'historique à zéro. Irréversible.</div>
                </div>
                <button
                  type="button"
                  onClick={handleResetStats}
                  className="px-4 py-2 rounded-lg border bg-transparent text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap hover:bg-[#f04438] hover:text-white hover:border-[#f04438]"
                  style={{ borderColor: "rgba(240,68,56,0.25)", color: C.red }}
                >
                  Réinitialiser
                </button>
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <div>
                  <div className="text-[13.5px] font-semibold" style={{ color: C.red }}>Supprimer le compte</div>
                  <div className="text-[12px] text-[#8a919e] mt-0.5">Suppression immédiate. Irréversible, aucun remboursement.</div>
                </div>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 rounded-lg border bg-transparent text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap hover:bg-[#f04438] hover:text-white hover:border-[#f04438] flex items-center gap-1.5"
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
                      className="text-[12px] text-[#8a919e] hover:text-[#3c4149] cursor-pointer bg-transparent border-none"
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
