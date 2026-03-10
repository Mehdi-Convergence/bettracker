import { createContext, useContext, useState, type ReactNode } from "react";

interface BreadcrumbCtx {
  label: string | null;
  setLabel: (s: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbCtx>({ label: null, setLabel: () => {} });

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ label, setLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
