import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { getCurrentUser } from "@/lib/auth/session";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Buat akun" };

export default async function RegisterPage({
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
            Mulai bangun sistem hidup kamu sendiri.
          </p>
        </div>

        <RegisterForm initialError={error} />
      </div>
    </div>
  );
}
