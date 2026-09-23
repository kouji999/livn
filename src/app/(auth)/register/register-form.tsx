"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Registration form.
 *
 * Client-side echo of the password rules so the user gets feedback before a
 * round trip, while the server remains the only authority.
 */
type State = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function RegisterForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_previous, formData) => {
      const result = await registerAction({
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (result.ok) {
        window.location.href = "/today";
        return {};
      }

      return {
        error: result.error.message,
        fieldErrors: result.error.fieldErrors,
      };
    },
    { error: initialError },
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2.5 text-sm text-ink"
        >
          {state.error}
        </div>
      )}

      <Input
        name="displayName"
        label="Nama"
        placeholder="Nama kamu"
        autoComplete="name"
        required
        autoFocus
        error={state.fieldErrors?.displayName}
      />

      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="nama@email.com"
        autoComplete="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email}
      />

      <Input
        name="password"
        type="password"
        label="Kata sandi"
        placeholder="Minimal 10 karakter"
        autoComplete="new-password"
        required
        hint="Gunakan frasa yang mudah kamu ingat tapi sulit ditebak."
        error={state.fieldErrors?.password}
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Ulangi kata sandi"
        placeholder="Ketik ulang kata sandi"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={pending}
      >
        {pending ? "Membuat akun..." : "Buat akun"}
      </Button>

      <p className="text-center text-sm text-ink-subtle">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Masuk
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-ink-faint">
        Akun ini akan langsung dilengkapi area, kategori dan akun keuangan
        bawaan agar bisa dipakai sejak menit pertama.
      </p>
    </form>
  );
}
