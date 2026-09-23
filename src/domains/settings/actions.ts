"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/action-result";
import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { parseOrThrow } from "@/lib/validation";
import { isSupportedCurrency } from "@/lib/money";
import { SUPPORTED_LOCALES, isSupportedTimeZone } from "./settings";

/**
 * Account settings actions.
 *
 * Every value written here changes how existing records are *presented* or
 * *measured*, never what they contain:
 *
 *   • `timeZone` decides which calendar day an instant belongs to. Changing it
 *     re-files existing transactions and habit logs into different days, so it is
 *     treated as significant rather than cosmetic.
 *   • `weekStartsOn` changes how a "week" is aggregated in analytics and reviews.
 *   • `currency` is the display currency; account balances keep their own.
 *
 * All three therefore revalidate the surfaces whose numbers are derived from
 * them, rather than only the page that was edited.
 */

export const settingsSchema = z.object({
  // No displayName: the name is profile presentation, handled by
  // `domains/profile`. Keeping it here would mean two forms that both write it.
  timeZone: z.string().trim().min(1, "Zona waktu wajib dipilih."),
  locale: z.enum(SUPPORTED_LOCALES),
  currency: z.string().trim().length(3, "Kode mata uang 3 huruf."),
  weekStartsOn: z.coerce.number().int().min(0).max(1),
  themePreference: z.enum(["system", "light", "dark"]),
});

/**
 * Revalidates every surface whose numbers depend on a preference.
 *
 * A narrow revalidation would leave Today and Progress showing figures computed
 * under the previous setting until the next navigation.
 */
function revalidateEverything() {
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/money");
  revalidatePath("/progress");
  revalidatePath("/journal");
  revalidatePath("/settings");
}

export const updateSettingsAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const data = parseOrThrow(settingsSchema, input, "Periksa kembali pengaturan.");

  // An unknown zone would silently shift every calendar day, so it is rejected
  // rather than stored and discovered later.
  if (!isSupportedTimeZone(data.timeZone)) {
    throw errors.validation("Zona waktu tidak dikenali.", {
      timeZone: "Pilih zona waktu dari daftar.",
    });
  }

  const currency = data.currency.toUpperCase();
  if (!isSupportedCurrency(currency)) {
    throw errors.validation(`Mata uang ${currency} belum didukung.`, {
      currency: "Pilih mata uang dari daftar.",
    });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      timeZone: data.timeZone,
      locale: data.locale,
      currency,
      weekStartsOn: data.weekStartsOn,
      themePreference: data.themePreference,
    },
  });

  revalidateEverything();
  return { ok: true };
});
