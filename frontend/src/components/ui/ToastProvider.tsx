import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      
      {/* ── Toast Notification Container (Fixed Top-Right) ────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => {
          let typeStyles = '';
          let Icon = Info;
          let iconColor = '';

          if (toast.type === 'success') {
            typeStyles = 'border-emerald-500/50 text-emerald-400';
            Icon = CheckCircle2;
            iconColor = 'text-emerald-400';
          } else if (toast.type === 'error') {
            typeStyles = 'border-rose-500/50 text-rose-400';
            Icon = AlertTriangle;
            iconColor = 'text-rose-400';
          } else if (toast.type === 'info') {
            typeStyles = 'border-cyan-500/50 text-cyan-400';
            Icon = Info;
            iconColor = 'text-cyan-400';
          }

          return (
            <div
              key={toast.id}
              className={`bg-surface border rounded-lg p-4 shadow-xl flex items-start gap-3 max-w-md w-full text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${typeStyles}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} strokeWidth={2} />
              <div className="flex-1 text-primary">{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-muted hover:text-primary transition-colors shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
