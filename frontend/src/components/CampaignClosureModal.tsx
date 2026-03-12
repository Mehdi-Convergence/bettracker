import { createPortal } from "react-dom";
import { Archive, X, Loader2, AlertTriangle } from "lucide-react";
import type { CampaignStats } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isClosing: boolean;
  campaignName: string;
  stats: CampaignStats;
}

interface StatRowProps {
  label: string;
  value: string;
  colorClass?: string;
}

function StatRow({ label, value, colorClass }: StatRowProps) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`text-[15px] font-bold font-[var(--font-mono)] ${colorClass ?? "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

export default function CampaignClosureModal({
  open,
  onClose,
  onConfirm,
  isClosing,
  campaignName,
  stats,
}: Props) {
  if (!open) return null;

  const roiPositive = stats.roi_pct >= 0;
  const pnlPositive = stats.total_pnl >= 0;
  const clvPositive = stats.avg_clv != null && stats.avg_clv > 0;

  const roiValue = `${roiPositive ? "+" : ""}${stats.roi_pct.toFixed(1)}%`;
  const pnlValue = `${pnlPositive ? "+" : ""}${stats.total_pnl.toFixed(2)} €`;
  const winRateValue = `${(stats.win_rate * 100).toFixed(1)}%`;
  const totalBetsValue = String(stats.total_bets);
  const bankrollValue = `${stats.current_bankroll.toFixed(2)} €`;
  const stakedValue = `${stats.total_staked.toFixed(2)} €`;
  const clvValue = stats.avg_clv != null
    ? `${clvPositive ? "+" : ""}${stats.avg_clv.toFixed(2)}%`
    : "N/A";
  const drawdownValue = `-${stats.max_drawdown_pct.toFixed(1)}%`;

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <Archive size={16} className="text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-slate-900">Cloturer la campagne</h2>
              <p className="text-[12px] text-slate-500 truncate">{campaignName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* Stats grid */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Resume de la campagne
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatRow
                label="ROI"
                value={roiValue}
                colorClass={roiPositive ? "text-emerald-600" : "text-red-500"}
              />
              <StatRow
                label="Gain net"
                value={pnlValue}
                colorClass={pnlPositive ? "text-emerald-600" : "text-red-500"}
              />
              <StatRow
                label="Taux reussite"
                value={winRateValue}
                colorClass="text-slate-800"
              />
              <StatRow
                label="Paris joues"
                value={totalBetsValue}
                colorClass="text-slate-800"
              />
              <StatRow
                label="Bankroll finale"
                value={bankrollValue}
                colorClass="text-slate-800"
              />
              <StatRow
                label="Mise totale"
                value={stakedValue}
                colorClass="text-slate-800"
              />
              <StatRow
                label="CLV moyen"
                value={clvValue}
                colorClass={
                  stats.avg_clv == null
                    ? "text-slate-400"
                    : clvPositive
                    ? "text-emerald-600"
                    : "text-slate-800"
                }
              />
              <StatRow
                label="Max drawdown"
                value={drawdownValue}
                colorClass="text-red-500"
              />
            </div>
          </div>

          {/* Warning */}
          <div className="mx-5 mb-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-800 leading-snug">
              Cette action est irreversible. La campagne passera en statut Archivee.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 px-5 pb-5">
            <button
              onClick={onClose}
              disabled={isClosing}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              disabled={isClosing}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isClosing && <Loader2 size={13} className="animate-spin" />}
              {isClosing ? "Cloture en cours..." : "Confirmer la cloture"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
