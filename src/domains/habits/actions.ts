"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import * as habits from "./service";

/**
 * Habit server actions.
 *
 * Every write revalidates Today, the habit list and Progress, because a single
 * completion changes the daily view, the habit's own metrics and the monthly
 * consistency figure at once.
 */

function revalidateHabits() {
  revalidatePath("/today");
  revalidatePath("/plan/habits");
  revalidatePath("/progress");
}

export const createHabitAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const habit = await habits.createHabit(user.id, input);
  revalidateHabits();
  return habit;
});

export const updateHabitAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const habit = await habits.updateHabit(user.id, id, rest);
    revalidateHabits();
    return habit;
  },
);

/**
 * Toggles a habit for a calendar day.
 *
 * `date` defaults to the user's today, so the Today screen does not have to
 * compute it — and cannot compute it wrongly for the user's time zone.
 */
export const toggleHabitAction = defineAction(
  async (input: { habitId: string; date?: string; completed: boolean; value?: number }) => {
    const user = await requireUser();

    const date = input.date ?? habitsToday(user.timeZone);

    const result = await habits.setHabitCompletion(user.id, {
      habitId: input.habitId,
      date,
      completed: input.completed,
      value: input.value,
    });

    revalidateHabits();
    return result;
  },
);

export const archiveHabitAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const habit = await habits.archiveHabit(user.id, input.id);
  revalidateHabits();
  return habit;
});

export const deleteHabitAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await habits.deleteHabit(user.id, input.id);
  revalidateHabits();
  return { id: input.id };
});

function habitsToday(timeZone: string): string {
  // Reuses the same zone-aware conversion the rest of the app uses, so a
  // completion cannot land on the wrong day.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}
