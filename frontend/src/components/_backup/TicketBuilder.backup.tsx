import { useState, useMemo } from "react";
import { Layers, Plus, X, Target, Building2, AlertTriangle, Send, Loader2, Check } from "lucide-react";
import { LEAGUE_INFO } from "../types";
import type { Ticket, ValueBet } from "../types";
import { createBet } from "../services/api";

interface TicketBuilderProps {
  tickets: Ticket[];
  activeTicketIdx: number;
  onSetActiveTicket: (idx: number) => void;
  onAddTicket: () => void;
  onRemoveTicket: (idx: number) => void;
  onRemoveLeg: (ticketIdx: number, legId: string) => void;
  onUpdateStake: (ticketIdx: number, stake: number) => void;
  onDropBet: (b: ValueBet) => void;
  onUpdateBookmaker: (ticketIdx: number, bookmaker: string | null) => void;
  onUpdateLegOutcome: (ticketIdx: number, legId: string, newOutcome: string) => void;
}

function outcomeSelectColor(o: string) {
  return o === "H"
    ? "bg-blue-100 text-blue-700 border-blue-300"
    : o === "D"
    ? "bg-amber-100 text-amber-700 border-amber-300"
    : "bg-red-100 text-red-700 border-red-300";
}

export default function TicketBuilder({
  tickets,
  activeTicketIdx,
  onSetActiveTicket,
  onAddTicket,
  onRemoveTicket,
  onRemoveLeg,
  onUpdateStake,
  onDropBet,
  onUpdateBookmaker,
  onUpdateLegOutcome,
}: TicketBuilderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [placing, setPlacing] = useState<"idle" | "loading" | "done">("idle");

  const activeTicket = tickets[activeTicketIdx];

  // Collect all bookmakers available across legs of active ticket
  const availableBookmakers = useMemo(() => {
    if (!activeTicket) return [];
    const set = new Set<string>();
    for (const leg of activeTicket.legs) {
      for (const bk of Object.keys(leg.all_odds)) set.add(bk);
    }
    return [...set].sort();
  }, [activeTicket]);

  // Check if any leg is missing odds for the locked bookmaker
  const missingLegs = activeTicket?.bookmaker
    ? activeTicket.legs.filter((l) => !l.all_odds[activeTicket.bookmaker!] || l.odds === 0)
    : [];

  // Stats for active ticket
  const combinedOdds = activeTicket
    ? activeTicket.legs.reduce((acc, l) => acc * l.odds, 1)
    : 1;
  const combinedProb = activeTicket
    ? activeTicket.legs.reduce((acc, l) => acc * l.model_prob, 1)
    : 0;
  const ev = combinedProb * combinedOdds - 1;
  const potentialGain = activeTicket ? activeTicket.stake * (combinedOdds - 1) : 0;

  // Totals across all tickets
  const totalStake = tickets.reduce((s, t) => s + t.stake, 0);
  const totalPotentialGain = tickets.reduce((s, t) => {
    const odds = t.legs.reduce((a, l) => a * l.odds, 1);
    return s + t.stake * (odds - 1);
  }, 0);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      onDropBet(data as ValueBet);
    } catch {
      // invalid drop data
    }
  }

  async function handlePlaceBet() {
    if (!activeTicket || activeTicket.legs.length === 0) return;
    setPlacing("loading");
    try {
      if (activeTicket.legs.length === 1) {
        // Single bet
        const l = activeTicket.legs[0];
        await createBet({
          home_team: l.home_team,
          away_team: l.away_team,
          league: l.league,
          match_date: l.date,
          outcome_bet: l.outcome,
          odds_at_bet: l.odds,
          stake: activeTicket.stake,
          is_combo: false,
          combo_legs: null,
        });
      } else {
        // Combo bet — first leg as main, all legs in combo_legs
        const first = activeTicket.legs[0];
        await createBet({
          home_team: first.home_team,
          away_team: first.away_team,
          league: first.league,
          match_date: first.date,
          outcome_bet: first.outcome,
          odds_at_bet: combinedOdds,
          stake: activeTicket.stake,
          is_combo: true,
          combo_legs: activeTicket.legs.map((l) => ({
            home_team: l.home_team,
            away_team: l.away_team,
            league: l.league,
            match_date: l.date,
            outcome_bet: l.outcome,
            odds: l.odds,
          })),
        });
      }
      setPlacing("done");
      setTimeout(() => setPlacing("idle"), 2000);
    } catch {
      setPlacing("idle");
      alert("Erreur : impossible d'enregistrer le pari.");
    }
  }

  const hasLegs = activeTicket && activeTicket.legs.length > 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-[26%] min-w-[320px] shrink-0 rounded-xl border-2 flex flex-col max-h-[calc(100vh-12rem)] sticky top-0 transition-all ${
        dragOver
          ? "border-blue-400 bg-blue-50 shadow-lg shadow-blue-200/30"
          : "border-gray-200 bg-white shadow-lg"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Layers size={14} className="text-blue-600" />
          </div>
          <span className="text-gray-900 text-sm font-semibold">Mes Tickets</span>
        </div>
        {tickets.length > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {tickets.reduce((s, t) => s + t.legs.length, 0)} paris
          </span>
        )}
      </div>

      {/* Ticket tabs */}
      {tickets.length > 0 && (
        <div className="flex items-center border-b border-gray-200 px-2 overflow-x-auto">
          {tickets.map((ticket, idx) => (
            <button
              key={ticket.id}
              onClick={() => onSetActiveTicket(idx)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                idx === activeTicketIdx
                  ? "text-blue-600 border-blue-500"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {ticket.name}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                idx === activeTicketIdx ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
              }`}>
                {ticket.legs.length}
              </span>
              {tickets.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTicket(idx);
                  }}
                  className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={onAddTicket}
            className="px-2 py-2 text-gray-400 hover:text-blue-500 transition-colors"
            title="Nouveau ticket"
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      {/* Active ticket content */}
      <div className="flex-1 overflow-y-auto">
        {!hasLegs ? (
          <div className={`flex flex-col items-center justify-center py-10 px-4 text-center transition-colors ${
            dragOver ? "text-blue-500" : "text-gray-400"
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
              dragOver ? "bg-blue-100" : "bg-gray-100"
            }`}>
              <Target size={20} className={dragOver ? "text-blue-500" : "text-gray-400"} />
            </div>
            <p className="text-xs font-medium">
              {dragOver ? "Deposer ici !" : "Glissez un match ici"}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              ou cliquez sur un outcome
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {activeTicket.legs.map((leg) => {
              const info = LEAGUE_INFO[leg.league];
              const impliedProb = leg.odds > 0 ? 1 / leg.odds : 0;
              const edge = leg.model_prob - impliedProb;
              const fmtDate = leg.date.includes("T")
                ? new Date(leg.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : leg.date;

              return (
                <div
                  key={leg.id}
                  className="bg-gray-50 rounded-lg p-2.5 text-xs border border-gray-200 hover:border-gray-300 transition-colors group"
                >
                  {/* Row 1: Team [Outcome] Team + remove */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-gray-900 font-medium text-[11px] truncate">{leg.home_team}</span>
                      <select
                        value={leg.outcome}
                        onChange={(e) => onUpdateLegOutcome(activeTicketIdx, leg.id, e.target.value)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${outcomeSelectColor(leg.outcome)}`}
                      >
                        <option value="H">Dom</option>
                        <option value="D">Nul</option>
                        <option value="A">Ext</option>
                      </select>
                      <span className="text-gray-900 font-medium text-[11px] truncate">{leg.away_team}</span>
                    </div>
                    <button
                      onClick={() => onRemoveLeg(activeTicketIdx, leg.id)}
                      className="text-gray-300 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Row 2: league + date */}
                  <div className="text-gray-400 text-[10px] mt-0.5">
                    {info ? `${info.flag} ${info.name}` : leg.league} · {fmtDate}
                  </div>

                  {/* Row 3: odds + bookmaker + prob + edge */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {leg.odds > 0 ? (
                      <span className="text-amber-600 font-bold text-[11px]">{leg.odds.toFixed(2)}</span>
                    ) : (
                      <span className="text-red-400 font-bold text-[10px]">N/A</span>
                    )}
                    <span className="text-gray-400 text-[9px]">{leg.bookmaker}</span>
                    <span
                      className="text-gray-500 text-[10px] cursor-help"
                      title="Probabilite estimee par le modele pour cet outcome"
                    >
                      {(leg.model_prob * 100).toFixed(0)}%
                    </span>
                    {leg.odds > 0 && (
                      <span
                        className={`text-[10px] font-semibold cursor-help ${edge > 0 ? "text-emerald-600" : "text-red-400"}`}
                        title={edge > 0
                          ? `Edge +${(edge * 100).toFixed(1)}% : le modele estime ${(leg.model_prob * 100).toFixed(0)}% de chances vs ${(impliedProb * 100).toFixed(0)}% implique par la cote. Pari potentiellement rentable.`
                          : `Edge ${(edge * 100).toFixed(1)}% : pas de valeur detectee sur cet outcome.`
                        }
                      >
                        {edge > 0 ? "+" : ""}{(edge * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats card */}
      {hasLegs && (
        <div className="border-t border-gray-200 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
              <div className="text-[9px] text-gray-400 uppercase tracking-wider">Cote</div>
              <div className="text-amber-600 font-bold text-sm mt-0.5">
                {combinedOdds.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
              <div className="text-[9px] text-gray-400 uppercase tracking-wider">Proba</div>
              <div className="text-emerald-600 font-bold text-sm mt-0.5">
                {(combinedProb * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
              <div className="text-[9px] text-gray-400 uppercase tracking-wider">EV</div>
              <div className={`font-bold text-sm mt-0.5 ${
                ev > 0 ? "text-emerald-600" : "text-red-500"
              }`}>
                {ev > 0 ? "+" : ""}{(ev * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Bookmaker selector */}
          {availableBookmakers.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Building2 size={10} className="text-gray-400" />
                <label className="text-[10px] text-gray-400 shrink-0">Bookmaker</label>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => onUpdateBookmaker(activeTicketIdx, null)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    activeTicket!.bookmaker === null
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-700"
                  }`}
                >
                  Meilleure cote
                </button>
                {availableBookmakers.map((bk) => (
                  <button
                    key={bk}
                    onClick={() => onUpdateBookmaker(activeTicketIdx, bk)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      activeTicket!.bookmaker === bk
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-700"
                    }`}
                  >
                    {bk}
                  </button>
                ))}
              </div>
              {missingLegs.length > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-amber-600 mt-0.5">
                  <AlertTriangle size={9} />
                  {missingLegs.length} paris indisponible{missingLegs.length > 1 ? "s" : ""} chez {activeTicket!.bookmaker}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-400 shrink-0">Mise</label>
            <div className="relative flex-1">
              <input
                type="number"
                value={activeTicket!.stake}
                onChange={(e) =>
                  onUpdateStake(activeTicketIdx, Number(e.target.value))
                }
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 w-full pr-6 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">EUR</span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex justify-between items-center">
            <span className="text-[11px] text-emerald-700/70">Gain potentiel</span>
            <span className="text-emerald-700 font-bold text-base">
              +{potentialGain.toFixed(2)} EUR
            </span>
          </div>

          {/* Place bet button */}
          <button
            onClick={handlePlaceBet}
            disabled={placing !== "idle"}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm ${
              placing === "done"
                ? "bg-emerald-500 text-white"
                : placing === "loading"
                ? "bg-blue-400 text-white cursor-wait"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {placing === "loading" ? (
              <><Loader2 size={14} className="animate-spin" /> Envoi...</>
            ) : placing === "done" ? (
              <><Check size={14} /> Enregistre !</>
            ) : (
              <><Send size={14} /> Parier</>
            )}
          </button>
        </div>
      )}

      {/* Total across all tickets */}
      {tickets.length > 1 && (
        <div className="border-t border-gray-200 px-3 py-2.5 bg-gray-50 rounded-b-xl">
          <div className="text-[10px] text-gray-400 font-medium mb-1.5">
            Total · {tickets.length} tickets
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Mise totale</span>
            <span className="text-gray-900 font-semibold">
              {totalStake.toFixed(2)} EUR
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-500">Gain total</span>
            <span className="text-emerald-600 font-bold">
              +{totalPotentialGain.toFixed(2)} EUR
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
