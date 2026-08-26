import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfig, API_BASE_URL } from '../context/ConfigContext';
import { useToast } from '../components/ui/ToastProvider';
import { Button } from '../components/ui/Button';
import { ShieldCheck, Delete, Search, ArrowLeft } from 'lucide-react';

/** GET /api/auth/pin-directory's row shape — see pinUsers.routes.ts. */
interface PinDirectoryEntry {
  id: string;
  name: string;
  employeeId: string;
}

export function LoginPage() {
  const { loginWithM365, loginWithPIN } = useAuth();
  const { config } = useConfig();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Same fallback pattern as Sidebar.tsx — a device loading this page has
  // never authenticated yet, so this is the one screen besides Sidebar
  // itself that needs these fields, and needs the exact same "never
  // configured" behavior (today's hardcoded look, byte-for-byte).
  const companyName = config?.companyName?.trim() || 'ONE GLOVE GROUP';
  const portalTitle = config?.portalTitle?.trim() || 'QI PLATFORM v4.0';
  const logoImage = config?.logoImage || null;

  // ── Kiosk PIN login — identity-first ──────────────────────────────────────
  // Step 1: worker picks their own account from a searchable directory
  // (GET /api/auth/pin-directory — pre-auth-safe, name + employeeId only).
  // Step 2: today's PIN dots + numeric keypad, unchanged, scoped to the
  // selected account (backend/src/routes/pinUsers.routes.ts's POST
  // /api/auth/pin-login verifies the PIN against only that one row now, not
  // a scan-all match).
  const [step, setStep] = useState<'select' | 'pin'>('select');
  const [directory, setDirectory] = useState<PinDirectoryEntry[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<PinDirectoryEntry | null>(null);

  const [pin, setPin] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/pin-directory`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => setDirectory((data.pinUsers ?? []) as PinDirectoryEntry[]))
      .catch((err) => {
        console.error('[LoginPage] Failed to load PIN directory:', err);
        setDirectoryError(true);
      })
      .finally(() => setDirectoryLoading(false));
  }, []);

  // Filter-as-you-type on either name or employeeId — the directory already
  // arrives sorted by employeeId (server-side orderBy), and Array.filter
  // preserves that order, so no re-sort is needed here.
  //
  // No results render until at least 1 character is typed (kiosk touchscreen
  // scale concern — a flat list on bare focus doesn't stay usable as the
  // roster grows), and matches are capped to MAX_VISIBLE_RESULTS with a
  // "keep typing" hint rather than silently truncating.
  const MAX_VISIBLE_RESULTS = 8;
  const trimmedQuery = query.trim().toLowerCase();
  const filteredDirectory = trimmedQuery
    ? directory.filter(
        (u) => u.name.toLowerCase().includes(trimmedQuery) || u.employeeId.toLowerCase().includes(trimmedQuery)
      )
    : [];
  const visibleDirectory = filteredDirectory.slice(0, MAX_VISIBLE_RESULTS);
  const hiddenMatchCount = filteredDirectory.length - visibleDirectory.length;

  const handleSelectUser = (u: PinDirectoryEntry) => {
    setSelectedUser(u);
    setPin('');
    setStep('pin');
  };

  const handleBackToSelect = () => {
    setSelectedUser(null);
    setPin('');
    setStep('select');
  };

  // Handle M365 Login — real MSAL popup flow (AuthContext.tsx's
  // loginWithM365). A role of null (pending admin assignment, revoked, or
  // bootstrap-eligible) still lands here successfully; App.tsx's
  // ProtectedRoute shows the matching status screen in those cases, so no
  // branching is needed on this page for them. 'invite-claimed' is the one
  // status that proceeds straight into the app — it just gets a one-off
  // welcome toast acknowledging the just-claimed role.
  const handleM365Login = async () => {
    try {
      setIsLoggingIn(true);
      const resolvedUser = await loginWithM365();
      if (resolvedUser.status === 'invite-claimed') {
        addToast('success', `Welcome! You've been invited as ${resolvedUser.role}.`);
      } else {
        addToast('success', 'Logged in successfully via Microsoft 365.');
      }
      navigate('/wizard'); // Default page shall be entry wizard
    } catch (error) {
      addToast('error', 'Microsoft 365 Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle PIN Pad Input — identity is the account chosen in step 1
  // (selectedUser); the PIN itself is only verified against that one
  // account now, not resolved from a scan-all match.
  const handlePinInput = async (digit: string) => {
    if (pin.length >= 6 || !selectedUser) return;

    const newPin = pin + digit;
    setPin(newPin);

    // Auto-submit when 6 digits are reached
    if (newPin.length === 6) {
      try {
        setIsLoggingIn(true);
        await loginWithPIN(selectedUser.id, newPin);
        addToast('success', 'Factory floor login successful.');
        navigate('/wizard'); // Operators go to wizard
      } catch (error) {
        addToast('error', 'Invalid PIN. Please try again.');
        setPin(''); // Reset PIN on failure
      } finally {
        setIsLoggingIn(false);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  // Listen for global keyboard input — kiosk convenience for an external
  // numeric keypad. Only meaningful once an account is selected (step
  // 'pin'); while step 'select' is active, digit/backspace/escape keys are
  // left alone so they behave normally inside the search input instead of
  // being hijacked into PIN entry.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent handling if a modifier key is pressed (except Shift for some reason, but let's just ignore ctrl/alt/meta)
      if (e.ctrlKey || e.metaKey || e.altKey || isLoggingIn) return;
      if (step !== 'pin') return;

      if (e.key >= '0' && e.key <= '9') {
        handlePinInput(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Delete' || e.key === 'Clear' || e.key === 'Escape') {
        setPin('');
        addToast('info', 'PIN Cleared');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLoggingIn, step, selectedUser, loginWithPIN, navigate, addToast]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-10 bg-canvas text-primary px-6 py-12">
      {/* ── Shared Header: logo + company name + portal title, rendered
           once above both cards (previously duplicated per-panel). Part of
           the centered composed unit now, not a fixed top bar. ─────────── */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-brand-primary/20 text-brand-secondary flex items-center justify-center border border-brand-secondary/40 shadow-[0_0_20px_rgba(45,212,191,0.2)] overflow-hidden">
          {logoImage ? (
            <img src={logoImage} alt={companyName} className="w-full h-full object-contain" />
          ) : (
            <ShieldCheck size={28} />
          )}
        </div>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-primary truncate">{companyName}</p>
          <p className="text-[10px] font-mono uppercase text-muted tracking-wide">{portalTitle}</p>
        </div>
      </div>

      {/* ── Two centered cards, side-by-side at lg+, gap instead of a
           continuous divider. Same bg-surface/border-gray-800 card shell on
           both — any distinction between the two options comes from their
           heading/content, not a background mismatch. Both cards share a
           fixed h-[36rem] — NOT items-stretch alone, since stretch would
           still let the whole row (and therefore Management) grow/shrink
           every time Kiosk's internal step changes (query typed, account
           selected, etc). A fixed height on both, combined with an
           internal `overflow-y-auto` region inside Kiosk (below), keeps the
           card FRAME constant regardless of how much its own content varies
           — content scrolls inside the frame instead of resizing it. ───── */}
      <div className="w-full flex flex-col lg:flex-row items-stretch justify-center gap-6">
        {/* ── Management & Office (M365 SSO) — hidden below lg, matching
             today's kiosk-first behavior on narrow/touchscreen devices ── */}
        <div className="hidden lg:flex w-full max-w-sm h-[36rem] flex-col bg-surface border border-gray-800 rounded-2xl shadow-lg p-8">
          <div className="text-center shrink-0">
            <h2 className="text-xl font-bold uppercase tracking-tight text-primary">Management Access</h2>
            <p className="text-xs text-muted mt-1 font-normal normal-case">For Managers, Executives and Admins</p>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <Button
              className="w-full h-14 text-base"
              onClick={handleM365Login}
              disabled={isLoggingIn}
            >
              <svg className="w-6 h-6 mr-3" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
              {isLoggingIn ? 'Authenticating...' : 'Sign in with Microsoft 365'}
            </Button>
          </div>
        </div>

        {/* ── Factory Floor (Kiosk PIN Pad) ──────────────────────────── */}
        <div className="w-full max-w-sm h-[36rem] flex flex-col bg-surface border border-gray-800 rounded-2xl shadow-lg p-8 overflow-hidden">
          <div className="text-center shrink-0">
            <h2 className="text-xl font-bold uppercase tracking-tight text-primary">Factory Floor Kiosk</h2>
            <p className="text-xs text-muted mt-1 font-normal normal-case">
              {step === 'select' ? 'For Floor Staff' : `Welcome, ${selectedUser?.name}`}
            </p>
          </div>

          {/* flex-1 + min-h-0 lets this region shrink below its content's
              natural size (the flexbox default is min-height:auto, which
              would otherwise force the card taller instead of scrolling)
              so any step's content — search results, PIN keypad — scrolls
              inside this fixed-height card rather than resizing it. */}
          <div className="mt-8 flex-1 min-h-0 overflow-y-auto flex flex-col justify-center space-y-6">
            {step === 'select' ? (
              <>
                {/* Searchable Staff Directory */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or Employee ID..."
                      className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg pl-10 pr-4 py-3 focus:border-brand-primary outline-none"
                    />
                  </div>

                  {trimmedQuery && (
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-800 divide-y divide-gray-800/60 bg-canvas">
                      {directoryLoading ? (
                        <p className="px-4 py-6 text-center text-sm text-muted">Loading staff list...</p>
                      ) : directoryError ? (
                        <p className="px-4 py-6 text-center text-sm text-danger">
                          Unable to load staff list. Contact your supervisor.
                        </p>
                      ) : filteredDirectory.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-muted">
                          {directory.length === 0 ? 'No staff accounts set up yet.' : 'No matching staff found.'}
                        </p>
                      ) : (
                        <>
                          {visibleDirectory.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleSelectUser(u)}
                              className="w-full text-left px-4 py-3 hover:bg-gray-800 active:bg-gray-800 transition-colors outline-none touch-manipulation"
                            >
                              <span className="text-sm font-medium text-primary">
                                <span className="text-muted font-mono text-xs uppercase">{u.employeeId} —</span> {u.name}
                              </span>
                            </button>
                          ))}
                          {hiddenMatchCount > 0 && (
                            <p className="px-4 py-3 text-center text-xs text-muted">
                              +{hiddenMatchCount} more match{hiddenMatchCount === 1 ? '' : 'es'} — keep typing to narrow results.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-xs text-muted">
                    Don't have a PIN? Contact your manager or admin.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* PIN Indicator Dots */}
                <div className="flex justify-center gap-3 py-6">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full transition-all duration-300 ${
                        i < pin.length
                          ? 'bg-brand-secondary shadow-[0_0_10px_rgba(45,212,191,0.5)] scale-110'
                          : 'bg-gray-800'
                      }`}
                    />
                  ))}
                </div>

                {/* Large Touch Target Keypad */}
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => handlePinInput(num.toString())}
                      disabled={isLoggingIn}
                      className="h-16 rounded-xl bg-canvas border border-gray-700 text-2xl font-mono font-semibold hover:bg-gray-800 hover:border-gray-500 active:scale-95 transition-all touch-manipulation"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setPin('');
                      addToast('info', 'PIN Cleared');
                    }}
                    disabled={isLoggingIn || pin.length === 0}
                    className="h-16 rounded-xl bg-canvas/50 border border-transparent text-muted font-semibold hover:text-white active:scale-95 transition-all flex items-center justify-center touch-manipulation"
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => handlePinInput('0')}
                    disabled={isLoggingIn}
                    className="h-16 rounded-xl bg-canvas border border-gray-700 text-2xl font-mono font-semibold hover:bg-gray-800 hover:border-gray-500 active:scale-95 transition-all touch-manipulation"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    disabled={isLoggingIn || pin.length === 0}
                    className="h-16 rounded-xl bg-canvas border border-gray-700 text-muted hover:text-danger hover:border-danger/50 active:scale-95 transition-all flex items-center justify-center touch-manipulation"
                  >
                    <Delete size={24} />
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleBackToSelect}
                    disabled={isLoggingIn}
                    className="text-xs text-muted hover:text-white transition-colors outline-none inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3 h-3" strokeWidth={2} />
                    Not you? Go back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
