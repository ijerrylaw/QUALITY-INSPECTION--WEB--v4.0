import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { Button } from '../components/ui/Button';
import { ShieldCheck, HardHat, Delete } from 'lucide-react';

export function LoginPage() {
  const { loginWithM365, loginWithPIN } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [pin, setPin] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

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

  // Handle PIN Pad Input — identity is resolved server-side from the PIN
  // itself (backend/src/routes/pinUsers.routes.ts's POST /api/auth/pin-login),
  // so no separate "who are you" selection step is needed.
  const handlePinInput = async (digit: string) => {
    if (pin.length >= 6) return;

    const newPin = pin + digit;
    setPin(newPin);

    // Auto-submit when 6 digits are reached
    if (newPin.length === 6) {
      try {
        setIsLoggingIn(true);
        await loginWithPIN(newPin);
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

  // Listen for global keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent handling if a modifier key is pressed (except Shift for some reason, but let's just ignore ctrl/alt/meta)
      if (e.ctrlKey || e.metaKey || e.altKey || isLoggingIn) return;

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
  }, [pin, isLoggingIn, loginWithPIN, navigate, addToast]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-primary">
      {/* ── Left Side: Management & Office (M365 SSO) ───────────────────── */}
      <div className="hidden lg:flex w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden bg-surface border-r border-gray-800">
        <div className="absolute top-0 left-0 w-full h-full bg-brand-primary/5 pointer-events-none"></div>
        
        <div className="max-w-md w-full space-y-8 relative z-10 text-center">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/20 text-brand-secondary flex items-center justify-center border border-brand-secondary/40 shadow-[0_0_20px_rgba(45,212,191,0.2)]">
              <ShieldCheck size={32} />
            </div>
          </div>
          
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Management Access</h2>
            <p className="mt-3 text-muted text-lg">
              Sign in via Single Sign-On to approve amendments, manage configurations, and view global analytics.
            </p>
          </div>

          <div className="pt-6">
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
      </div>

      {/* ── Right Side: Factory Floor (Kiosk PIN Pad) ────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 bg-canvas relative">
        
        <div className="max-w-sm w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 text-gray-300 flex items-center justify-center border border-gray-700">
                <HardHat size={28} />
              </div>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Factory Floor Kiosk</h2>
            <p className="mt-2 text-muted">Enter your 6-digit PIN</p>
          </div>

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
                className="h-16 rounded-xl bg-surface border border-gray-700 text-2xl font-mono font-semibold hover:bg-gray-800 hover:border-gray-500 active:scale-95 transition-all touch-manipulation"
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
              className="h-16 rounded-xl bg-surface/50 border border-transparent text-gray-500 font-semibold hover:text-white active:scale-95 transition-all flex items-center justify-center touch-manipulation"
            >
              CLEAR
            </button>
            <button
              onClick={() => handlePinInput('0')}
              disabled={isLoggingIn}
              className="h-16 rounded-xl bg-surface border border-gray-700 text-2xl font-mono font-semibold hover:bg-gray-800 hover:border-gray-500 active:scale-95 transition-all touch-manipulation"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              disabled={isLoggingIn || pin.length === 0}
              className="h-16 rounded-xl bg-surface border border-gray-700 text-gray-400 hover:text-danger hover:border-danger/50 active:scale-95 transition-all flex items-center justify-center touch-manipulation"
            >
              <Delete size={24} />
            </button>
          </div>

          <div className="text-center pt-4">
             <p className="text-xs text-gray-500">
               Don't have a PIN? Ask your supervisor or manager.
             </p>
          </div>

        </div>
      </div>
    </div>
  );
}
