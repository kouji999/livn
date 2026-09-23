"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Toast notifications.
 *
 * Rules this system follows:
 *
 *   • Errors persist until dismissed. A failure the user did not notice is
 *     worse than one they have to close.
 *   • Successes self-dismiss. They confirm, they do not demand attention.
 *   • Never more than four on screen; the oldest is evicted so a burst of
 *     failures cannot bury the page.
 *   • Announced via `aria-live` so a screen reader hears the outcome of an
 *     action it cannot see.
 */

export type ToastTone = "success" | "error" | "info";

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  description?: string;
  /** Milliseconds; `null` means it stays until dismissed. */
  duration: number | null;
};

type State = { toasts: Toast[] };

type Action =
  | { type: "add"; toast: Toast }
  | { type: "dismiss"; id: string }
  | { type: "clear" };

const MAX_VISIBLE = 4;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const next = [...state.toasts, action.toast];
      return { toasts: next.slice(-MAX_VISIBLE) };
    }
    case "dismiss":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "clear":
      return { toasts: [] };
  }
}

type ToastApi = {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATIONS: Record<ToastTone, number | null> = {
  success: 3200,
  info: 4000,
  error: null, // errors require acknowledgement
};

let counter = 0;
function nextId() {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });

  const push = useCallback((tone: ToastTone, message: string, description?: string) => {
    dispatch({
      type: "add",
      toast: { id: nextId(), tone, message, description, duration: DURATIONS[tone] },
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => push("success", m, d),
      error: (m, d) => push("error", m, d),
      info: (m, d) => push("info", m, d),
      dismiss: (id) => dispatch({ type: "dismiss", id }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={state.toasts} onDismiss={api.dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-positive/30 bg-positive-soft text-ink",
  error: "border-negative/35 bg-negative-soft text-ink",
  info: "border-border-strong bg-surface text-ink",
};

const TONE_ACCENT: Record<ToastTone, string> = {
  success: "bg-positive",
  error: "bg-negative",
  info: "bg-ink-faint",
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.duration === null) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border shadow-raised motion-safe:animate-fade-up",
        TONE_STYLES[toast.tone],
      )}
    >
      <span className={cn("w-1 self-stretch shrink-0", TONE_ACCENT[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1 py-2.5">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-ink-muted">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Tutup notifikasi"
        className="mr-1.5 mt-1.5 shrink-0 rounded-sm p-1 text-ink-faint transition-colors duration-fast hover:bg-black/5 hover:text-ink"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
