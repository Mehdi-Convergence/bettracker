import { useState, useEffect, useRef, useCallback } from "react";
import {
  DollarSign,
  Bell,
  Share2,
  Settings,
  Sun,
  Moon,
  Monitor,
  Check,
  X,
  User,
  ExternalLink,
  ShieldCheck,
  QrCode,
  KeyRound,
} from "lucide-react";
import { Toggle } from "@/components/ui";
import { getPreferences, updatePreferences, getPortfolioBets, setup2FA, verify2FA, disable2FA } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import type { UserPreferences, Bet } from "@/types";

/* ── Design tokens ── */
const C = {
  bg: "#f4f5f7",
  white: "#ffffff",
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
  amber: "#f79009",
  amberBg: "rgba(247,144,9,0.08)",
};

type SectionId = "bankroll" | "notifications" | "share" | "display" | "security";

const SECTIONS: { id: SectionId; label: string; group: string; icon: typeof DollarSign }[] = [
  { id: "bankroll", label: "Bankroll globale", group: "Finances", icon: DollarSign },
  { id: "notifications", label: "Push & Email", group: "Notifications", icon: Bell },
  { id: "share", label: "Partage de tickets", group: "Partage & Com", icon: Share2 },
  { id: "display", label: "Affichage & Langue", group: "Préférences", icon: Settings },
  { id: "security", label: "Double authentification", group: "Sécurité", icon: ShieldCheck },
];

const NOTIF_EVENTS: {
  key: string;
  label: string;
  desc: string;
  prefKey: keyof UserPreferences;
}[] = [
  { key: "new_ticket", label: "Nouveau ticket proposé", desc: "Campagne génère un ticket à valider", prefKey: "notif_new_ticket" },
  { key: "stop_loss", label: "Stop-loss déclenché", desc: "Perte journalière atteint votre limite", prefKey: "notif_stop_loss" },
  { key: "smart_stop", label: "Smart Stop : pause recommandée", desc: "ROI des 20 derniers paris sous -15%", prefKey: "notif_smart_stop" },
  { key: "campaign_ending", label: "Fin de campagne imminente", desc: "Objectif de bankroll atteint", prefKey: "notif_campaign_ending" },
  { key: "low_bankroll", label: "Alerte bankroll basse", desc: "Bankroll sous le seuil configuré", prefKey: "notif_low_bankroll" },
];

const sectionTitleCls = "text-[14px] font-bold text-[#111318] flex items-center gap-2 mb-0.5";
const sectionDescCls = "text-[12px] text-[#8a919e] leading-relaxed";
const labelCls = "text-[12px] font-semibold text-[#3c4149] block mb-1.5";
const inputCls = "w-full py-2 px-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg text-[13px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
const selectCls = inputCls + " cursor-pointer";
const rowCls = "flex items-center justify-between px-5 py-3.5 border-b border-[#e3e6eb] last:border-b-0";

