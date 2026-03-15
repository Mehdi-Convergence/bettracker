import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Navigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useAuth } from "@/contexts/AuthContext";
import {
  aiChatStream,
  getAIConversations,
  getAIConversationMessages,
  deleteAIConversation,
  getAIRateLimit,
} from "@/services/api";
import type { AIConversation, AIMessageData, AIRateLimit } from "@/types";
import {
  MessageCircle,
  Send,
  RotateCcw,
  TrendingUp,
  Zap,
  BarChart3,
  CreditCard,
  Info,
  CheckSquare,
  Clock,
  Trash2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Gauge,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   MARKDOWN RENDERING
   ═══════════════════════════════════════════════════════ */

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text: string): string {
  const raw = marked.parse(text);
  const html = typeof raw === "string" ? raw : "";
  return DOMPurify.sanitize(html);
}

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  streaming?: boolean;
}

const QUICK_ACTIONS = [
  { label: "Analyser mon ticket", icon: CheckSquare },
  { label: "Value bets du jour", icon: TrendingUp },
  { label: "Ticket auto", icon: Zap },
  { label: "Review strategie", icon: BarChart3 },
  { label: "Simulation bankroll", icon: CreditCard },
];

/* ═══════════════════════════════════════════════════════
   CONTEXT PANEL — real data widgets
   ═══════════════════════════════════════════════════════ */

