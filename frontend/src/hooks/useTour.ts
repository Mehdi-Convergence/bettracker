import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTourContext } from "@/contexts/TourContext";
import * as api from "@/services/api";

export function useTour(module: string) {
  const { user, refreshUser } = useAuth();
  const { setRequestTour } = useTourContext();
  const [showTour, setShowTour] = useState(false);

  // Auto-launch on first visit
  useEffect(() => {
    if (
      user?.onboarding_completed &&
      !user.visited_modules.includes(module)
    ) {
      const timer = setTimeout(() => setShowTour(true), 600);
      return () => clearTimeout(timer);
    }
  }, [user, module]);

  // Register the startTour callback so Layout's ? button can trigger it
  useEffect(() => {
    setRequestTour(() => setShowTour(true));
    return () => setRequestTour(null);
  }, [setRequestTour]);

  const completeTour = async () => {
    setShowTour(false);
    try {
      await api.markTourVisited(module);
      await refreshUser();
    } catch {
      // silent
    }
  };

  return { showTour, startTour: () => setShowTour(true), completeTour };
}
