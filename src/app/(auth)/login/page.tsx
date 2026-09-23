import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/today");

  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Wordmark size="lg" href="/" label="Livn, kembali ke halaman utama" />
          <p className="text-sm text-ink-subtle">
            Tempat hidup kamu dicatat dan diukur.
          </p>
        </div>

        <LoginForm initialError={error} />
      </div>
    </div>
  );
}
