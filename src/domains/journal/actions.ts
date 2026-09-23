"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import * as journal from "./service";

/**
 * Journal server actions.
 *
 * Revalidation covers Today, because the Today screen embeds the day's entry
 * and its mood/energy figures — saving a reflection must update the screen the
 * user just came from.
 */

function revalidateJournal(date?: string) {
  revalidatePath("/today");
  revalidatePath("/journal");
  revalidatePath("/journal/timeline");
  if (date) revalidatePath(`/journal/${date}`);
  revalidatePath("/progress");
}

export const saveJournalAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const entry = await journal.saveJournalEntry(user.id, input);
  revalidateJournal(entry.date.toISOString().slice(0, 10));
  return { id: entry.id, date: entry.date.toISOString().slice(0, 10) };
});

export const deleteJournalAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await journal.deleteJournalEntry(user.id, input.id);
  revalidateJournal();
  return { id: input.id };
});

export const createLifeEventAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const event = await journal.createLifeEvent(user.id, input);
  revalidateJournal(event.date.toISOString().slice(0, 10));
  return event;
});

export const updateLifeEventAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const event = await journal.updateLifeEvent(user.id, id, rest);
    revalidateJournal();
    return event;
  },
);

export const deleteLifeEventAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await journal.deleteLifeEvent(user.id, input.id);
  revalidateJournal();
  return { id: input.id };
});