export default function Parametres() {
  const { user, refreshUser } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [dirty, setDirty] = useState<Partial<UserPreferences>>({});
  const [saving, setSaving] = useState<SectionId | null>(null);
  const [saved, setSaved] = useState<SectionId | null>(null);
  const [pendingBets, setPendingBets] = useState<Bet[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("bankroll");
  const [showShareModal, setShowShareModal] = useState(false);

  // 2FA states
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "disable">("idle");
  const [twoFaQr, setTwoFaQr] = useState<string>("");
  const [twoFaSecret, setTwoFaSecret] = useState<string>("");
  const [twoFaCode, setTwoFaCode] = useState<string>("");
  const [twoFaDisablePwd, setTwoFaDisablePwd] = useState<string>("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string>("");
  const [twoFaSuccess, setTwoFaSuccess] = useState<string>("");

  const sectionRefs = {
    bankroll: useRef<HTMLDivElement>(null),
    notifications: useRef<HTMLDivElement>(null),
    share: useRef<HTMLDivElement>(null),
    display: useRef<HTMLDivElement>(null),
    security: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    getPreferences().then(setPrefs).catch(() => {});
    getPortfolioBets()
      .then((bets) => setPendingBets(bets.filter((b) => b.result === "pending" && !b.campaign_id)))
      .catch(() => {});
  }, []);

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id as SectionId);
        }
      },
      { threshold: 0.3, rootMargin: "-20% 0px -70% 0px" }
    );
    for (const ref of Object.values(sectionRefs)) {
      if (ref.current) observer.observe(ref.current);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const getVal = useCallback(
    <K extends keyof UserPreferences>(key: K): UserPreferences[K] => {
      if (key in dirty) return dirty[key] as UserPreferences[K];
      if (prefs) return prefs[key];
      return undefined as unknown as UserPreferences[K];
    },
    [dirty, prefs]
  );

  const setVal = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setDirty((d) => ({ ...d, [key]: value }));
  };

  const handleSave = async (section: SectionId) => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(section);
    try {
      const updated = await updatePreferences(dirty);
      setPrefs(updated);
      setDirty({});
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      // silently handled
    } finally {
      setSaving(null);
    }
  };

  const scrollTo = (id: SectionId) => {
    sectionRefs[id].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSetup2FA = async () => {
    setTwoFaError("");
    setTwoFaSuccess("");
    setTwoFaLoading(true);
    try {
      const data = await setup2FA();
      setTwoFaQr(data.qr_code);
      setTwoFaSecret(data.secret);
      setTwoFaStep("setup");
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaError("");
    setTwoFaLoading(true);
    try {
      await verify2FA(twoFaCode);
      setTwoFaSuccess("Double authentification activee avec succes !");
      setTwoFaStep("idle");
      setTwoFaCode("");
      await refreshUser();
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Code invalide");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaError("");
    setTwoFaLoading(true);
    try {
      await disable2FA(twoFaDisablePwd, twoFaCode);
      setTwoFaSuccess("Double authentification desactivee.");
      setTwoFaStep("idle");
      setTwoFaCode("");
      setTwoFaDisablePwd("");
      await refreshUser();
    } catch (err: unknown) {
      setTwoFaError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const hasDirty = Object.keys(dirty).length > 0;
  const bankrollTotal = getVal("initial_bankroll") ?? 1000;
  const inPlay = pendingBets.reduce((s, b) => s + b.stake, 0);
  const available = bankrollTotal - inPlay;
  const pctUsed = bankrollTotal > 0 ? (available / bankrollTotal) * 100 : 0;
  const currSymbol = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" }[(getVal("currency") ?? "EUR") as string] ?? "€";

  if (!prefs) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3b5bdb]" />
      </div>
    );
  }

  const SaveBtn = ({ section }: { section: SectionId }) => (
    <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-[#e3e6eb] mt-4">
      {hasDirty && (
        <button
          type="button"
          onClick={() => setDirty({})}
          className="px-4 py-2 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12.5px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-all"
        >
          Annuler
        </button>
      )}
      <button
        onClick={() => handleSave(section)}
        disabled={!hasDirty || saving === section}
        className="px-4 py-2 rounded-[9px] border-none text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: saved === section ? C.green : C.accent }}
      >
        {saved === section ? (
          <><Check size={13} /> Sauvegardé !</>
        ) : saving === section ? "..." : "Sauvegarder"}
      </button>
    </div>
  );

  // Share preview pseudo
  const pseudo = (getVal("share_pseudo") as string) || `@${user?.display_name?.replace(/\s+/g, "") ?? "pseudo"}`;

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#111318]">Paramètres</h1>
        <p className="text-[13px] text-[#8a919e] mt-1">Configuration fonctionnelle : bankroll, notifications, partage, affichage</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* ── LEFT: Sidebar navigation ── */}
        <div className="md:w-[210px] md:min-w-[210px] md:sticky top-4 self-start">
          <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden">
            <div className="p-2.5 flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5">
              {SECTIONS.map((s, i) => {
                const Icon = s.icon;
                const isActive = activeSection === s.id;
                const prevGroup = i > 0 ? SECTIONS[i - 1].group : null;
                const showGroup = s.group !== prevGroup;
                return (
                  <div key={s.id}>
                    {showGroup && (
                      <div className="hidden md:block text-[10px] font-bold text-[#b0b7c3] uppercase tracking-[0.1em] px-3 pt-2.5 pb-1 first:pt-0">
                        {s.group}
                      </div>
                    )}
                    <button
                      onClick={() => scrollTo(s.id)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all border-none text-left w-full ${
                        isActive
                          ? "text-[#3b5bdb] font-semibold"
                          : "text-[#3c4149] hover:bg-[#f4f5f7]"
                      }`}
                      style={{ background: isActive ? C.accentBg : "transparent" }}
                    >
                      <Icon size={15} style={{ color: isActive ? C.accent : C.muted2 }} />
                      {s.label}
                    </button>
                  </div>
                );
              })}
              <div className="hidden md:block h-px bg-[#e3e6eb] my-2.5 mx-2" />
              <a
                href="/settings"
                className="hidden md:flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#8a919e] hover:bg-[#f4f5f7] transition-all no-underline"
              >
                <User size={15} style={{ color: C.muted2 }} />
                Mon profil & Plan →
              </a>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Scrollable sections ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">

          {/* ═══ Section 1: Bankroll globale ═══ */}
          <div ref={sectionRefs.bankroll} id="bankroll" className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up">
            <div className="px-5 py-4 border-b border-[#e3e6eb]">
              <div className={sectionTitleCls}>
                <DollarSign size={16} style={{ color: C.accent }} /> Bankroll globale
              </div>
              <div className={sectionDescCls}>Budget dédié aux paris hors campagne (depuis le Scanner). Distinct des bankrolls de chaque campagne.</div>
            </div>
            <div className="p-5">
              {/* Gradient card */}
              <div className="rounded-[10px] p-[18px_20px] text-white flex items-center justify-between mb-4" style={{ background: "linear-gradient(135deg, #3b5bdb, #2f4ac7)" }}>
                <div>
                  <div className="text-[11.5px] opacity-70 mb-1">Disponible</div>
                  <div className="text-[26px] font-extrabold font-[var(--font-mono)] tracking-tight">{available.toLocaleString("fr-FR")} {currSymbol}</div>
                  <div className="text-[11px] opacity-55 mt-1">sur {bankrollTotal.toLocaleString("fr-FR")} {currSymbol} configurés</div>
                  <div className="w-[110px] h-[5px] bg-white/20 rounded-[3px] mt-2 overflow-hidden">
                    <div className="h-full bg-white rounded-[3px]" style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] opacity-55 mb-1">En jeu</div>
                  <div className="text-[22px] font-extrabold font-[var(--font-mono)]">{inPlay.toLocaleString("fr-FR")} {currSymbol}</div>
                  <div className="text-[10px] opacity-50 mt-1">{pendingBets.length} ticket{pendingBets.length !== 1 ? "s" : ""} actif{pendingBets.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {/* Inputs row */}
              <div className="grid grid-cols-2 gap-3.5 mb-4">
                <div>
                  <label className={labelCls}>Montant total ({currSymbol}) *</label>
                  <input
                    type="number"
                    value={getVal("initial_bankroll") ?? 1000}
                    onChange={(e) => setVal("initial_bankroll", parseFloat(e.target.value) || 0)}
                    className={inputCls}
                    min={0}
                    step={50}
                  />
                  <div className="text-[11.5px] text-[#8a919e] mt-1">Budget de référence pour les paris hors campagne</div>
                </div>
                <div>
                  <label className={labelCls}>Mise par défaut ({currSymbol}) *</label>
                  <input
                    type="number"
                    value={getVal("default_stake") ?? 30}
                    onChange={(e) => setVal("default_stake", parseFloat(e.target.value) || 0)}
                    className={inputCls}
                    min={0}
                    step={5}
                  />
                  <div className="text-[11.5px] text-[#8a919e] mt-1">Pré-remplie à la création d'un ticket Scanner</div>
                </div>
              </div>

              {/* Toggle rows */}
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Mise en % de bankroll</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">La mise par défaut = X% de la bankroll courante plutôt qu'un montant fixe</div>
                  </div>
                  <Toggle checked={getVal("stake_as_percentage") ?? false} onChange={(v) => setVal("stake_as_percentage", v)} />
                </div>
                {getVal("stake_as_percentage") && (
                  <div className={rowCls}>
                    <div className="flex-1 pr-5">
                      <div className="text-[13.5px] font-medium text-[#111318]">% mise par défaut</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={getVal("stake_percentage") ?? 2}
                        onChange={(e) => setVal("stake_percentage", parseFloat(e.target.value) || 0)}
                        className={inputCls + " !w-[70px]"}
                        min={0.1}
                        max={100}
                        step={0.5}
                      />
                      <span className="text-[13px] text-[#8a919e]">%</span>
                    </div>
                  </div>
                )}
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Stop-loss journalier hors campagne</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Bloque la création de tickets hors campagne si cette perte est atteinte dans la journée</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={getVal("daily_stop_loss") ?? 10}
                      onChange={(e) => setVal("daily_stop_loss", parseFloat(e.target.value) || 0)}
                      className={inputCls + " !w-[70px]"}
                      min={0}
                    />
                    <select
                      value={getVal("stop_loss_unit") ?? "pct"}
                      onChange={(e) => setVal("stop_loss_unit", e.target.value)}
                      className={selectCls + " !w-[65px]"}
                    >
                      <option value="pct">%</option>
                      <option value="eur">{currSymbol}</option>
                    </select>
                  </div>
                </div>
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Alerte seuil bas bankroll</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Notification quand la bankroll disponible descend sous ce montant</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={getVal("low_bankroll_alert") ?? 200}
                      onChange={(e) => setVal("low_bankroll_alert", parseFloat(e.target.value) || 0)}
                      className={inputCls + " !w-[90px]"}
                      min={0}
                    />
                    <span className="text-[13px] text-[#8a919e]">{currSymbol}</span>
                  </div>
                </div>
              </div>
              <SaveBtn section="bankroll" />
            </div>
          </div>

          {/* ═══ Section 2: Push & Email ═══ */}
          <div ref={sectionRefs.notifications} id="notifications" className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.05s" }}>
            <div className="px-5 py-4 border-b border-[#e3e6eb]">
              <div className={sectionTitleCls}>
                <Bell size={16} style={{ color: C.accent }} /> Notifications in-app
              </div>
              <div className={sectionDescCls}>Activez ou désactivez chaque type de notification. Les notifications apparaissent dans la cloche en haut à droite.</div>
            </div>

            {/* Column headers */}
            <div className="grid px-5 py-2.5 border-b border-[#e3e6eb] bg-[#f4f5f7]" style={{ gridTemplateColumns: "1fr 80px" }}>
              <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider">Événement</div>
              <div className="text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider text-center flex flex-col items-center gap-0.5">
                <Bell size={12} />
                Actif
              </div>
            </div>

            {/* Notification rows */}
            {NOTIF_EVENTS.map((evt, i) => (
              <div
                key={evt.key}
                className="grid px-5 py-3 items-center"
                style={{
                  gridTemplateColumns: "1fr 80px",
                  borderBottom: i < NOTIF_EVENTS.length - 1 ? `1px solid ${C.border}` : "none",
                }}
              >
                <div>
                  <div className="text-[13px] font-medium text-[#111318]">{evt.label}</div>
                  <div className="text-[11.5px] text-[#8a919e] mt-0.5">{evt.desc}</div>
                </div>
                <div className="flex justify-center">
                  <Toggle
                    checked={(getVal(evt.prefKey) as boolean) ?? false}
                    onChange={(v) => setVal(evt.prefKey, v as never)}
                  />
                </div>
              </div>
            ))}

            <div className="px-5 py-4 border-t border-[#e3e6eb]">
              <SaveBtn section="notifications" />
            </div>
          </div>

          {/* ═══ Section 3: Partage de tickets ═══ */}
          <div ref={sectionRefs.share} id="share" className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="px-5 py-4 border-b border-[#e3e6eb]">
              <div className={sectionTitleCls}>
                <Share2 size={16} style={{ color: C.accent }} /> Partage de tickets
              </div>
              <div className={sectionDescCls}>Générez une image PNG de vos tickets à partager sur X/Twitter. Tous les tickets sont partageables, transparence totale.</div>
            </div>
            <div className="p-5">
              <div className="flex gap-5 items-start flex-wrap">
                {/* Preview card */}
                <div className="shrink-0 w-[280px]">
                  <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2.5">Aperçu carte</div>
                  <div className="rounded-xl p-[18px_20px] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]" style={{ background: "linear-gradient(145deg, #0f172a, #1a2540)" }}>
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded bg-[rgba(59,91,219,0.3)] text-[#7eb8ff] font-[var(--font-mono)] uppercase tracking-wider mb-3">
                      🎾 ATP · Indian Wells QF
                    </div>
                    <div className="text-[16px] font-extrabold tracking-tight mb-0.5">Sinner vs Fritz</div>
                    <div className="text-[11px] text-white/45 mb-3">
                      Dom (Sinner) · {(getVal("share_show_bookmaker") ?? true) && "Unibet · "}09/03/2026
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      <div className="bg-white/[0.06] rounded-md p-2 text-center">
                        <div className="text-[15px] font-extrabold font-[var(--font-mono)]">1.65</div>
                        <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">Cote</div>
                      </div>
                      <div className="bg-white/[0.06] rounded-md p-2 text-center">
                        <div className="text-[15px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">+5.8%</div>
                        <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">Edge</div>
                      </div>
                      {(getVal("share_show_clv") ?? true) && (
                        <div className="bg-white/[0.06] rounded-md p-2 text-center">
                          <div className="text-[15px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">+3.8%</div>
                          <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">CLV</div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-[7px] mb-3" style={{ background: "rgba(18,183,106,0.15)", border: "1px solid rgba(18,183,106,0.25)" }}>
                      <span className="text-[12px] font-bold text-[#4ade80]">✓ Gagné</span>
                      <span className="text-[17px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">
                        {(getVal("share_show_gain_euros") ?? true) ? "+19.50 €" : "+21.5% ROI"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/[0.07] pt-2.5">
                      <span className="text-[12px] font-semibold text-white/60">{pseudo}</span>
                      <span className="text-[12px] font-extrabold tracking-tight text-white/30">Bet<span className="text-[#4f8cff]">Tracker</span></span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="mt-2.5 w-full px-4 py-2.5 rounded-[9px] border-none text-white text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:brightness-110"
                    style={{ background: C.accent }}
                  >
                    <Share2 size={13} /> Voir la modal de partage
                  </button>
                </div>

                {/* Config */}
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2.5">Configuration par défaut</div>
                  <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                    <div className={rowCls}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Pseudo public affiché</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">Visible en bas de chaque carte partagée</div>
                      </div>
                      <input
                        type="text"
                        value={getVal("share_pseudo") ?? ""}
                        onChange={(e) => setVal("share_pseudo", e.target.value)}
                        placeholder={`@${user?.display_name?.replace(/\s+/g, "") ?? "pseudo"}`}
                        className={inputCls + " !w-[140px]"}
                      />
                    </div>
                    <div className={rowCls}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Afficher la mise</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">Montant misé visible sur la carte</div>
                      </div>
                      <Toggle checked={getVal("share_show_stake") ?? false} onChange={(v) => setVal("share_show_stake", v)} />
                    </div>
                    <div className={rowCls}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Afficher le gain/perte en €</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">Si off : % ROI uniquement</div>
                      </div>
                      <Toggle checked={getVal("share_show_gain_euros") ?? true} onChange={(v) => setVal("share_show_gain_euros", v)} />
                    </div>
                    <div className={rowCls}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Afficher le bookmaker</div>
                      </div>
                      <Toggle checked={getVal("share_show_bookmaker") ?? true} onChange={(v) => setVal("share_show_bookmaker", v)} />
                    </div>
                    <div className={rowCls}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Afficher le CLV</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">Crédibilise la valeur long terme, recommandé</div>
                      </div>
                      <Toggle checked={getVal("share_show_clv") ?? true} onChange={(v) => setVal("share_show_clv", v)} />
                    </div>
                    <div className={rowCls + " bg-[#f4f5f7]"}>
                      <div className="flex-1 pr-5">
                        <div className="text-[13px] font-medium text-[#111318]">Watermark BetTracker</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">Toujours affiché, contrepartie de la feature gratuite</div>
                      </div>
                      <Toggle checked={true} onChange={() => {}} disabled />
                    </div>
                  </div>
                </div>
              </div>
              <SaveBtn section="share" />
            </div>
          </div>

          {/* ═══ Section 4: Affichage & Langue ═══ */}
          <div ref={sectionRefs.display} id="display" className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <div className="px-5 py-4 border-b border-[#e3e6eb]">
              <div className={sectionTitleCls}>
                <Settings size={16} style={{ color: C.accent }} /> Affichage & Langue
              </div>
            </div>
            <div className="p-5">
              {/* Theme */}
              <div className="mb-5">
                <div className="text-[12px] font-semibold text-[#3c4149] mb-2.5">Thème</div>
                <div className="flex gap-2.5">
                  {([
                    { id: "light", label: "Clair (défaut)", icon: Sun, sb: "#1e2535", main: "#f4f5f7", bar: "#fff", cnt: "#e3e6eb" },
                    { id: "dark", label: "Sombre", icon: Moon, sb: "#0f172a", main: "#1e293b", bar: "#0f172a", cnt: "#334155" },
                    { id: "auto", label: "Auto (système)", icon: Monitor, sb: "#1e2535", main: "#e2e8f0", bar: "#cbd5e1", cnt: "#94a3b8" },
                  ] as const).map((t) => {
                    const isSelected = getVal("theme") === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setVal("theme", t.id)}
                        className="flex-1 border-2 rounded-[9px] p-2.5 cursor-pointer transition-all text-center bg-transparent hover:border-[#cdd1d9]"
                        style={{
                          borderColor: isSelected ? C.accentBd : C.border,
                          background: isSelected ? C.accentBg : "transparent",
                        }}
                      >
                        <div className="w-full h-8 rounded-[5px] overflow-hidden flex mb-2">
                          <div style={{ width: "28%", background: t.sb }} />
                          <div className="flex-1 flex flex-col gap-0.5 p-1" style={{ background: t.main }}>
                            <div className="h-[7px] rounded-sm" style={{ background: t.bar }} />
                            <div className="flex-1 rounded-sm" style={{ background: t.cnt }} />
                          </div>
                        </div>
                        <div className={`text-[11.5px] font-semibold ${isSelected ? "text-[#3b5bdb]" : "text-[#3c4149]"}`}>
                          {t.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Settings rows */}
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Langue</div>
                  </div>
                  <select
                    value={getVal("language") ?? "fr"}
                    onChange={(e) => setVal("language", e.target.value)}
                    className={selectCls + " !w-auto"}
                  >
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="es">🇪🇸 Español</option>
                  </select>
                </div>
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Devise d'affichage</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Cosmétique : affiche le symbole, ne convertit pas les montants</div>
                  </div>
                  <select
                    value={getVal("currency") ?? "EUR"}
                    onChange={(e) => setVal("currency", e.target.value)}
                    className={selectCls + " !w-auto"}
                  >
                    <option value="EUR">€ Euro</option>
                    <option value="GBP">£ Livre sterling</option>
                    <option value="USD">$ Dollar</option>
                    <option value="CHF">CHF Franc suisse</option>
                  </select>
                </div>
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Format des cotes</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Affecte toutes les vues et les cartes de partage</div>
                  </div>
                  <select
                    value={getVal("odds_format") ?? "decimal"}
                    onChange={(e) => setVal("odds_format", e.target.value)}
                    className={selectCls + " !w-auto"}
                  >
                    <option value="decimal">Décimal (1.85)</option>
                    <option value="fractional">Fractionnaire (17/20)</option>
                    <option value="american">Américain (+185)</option>
                  </select>
                </div>
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Vue par défaut : Tickets</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Vue affichée à l'ouverture du module Tickets</div>
                  </div>
                  <select
                    value={getVal("default_tickets_view") ?? "kanban"}
                    onChange={(e) => setVal("default_tickets_view", e.target.value)}
                    className={selectCls + " !w-auto"}
                  >
                    <option value="kanban">Kanban</option>
                    <option value="list">Liste / Historique</option>
                    <option value="campaign">Par campagne</option>
                  </select>
                </div>
                <div className={rowCls}>
                  <div className="flex-1 pr-5">
                    <div className="text-[13.5px] font-medium text-[#111318]">Vue par défaut : Campagnes</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">Vue affichée à l'ouverture du module Campagnes</div>
                  </div>
                  <select
                    value={getVal("default_campaigns_view") ?? "grid"}
                    onChange={(e) => setVal("default_campaigns_view", e.target.value)}
                    className={selectCls + " !w-auto"}
                  >
                    <option value="grid">Grille</option>
                    <option value="kanban">Kanban</option>
                  </select>
                </div>
              </div>
              <SaveBtn section="display" />
            </div>
          </div>

          {/* ── Lien Profil ── */}
          <div className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm px-5 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-semibold text-[#111318]">Plan & Facturation</div>
              <div className="text-[12px] text-[#8a919e] mt-0.5">Gérer votre abonnement, vos factures et votre plan dans le Profil</div>
            </div>
            <a
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e3e6eb] bg-transparent text-[#3c4149] text-[13px] font-medium no-underline transition-all hover:border-[rgba(59,91,219,0.18)] hover:text-[#3b5bdb]"
            >
              Aller au Profil <ExternalLink size={12} />
            </a>
          </div>

          {/* ═══ Section 5: Double authentification ═══ */}
          <div ref={sectionRefs.security} id="security" className="bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-sm overflow-hidden animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <div className="px-5 py-4 border-b border-[#e3e6eb]">
              <div className={sectionTitleCls}>
                <ShieldCheck size={16} style={{ color: C.accent }} /> Double authentification (2FA)
              </div>
              <div className={sectionDescCls}>Protégez votre compte avec une application d'authentification (Google Authenticator, Authy, etc.).</div>
            </div>
            <div className="p-5">
              {/* Feedback messages */}
              {twoFaSuccess && (
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#12b76a] mb-4" style={{ background: "rgba(18,183,106,0.06)", border: "1px solid rgba(18,183,106,0.2)" }}>
                  <Check size={15} className="shrink-0" />
                  {twoFaSuccess}
                </div>
              )}
              {twoFaError && twoFaStep === "idle" && (
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438] mb-4" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                  <X size={15} className="shrink-0" />
                  {twoFaError}
                </div>
              )}

              {/* Status actuel */}
              {twoFaStep === "idle" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: user?.totp_enabled ? "rgba(18,183,106,0.1)" : "rgba(240,68,56,0.07)" }}
                    >
                      <KeyRound size={18} style={{ color: user?.totp_enabled ? C.green : C.red }} />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#111318]">
                        {user?.totp_enabled ? "2FA activée" : "2FA désactivée"}
                      </div>
                      <div className="text-[12px] text-[#8a919e] mt-0.5">
                        {user?.totp_enabled
                          ? "Votre compte est protégé par une application d'authentification."
                          : "Activez le 2FA pour sécuriser votre compte."}
                      </div>
                    </div>
                  </div>
                  {user?.totp_enabled ? (
                    <button
                      onClick={() => { setTwoFaStep("disable"); setTwoFaError(""); setTwoFaSuccess(""); setTwoFaCode(""); setTwoFaDisablePwd(""); }}
                      className="px-4 py-2 rounded-[9px] border border-[rgba(240,68,56,0.25)] bg-transparent text-[#f04438] text-[13px] font-semibold cursor-pointer transition-all hover:bg-[rgba(240,68,56,0.06)]"
                    >
                      Désactiver
                    </button>
                  ) : (
                    <button
                      onClick={handleSetup2FA}
                      disabled={twoFaLoading}
                      className="px-4 py-2 rounded-[9px] border-none text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ background: C.accent }}
                    >
                      {twoFaLoading ? "..." : <><QrCode size={14} /> Activer</>}
                    </button>
                  )}
                </div>
              )}

              {/* Etape : setup (affichage QR + saisie code) */}
              {twoFaStep === "setup" && (
                <form onSubmit={handleVerify2FA}>
                  <div className="flex flex-col gap-4">
                    <div className="text-[13px] text-[#3c4149]">
                      <strong>Etape 1 :</strong> Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy...).
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      {twoFaQr && (
                        <img src={twoFaQr} alt="QR code 2FA" className="w-[180px] h-[180px] border border-[#e3e6eb] rounded-xl p-2" />
                      )}
                      <div className="text-center">
                        <div className="text-[11px] text-[#8a919e] mb-1">Ou entrez manuellement la clé :</div>
                        <div
                          className="inline-block px-3 py-1.5 rounded-lg text-[13px] font-[var(--font-mono)] tracking-widest text-[#111318]"
                          style={{ background: "#f4f5f7", border: "1px solid #e3e6eb" }}
                        >
                          {twoFaSecret}
                        </div>
                      </div>
                    </div>
                    <div className="text-[13px] text-[#3c4149]">
                      <strong>Etape 2 :</strong> Entrez le code à 6 chiffres généré par l'application pour confirmer.
                    </div>
                    {twoFaError && (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[9px] text-[13px] text-[#f04438]" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                        <X size={14} className="shrink-0" /> {twoFaError}
                      </div>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className={inputCls + " text-center text-[18px] font-[var(--font-mono)] tracking-[0.3em]"}
                      autoFocus
                    />
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaError(""); }}
                        className="flex-1 px-4 py-2.5 rounded-[9px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[13px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-all"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={twoFaLoading || twoFaCode.length !== 6}
                        className="flex-1 px-4 py-2.5 rounded-[9px] border-none text-white text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-all hover:brightness-110 disabled:opacity-50"
                        style={{ background: C.accent }}
                      >
                        {twoFaLoading ? "..." : <><Check size={14} /> Confirmer</>}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Etape : disable */}
              {twoFaStep === "disable" && (
                <form onSubmit={handleDisable2FA}>
                  <div className="flex flex-col gap-3.5">
                    <div className="text-[13px] text-[#3c4149]">
                      Pour désactiver le 2FA, confirmez votre mot de passe et entrez le code de votre application.
                    </div>
                    {twoFaError && (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[9px] text-[13px] text-[#f04438]" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                        <X size={14} className="shrink-0" /> {twoFaError}
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Mot de passe actuel</label>
                      <input
                        type="password"
                        value={twoFaDisablePwd}
                        onChange={(e) => setTwoFaDisablePwd(e.target.value)}
                        placeholder="Votre mot de passe"
                        className={inputCls}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Code 2FA (6 chiffres)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={twoFaCode}
                        onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        className={inputCls + " text-center text-[18px] font-[var(--font-mono)] tracking-[0.3em]"}
                        required
                      />
                    </div>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaDisablePwd(""); setTwoFaError(""); }}
                        className="flex-1 px-4 py-2.5 rounded-[9px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[13px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-all"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={twoFaLoading || !twoFaDisablePwd || twoFaCode.length !== 6}
                        className="flex-1 px-4 py-2.5 rounded-[9px] border border-[rgba(240,68,56,0.25)] bg-transparent text-[#f04438] text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-all hover:bg-[rgba(240,68,56,0.06)] disabled:opacity-50"
                      >
                        {twoFaLoading ? "..." : "Désactiver le 2FA"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Share preview modal ── */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[2px]"
          style={{ background: "rgba(10,13,20,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col animate-fade-up">
            <div className="px-5 py-4 border-b border-[#e3e6eb] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[15px] font-bold text-[#111318]">Partager ce ticket</h3>
                <div className="text-[12px] text-[#8a919e] mt-0.5">Sinner vs Fritz · Dom @ 1.65 · ✓ Gagné</div>
              </div>
              <button onClick={() => setShowShareModal(false)} className="w-[30px] h-[30px] rounded-lg border-none bg-transparent cursor-pointer text-[#8a919e] hover:bg-[#f4f5f7] hover:text-[#111318] transition-all flex items-center justify-center">
                <X size={15} />
              </button>
            </div>

            <div className="p-5 flex gap-5 flex-1">
              {/* Preview side */}
              <div className="shrink-0 w-[260px]">
                <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2.5">Aperçu</div>
                <div className="rounded-xl p-[18px_20px] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]" style={{ background: "linear-gradient(145deg, #0f172a, #1a2540)" }}>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded bg-[rgba(59,91,219,0.3)] text-[#7eb8ff] font-[var(--font-mono)] uppercase tracking-wider mb-3">
                    🎾 ATP · Indian Wells QF
                  </div>
                  <div className="text-[16px] font-extrabold tracking-tight mb-0.5">Sinner vs Fritz</div>
                  <div className="text-[11px] text-white/45 mb-3">Dom (Sinner) · Unibet · 09/03/2026</div>
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <div className="bg-white/[0.06] rounded-md p-2 text-center">
                      <div className="text-[15px] font-extrabold font-[var(--font-mono)]">1.65</div>
                      <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">Cote</div>
                    </div>
                    <div className="bg-white/[0.06] rounded-md p-2 text-center">
                      <div className="text-[15px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">+5.8%</div>
                      <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">Edge</div>
                    </div>
                    <div className="bg-white/[0.06] rounded-md p-2 text-center">
                      <div className="text-[15px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">+3.8%</div>
                      <div className="text-[9.5px] text-white/40 mt-0.5 uppercase tracking-wider">CLV</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-[7px] mb-3" style={{ background: "rgba(18,183,106,0.15)", border: "1px solid rgba(18,183,106,0.25)" }}>
                    <span className="text-[12px] font-bold text-[#4ade80]">✓ Gagné</span>
                    <span className="text-[17px] font-extrabold font-[var(--font-mono)] text-[#4ade80]">+19.50 €</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.07] pt-2.5">
                    <span className="text-[12px] font-semibold text-white/60">{pseudo}</span>
                    <span className="text-[12px] font-extrabold tracking-tight text-white/30">Bet<span className="text-[#4f8cff]">Tracker</span></span>
                  </div>
                </div>
                {/* Tweet preview */}
                <div className="mt-2.5 p-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg">
                  <div className="text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-1.5">Texte X/Twitter</div>
                  <div className="text-[12.5px] text-[#3c4149] leading-relaxed">
                    <strong className="text-[#111318]">✅ Sinner vs Fritz : Dom @ 1.65</strong><br />
                    Edge : +5.8% | CLV : +3.8%<br />
                    +19.50€<br /><br />
                    <span className="text-[#3b5bdb]">#ValueBetting #BetTracker</span>
                  </div>
                </div>
              </div>

              {/* Options + Actions */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">Options pour ce partage</div>
                <div className="text-[11.5px] text-[#8a919e] mb-2">Modifiables à la volée, ne change pas vos paramètres globaux</div>
                <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden mb-4">
                  {[
                    { label: "Afficher la mise", desc: null },
                    { label: "Afficher le gain en €", desc: "Si off : % ROI uniquement" },
                    { label: "Afficher le bookmaker", desc: null },
                    { label: "Afficher le CLV", desc: null },
                  ].map((opt, i) => (
                    <div key={i} className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#e3e6eb] last:border-b-0">
                      <div>
                        <div className="text-[13px] font-medium text-[#111318]">{opt.label}</div>
                        {opt.desc && <div className="text-[11px] text-[#8a919e] mt-0.5">{opt.desc}</div>}
                      </div>
                      <Toggle checked={i !== 0} onChange={() => {}} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#f4f5f7]">
                    <div>
                      <div className="text-[13px] font-medium text-[#111318]">Watermark BetTracker</div>
                      <div className="text-[11px] text-[#8a919e] mt-0.5">Toujours présent</div>
                    </div>
                    <Toggle checked={true} onChange={() => {}} disabled />
                  </div>
                </div>

                <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">Pseudo affiché</div>
                <input
                  type="text"
                  defaultValue={pseudo}
                  className={inputCls + " mb-4"}
                />

                <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">Actions</div>
                <div className="grid grid-cols-3 gap-2">
                  <button className="p-2.5 rounded-[9px] border-[1.5px] border-[#e3e6eb] bg-transparent cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:border-[rgba(59,91,219,0.18)] hover:bg-[rgba(59,91,219,0.07)]">
                    <span className="text-[20px]">📋</span>
                    <span className="text-[12px] font-semibold text-[#3c4149]">Copier l'image</span>
                    <span className="text-[10.5px] text-[#8a919e]">PNG presse-papier</span>
                  </button>
                  <button className="p-2.5 rounded-[9px] border-[1.5px] border-[#e3e6eb] bg-transparent cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:border-[rgba(59,91,219,0.18)] hover:bg-[rgba(59,91,219,0.07)]">
                    <span className="text-[20px]">⬇️</span>
                    <span className="text-[12px] font-semibold text-[#3c4149]">Télécharger</span>
                    <span className="text-[10.5px] text-[#8a919e]">Fichier PNG local</span>
                  </button>
                  <button className="p-2.5 rounded-[9px] border-[1.5px] border-[rgba(0,0,0,0.15)] bg-black cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:bg-[#1a1a1a]">
                    <span className="text-[18px] font-black font-[var(--font-mono)]">𝕏</span>
                    <span className="text-[12px] font-semibold text-white/80">Partager sur X</span>
                    <span className="text-[10.5px] text-white/50">Image + texte pré-rempli</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#e3e6eb] flex items-center justify-between shrink-0">
              <span className="text-[12px] text-[#8a919e]">Génération côté client, aucune donnée envoyée</span>
              <button
                onClick={() => setShowShareModal(false)}
                className="px-3.5 py-2 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12.5px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
