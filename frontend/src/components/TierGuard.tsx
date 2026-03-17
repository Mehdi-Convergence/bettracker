import { useAuth } from "../contexts/AuthContext";
import { Lock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

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
  if (!user) return null;

  const userLevel = TIER_LEVELS[user.tier] ?? 0;
  const requiredLevel = TIER_LEVELS[minTier] ?? 0;

  // Trial users get full access
  if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
    return <>{children}</>;
  }

  if (userLevel >= requiredLevel) {
    return <>{children}</>;
  }

  const planName = TIER_NAMES[minTier] ?? minTier;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
          <Lock className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Fonctionnalite reservee au plan {planName}
        </h2>
        <p className="text-sm text-slate-500">
          Cette page necessite un abonnement {planName} ou superieur.
          Mettez a niveau votre plan pour y acceder.
        </p>
        <Link
          to="/parametres"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors no-underline"
        >
          Voir les plans
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Check if user has access to a given tier (for sidebar visibility).
 */
export function userHasTier(userTier: string, minTier: string, trialEndsAt: string | null): boolean {
  const userLevel = TIER_LEVELS[userTier] ?? 0;
  const requiredLevel = TIER_LEVELS[minTier] ?? 0;
  // Trial users get full access
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return true;
  return userLevel >= requiredLevel;
}
