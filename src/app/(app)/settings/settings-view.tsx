"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Globe } from "lucide-react";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RecordIcon } from "@/components/ui/record-icon";
import { Avatar } from "@/components/brand/avatar";
import { cn } from "@/lib/cn";
import {
  CURRENCY_OPTIONS,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  THEME_OPTIONS,
  TIME_ZONE_OPTIONS,
  WEEK_START_OPTIONS,
  detectTimeZone,
  formatTimeZoneOffset,
} from "@/domains/settings/settings";
import { updateSettingsAction } from "@/domains/settings/actions";
import { PasswordChangeForm } from "./password-change-form";

/**
 * Settings.
 *
 * Three groups, ordered by how much they affect the stored numbers:
 *
 *   1. Identity - who the data belongs to. Read-only here; the name and avatar
 *      have their own page, and credentials have their own flow.
 *   2. Measurement - time zone, week start, currency. These change how existing
 *      records are filed and totalled, so the page states that plainly instead
 *      of presenting them as cosmetic toggles.
 *   3. Appearance - theme and language. Presentation only.
 *
 * The order matters: a person scrolling this page meets the consequential
 * settings before the shallow ones.
 */

type SettingsProfile = {
  email: string;
  displayName: string;
  headline: string | null;
  avatarStyle: string;
  avatarColor: string;
  avatarIcon: string | null;
  timeZone: string;
  locale: string;
  currency: string;
  weekStartsOn: number;
  themePreference: string;
  createdAt: string;
};

