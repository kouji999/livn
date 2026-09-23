"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { changePasswordAction } from "@/domains/auth/actions";

/**
 * Password change.
 *
 * Kept in its own form rather than folded into the settings save bar: it is a
 * security action with its own rules, its own validation and its own
 * consequence — every other session is revoked — and mixing it into a general
 * "save" would let someone change their password by accident.
 */
export function PasswordChangeForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    startTransition(async () => {
      const result = await changePasswordAction(form);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal mengganti kata sandi", result.error.message);
        return;
      }

      toast.success(
        "Kata sandi diganti",
        "Semua sesi lain sudah diakhiri. Kamu tetap masuk di perangkat ini.",
      );
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setErrors({});
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-muted">
          Kata sandimu terakhir diubah saat akun dibuat.
        </p>
        <Button variant="secondary" size="md" icon={<KeyRound />} onClick={() => setOpen(true)}>
          Ganti kata sandi
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <Input
        label="Kata sandi saat ini"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(e) => setForm((c) => ({ ...c, currentPassword: e.target.value }))}
        error={errors.currentPassword}
        autoFocus
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Kata sandi baru"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((c) => ({ ...c, newPassword: e.target.value }))}
          hint="Minimal 10 karakter"
          error={errors.newPassword}
        />
        <Input
          label="Ulangi kata sandi baru"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => setForm((c) => ({ ...c, confirmPassword: e.target.value }))}
          error={errors.confirmPassword}
        />
      </div>

      <p className="rounded-md border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink">
        Mengganti kata sandi akan mengakhiri sesi di perangkat lain. Kamu akan tetap
        masuk di perangkat ini.
      </p>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          Ganti kata sandi
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setOpen(false);
            setErrors({});
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
          }}
          disabled={pending}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
