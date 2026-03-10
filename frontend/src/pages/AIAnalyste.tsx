import { useState, useRef, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import {
  MessageCircle,
  Send,
  Plus,
  RotateCcw,
  Settings2,
  Image,
  Search,
  CheckSquare,
  TrendingUp,
  Zap,
  BarChart3,
  CreditCard,
  Info,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   MOCK DATA — Phase 1 only (will be replaced by API)
   ═══════════════════════════════════════════════════════ */

interface MockSession {
  id: number;
  name: string;
  active: boolean;
}

interface MockEmbed {
  type: "match" | "ticket" | "chart";
}

interface MockMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  time: string;
  embeds?: MockEmbed[];
  chips?: string[];
}

const MOCK_SESSIONS: MockSession[] = [
  { id: 1, name: "Analyse du jour", active: true },
  { id: 2, name: "Ticket Indian Wells", active: false },
  { id: 3, name: "Review Mars 2026", active: false },
];

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: 1,
    role: "assistant",
    content: `Bonjour Mehdi 👋 J'ai analysé ton scan du jour. <strong>7 value bets détectés</strong>, edge moyen <span class="hl-green">+6.2%</span>.<br><br>Ton meilleur signal aujourd'hui : <span class="hl-blue">Almeria vs Cultural</span> avec un edge de <span class="hl-green">+7.5%</span> sur la victoire Almeria. Le modèle Poisson donne <span class="hl-green">71.7%</span> de chances, le marché ne valorise que <span class="hl-amber">64.1%</span>.<br><br>Ton ticket actuel (2 sélections) a un EV combiné de <span class="hl-green">+18.3%</span>. C'est solide.`,
    time: "09:14",
    embeds: [{ type: "match" }],
    chips: [
      "Pourquoi cet edge ?",
      "Analyse mon ticket complet",
      "Autres value bets du jour",
    ],
  },
  {
    id: 2,
    role: "user",
    content:
      "Analyse mon ticket en cours. Est-ce que c'est une bonne combinaison ?",
    time: "09:15",
  },
  {
    id: 3,
    role: "assistant",
    content: `Voici ton <strong>Ticket 1</strong> analysé :<br><br>✅ <strong>Almeria Dom @ 1.56</strong> — Excellent. Edge +7.5%, modèle confiant à 71.7%. Cote en baisse (−0.04 en 2h), le marché confirme.<br><br>✅ <strong>Trabzonspor Ext @ 2.05</strong> — Très bon. Edge +10.8%, le plus fort du scan. Trabzonspor est 3e au classement, Kayserispor 17e. λ favorable.<br><br>⚠️ <strong>Point d'attention</strong> : les deux matchs sont <span class="hl-amber">le même jour (09/03)</span>. En combi, si l'un tombe, tout tombe. Avec 20€ et une cote combinée de <span class="hl-blue">×3.20</span>, ton gain potentiel est <span class="hl-green">+44€</span> pour un EV combiné de <span class="hl-green">+18.3%</span>. C'est une bonne combinaison selon mon modèle.`,
    time: "09:15",
    embeds: [{ type: "ticket" }],
    chips: [
      "Ajouter une 3e sélection ?",
      "Simuler avec mise différente",
      "Comparer avec d'autres combis",
    ],
  },
  {
    id: 4,
    role: "user",
    content:
      "Quel est mon ROI sur les 30 derniers jours et comment je peux l'améliorer ?",
    time: "09:17",
  },
  {
    id: 5,
    role: "assistant",
    content: `Sur les <strong>30 derniers jours</strong> : ROI global <span class="hl-green">+18.4%</span>, taux de réussite <span class="hl-blue">61.8%</span> sur 34 tickets.<br><br>Points forts : <strong>Tennis ATP</strong> est ta meilleure surface (<span class="hl-green">+22.4%</span>), Bundesliga aussi (<span class="hl-green">+11.1%</span>).<br><br>⚠️ Points à améliorer :<br>• <strong>Basketball NBA</strong> : <span class="hl-red">−8.1%</span> — à éviter jusqu'à nouvelle analyse<br>• <strong>WTA combi</strong> : trop volatile, 3 tickets tués ce mois. Limite à 10€ max<br>• <strong>Cotes > 3.0</strong> : taux de réussite chute à 34% — rester sur 1.4–2.8`,
    time: "09:18",
    embeds: [{ type: "chart" }],
    chips: [
      "Créer une campagne ATP optimisée",
      "Analyser mes pertes NBA",
      "Simulation bankroll Kelly",
    ],
  },
];

