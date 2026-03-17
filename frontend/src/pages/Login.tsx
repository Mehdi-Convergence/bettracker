import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Eye, EyeOff, UserPlus, Check, ScanSearch, BarChart2, Bot, MessageCircle, ShieldCheck, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { requestEmailCode, verifyEmailCode, setAccessToken, createReactivateCheckout, sendEmail2FACode } from "@/services/api";

type Mode = "login" | "signup";
type LoginMethod = "password" | "email-code";

export default function Login() {
  const { login, login2FAVerify, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA step
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);
  const [active2FAMethod, setActive2FAMethod] = useState<string>("totp");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);

  // Email code step
  const [emailCodeStep, setEmailCodeStep] = useState<"email" | "code">("email");
  const [emailCodeEmail, setEmailCodeEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);
  const [emailCodeSuccess, setEmailCodeSuccess] = useState("");

  // Inactive account
  const [inactiveAccount, setInactiveAccount] = useState<{ user_id: number; email: string } | null>(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);

  // Signup
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");
  const [signupErr, setSignupErr] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInactiveAccount(null);
    setLoading(true);
    try {
      // Pre-check for inactive account (403 with inactive flag)
      const preCheck = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (preCheck.status === 403) {
        const data = await preCheck.json();
        if (data.inactive) {
          setInactiveAccount({ user_id: data.user_id, email: data.email });
          setLoading(false);
          return;
        }
      }
      // Normal login flow
      const result = await login(email, password);
      if (result && result.requires_2fa) {
        setLoginToken(result.login_token);
        setAvailableMethods(result.available_methods || ["totp"]);
        const preferred = result.preferred_method || "totp";
        setActive2FAMethod(preferred);
        setTwoFactorRequired(true);
        setEmailCodeSent(false);
        // If preferred method is email, auto-send the code
        if (preferred === "email") {
          sendEmail2FACode(result.login_token).catch(() => {});
          setEmailCodeSent(true);
        }
      } else {
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async (tier: "pro" | "premium") => {
    if (!inactiveAccount) return;
    setReactivateLoading(true);
    try {
      const { url } = await createReactivateCheckout(inactiveAccount.user_id, inactiveAccount.email, tier);
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la reactivation");
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    setSendingEmailCode(true);
    try {
      await sendEmail2FACode(loginToken);
      setEmailCodeSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur d'envoi");
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleSwitchMethod = (method: string) => {
    setActive2FAMethod(method);
    setTwoFactorCode("");
    setError("");
    if (method === "email" && !emailCodeSent) {
      handleSendEmailCode();
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setTwoFactorLoading(true);
    try {
      await login2FAVerify(loginToken, twoFactorCode, active2FAMethod);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Code invalide");
      setTwoFactorCode("");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleRequestEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailCodeSuccess("");
    setEmailCodeLoading(true);
    try {
      await requestEmailCode(emailCodeEmail);
      setEmailCodeStep("code");
      setEmailCodeSuccess("Code envoye. Verifiez votre boite mail.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi du code");
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailCodeLoading(true);
    try {
      const result = await verifyEmailCode(emailCodeEmail, emailCode) as Record<string, unknown>;
      if (result.requires_2fa) {
        const token = result.login_token as string;
        setLoginToken(token);
        const methods = (result.available_methods as string[]) || ["totp"];
        setAvailableMethods(methods);
        const preferred = (result.preferred_method as string) || "totp";
        setActive2FAMethod(preferred);
        setTwoFactorRequired(true);
        setEmailCodeSent(false);
        setLoginMethod("password");
        if (preferred === "email") {
          sendEmail2FACode(token).catch(() => {});
          setEmailCodeSent(true);
        }
      } else {
        setAccessToken(result.access_token as string);
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Code invalide");
      setEmailCode("");
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErr("");
    if (signupPwd.length < 8) { setSignupErr("Min. 8 caractères"); return; }
    setSignupLoading(true);
    try {
      await register(signupEmail, signupPwd, signupName);
      navigate("/dashboard");
    } catch (err: unknown) {
      setSignupErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSignupLoading(false);
    }
  };

  const inputCls = "w-full py-[11px] pl-[38px] pr-3.5 bg-white border-[1.5px] border-[#e3e6eb] rounded-[10px] text-[14px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
  const inputNoPadCls = "w-full py-[11px] px-3.5 bg-white border-[1.5px] border-[#e3e6eb] rounded-[10px] text-[14px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";
  const labelCls = "text-[11.5px] font-semibold text-[#3c4149] tracking-wide";

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* ── LEFT PANEL: BRANDING ── */}
      <div className="hidden md:flex md:flex-col relative overflow-hidden" style={{ background: "#0f1623" }}>
        {/* Grid decoration */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Glow circles */}
        <div className="absolute -top-30 -right-30 w-[600px] h-[600px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(79,140,255,0.12) 0%, transparent 65%)" }} />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(18,183,106,0.08) 0%, transparent 65%)" }} />

        {/* Logo — ancré en haut à gauche */}
        <Link to="/" className="relative z-10 flex items-center gap-2.5 no-underline" style={{ padding: "40px 0 0 44px" }}>
          <div className="w-8 h-8 bg-[#4f8cff] rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="w-[17px] h-[17px]">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span className="font-extrabold text-[17px] tracking-tight text-white">
            Bet<span className="text-[#7eb8ff]">Tracker</span>
          </span>
        </Link>

        {/* Center content — centré horizontalement */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center">
          <div className="w-full max-w-[580px]" style={{ gap: "36px", display: "flex", flexDirection: "column" }}>
            <div>
              <div
                className="font-semibold uppercase mb-5"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", letterSpacing: "0.18em", color: "rgba(79,140,255,0.8)" }}
              >
                Value Bet Detection
              </div>
              <h1
                className="tracking-tight leading-[1.05] text-white mb-6"
                style={{ fontSize: "62px", fontWeight: 900 }}
              >
                Pariez avec l&apos;<span className="bg-gradient-to-r from-[#7eb8ff] to-[#4f8cff] bg-clip-text text-transparent">edge</span>
                <br />
                et la <span className="bg-gradient-to-r from-[#12b76a] to-[#3ee09c] bg-clip-text text-transparent">probabilité</span>.
                <br />
                Pas l&apos;instinct.
              </h1>
              <p
                className="leading-[1.75]"
                style={{ fontSize: "20px", color: "rgba(255,255,255,0.42)", textAlign: "justify" }}
              >
                Détectez les value bets en temps réel, suivez vos performances match par match et pilotez vos campagnes de paris avec un algorithme entraîné sur des années de données.
              </p>
            </div>

            <div className="flex flex-col" style={{ gap: "18px" }}>
              {[
                { Icon: ScanSearch, text: "Scan automatique des matchs à fort edge", color: "#7eb8ff", bg: "rgba(79,140,255,0.15)" },
                { Icon: BarChart2, text: "Suivi ROI en temps réel · Historique complet", color: "#12b76a", bg: "rgba(18,183,106,0.15)" },
                { Icon: Bot, text: "Campagnes auto-pilotées par l'algorithme", color: "#f79009", bg: "rgba(247,144,9,0.15)" },
                { Icon: MessageCircle, text: "IA Analyste disponible 24h/24", color: "#a78bfa", bg: "rgba(139,92,246,0.15)" },
              ].map(({ Icon, text, color, bg }) => (
                <div key={text} className="flex items-center gap-4" style={{ fontSize: "15.5px", color: "rgba(255,255,255,0.72)" }}>
                  <div
                    className="rounded-xl flex items-center justify-center shrink-0"
                    style={{ width: "38px", height: "38px", background: bg }}
                  >
                    <Icon size={17} style={{ color }} />
                  </div>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Social proof — ancré en bas à gauche */}
        <div className="relative z-10" style={{ padding: "0 0 40px 44px" }}>
          <div
            className="inline-flex items-center gap-3 px-4 py-3.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex">
              {["#4f8cff", "#12b76a", "#f79009", "#7c3aed", "#f04438"].map((c, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2"
                  style={{ background: c, borderColor: "#0f1623", marginLeft: i > 0 ? "-8px" : 0 }}
                >
                  {["A", "T", "R", "M", "K"][i]}
                </div>
              ))}
            </div>
            <div className="text-[12.5px] whitespace-nowrap" style={{ color: "rgba(255,255,255,0.55)" }}>
              Rejoignez nos parieurs · ROI moyen <strong style={{ color: "#12b76a" }}>+18%</strong>
            </div>
          </div>
        </div>

      </div>

      {/* ── RIGHT PANEL: FORM ── */}
      <div className="bg-[#f4f5f7] flex items-center justify-center px-8 py-10">
        <div className="w-full max-w-[420px] animate-fade-up">
          {/* Header */}
          <div className="mb-7">
            <h2 className="text-[22px] font-extrabold tracking-tight text-[#111318]">
              {mode === "login" ? "Bon retour" : "Créez votre compte"}
            </h2>
            <p className="text-[13px] text-[#8a919e] mt-1">
              {mode === "login" ? "Connectez-vous à votre espace BetTracker" : "7 jours gratuits · aucune carte requise"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-white border border-[#e3e6eb] rounded-[10px] p-[3px] mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-[9px] text-[13px] font-medium rounded-lg cursor-pointer transition-all border-none ${
                mode === "login" ? "bg-[#1e2535] text-white font-semibold" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-[9px] text-[13px] font-medium rounded-lg cursor-pointer transition-all border-none ${
                mode === "signup" ? "bg-[#1e2535] text-white font-semibold" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"
              }`}
            >
              Créer un compte
            </button>
          </div>

          {/* ── 2FA FORM ── */}
          {mode === "login" && twoFactorRequired && (
            <form onSubmit={handleTwoFactorSubmit}>
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-[10px]" style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
                  {active2FAMethod === "email" ? <Mail size={20} className="text-[#3b5bdb] shrink-0" /> : <ShieldCheck size={20} className="text-[#3b5bdb] shrink-0" />}
                  <div>
                    <div className="text-[13px] font-semibold text-[#111318]">Double authentification</div>
                    <div className="text-[12px] text-[#8a919e] mt-0.5">
                      {active2FAMethod === "email"
                        ? "Un code a 6 chiffres a ete envoye a votre adresse email"
                        : "Entrez le code a 6 chiffres de votre application d'authentification"}
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Code de verification (6 chiffres)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className={inputNoPadCls + " text-center text-[18px] font-[var(--font-mono)] tracking-[0.3em]"}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={twoFactorLoading || twoFactorCode.length !== 6}
                  className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(59,91,219,0.3)] hover:bg-[#2f4ac7] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(59,91,219,0.35)] disabled:opacity-70 mt-1"
                >
                  {twoFactorLoading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Verifier le code
                </button>

                {/* Method switcher + resend */}
                <div className="flex flex-col items-center gap-2 mt-1">
                  {active2FAMethod === "email" && (
                    <button
                      type="button"
                      onClick={handleSendEmailCode}
                      disabled={sendingEmailCode}
                      className="text-[12.5px] text-[#3b5bdb] bg-transparent border-none cursor-pointer hover:underline transition-colors font-medium disabled:opacity-50"
                    >
                      {sendingEmailCode ? "Envoi en cours..." : "Renvoyer le code par email"}
                    </button>
                  )}

                  {availableMethods.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleSwitchMethod(active2FAMethod === "totp" ? "email" : "totp")}
                      className="text-[12.5px] text-[#8a919e] bg-transparent border-none cursor-pointer hover:text-[#3b5bdb] transition-colors flex items-center gap-1.5"
                    >
                      {active2FAMethod === "totp" ? (
                        <><Mail size={12} /> Recevoir le code par email</>
                      ) : (
                        <><KeyRound size={12} /> Utiliser l'application d'authentification</>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setTwoFactorRequired(false); setTwoFactorCode(""); setError(""); setEmailCodeSent(false); }}
                    className="text-[12.5px] text-[#8a919e] bg-transparent border-none cursor-pointer hover:text-[#3c4149] transition-colors"
                  >
                    Retour a la connexion
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ── INACTIVE ACCOUNT ── */}
          {mode === "login" && inactiveAccount && !twoFactorRequired && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 px-4 py-4 rounded-[10px]" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <div>
                  <div className="text-[13px] font-semibold text-[#92400e]">Compte inactif</div>
                  <div className="text-[12px] text-[#b45309] mt-0.5">
                    Votre compte ({inactiveAccount.email}) a ete desactive. Choisissez un plan pour le reactiver.
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "rgba(240,68,56,0.06)", border: "1px solid rgba(240,68,56,0.2)" }}>
                  {error}
                </div>
              )}

              <button
                onClick={() => handleReactivate("pro")}
                disabled={reactivateLoading}
                className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#2f4ac7] disabled:opacity-70"
              >
                {reactivateLoading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : null}
                Reactiver avec Pro — 29EUR/mois
              </button>
              <button
                onClick={() => handleReactivate("premium")}
                disabled={reactivateLoading}
                className="w-full py-[13px] rounded-[10px] border-none text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-70"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
              >
                Reactiver avec Elite — 69EUR/mois
              </button>

              <button
                type="button"
                onClick={() => { setInactiveAccount(null); setError(""); }}
                className="text-[12.5px] text-[#8a919e] bg-transparent border-none cursor-pointer hover:text-[#3c4149] transition-colors text-center"
              >
                Retour a la connexion
              </button>
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {mode === "login" && !twoFactorRequired && !inactiveAccount && (
            <div>
              {/* Methode de connexion */}
              <div className="relative flex p-0.5 mb-5 rounded-xl" style={{ background: "#f4f5f7" }}>
                {/* Sliding indicator */}
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-[10px] bg-white transition-all duration-200"
                  style={{
                    width: "calc(50% - 2px)",
                    left: loginMethod === "password" ? "2px" : "calc(50%)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => { setLoginMethod("password"); setError(""); }}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-[9px] rounded-[10px] text-[12.5px] font-semibold cursor-pointer border-none bg-transparent transition-colors ${
                    loginMethod === "password" ? "text-[#111318]" : "text-[#8a919e] hover:text-[#6b7280]"
                  }`}
                >
                  <Lock size={13} />
                  Mot de passe
                </button>
                <button
                  type="button"
                  onClick={() => { setLoginMethod("email-code"); setError(""); setEmailCodeStep("email"); setEmailCode(""); setEmailCodeSuccess(""); }}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-[9px] rounded-[10px] text-[12.5px] font-semibold cursor-pointer border-none bg-transparent transition-colors ${
                    loginMethod === "email-code" ? "text-[#111318]" : "text-[#8a919e] hover:text-[#6b7280]"
                  }`}
                >
                  <KeyRound size={13} />
                  Code par email
                </button>
              </div>

              {/* Formulaire mot de passe */}
              {loginMethod === "password" && (
                <form onSubmit={handleLogin}>
                  <div className="flex flex-col gap-3.5">
                    {error && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        {error}
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Adresse e-mail</label>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="votre@email.com"
                          className={inputCls}
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Mot de passe</label>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                        <input
                          type={showPwd ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Votre mot de passe"
                          className={inputCls + " pr-[42px]"}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#b0b7c3] hover:text-[#111318] transition-colors p-0"
                        >
                          {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between -mt-1">
                      <label className="flex items-center gap-2 text-[12.5px] text-[#8a919e] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="w-[15px] h-[15px] accent-[#3b5bdb] cursor-pointer"
                        />
                        Se souvenir de moi
                      </label>
                      <Link to="/forgot-password" className="text-[12.5px] text-[#3b5bdb] font-medium no-underline hover:underline">
                        Mot de passe oublie ?
                      </Link>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(59,91,219,0.3)] hover:bg-[#2f4ac7] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(59,91,219,0.35)] disabled:opacity-70 mt-1"
                    >
                      {loading ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <LogIn size={16} />
                      )}
                      Se connecter
                    </button>
                  </div>

                  <div className="text-center text-[13px] text-[#8a919e] mt-5 pt-5 border-t border-[#e3e6eb]">
                    Pas encore de compte ?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="text-[#3b5bdb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0">
                      Essai gratuit 7 jours →
                    </button>
                  </div>
                </form>
              )}

              {/* Formulaire code par email */}
              {loginMethod === "email-code" && (
                <div>
                  {emailCodeStep === "email" ? (
                    <form onSubmit={handleRequestEmailCode}>
                      <div className="flex flex-col gap-3.5">
                        <div className="flex items-start gap-3 px-3.5 py-3 rounded-[10px] text-[12.5px] text-[#3c4149]" style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
                          <KeyRound size={15} className="text-[#3b5bdb] shrink-0 mt-0.5" />
                          <span>Entrez votre email pour recevoir un code de connexion a 6 chiffres valable 10 minutes.</span>
                        </div>

                        {error && (
                          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                            {error}
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Adresse e-mail</label>
                          <div className="relative">
                            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                            <input
                              type="email"
                              value={emailCodeEmail}
                              onChange={(e) => setEmailCodeEmail(e.target.value)}
                              placeholder="votre@email.com"
                              className={inputCls}
                              required
                              autoFocus
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={emailCodeLoading}
                          className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(59,91,219,0.3)] hover:bg-[#2f4ac7] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(59,91,219,0.35)] disabled:opacity-70"
                        >
                          {emailCodeLoading ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <Mail size={16} />
                          )}
                          Envoyer le code
                        </button>
                      </div>

                      <div className="text-center text-[13px] text-[#8a919e] mt-5 pt-5 border-t border-[#e3e6eb]">
                        Pas encore de compte ?{" "}
                        <button type="button" onClick={() => setMode("signup")} className="text-[#3b5bdb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0">
                          Essai gratuit 7 jours →
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyEmailCode}>
                      <div className="flex flex-col gap-3.5">
                        {emailCodeSuccess && (
                          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#12b76a]" style={{ background: "var(--green-bg)", border: "1px solid rgba(18,183,106,0.2)" }}>
                            <Check size={15} className="shrink-0" />
                            {emailCodeSuccess}
                          </div>
                        )}

                        {error && (
                          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                            {error}
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Code de verification (6 chiffres)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            value={emailCode}
                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            className={inputNoPadCls + " text-center text-[18px] font-[var(--font-mono)] tracking-[0.3em]"}
                            required
                            autoFocus
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={emailCodeLoading || emailCode.length !== 6}
                          className="w-full py-[13px] rounded-[10px] border-none bg-[#3b5bdb] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(59,91,219,0.3)] hover:bg-[#2f4ac7] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(59,91,219,0.35)] disabled:opacity-70"
                        >
                          {emailCodeLoading ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <KeyRound size={16} />
                          )}
                          Valider le code
                        </button>

                        <button
                          type="button"
                          onClick={() => { setEmailCodeStep("email"); setEmailCode(""); setError(""); setEmailCodeSuccess(""); }}
                          className="text-[12.5px] text-[#8a919e] bg-transparent border-none cursor-pointer hover:text-[#3c4149] transition-colors text-center"
                        >
                          Renvoyer le code
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SIGNUP FORM ── */}
          {mode === "signup" && (
            <form onSubmit={handleSignup}>
              <div className="flex flex-col gap-3.5">
                {/* Trial badge */}
                <div
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-[10px] text-[12.5px] text-[#3c4149]"
                  style={{ background: "var(--green-bg)", border: "1px solid rgba(18,183,106,0.2)" }}
                >
                  <Check size={16} className="text-[#12b76a] shrink-0" />
                  <span><strong className="text-[#12b76a]">7 jours gratuits</strong> · Aucune CB requise · Résiliation en 1 clic</span>
                </div>

                {signupErr && (
                  <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[9px] text-[13px] font-medium text-[#f04438]" style={{ background: "var(--red-bg)", border: "1px solid rgba(240,68,56,0.2)" }}>
                    {signupErr}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Pseudo</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <input
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="ex: ValueBettor_99"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Adresse e-mail</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Mot de passe</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
                    <input
                      type="password"
                      value={signupPwd}
                      onChange={(e) => setSignupPwd(e.target.value)}
                      placeholder="Min. 8 caractères"
                      className={inputNoPadCls + " pl-[38px]"}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={signupLoading}
                  className="w-full py-[13px] rounded-[10px] border-none bg-[#12b76a] text-white text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(18,183,106,0.3)] hover:bg-[#0ea55e] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(18,183,106,0.35)] disabled:opacity-70"
                >
                  {signupLoading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <UserPlus size={16} />
                  )}
                  Créer mon compte gratuit
                </button>

                <p className="text-[11px] text-[#b0b7c3] text-center leading-relaxed">
                  En créant un compte vous acceptez les{" "}
                  <Link to="/cgu" className="text-[#3b5bdb] no-underline">CGU</Link> et la{" "}
                  <Link to="/confidentialite" className="text-[#3b5bdb] no-underline">politique de confidentialité</Link>.
                </p>
              </div>

              <div className="text-center text-[13px] text-[#8a919e] mt-5 pt-5 border-t border-[#e3e6eb]">
                Déjà un compte ?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-[#3b5bdb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0">
                  Se connecter →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

    </div>
  );
}
