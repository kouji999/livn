"use client";

import { useEffect } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Shown when a server component throws during rendering. The raw error is
 * logged for the developer and never rendered: a stack trace tells a user
 * nothing and can leak internals.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[livn] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 text-center">
      {/*
        Deliberately not a link. If a rendering fault is systemic rather than
        page-specific, a logo that navigates would give the reader a way to loop
        through the same error. The two buttons below are the intended exits,
        and one of them is a full page load rather than a client navigation.
      */}
      <Wordmark size="md" />
      <div className="space-y-1.5">
        <p className="text-xl font-semibold tracking-tight text-ink">
          Ada yang gagal dimuat
        </p>
        <p className="max-w-[42ch] text-sm text-ink-subtle">
          Datamu aman. Coba muat ulang halaman ini, dan kalau masih gagal,
          kembali lagi sebentar.
        </p>
        {error.digest && (
          <p className="tabular text-micro text-ink-faint">
            Kode kejadian: {error.digest}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={reset}>
          Coba lagi
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            window.location.href = "/today";
          }}
        >
          Ke Today
        </Button>
      </div>
    </div>
  );
}
