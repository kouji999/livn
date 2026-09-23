"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Info } from "lucide-react";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/brand/avatar";
import { RecordIcon } from "@/components/ui/record-icon";
import { cn } from "@/lib/cn";
import { COLORS } from "@/lib/tokens";
import { ICON_OPTIONS } from "@/lib/icons";
import { updateProfileAction } from "@/domains/profile/actions";

/**
 * Profile editor.
 *
 * The avatar is configured by three choices that are all visible at once —
 * shape, colour, glyph — with a live preview beside them. Choosing by seeing is
 * faster than choosing by describing, and it removes any need to explain what
 * "solid" or "initials" means.
 *
 * Nothing here is required. A person who only wants to change their name leaves
 * every other field alone.
 */

type ProfileData = {
  email: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatarStyle: string;
  avatarColor: string;
  avatarIcon: string | null;
  createdAt: string;
  lastSeenAt: string | null;
};

const STYLES = [
  { value: "initials", label: "Inisial", hint: "Dua huruf dari namamu" },
  { value: "icon", label: "Ikon", hint: "Simbol yang kamu pilih" },
  { value: "solid", label: "Penuh", hint: "Warna solid dengan inisial" },
] as const;

/** A curated glyph set — an avatar mark, not a general-purpose picker. */
const AVATAR_ICONS = [
  "user", "sparkles", "activity", "target", "flame", "book-open",
  "briefcase", "wallet", "heart-pulse", "home", "layers", "trending-up",
  "graduation-cap", "dumbbell", "laptop", "users",
];

