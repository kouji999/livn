import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";

/**
 * Not found.
 *
 * Reached for a genuinely missing route or record. It stays inside the product
 * rather than showing a bare framework error, and offers the one action that
 * always makes sense: go back to Today.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 text-center">
      <Wordmark size="md" />
      <div className="space-y-1.5">
        <p className="text-xl font-semibold tracking-tight text-ink">
          Halaman ini tidak ada
        </p>
        <p className="max-w-[40ch] text-sm text-ink-subtle">
          Alamatnya mungkin salah, atau data yang kamu cari sudah dihapus.
        </p>
      </div>
      <ButtonLink href="/today" variant="primary" size="md">
        Kembali ke Today
      </ButtonLink>
      <p className="text-xs text-ink-faint">
        Atau{" "}
        <Link href="/plan" className="text-accent underline-offset-4 hover:underline">
          buka halaman Plan
        </Link>
        .
      </p>
    </div>
  );
}
