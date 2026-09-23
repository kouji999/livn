"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Login form.
 *
 * Uses `useActionState` so the server action's result survives re-render and
 * can render field-level errors. `useFormStatus`-style pending state comes
 * from the same hook, which keeps the button honest about what is happening.
 */
type State = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_previous, formData) => {
      const result = await loginAction({
        email: formData.get("email"),
        password: formData.get("password"),
      });

      if (result.ok) {
        // A full navigation is correct here: the session cookie changed and
        // every server component on the next page must re-render.
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
        name="email"
        type="email"
        label="Email"
        placeholder="nama@email.com"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        error={state.fieldErrors?.email}
      />

      <Input
        name="password"
        type="password"
        label="Kata sandi"
        placeholder="Kata sandi kamu"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={pending}
        className={cn(pending && "cursor-progress")}
      >
        {pending ? "Memproses..." : "Masuk"}
      </Button>

      <p className="text-center text-sm text-ink-subtle">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Buat akun
        </Link>
      </p>
    </form>
  );
}
