"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RecordIcon } from "@/components/ui/record-icon";
import { cn } from "@/lib/cn";
import { COLORS } from "@/lib/tokens";
import { ICON_OPTIONS } from "@/lib/icons";
import { createAccountAction } from "@/domains/finance/actions";
import { ACCOUNT_TYPES } from "@/domains/finance/vocabulary";
import { statusMeta } from "@/components/ui/status";

/**
 * Account composer.
 *
 * The opening balance is asked for explicitly because it is the one number the
 * ledger cannot derive: everything after it comes from transactions. Leaving it
 * blank is allowed and means zero, which is the honest default for a new wallet.
 */
export function AccountComposer({
  onDone,
  onSaved,
}: {
  onDone?: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [type, setType] = useState("CASH");
  const [openingBalance, setOpeningBalance] = useState("");
  const [institution, setInstitution] = useState("");
  const [colorToken, setColorToken] = useState("accent");
  const [iconName, setIconName] = useState("wallet");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    if (!name.trim()) {
      setErrors({ name: "Nama akun wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await createAccountAction({
        name: name.trim(),
        type,
        // An empty balance is zero, not "unset".
        openingBalance: openingBalance.trim() || "0",
        institution: institution.trim() || undefined,
        colorToken,
        iconName,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal membuat akun", result.error.message);
        return;
      }

      toast.success("Akun dibuat");
      setName("");
      setOpeningBalance("");
      setInstitution("");
      setErrors({});
      onSaved?.();
      onDone?.();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Akun baru</h3>
        {onDone && (
          <button type="button" onClick={onDone} className="text-xs text-ink-subtle hover:text-ink">
            Tutup
          </button>
        )}
      </div>

      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <div className="flex items-start gap-3">
        <RecordIcon icon={iconName} token={colorToken} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            label="Nama akun"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: BCA"
            autoFocus
            required
            error={errors.name}
          />
          <Input
            label="Institusi"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Opsional, misalnya nama bank"
            error={errors.institution}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Jenis"
          value={type}
          onChange={(e) => setType(e.target.value)}
          error={errors.type}
        >
          {ACCOUNT_TYPES.map((value) => (
            <option key={value} value={value}>
              {statusMeta("account", value).label}
            </option>
          ))}
        </Select>

        <Input
          label="Saldo awal"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          hint="Saldo saat ini. Kosongkan untuk mulai dari nol."
          error={errors.openingBalance}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Warna</legend>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((token) => {
            const active = colorToken === token;
            return (
              <button
                key={token}
                type="button"
                onClick={() => setColorToken(token)}
                aria-label={`Warna ${token}`}
                aria-pressed={active}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border transition-colors duration-fast",
                  active ? "border-ink-faint" : "border-transparent hover:border-border-strong",
                )}
                style={{ backgroundColor: `var(--color-${token}-soft)` }}
              >
                {active && <Check size={13} style={{ color: `var(--color-${token})` }} />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Ikon</legend>
        <div className="grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-2">
          {[
            "wallet", "banknote", "landmark", "smartphone", "piggy-bank",
            "credit-card", "trending-up", "package", "briefcase", "home",
            "sparkles", "activity", "user", "repeat", "layers", "target",
          ].map((iconOption) => {
            const active = iconName === iconOption;
            const label = ICON_OPTIONS.find((o) => o.name === iconOption)?.label ?? iconOption;
            return (
              <button
                key={iconOption}
                type="button"
                onClick={() => setIconName(iconOption)}
                aria-label={label}
                aria-pressed={active}
                title={label}
                className={cn(
                  "flex items-center justify-center rounded-md border p-1.5 transition-colors duration-fast",
                  active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-sunken",
                )}
              >
                <RecordIcon icon={iconOption} token={colorToken} size="sm" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          Buat akun
        </Button>
        {onDone && (
          <Button variant="ghost" size="md" onClick={onDone} disabled={pending}>
            Batal
          </Button>
        )}
      </div>
    </div>
  );
}