export function SettingsView({ profile }: { profile: SettingsProfile }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // No `displayName` here: the name is presentation and lives on the profile
  // page. This form carries only the settings that change how numbers are
  // computed or displayed.
  const [form, setForm] = useState({
    timeZone: profile.timeZone,
    locale: profile.locale,
    currency: profile.currency,
    weekStartsOn: profile.weekStartsOn,
    themePreference: profile.themePreference,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const deviceZone = detectTimeZone();
  const zoneChanged = form.timeZone !== profile.timeZone;
  const weekChanged = form.weekStartsOn !== profile.weekStartsOn;
  const currencyChanged = form.currency !== profile.currency;

  const dirty =
    zoneChanged ||
    weekChanged ||
    currencyChanged ||
    form.locale !== profile.locale ||
    form.themePreference !== profile.themePreference;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    if (errors[key as string]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key as string];
        return next;
      });
    }
  }

  function save() {
    startTransition(async () => {
      const result = await updateSettingsAction(form);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Pengaturan disimpan");
      setErrors({});
      setSaved(true);

      // The theme is applied to <html> before paint on the next render, so a
      // navigation is what makes the change visible immediately.
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-4 py-3 text-sm">
          {errors._form}
        </p>
      )}

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Akun"
          description="Identitas pemilik data. Tidak bisa diubah dari sini."
        />
        <div className="space-y-3 px-5 pb-5">
          {/*
            The name and avatar live on the profile page rather than here. They
            are presentation, and this page is about how numbers are computed —
            two different concerns that would be confusing to interleave.
          */}
          <Link
            href="/settings/profile"
            className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3 transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken"
          >
            <Avatar
              name={profile.displayName}
              style={profile.avatarStyle}
              colorToken={profile.avatarColor}
              iconName={profile.avatarIcon}
              size="md"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {profile.displayName}
              </span>
              <span className="block truncate text-xs text-ink-subtle">
                {profile.headline ?? "Atur nama, tanda pengenal dan deskripsi"}
              </span>
            </span>
            <span className="shrink-0 text-micro font-medium text-accent">Ubah profil</span>
          </Link>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Email"
              value={profile.email}
              readOnly
              disabled
              hint="Tidak bisa diubah dari antarmuka"
            />
            <div className="flex items-end">
              <p className="pb-2 text-micro text-ink-faint">
                Akun dibuat{" "}
                {new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(profile.createdAt))}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Measurement ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Cara data dihitung"
          description="Pengaturan ini mengubah bagaimana catatan yang sudah ada dikelompokkan dan dijumlahkan."
        />
        <div className="space-y-4 px-5 pb-5">
          <div className="rounded-md border border-warning/30 bg-warning-soft px-3.5 py-2.5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
              <span>
                Mengubah zona waktu atau awal minggu akan menghitung ulang statistik
                yang sudah ada. Catatanmu tidak hilang, tetapi angka bulanan dan
                mingguan bisa bergeser.
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Select
                label="Zona waktu"
                value={form.timeZone}
                onChange={(e) => set("timeZone", e.target.value)}
                error={errors.timeZone}
                hint={`Sekarang ${formatTimeZoneOffset(form.timeZone)}`}
              >
                {/* A stored zone outside the curated list is still shown, so the
                    select never silently reassigns it. */}
                {!TIME_ZONE_OPTIONS.some((z) => z.value === form.timeZone) && (
                  <option value={form.timeZone}>{form.timeZone}</option>
                )}
                {TIME_ZONE_OPTIONS.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </Select>

              {deviceZone && deviceZone !== form.timeZone && (
                <button
                  type="button"
                  onClick={() => set("timeZone", deviceZone)}
                  className="mt-1.5 inline-flex items-center gap-1 text-micro text-accent hover:underline"
                >
                  <Globe size={10} />
                  Pakai zona perangkat ({deviceZone})
                </button>
              )}
            </div>

            <Select
              label="Awal minggu"
              value={String(form.weekStartsOn)}
              onChange={(e) => set("weekStartsOn", Number(e.target.value))}
              error={errors.weekStartsOn}
              hint="Mempengaruhi review mingguan dan grafik"
            >
              {WEEK_START_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <Select
            label="Mata uang tampilan"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
            error={errors.currency}
            hint="Saldo setiap akun menyimpan mata uangnya sendiri; ini hanya untuk ringkasan"
          >
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {(zoneChanged || weekChanged || currencyChanged) && (
            <ul className="space-y-1 rounded-md border border-border bg-surface-sunken px-3.5 py-2.5 text-xs text-ink-muted">
              {zoneChanged && (
                <li>
                  Zona waktu: {profile.timeZone} menjadi {form.timeZone}. Tanggal
                  transaksi dan kebiasaan akan dikelompokkan ulang.
                </li>
              )}
              {weekChanged && (
                <li>Awal minggu akan berubah, sehingga review mingguan bergeser.</li>
              )}
              {currencyChanged && (
                <li>Angka ringkasan akan ditampilkan dalam {form.currency}.</li>
              )}
            </ul>
          )}
        </div>
      </Card>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Tampilan"
          description="Hanya mempengaruhi tampilan, tidak mengubah data."
        />
        <div className="space-y-4 px-5 pb-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-ink-muted">Tema</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const active = form.themePreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set("themePreference", option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors duration-fast",
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                        active ? "border-accent bg-accent text-accent-ink" : "border-border-strong",
                      )}
                    >
                      {active && <Check size={9} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">{option.label}</span>
                      <span className="block text-micro text-ink-faint">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Select
            label="Bahasa"
            value={form.locale}
            onChange={(e) => set("locale", e.target.value)}
            error={errors.locale}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Save bar. Sticky so the action stays reachable on a long page. */}
      <div className="sticky bottom-4 z-sticky flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-raised">
        <Button variant="primary" size="md" onClick={save} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan pengaturan" : saved ? "Tersimpan" : "Tidak ada perubahan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm({
                timeZone: profile.timeZone,
                locale: profile.locale,
                currency: profile.currency,
                weekStartsOn: profile.weekStartsOn,
                themePreference: profile.themePreference,
              });
              setErrors({});
            }}
            disabled={pending}
          >
            Batalkan
          </Button>
        )}

        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-xs text-positive">
            <Check size={13} />
            Perubahan sudah aktif
          </span>
        )}
      </div>

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Keamanan"
          description="Mengganti kata sandi akan mengakhiri semua sesi lain."
        />
        <div className="px-5 pb-5">
          <PasswordChangeForm />
        </div>
      </Card>

      {/* ── Data ownership ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Data kamu"
          description="Semua catatan bisa diunduh dalam format terbuka."
        />
        <div className="px-5 pb-5">
          <div className="rounded-md border border-border bg-surface-sunken px-4 py-3.5">
            <p className="text-xs leading-relaxed text-ink-muted">
              Ekspor data belum tersedia. Kalau kamu membutuhkannya sekarang, seluruh
              isi basis data bisa diambil dengan{" "}
              <code className="rounded-sm bg-surface px-1 py-0.5 text-micro">
                pg_dump
              </code>{" "}
              dari direktori proyek.
            </p>
            <p className="mt-2 text-micro text-ink-faint">
              Menghapus akun juga belum tersedia dari antarmuka.
            </p>
          </div>
        </div>
      </Card>

      <SectionLabel>Ringkasan akun</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon="wallet" label="Mata uang" value={form.currency} />
        <SummaryTile icon="globe" label="Zona" value={formatTimeZoneOffset(form.timeZone)} />
        <SummaryTile
          icon="calendar"
          label="Awal minggu"
          value={form.weekStartsOn === 1 ? "Senin" : "Minggu"}
        />
        <SummaryTile
          icon={form.themePreference === "dark" ? "moon" : "palette"}
          label="Tema"
          value={
            form.themePreference === "system"
              ? "Sistem"
              : form.themePreference === "dark"
                ? "Gelap"
                : "Terang"
          }
        />
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
      <RecordIcon icon={icon} token="neutral" size="sm" />
      <p className="mt-2 text-micro text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-ink">{value}</p>
    </div>
  );
}