function ContextPanel({
  rateLimit,
  conversations,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  onSendMessage,
}: {
  rateLimit: AIRateLimit | null;
  conversations: AIConversation[];
  onSelectConversation: (id: number) => void;
  onDeleteConversation: (id: number) => void;
  onNewConversation: () => void;
  onSendMessage: (text: string) => void;
}) {
  return (
    <div className="w-[320px] min-w-[320px] border-l border-[#e3e6eb] bg-white flex flex-col overflow-hidden max-lg:hidden">
      {/* Context header */}
      <div className="shrink-0 px-4 py-3.5 border-b border-[#e3e6eb] flex items-center justify-between">
        <div className="flex items-center gap-[7px] text-[13px] font-bold text-[#111318]">
          <Info size={14} className="text-[#7c3aed]" />
          Contexte
        </div>
        {rateLimit && (
          <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold font-mono bg-[rgba(124,58,237,.07)] text-[#7c3aed]">
            {rateLimit.remaining}/{rateLimit.limit} msg
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-4">

        {/* Rate limit gauge */}
        {rateLimit && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
              <Gauge size={11} className="text-[#3b5bdb]" />
              Quota quotidien
            </div>
            <div className="rounded-[10px] p-3 border border-[#e3e6eb]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#8a919e]">Messages utilises</span>
                <span className="text-[13px] font-bold font-mono text-[#111318]">
                  {rateLimit.used}/{rateLimit.limit}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#f0f1f3] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((rateLimit.used / rateLimit.limit) * 100, 100)}%`,
                    backgroundColor: rateLimit.remaining <= 2 ? "#f04438" : rateLimit.remaining <= 5 ? "#f79009" : "#12b76a",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Conversations history */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
              <Clock size={11} className="text-[#3b5bdb]" />
              Conversations
            </div>
            <button
              onClick={onNewConversation}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-[#7c3aed] bg-[rgba(124,58,237,.07)] hover:bg-[rgba(124,58,237,.12)] transition-colors cursor-pointer border-none font-[inherit]"
            >
              <RotateCcw size={10} />
              Nouveau
            </button>
          </div>
          {conversations.length === 0 ? (
            <div className="text-[12px] text-[#b0b7c3] text-center py-3">Aucune conversation</div>
          ) : (
            <div className="flex flex-col gap-[5px] max-h-[200px] overflow-y-auto">
              {conversations.slice(0, 15).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#e3e6eb] bg-[#f7f8fa] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:bg-[rgba(124,58,237,.04)] group"
                  onClick={() => onSelectConversation(c.id)}
                >
                  <MessageCircle size={12} className="text-[#b0b7c3] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#111318] truncate">{c.title || "Sans titre"}</div>
                    <div className="text-[10px] text-[#b0b7c3]">
                      {c.message_count} msg
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteConversation(c.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#b0b7c3] hover:text-[#f04438] transition-all cursor-pointer border-none bg-transparent"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggested questions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-[5px] text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">
            <MessageCircle size={11} className="text-[#3b5bdb]" />
            Questions suggerees
          </div>
          <div className="flex gap-[5px] flex-wrap">
            {[
              "Quel est mon ROI ce mois-ci ?",
              "Value bets football ce soir",
              "Analyse mes derniers paris",
              "Resume mes campagnes actives",
              "Quel sport est le plus rentable ?",
              "Simulation bankroll Kelly",
            ].map((q) => (
              <button
                key={q}
                onClick={() => onSendMessage(q)}
                className="px-[9px] py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   WELCOME SCREEN (empty conversation)
   ═══════════════════════════════════════════════════════ */

function WelcomeScreen({ onSend }: { onSend: (text: string) => void }) {
  const suggestions = [
    { icon: TrendingUp, label: "Value bets du jour", desc: "Quels matchs ont le meilleur edge ?" },
    { icon: BarChart3, label: "Mon ROI ce mois", desc: "Analyse mes performances recentes" },
    { icon: CheckSquare, label: "Analyser mon ticket", desc: "Verifie la qualite de mes selections" },
    { icon: CreditCard, label: "Gestion bankroll", desc: "Simulation Kelly et sizing optimal" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
        <MessageCircle size={24} className="text-white" />
      </div>
      <h2 className="text-[20px] font-extrabold text-[#111318] mb-1">IA Analyste</h2>
      <p className="text-[13px] text-[#8a919e] mb-6 text-center max-w-[380px]">
        Pose-moi n'importe quelle question sur tes paris, tes stats, les matchs du jour ou ta strategie.
      </p>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2.5 w-full max-w-[500px]">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSend(s.label)}
            className="flex items-start gap-2.5 p-3.5 rounded-xl border border-[#e3e6eb] bg-white text-left cursor-pointer transition-all hover:border-[rgba(124,58,237,.2)] hover:bg-[rgba(124,58,237,.03)] hover:shadow-[0_2px_8px_rgba(16,24,40,.06)] font-[inherit]"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[rgba(124,58,237,.07)]">
              <s.icon size={16} className="text-[#7c3aed]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#111318]">{s.label}</div>
              <div className="text-[11.5px] text-[#8a919e] mt-0.5">{s.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function AIAnalyste() {
  const { user } = useAuth();

  const userInitials = useMemo(() => {
    if (!user?.display_name) return "U";
    return user.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  }, [user?.display_name]);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [rateLimit, setRateLimit] = useState<AIRateLimit | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Load conversations + rate limit on mount
  useEffect(() => {
    loadConversations();
    loadRateLimit();
  }, []);

  async function loadConversations() {
    try {
      const data = await getAIConversations();
      setConversations(data);
    } catch {
      // silent
    }
  }

  async function loadRateLimit() {
    try {
      const data = await getAIRateLimit();
      setRateLimit(data);
    } catch {
      // silent
    }
  }

  async function loadConversation(id: number) {
    try {
      const msgs = await getAIConversationMessages(id);
      setConversationId(id);
      setMessages(
        msgs.map((m: AIMessageData) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          time: (() => {
            try { return new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
          })(),
        }))
      );
      setError(null);
      setShowMobileSidebar(false);
    } catch {
      setError("Impossible de charger cette conversation");
    }
  }

  async function handleDeleteConversation(id: number) {
    try {
      await deleteAIConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewConversation();
      }
    } catch {
      // silent
    }
  }

  function handleNewConversation() {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setShowMobileSidebar(false);
  }

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isStreaming) return;

    setInput("");
    setError(null);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: msg,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };

    // Add placeholder assistant message for streaming
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      let currentConvId = conversationId;

      for await (const event of aiChatStream(msg, currentConvId)) {
        if (event.type === "token" && event.text) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m
            )
          );
          if (event.conversationId && !currentConvId) {
            currentConvId = event.conversationId;
            setConversationId(event.conversationId);
          }
        } else if (event.type === "done") {
          if (event.conversationId && !currentConvId) {
            currentConvId = event.conversationId;
            setConversationId(event.conversationId);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
        } else if (event.type === "error") {
          setError(event.message || "Erreur lors de la generation");
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Erreur de connexion";
      setError(errorMsg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        )
      );
      loadRateLimit();
      loadConversations();
    }
  }, [input, isStreaming, conversationId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Admin only for now
  if (user && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -mx-6 -my-5 bg-white overflow-x-hidden">

      {/* ══ HEADER ══ */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#e3e6eb] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111318]">IA Analyste</h1>
          {rateLimit && (
            <span className="text-[11px] text-[#b0b7c3] font-mono max-sm:hidden">
              {rateLimit.remaining} msg restants
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] bg-white text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]"
          >
            <RotateCcw size={13} />
            <span className="max-sm:hidden">Nouvelle conversation</span>
          </button>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] bg-white text-[#8a919e] text-[12px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-colors font-[inherit]"
          >
            <Clock size={13} />
          </button>
        </div>
      </div>

      {/* ══ BODY: CHAT + CONTEXT ══ */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── CHAT ZONE ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Error banner */}
          {error && (
            <div className="mx-5 mt-3 px-3.5 py-2.5 rounded-lg bg-[rgba(240,68,56,.06)] border border-[rgba(240,68,56,.15)] flex items-center gap-2 text-[13px] text-[#f04438]">
              <AlertCircle size={14} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-[#f04438] hover:text-[#d92d2d] cursor-pointer border-none bg-transparent font-[inherit] text-[12px] font-semibold">
                Fermer
              </button>
            </div>
          )}

          {/* Messages or Welcome */}
          {messages.length === 0 ? (
            <WelcomeScreen onSend={handleSend} />
          ) : (
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
                      {userInitials}
                    </div>
                  )}

                  {/* Content */}
                  <div className={`max-w-[80%] max-sm:max-w-[92%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : ""}`}>
                    <div
                      className={`px-3.5 py-[11px] text-[13.5px] leading-relaxed ${
                        msg.role === "assistant"
                          ? "bg-white border border-[#e3e6eb] text-[#111318] rounded-[4px_12px_12px_12px] ai-message-content"
                          : "bg-[#3b5bdb] text-white rounded-[12px_4px_12px_12px]"
                      }`}
                      style={msg.role === "assistant" ? { boxShadow: "0 1px 3px rgba(16,24,40,.06)" } : undefined}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || "") }} />
                          {msg.streaming && (
                            <span className="inline-block w-2 h-4 bg-[#7c3aed] rounded-sm ml-0.5 animate-pulse" />
                          )}
                        </>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    <span className={`text-[10.5px] text-[#b0b7c3] ${msg.role === "user" ? "text-right" : ""}`}>{msg.time}</span>
                  </div>
                </div>
              ))}

              {/* Streaming indicator when no content yet */}
              {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
                <div className="flex gap-2.5 items-start">
                  <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f8cff)" }}>
                    <MessageCircle size={14} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 px-3.5 py-3 bg-white border border-[#e3e6eb] rounded-[4px_12px_12px_12px]" style={{ boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
                    <Loader2 size={14} className="text-[#7c3aed] animate-spin" />
                    <span className="text-[12px] text-[#8a919e]">Analyse en cours...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── INPUT BAR ── */}
          <div className="shrink-0 px-5 py-3 bg-white border-t border-[#e3e6eb]">
            {/* Quick action chips */}
            {messages.length === 0 ? null : (
              <div className="flex gap-1.5 flex-wrap mb-2.5 max-sm:hidden">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => handleSend(qa.label)}
                    disabled={isStreaming}
                    className="flex items-center gap-[5px] px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#e3e6eb] bg-[#f7f8fa] text-[#8a919e] cursor-pointer transition-all hover:border-[rgba(124,58,237,.18)] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,.07)] whitespace-nowrap font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <qa.icon size={12} />
                    {qa.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "En cours de generation..." : "Pose une question sur un match, ton ticket, ta strategie..."}
                rows={1}
                disabled={isStreaming}
                className="flex-1 px-3.5 py-[11px] border-[1.5px] border-[#e3e6eb] rounded-xl text-[13.5px] text-[#111318] bg-[#f7f8fa] outline-none transition-all resize-none leading-normal font-[inherit] min-h-[44px] max-h-[120px] focus:border-[#7c3aed] focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,58,237,.07)] disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={isStreaming || !input.trim()}
                className="w-10 h-10 rounded-[10px] border-none bg-[#7c3aed] text-white flex items-center justify-center cursor-pointer transition-all hover:bg-[#6d28d9] hover:scale-105 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONTEXT PANEL (desktop) ── */}
        <ContextPanel
          rateLimit={rateLimit}
          conversations={conversations}
          onSelectConversation={loadConversation}
          onDeleteConversation={handleDeleteConversation}
          onNewConversation={handleNewConversation}
          onSendMessage={handleSend}
        />

        {/* ── MOBILE SIDEBAR OVERLAY ── */}
        {showMobileSidebar && (
          <div className="absolute inset-0 z-50 lg:hidden flex">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowMobileSidebar(false)} />
            <div className="relative ml-auto w-[300px] bg-white h-full flex flex-col animate-slide-in overflow-hidden">
              <div className="shrink-0 px-4 py-3 border-b border-[#e3e6eb] flex items-center gap-2">
                <button onClick={() => setShowMobileSidebar(false)} className="p-1 rounded cursor-pointer border-none bg-transparent text-[#8a919e] hover:text-[#111318]">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-[14px] font-bold text-[#111318]">Historique</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {rateLimit && (
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-[#f7f8fa] text-[12px]">
                    <span className="text-[#8a919e]">Quota</span>
                    <span className="font-bold font-mono text-[#111318]">{rateLimit.remaining}/{rateLimit.limit}</span>
                  </div>
                )}
                <button
                  onClick={handleNewConversation}
                  className="w-full py-2 rounded-lg border border-dashed border-[#e3e6eb] text-[12px] font-semibold text-[#7c3aed] cursor-pointer hover:bg-[rgba(124,58,237,.04)] transition-colors bg-transparent font-[inherit]"
                >
                  + Nouvelle conversation
                </button>
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-all ${
                      conversationId === c.id ? "border-[#7c3aed] bg-[rgba(124,58,237,.04)]" : "border-[#e3e6eb] hover:border-[rgba(124,58,237,.18)]"
                    }`}
                    onClick={() => loadConversation(c.id)}
                  >
                    <MessageCircle size={12} className="text-[#b0b7c3] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#111318] truncate">{c.title || "Sans titre"}</div>
                      <div className="text-[10px] text-[#b0b7c3]">{c.message_count} msg</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteConversation(c.id); }}
                      className="p-1 rounded text-[#b0b7c3] hover:text-[#f04438] cursor-pointer border-none bg-transparent"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
