import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const DEMO_MODE_KEY = "isDemoMode";

interface DemoModeContextType {
  isDemoMode: boolean;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType>({
  isDemoMode: false,
  enableDemoMode: () => {},
  disableDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem(DEMO_MODE_KEY) === "true";
  });

  const enableDemoMode = useCallback(() => {
    localStorage.setItem(DEMO_MODE_KEY, "true");
    setIsDemoMode(true);
  }, []);

  const disableDemoMode = useCallback(() => {
    localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemoMode(false);
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, enableDemoMode, disableDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
