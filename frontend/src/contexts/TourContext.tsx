import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TourContextValue {
  requestTour: (() => void) | null;
  setRequestTour: (fn: (() => void) | null) => void;
}

const TourContext = createContext<TourContextValue>({
  requestTour: null,
  setRequestTour: () => {},
});

export function TourProvider({ children }: { children: ReactNode }) {
  const [requestTour, setRequestTourState] = useState<(() => void) | null>(null);

  const setRequestTour = useCallback((fn: (() => void) | null) => {
    setRequestTourState(() => fn);
  }, []);

  return (
    <TourContext.Provider value={{ requestTour, setRequestTour }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTourContext() {
  return useContext(TourContext);
}
