/**
 * @file WizardGuardContext.tsx
 * @description Shares "is the in-progress wizard entry dirty" between
 * WizardPage.tsx (which computes it via utils/wizardDirty.ts) and
 * Sidebar.tsx (which needs it to decide whether to intercept a nav click
 * with a discard-confirmation dialog). The two aren't in a parent/child
 * relationship — both sit as siblings under App.tsx's protected shell —
 * so a small context is the natural fit, matching how ConfigContext/
 * AuthContext already share cross-tree state in this app.
 *
 * No route-blocking or persistence lives here. Navigating away while dirty
 * and confirming the discard is enough to lose the in-memory state —
 * WizardPage.tsx unmounts like any other route change, per this app's
 * existing convention of never autosaving/persisting a draft.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface WizardGuardContextType {
  isWizardDirty: boolean;
  setWizardDirty: (dirty: boolean) => void;
}

const WizardGuardContext = createContext<WizardGuardContextType>({
  isWizardDirty: false,
  setWizardDirty: () => {},
});

export function WizardGuardProvider({ children }: { children: ReactNode }) {
  const [isWizardDirty, setIsWizardDirty] = useState(false);
  const setWizardDirty = useCallback((dirty: boolean) => setIsWizardDirty(dirty), []);

  return (
    <WizardGuardContext.Provider value={{ isWizardDirty, setWizardDirty }}>
      {children}
    </WizardGuardContext.Provider>
  );
}

export function useWizardGuard(): WizardGuardContextType {
  return useContext(WizardGuardContext);
}
