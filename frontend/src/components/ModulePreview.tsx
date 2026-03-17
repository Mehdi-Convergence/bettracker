import { Zap, ArrowRight, Eye, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PreviewProvider } from "../contexts/PreviewContext";

interface ModulePreviewProps {
  planName: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModulePreview({ planName, onClose, children }: ModulePreviewProps) {
  return (
    <div className="relative">
      {/* Floating upgrade bar */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 flex items-center justify-between rounded-xl mb-4 shadow-lg">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5" />
          <span className="text-sm font-semibold">
            Apercu du module — Passez au plan {planName} pour debloquer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings?tab=plan"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors no-underline"
          >
            Passer au {planName}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mock data disclaimer */}
      <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
        <Eye className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs font-medium">
          Donnees de demonstration — Ces donnees sont fictives et servent uniquement a illustrer les fonctionnalites du module.
        </span>
      </div>

      {/* Real module content in preview mode */}
      <PreviewProvider>
        {children}
      </PreviewProvider>
    </div>
  );
}
