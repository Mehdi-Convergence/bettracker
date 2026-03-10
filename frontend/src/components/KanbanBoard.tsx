import { type ReactNode } from "react";

// ── Design tokens ──
const SHADOW_SM = "0 1px 3px rgba(16,24,40,.06)";

// ══════════════════════════════════════════════
// PUBLIC TYPES
// ══════════════════════════════════════════════

export interface KanbanColumn {
  id: string;
  title: string;
  icon: ReactNode;
  color: string;          // hex color for header accent
  emptyText: string;
  headerSlot?: ReactNode; // optional slot (e.g. "Ajouter ticket manuel")
}

export interface KanbanCardData {
  id: string;
  columnId: string;
  [key: string]: unknown;
}

export interface KanbanBoardProps<T extends KanbanCardData> {
  columns: KanbanColumn[];
  cards: T[];
  renderCard: (card: T) => ReactNode;
  className?: string;
}

// ══════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════

export default function KanbanBoard<T extends KanbanCardData>({
  columns,
  cards,
  renderCard,
  className = "",
}: KanbanBoardProps<T>) {
  return (
    <div className={`flex gap-4 overflow-x-auto pb-2 ${className}`}>
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.columnId === col.id);

        return (
          <div key={col.id}
            className="flex-1 min-w-[300px] bg-[#f4f5f7] rounded-xl border border-[#e3e6eb] flex flex-col"
            style={{ boxShadow: SHADOW_SM }}>

            {/* Column header */}
            <div className="px-4 py-3 border-b border-[#e3e6eb] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{ color: col.color }}>{col.icon}</span>
                <span className="text-sm font-semibold text-[#111318]">{col.title}</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#8a919e] border border-[#e3e6eb]">
                  {colCards.length}
                </span>
              </div>
              {col.headerSlot}
            </div>

            {/* Cards */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[65vh] scanner-scroll">
              {colCards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-[#8a919e]">{col.emptyText}</p>
                </div>
              ) : (
                colCards.map((card) => (
                  <div key={card.id}>{renderCard(card)}</div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
