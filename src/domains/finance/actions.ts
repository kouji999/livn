"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import * as finance from "./service";

/**
 * Finance server actions.
 *
 * Every write invalidates the whole money surface plus Today, because a single
 * transaction changes the ledger, the account balances, the month summary and
 * the Today headline figure at once.
 */

function revalidateMoney() {
  revalidatePath("/money");
  revalidatePath("/money/transactions");
  revalidatePath("/money/accounts");
  revalidatePath("/money/budgets");
  revalidatePath("/money/savings");
  revalidatePath("/today");
  revalidatePath("/progress");
}

// ───────────────────────────────────────────────────────────────── accounts ──

export const createAccountAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const account = await finance.createAccount(user.id, input);
  revalidateMoney();
  return account;
});

export const updateAccountAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const account = await finance.updateAccount(user.id, id, rest);
    revalidateMoney();
    return account;
  },
);

export const closeAccountAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const account = await finance.closeAccount(user.id, input.id);
  revalidateMoney();
  return account;
});

// ───────────────────────────────────────────────────────────── transactions ──

export const createTransactionAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const transaction = await finance.createTransaction(user.id, input);
  revalidateMoney();
  return transaction;
});

export const updateTransactionAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const transaction = await finance.updateTransaction(user.id, id, rest);
    revalidateMoney();
    return transaction;
  },
);

export const reverseTransactionAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const reversal = await finance.reverseTransaction(user.id, input.id);
  revalidateMoney();
  return reversal;
});