export function ProfileView({
  profile,
  sessions,
}: {
  profile: ProfileData;
  sessions: { total: number; active: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    avatarStyle: profile.avatarStyle,
    avatarColor: profile.avatarColor,
    avatarIcon: profile.avatarIcon ?? "user",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const dirty =
    form.displayName !== profile.displayName ||
    form.headline !== (profile.headline ?? "") ||
    form.bio !== (profile.bio ?? "") ||
    form.location !== (profile.location ?? "") ||
    form.avatarStyle !== profile.avatarStyle ||
    form.avatarColor !== profile.avatarColor ||
    form.avatarIcon !== (profile.avatarIcon ?? "user");

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
      const result = await updateProfileAction(form);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan profil", result.error.message);
        return;
      }

      toast.success("Profil disimpan");
      setErrors({});
      setSaved(true);
      router.refresh();
    });
  }

  function reset() {
    setForm({
      displayName: profile.displayName,
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      avatarStyle: profile.avatarStyle,
      avatarColor: profile.avatarColor,
      avatarIcon: profile.avatarIcon ?? "user",
    });
    setErrors({});
  }

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
      >
        <ArrowLeft size={13} />
        Pengaturan
      </Link>

      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-4 py-3 text-sm">
          {errors._form}
        </p>
      )}

      {/* ── Preview + avatar ─────────────────────────────────────────────── */}
      <Card className="px-5 py-5">
        <div className="flex flex-wrap items-start gap-5">
          {/* Live preview, showing exactly what the shell will render. */}
          <div className="flex items-center gap-4">
            <Avatar
              name={form.displayName || "?"}
              style={form.avatarStyle}
              colorToken={form.avatarColor}
              iconName={form.avatarIcon}
              size="xl"
              labelled
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight text-ink">
                {form.displayName || "Tanpa nama"}
              </p>
              {form.headline && (
                <p className="mt-0.5 truncate text-sm text-ink-muted">{form.headline}</p>
              )}
              {form.location && (
                <p className="mt-1 text-micro text-ink-faint">{form.location}</p>
              )}
            </div>
          </div>

          <p className="ml-auto hidden max-w-[22ch] text-micro leading-relaxed text-ink-faint sm:block">
            Beginilah namamu muncul di sidebar dan di komentar aktivitas.
          </p>
        </div>
      </Card>

      {/* ── Avatar picker ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Tanda pengenal"
          description="Pilih bentuk, warna dan ikon. Tidak perlu mengunggah gambar."
        />
        <div className="space-y-4 px-5 pb-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-ink-muted">Bentuk</legend>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((style) => {
                const active = form.avatarStyle === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => set("avatarStyle", style.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-md border px-2 py-3 transition-colors duration-fast",
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    <Avatar
                      name={form.displayName || "?"}
                      style={style.value}
                      colorToken={form.avatarColor}
                      iconName={form.avatarIcon}
                      size="md"
                    />
                    <span className="text-xs font-medium text-ink">{style.label}</span>
                    <span className="text-center text-micro leading-tight text-ink-faint">
                      {style.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-ink-muted">Warna</legend>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((token) => {
                const active = form.avatarColor === token;
                return (
                  <button
                    key={token}
                    type="button"
                    onClick={() => set("avatarColor", token)}
                    aria-label={`Warna ${token}`}
                    aria-pressed={active}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border-2 transition-colors duration-fast",
                      active ? "border-ink-faint" : "border-transparent hover:border-border-strong",
                    )}
                    style={{ backgroundColor: `var(--color-${token}-soft)` }}
                  >
                    {active && <Check size={14} style={{ color: `var(--color-${token})` }} />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {form.avatarStyle === "icon" && (
            <fieldset className="motion-safe:animate-fade-in">
              <legend className="mb-2 text-xs font-medium text-ink-muted">Ikon</legend>
              <div className="grid grid-cols-8 gap-1.5 rounded-md border border-border p-2 sm:grid-cols-10">
                {AVATAR_ICONS.map((name) => {
                  const active = form.avatarIcon === name;
                  const label = ICON_OPTIONS.find((o) => o.name === name)?.label ?? name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => set("avatarIcon", name)}
                      aria-label={label}
                      aria-pressed={active}
                      title={label}
                      className={cn(
                        "flex items-center justify-center rounded-md border p-1.5 transition-colors duration-fast",
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-transparent hover:bg-surface-sunken",
                      )}
                    >
                      <RecordIcon icon={name} token={form.avatarColor} size="sm" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      </Card>

      {/* ── About you ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          size="sm"
          title="Tentang kamu"
          description="Semua kolom opsional. Hanya kamu yang melihatnya."
        />
        <div className="space-y-3 px-5 pb-5">
          <Input
            label="Nama"
            value={form.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            required
            error={errors.displayName}
            hint="Dipakai untuk sapaan dan inisial"
          />

          <Input
            label="Baris pengantar"
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Contoh: Belajar bahasa Jepang sambil kerja"
            error={errors.headline}
          />

          <Textarea
            label="Tentang"
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={4}
            placeholder="Apa yang sedang kamu kerjakan? Untuk apa sistem ini?"
            error={errors.bio}
            hint={`${form.bio.length}/500`}
          />

          <Input
            label="Lokasi"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Contoh: Jakarta"
            error={errors.location}
            hint="Teks bebas. Zona waktu diatur di Pengaturan."
          />
        </div>
      </Card>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-sticky flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-raised">
        <Button variant="primary" size="md" onClick={save} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan profil" : saved ? "Tersimpan" : "Tidak ada perubahan"}
        </Button>

        {dirty && (
          <Button variant="ghost" size="md" onClick={reset} disabled={pending}>
            Batalkan
          </Button>
        )}

        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-xs text-positive">
            <Check size={13} />
            Profil sudah diperbarui
          </span>
        )}
      </div>

      {/* ── Account facts ────────────────────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">Akun</SectionLabel>
        <Card>
          <dl className="divide-y divide-border-subtle">
            <Fact label="Email" value={profile.email} note="Tidak bisa diubah dari sini" />
            <Fact
              label="Dibuat"
              value={new Intl.DateTimeFormat("id-ID", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(profile.createdAt))}
            />
            <Fact
              label="Terakhir dipakai"
              value={
                profile.lastSeenAt
                  ? new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(profile.lastSeenAt))
                  : "Belum tercatat"
              }
            />
            <Fact
              label="Sesi aktif"
              value={`${sessions.active} dari ${sessions.total}`}
              note="Sesi kedaluwarsa dibersihkan saat halaman masuk dibuka"
            />
          </dl>
        </Card>
      </section>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <Info size={14} className="mt-0.5 shrink-0 text-ink-faint" />
        <p className="text-xs leading-relaxed text-ink-muted">
          Halaman ini hanya mengubah bagaimana kamu ditampilkan. Zona waktu, mata uang
          dan awal minggu — yang mempengaruhi cara angka dihitung — ada di{" "}
          <Link href="/settings" className="text-accent underline-offset-4 hover:underline">
            Pengaturan
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-right">
        <span className="block text-xs text-ink">{value}</span>
        {note && <span className="mt-0.5 block text-micro text-ink-faint">{note}</span>}
      </dd>
    </div>
  );
}
