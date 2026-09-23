"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/**
 * Destructive action confirmation.
 *
 * Uses the native `<dialog>` element rather than a portal-based modal: the
 * browser then owns focus trapping, `Esc` to dismiss, and rendering above
 * everything, none of which has to be reimplemented or can silently regress.
 *
 * The confirming button is never the default focus. A reflex Enter must not
 * delete anything.
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  onConfirm,
  children,
  variant = "danger",
  size = "md",
  disabled,
  className,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  variant?: "danger" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Focus the safe option when the dialog opens.
    const handleOpen = () => cancelRef.current?.focus();
    dialog.addEventListener("close", handleOpen);
    return () => dialog.removeEventListener("close", handleOpen);
  }, []);

  function open() {
    setConfirmed(false);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={open}
        disabled={disabled}
        className={className}
      >
        {children}
      </Button>

      <dialog
        ref={dialogRef}
        // `max-w-none` overrides the user-agent dialog width so the panel can
        // be sized by the content.
        className={cn(
          "m-auto w-[min(26rem,calc(100vw-2rem))] max-w-none rounded-lg border border-border bg-surface p-0 shadow-overlay",
          "backdrop:bg-black/35 backdrop:backdrop-blur-[2px]",
        )}
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-description" : undefined}
      >
        <div className="p-5">
          <h2 id="confirm-title" className="text-sm font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <p id="confirm-description" className="mt-1.5 text-sm text-ink-muted">
              {description}
            </p>
          )}

          <label className="mt-4 flex items-start gap-2.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--color-negative)]"
            />
            <span>Saya mengerti tindakan ini tidak bisa dibatalkan.</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button ref={cancelRef} variant="ghost" size="md" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={handleConfirm}
            loading={busy}
            disabled={!confirmed}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