const QUICK_ACTIONS = [
  { label: "Analyser mon ticket", icon: CheckSquare },
  { label: "Value bets du soir", icon: TrendingUp },
  { label: "Ticket auto", icon: Zap },
  { label: "Review stratégie", icon: BarChart3 },
  { label: "Simulation bankroll", icon: CreditCard },
];

/* ═══════════════════════════════════════════════════════
   EMBEDDED COMPONENTS (mock — will use real data later)
   ═══════════════════════════════════════════════════════ */

function EmbedMatchCard() {
  return (
    <div className="bg-white border border-[#e3e6eb] rounded-[10px] p-3.5 mt-1 cursor-pointer transition-all hover:border-[rgba(59,91,219,.18)] hover:shadow-[0_1px_4px_rgba(16,24,40,.06),0_4px_16px_rgba(16,24,40,.06)]" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-bold text-[#111318]">Almeria vs Cultural Leonesa</span>
        <span className="px-2 py-0.5 rounded-[5px] text-[10.5px] font-bold font-mono bg-[rgba(18,183,106,.08)] text-[#12b76a]">+7.5% edge</span>
      </div>
      <div className="text-[11px] text-[#8a919e] mb-2">🇪🇸 Segunda División · lun. 09/03 · 20:30 · Données 13/20</div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: "Dom ⭐", odds: "1.56", bk: "Unibet", edge: "+7.5%", best: true },
          { label: "Nul", odds: "4.38", bk: "Pinnacle", edge: "−3.2%", best: false },
          { label: "Ext", odds: "6.21", bk: "Pinnacle", edge: "−7.3%", best: false },
        ].map((iss) => (
          <div key={iss.label} className={`rounded-[7px] p-[7px] text-center border ${iss.best ? "border-[rgba(18,183,106,.2)] bg-[rgba(18,183,106,.08)]" : "border-[#e3e6eb]"}`}>
            <div className="text-[9.5px] font-semibold text-[#8a919e] uppercase tracking-wide">{iss.label}</div>
            <div className={`text-[16px] font-extrabold font-mono ${iss.best ? "text-[#12b76a]" : "text-[#111318]"}`}>{iss.odds}</div>
            <div className="text-[10px] text-[#8a919e]">{iss.bk}</div>
            <div className={`text-[10px] font-bold font-mono px-1 py-0.5 rounded-[3px] inline-block mt-0.5 ${iss.best ? "bg-[rgba(18,183,106,.08)] text-[#12b76a]" : "bg-[rgba(240,68,56,.07)] text-[#f04438]"}`}>{iss.edge}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-[#8a919e]">λ 2.12 / 0.758 · VVVVD vs DDNDD</span>
        <button className="px-2.5 py-1 rounded-[6px] border-none bg-[#3b5bdb] text-white text-[11px] font-semibold cursor-pointer font-[inherit]">+ Ticket</button>
      </div>
    </div>
  );
}

function EmbedTicketCard() {
  return (
    <div className="bg-[rgba(18,183,106,.02)] border-[1.5px] border-[rgba(18,183,106,.2)] rounded-[10px] p-3.5 mt-1" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#111318]">
          <CheckSquare size={12} className="text-[#12b76a]" />
          Ticket 1 · 2 sélections
        </div>
        <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold font-mono bg-[rgba(18,183,106,.08)] text-[#12b76a]">EV +18.3%</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[
          { iss: "Dom", team: "Almeria", odds: "1.56", bk: "Unibet", edge: "+7.5%" },
          { iss: "Ext", team: "Trabzonspor", odds: "2.05", bk: "1xBet", edge: "+10.8%" },
        ].map((leg) => (
          <div key={leg.team} className="flex items-center gap-2 text-[12px] px-2 py-1.5 rounded-[6px] bg-[#f7f8fa]">
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(59,91,219,.07)] text-[#3b5bdb] text-[10.5px] font-bold">{leg.iss}</span>
            <span className="font-semibold flex-1">{leg.team}</span>
            <span className="font-extrabold font-mono">{leg.odds}</span>
            <span className="text-[10.5px] text-[#8a919e]">{leg.bk}</span>
            <span className="font-mono font-bold text-[#12b76a] ml-auto">{leg.edge}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e3e6eb] text-[12.5px]">
        <span className="text-[#8a919e]">Mise : <strong className="text-[#111318]">20€</strong></span>
        <span className="text-[#8a919e]">Cote : <strong className="text-[#111318] font-mono">×3.20</strong></span>
        <span className="text-[#12b76a] font-extrabold font-mono">+44.00 €</span>
      </div>
    </div>
  );
}

function EmbedChartCard() {
  const bars = [
    { label: "ATP", pct: 22, color: "#3b5bdb", h: "100%" },
    { label: "Bund.", pct: 11, color: "#12b76a", h: "50%" },
    { label: "WTA", pct: 4, color: "#f79009", h: "18%" },
    { label: "Liga", pct: 2, color: "#f79009", h: "9%" },
    { label: "NBA", pct: -8, color: "#f04438", h: "36%" },
  ];
  return (
    <div className="bg-white border border-[#e3e6eb] rounded-[10px] p-3.5 mt-1" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
      <div className="text-[12px] font-semibold text-[#8a919e] mb-2">ROI par sport · 30 derniers jours</div>
      <div className="flex items-end gap-1.5 h-[60px]">
        {bars.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-[3px]">
            <span className={`text-[10px] font-bold font-mono ${b.pct >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
              {b.pct > 0 ? "+" : ""}{b.pct}%
            </span>
            <div className="w-full rounded-t-[3px]" style={{ height: b.h, background: b.color, opacity: b.pct < 0 ? 0.7 : 0.85 }} />
            <span className="text-[9.5px] text-[#8a919e] font-mono">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function AIAnalyste() {
  const [sessions] = useState(MOCK_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState(1);
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const now = useMemo(() => {
    return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }, []);

  function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg) return;

    // Add user message
    const userMsg: MockMessage = {
      id: Date.now(),
      role: "user",
      content: msg,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate AI typing
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const aiMsg: MockMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `Je traite ta demande : <strong>${msg}</strong>.<br><br>En cours d'analyse avec accès à ton historique, tes campagnes actives et le scan du moment…`,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        chips: ["Détailler l'analyse", "Voir les données sources"],
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1800);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -mx-6 -my-5 bg-white">

      {/* ══ HEADER ══ */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#e3e6eb] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111318]">IA Analyste</h1>
          <div className="flex items-center gap-[5px] px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono text-[#7c3aed]" style={{ background: "rgba(124,58,237,.07)", border: "1px solid rgba(124,58,237,.18)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-pulse" />
            En ligne · Claude
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] bg-white text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]">
            <RotateCcw size={13} />
            Nouveau contexte
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] bg-white text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]">
            <Settings2 size={13} />
            Paramètres IA
          </button>
        </div>
      </div>

      {/* ══ DEV BANNER ══ */}
      <div className="shrink-0 flex items-center gap-2.5 px-5 py-2.5 bg-amber-50 border-b border-amber-200">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          En cours de dev
        </span>
        <span className="text-[13px] text-amber-700">
          Cette fonctionnalité est en cours de développement. Les réponses affichées sont simulées et ne reflètent pas de vraies analyses.
        </span>
      </div>

      {/* ══ BODY: CHAT + CONTEXT ══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── CHAT ZONE ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Sessions bar */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#f7f8fa] border-b border-[#e3e6eb] overflow-x-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap cursor-pointer transition-all border font-[inherit] ${
                  s.id === activeSessionId
                    ? "bg-[rgba(124,58,237,.07)] text-[#7c3aed] border-[rgba(124,58,237,.18)] font-semibold"
                    : "bg-white text-[#8a919e] border-[#e3e6eb] hover:border-[#cdd1d9] hover:text-[#3c4149]"
                }`}
              >
                {s.name}
              </button>
            ))}
            <button className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-[#8a919e] hover:border-[#7c3aed] hover:text-[#7c3aed] transition-colors" style={{ border: "1px dashed #cdd1d9", background: "none" }}>
              <Plus size={13} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 items-start animate-[fadeUp_0.3s_ease_both] ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                {msg.role === "assistant" ? (
                  <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
                    <MessageCircle size={14} className="text-white" />
                  </div>
                ) : (
                  <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg,#4f8cff,#a78bfa)" }}>
                    MB
                  </div>
                )}

                {/* Content */}
                <div className={`max-w-[80%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : ""}`}>
                  <div
                    className={`px-3.5 py-[11px] text-[13.5px] leading-relaxed ${
                      msg.role === "assistant"
                        ? "bg-white border border-[#e3e6eb] text-[#111318] rounded-[4px_12px_12px_12px]"
                        : "bg-[#3b5bdb] text-white rounded-[12px_4px_12px_12px]"
                    }`}
                    style={msg.role === "assistant" ? { boxShadow: "0 1px 3px rgba(16,24,40,.06)" } : undefined}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }}
                  />

                  {/* Embeds */}
                  {msg.embeds?.map((embed, i) => (
                    <div key={i}>
                      {embed.type === "match" && <EmbedMatchCard />}
                      {embed.type === "ticket" && <EmbedTicketCard />}
                      {embed.type === "chart" && <EmbedChartCard />}
                    </div>
                  ))}

                  {/* Suggestion chips */}
                  {msg.chips && (
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {msg.chips.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleSend(chip)}
                          className="px-[11px] py-[5px] rounded-full text-[12px] font-medium border border-[#e3e6eb] bg-white text-[#3c4149] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit]"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className={`text-[10.5px] text-[#b0b7c3] ${msg.role === "user" ? "text-right" : ""}`}>{msg.time}</span>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2.5 items-start animate-[fadeUp_0.3s_ease_both]">
                <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
                  <MessageCircle size={14} className="text-white" />
                </div>
                <div className="flex items-center gap-1 px-3.5 py-3 bg-white border border-[#e3e6eb] rounded-[4px_12px_12px_12px]" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b0b7c3] animate-bounce" style={{ animationDelay: "0s", animationDuration: "0.8s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b0b7c3] animate-bounce" style={{ animationDelay: "0.15s", animationDuration: "0.8s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b0b7c3] animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "0.8s" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── INPUT BAR ── */}
          <div className="shrink-0 px-5 py-3 bg-white border-t border-[#e3e6eb]">
            {/* Quick action chips */}
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => handleSend(qa.label)}
                  className="flex items-center gap-[5px] px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit]"
                >
                  <qa.icon size={12} />
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pose une question sur un match, ton ticket, ta stratégie…"
                rows={1}
                className="flex-1 px-3.5 py-[11px] border-[1.5px] border-[#e3e6eb] rounded-xl text-[13.5px] text-[#111318] bg-[#f7f8fa] outline-none transition-all resize-none leading-normal font-[inherit] min-h-[44px] max-h-[120px] focus:border-[#7c3aed] focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,58,237,.07)]"
                style={{ placeholder: "#b0b7c3" } as React.CSSProperties}
              />
              <div className="flex items-center gap-1.5">
                <button className="w-9 h-9 rounded-[9px] border border-[#e3e6eb] bg-white flex items-center justify-center cursor-pointer text-[#8a919e] hover:border-[#cdd1d9] hover:text-[#111318] transition-colors" title="Joindre une capture">
                  <Image size={15} />
                </button>
                <button className="w-9 h-9 rounded-[9px] border border-[#e3e6eb] bg-white flex items-center justify-center cursor-pointer text-[#8a919e] hover:border-[#cdd1d9] hover:text-[#111318] transition-colors" title="Sélectionner un match">
                  <Search size={15} />
                </button>
                <button
                  onClick={() => handleSend()}
                  className="w-10 h-10 rounded-[10px] border-none bg-[#7c3aed] text-white flex items-center justify-center cursor-pointer transition-all hover:bg-[#6d28d9] hover:scale-105 shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── CONTEXT PANEL ── */}
        <div className="w-[320px] min-w-[320px] border-l border-[#e3e6eb] bg-white flex flex-col overflow-hidden">

          {/* Context header */}
          <div className="shrink-0 px-4 py-3.5 border-b border-[#e3e6eb] flex items-center justify-between">
            <div className="flex items-center gap-[7px] text-[13px] font-bold text-[#111318]">
              <Info size={14} className="text-[#7c3aed]" />
              Contexte actif
            </div>
            <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold font-mono bg-[rgba(124,58,237,.07)] text-[#7c3aed]">Mis à jour</span>
          </div>

          {/* Context body */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3">

            {/* ROI Widget */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                <TrendingUp size={11} className="text-[#3b5bdb]" />
                Mes performances · 30j
              </div>
              <div className="rounded-[10px] p-3.5" style={{ background: "linear-gradient(135deg,rgba(59,91,219,.06),rgba(124,58,237,.04))", border: "1px solid rgba(124,58,237,.18)" }}>
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-[28px] font-extrabold tracking-tight text-[#12b76a]">+18.4%</span>
                  <span className="text-[12px] text-[#8a919e] font-medium">ROI global</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { v: "34", l: "Tickets" },
                    { v: "61.8%", l: "Réussite", color: "#12b76a" },
                    { v: "3 240€", l: "Mise totale" },
                    { v: "+598€", l: "Gain net", color: "#12b76a" },
                  ].map((s) => (
                    <div key={s.l} className="flex flex-col gap-px">
                      <span className="text-[13px] font-bold font-mono" style={s.color ? { color: s.color } : undefined}>{s.v}</span>
                      <span className="text-[10.5px] text-[#8a919e]">{s.l}</span>
                    </div>
                  ))}
                </div>
                {/* Sparkline */}
                <div className="mt-2.5">
                  <svg width="100%" height="32" viewBox="0 0 280 32" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#12b76a" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#12b76a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <path d="M0,28 C40,26 60,20 100,18 C130,16 160,22 190,14 C210,8 240,10 280,6 L280,32 L0,32 Z" fill="url(#rg)" />
                    <path d="M0,28 C40,26 60,20 100,18 C130,16 160,22 190,14 C210,8 240,10 280,6" fill="none" stroke="#12b76a" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Ticket en cours */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                <CheckSquare size={11} className="text-[#3b5bdb]" />
                Ticket en cours
              </div>
              <div className="rounded-[10px] p-3 border-[1.5px] border-[rgba(18,183,106,.2)] bg-[rgba(18,183,106,.02)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-[5px] text-[12.5px] font-bold">
                    <CheckSquare size={11} className="text-[#12b76a]" />
                    Ticket 1 · 2 paris
                  </div>
                  <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold font-mono bg-[rgba(18,183,106,.08)] text-[#12b76a]">EV +18.3%</span>
                </div>
                {[
                  { iss: "Dom", team: "Almeria", odds: "1.56", edge: "+7.5%" },
                  { iss: "Ext", team: "Trabzonspor", odds: "2.05", edge: "+10.8%" },
                ].map((leg) => (
                  <div key={leg.team} className="flex items-center gap-1.5 text-[12px] px-[7px] py-1.5 rounded-[6px] bg-[#f7f8fa] mb-1">
                    <span className="px-[5px] py-0.5 rounded-[3px] bg-[rgba(59,91,219,.07)] text-[#3b5bdb] text-[10px] font-bold">{leg.iss}</span>
                    <span className="text-[11.5px] font-semibold flex-1">{leg.team}</span>
                    <span className="text-[11px] text-[#8a919e] font-mono">{leg.odds}</span>
                    <span className="font-mono font-bold text-[#12b76a]">{leg.edge}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-[#e3e6eb] text-[12px]">
                  <span className="text-[#8a919e] text-[11px]">Mise 20€ · Cote <span className="font-extrabold font-mono text-[#111318]">×3.20</span></span>
                  <span className="font-extrabold font-mono text-[#12b76a]">+44.00 €</span>
                </div>
              </div>
            </div>

            {/* Value bets du jour */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                <Search size={11} className="text-[#3b5bdb]" />
                Value bets du jour · 7
              </div>
              <div className="flex flex-col gap-[5px]">
                {[
                  { name: "Almeria Dom", meta: "Segunda · 20:30", pct: 72, edge: "+7.5%", pctColor: "#12b76a" },
                  { name: "Trabzonspor Ext", meta: "Süper Lig · 18:00", pct: 60, edge: "+10.8%", pctColor: "#f79009" },
                  { name: "Espanyol Dom", meta: "La Liga · 21:00", pct: 58, edge: "+6.7%", pctColor: "#f79009" },
                ].map((vb) => (
                  <button
                    key={vb.name}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#e3e6eb] bg-[#f7f8fa] cursor-pointer transition-all hover:border-[rgba(18,183,106,.2)] hover:bg-[rgba(18,183,106,.08)] w-full text-left font-[inherit]"
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[12px] font-semibold text-[#111318] truncate">{vb.name}</span>
                      <span className="text-[10.5px] text-[#8a919e]">{vb.meta}</span>
                    </div>
                    <span className="text-[14px] font-extrabold font-mono shrink-0" style={{ color: vb.pctColor }}>{vb.pct}%</span>
                    <span className="text-[10px] font-bold font-mono px-[5px] py-px rounded-[3px] bg-[rgba(18,183,106,.08)] text-[#12b76a] shrink-0">{vb.edge}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Questions suggérées */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
                <MessageCircle size={11} className="text-[#3b5bdb]" />
                Questions suggérées
              </div>
              <div className="flex gap-[5px] flex-wrap">
                {[
                  "Comparer Almeria vs Espanyol",
                  "Risque combi WTA ce soir",
                  "Pourquoi NBA mauvais pour moi ?",
                  "Créer campagne ATP Masters",
                  "Alertes si cote Almeria bouge",
                  "Simulation mise Kelly",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="px-[9px] py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
