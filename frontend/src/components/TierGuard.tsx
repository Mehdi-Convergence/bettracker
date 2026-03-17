import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Zap, ArrowRight, X, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { PreviewProvider } from "../contexts/PreviewContext";

const TIER_LEVELS: Record<string, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

const TIER_NAMES: Record<string, string> = {
  pro: "Pro",
  premium: "Elite",
};

interface TierGuardProps {
  minTier: "pro" | "premium";
  children: React.ReactNode;
}

export function TierGuard({ minTier, children }: TierGuardProps) {
  const { user } = useAuth();
  const [showPopup, setShowPopup] = useState(true);

  if (!user) return null;

  const userLevel = TIER_LEVELS[user.tier] ?? 0;
  const requiredLevel = TIER_LEVELS[minTier] ?? 0;

  // Trial users (free tier only) get full access during trial period
  if (user.tier === "free" && user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
    return <>{children}</>;
  }

  if (userLevel >= requiredLevel) {
    return <>{children}</>;
  }

  const planName = TIER_NAMES[minTier] ?? minTier;

  return (
    <div className="relative">
      {/* Real module rendered in preview mode behind the overlay */}
      <PreviewProvider>
        {children}
      </PreviewProvider>

      {/* Semi-transparent overlay popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" style={{ animation: "fadeUp 0.3s ease" }}>
            {/* Gradient header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white">
              <button
                onClick={() => setShowPopup(false)}
                className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Module reserve au plan {planName}</h2>
                </div>
              </div>
              <p className="text-sm text-white/80">
                Vous pouvez parcourir le module en mode demonstration. Les donnees affichees sont fictives.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <Zap className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Explorez librement les fonctionnalites. La creation et les interactions sont desactivees en mode apercu.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <Link
                  to="/settings?tab=plan"
                  className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all no-underline"
                >
                  Passer au plan {planName}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => setShowPopup(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Explorer en mode demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Check if user has access to a given tier (for sidebar visibility).
 */
export function userHasTier(userTier: string, minTier: string, trialEndsAt: string | null): boolean {
  const userLevel = TIER_LEVELS[userTier] ?? 0;
  const requiredLevel = TIER_LEVELS[minTier] ?? 0;
  // Trial users (free tier only) get full access during trial period
  if (userTier === "free" && trialEndsAt && new Date(trialEndsAt) > new Date()) return true;
  return userLevel >= requiredLevel;
}
