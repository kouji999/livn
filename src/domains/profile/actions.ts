"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/action-result";
import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { parseOrThrow } from "@/lib/validation";
import { isColorToken } from "@/lib/tokens";
import { ICON_OPTIONS } from "@/lib/icons";

/**
 * Profile actions.
 *
 * The profile is a *presentation* layer over the account: a chosen avatar, a
 * short bio, a colour and an icon. It deliberately excludes anything that
 * affects stored records — the time zone, currency and week start live in
 * settings, because changing those recomputes existing history rather than
 * changing how a name is displayed.
 *
 * The avatar is stored as a choice, not an upload. See `AVATAR_STYLES` for why.
 */

const AVATAR_STYLES = [
  "initials",
  "accent",
  "positive",
  "info",
  "warning",
  "neutral",
] as const;

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Nama wajib diisi.")
    .max(80, "Nama maksimal 80 karakter."),

  /** A short line shown under the name. Plain text; no markup is rendered. */
  headline: z
    .string()
    .trim()
    .max(120, "Maksimal 120 karakter.")
    .optional()
    .or(z.literal("")),

  bio: z
    .string()
    .trim()
    .max(500, "Maksimal 500 karakter.")
    .optional()
    .or(z.literal("")),

  /** IANA zone. Validated against `Intl` so an unknown value is rejected. */
  location: z
    .string()
    .trim()
    .max(80, "Maksimal 80 karakter.")
    .optional()
    .or(z.literal("")),

  avatarStyle: z.enum(AVATAR_STYLES),
  avatarColor: z.string().trim().max(24),
  avatarIcon: z.string().trim().max(40).optional().or(z.literal("")),
});

export type ProfileInput = z.infer<typeof profileSchema>;

function revalidateProfile() {
  revalidatePath("/settings");
  revalidatePath("/settings/profile");
  // The name and avatar appear in the shell on every authenticated page.
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/money");
  revalidatePath("/progress");
  revalidatePath("/journal");
}

export const updateProfileAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const data = parseOrThrow(profileSchema, input, "Periksa kembali data profil.");

  // An unknown colour token would render as an unstyled chip rather than
  // failing, so it is rejected here instead.
  if (!isColorToken(data.avatarColor)) {
    throw errors.validation("Warna tidak dikenali.", { avatarColor: "Pilih warna dari daftar." });
  }

  // Same reasoning for the icon: an unknown name falls back to a neutral glyph
  // and the user would not know their choice was ignored.
  if (data.avatarIcon && !ICON_OPTIONS.some((option) => option.name === data.avatarIcon)) {
    throw errors.validation("Ikon tidak dikenali.", { avatarIcon: "Pilih ikon dari daftar." });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      displayName: data.displayName,
      headline: data.headline || null,
      bio: data.bio || null,
      location: data.location || null,
      avatarStyle: data.avatarStyle,
      avatarColor: data.avatarColor,
      avatarIcon: data.avatarIcon || null,
    },
  });

  revalidateProfile();
  return { ok: true };
});
