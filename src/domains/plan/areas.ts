import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import { areaCreateSchema, areaUpdateSchema } from "./schemas";
import type { Area } from "@/generated/prisma/client";

/**
 * Area service.
 *
 * Areas are the top of the plan hierarchy and the dimension the Progress
 * screen groups by. They are user-defined: nothing in the domain logic depends
 * on a particular area existing.
 */

export type AreaWithCounts = Area & {
  _count: { goals: number; projects: number; tasks: number; habits: number };
};

export async function listAreas(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AreaWithCounts[]> {
  const areas = await db.area.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      _count: {
        select: { goals: true, projects: true, tasks: true, habits: true },
      },
    },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return areas as AreaWithCounts[];
}

export async function getArea(userId: string, areaId: string): Promise<Area> {
  const area = await db.area.findFirst({ where: { id: areaId, userId } });
  if (!area) throw errors.notFound("Area");
  return area;
}

export async function createArea(userId: string, input: unknown): Promise<Area> {
  const data = parseOrThrow(areaCreateSchema, input, "Periksa kembali data area.");

  const duplicate = await db.area.findFirst({
    where: { userId, name: data.name },
    select: { id: true },
  });
  if (duplicate) {
    throw errors.conflict(`Area "${data.name}" sudah ada.`);
  }

  // New areas go to the end of the user's existing ordering.
  const last = await db.area.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return db.area.create({
    data: {
      userId,
      name: data.name,
      description: data.description ?? null,
      colorToken: data.colorToken,
      iconName: data.iconName ?? null,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateArea(
  userId: string,
  areaId: string,
  input: unknown,
): Promise<Area> {
  await assertOwned("area", areaId, userId, "Area");
  const data = parseOrThrow(areaUpdateSchema, input, "Periksa kembali data area.");

  if (data.name) {
    const duplicate = await db.area.findFirst({
      where: { userId, name: data.name, id: { not: areaId } },
      select: { id: true },
    });
    if (duplicate) throw errors.conflict(`Area "${data.name}" sudah ada.`);
  }

  return db.area.update({
    where: { id: areaId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.colorToken !== undefined ? { colorToken: data.colorToken } : {}),
      ...(data.iconName !== undefined ? { iconName: data.iconName ?? null } : {}),
    },
  });
}

/**
 * Archives an area.
 *
 * Refuses while the area still holds live work: archiving an area whose goals
 * are active would hide them from every screen without the user noticing.
 */
export async function archiveArea(userId: string, areaId: string): Promise<Area> {
  await assertOwned("area", areaId, userId, "Area");

  const [goals, projects, habits] = await Promise.all([
    db.goal.count({ where: { areaId, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] } } }),
    db.project.count({ where: { areaId, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] } } }),
    db.habit.count({ where: { areaId, archivedAt: null } }),
  ]);

  if (goals + projects + habits > 0) {
    throw errors.conflict(
      `Area ini masih punya ${goals} tujuan, ${projects} proyek dan ${habits} kebiasaan aktif. Pindahkan atau arsipkan dulu.`,
    );
  }

  return db.area.update({
    where: { id: areaId },
    data: { archivedAt: new Date() },
  });
}

export async function restoreArea(userId: string, areaId: string): Promise<Area> {
  await assertOwned("area", areaId, userId, "Area");
  return db.area.update({ where: { id: areaId }, data: { archivedAt: null } });
}

/** Reorders areas to match the given id sequence. */
export async function reorderAreas(userId: string, orderedIds: string[]): Promise<void> {
  const owned = await db.area.findMany({
    where: { userId, id: { in: orderedIds } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((a) => a.id));

  await db.$transaction(
    orderedIds
      .filter((id) => ownedSet.has(id))
      .map((id, index) =>
        db.area.update({ where: { id }, data: { position: index } }),
      ),
  );
}
