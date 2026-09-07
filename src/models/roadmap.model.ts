import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export type RoadmapPhase = 'DAY_30' | 'DAY_60' | 'DAY_90';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type RoadmapTaskStatus = TaskStatus;

export interface RoadmapRow {
  id: string;
  userId: string;
  careerPathId: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapTaskRow {
  id: string;
  roadmapId: string;
  phase: RoadmapPhase;
  title: string;
  description: string;
  skillId: string | null;
  estimatedMinutes: number | null;
  order: number;
  status: TaskStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapWithTasks {
  roadmap: RoadmapRow;
  tasks: RoadmapTaskRow[];
}

export async function insertRoadmap(
  db: Db,
  input: { userId: string; careerPathId: string; title: string; description: string },
): Promise<RoadmapRow> {
  const row = await queryRow<RoadmapRow>(
    db,
    `INSERT INTO "roadmaps" ("userId", "careerPathId", "title", "description")
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.userId, input.careerPathId, input.title, input.description],
  );
  if (row === null) {
    throw new Error('insertRoadmap returned no row');
  }
  return row;
}

export async function insertRoadmapTask(
  db: Db,
  input: {
    roadmapId: string;
    phase: RoadmapPhase;
    title: string;
    description: string;
    skillId: string | null;
    estimatedMinutes: number | null;
    order: number;
  },
): Promise<RoadmapTaskRow> {
  const row = await queryRow<RoadmapTaskRow>(
    db,
    `INSERT INTO "roadmap_tasks"
       ("roadmapId", "phase", "title", "description", "skillId", "estimatedMinutes", "order")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.roadmapId, input.phase, input.title, input.description, input.skillId, input.estimatedMinutes, input.order],
  );
  if (row === null) {
    throw new Error('insertRoadmapTask returned no row');
  }
  return row;
}

export function groupTasksByPhase(tasks: RoadmapTaskRow[]): Record<RoadmapPhase, RoadmapTaskRow[]> {
  return tasks.reduce<Record<RoadmapPhase, RoadmapTaskRow[]>>(
    (acc, task) => {
      acc[task.phase].push(task);
      return acc;
    },
    { DAY_30: [], DAY_60: [], DAY_90: [] },
  );
}

/**
 * Returns the most recently created roadmap for a user, or null when none
 * exists. Used by progress/next-action services that treat an absent roadmap as
 * an incomplete journey step rather than an error.
 */
export async function findLatestRoadmapWithTasks(
  db: Db | undefined,
  userId: string,
): Promise<RoadmapWithTasks | null> {
  const pool = db ?? getPool();
  const roadmap = await queryRow<RoadmapRow>(
    pool,
    'SELECT * FROM "roadmaps" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [userId],
  );
  if (roadmap === null) {
    return null;
  }
  const tasks = await queryText<RoadmapTaskRow>(
    pool,
    'SELECT * FROM "roadmap_tasks" WHERE "roadmapId" = $1 ORDER BY "phase", "order"',
    [roadmap.id],
  );
  return { roadmap, tasks };
}

/**
 * Returns the most recently created roadmap for a user, with its tasks. Throws
 * RESOURCE_NOT_FOUND when the user has no roadmap.
 */
export async function findCurrentRoadmapWithTasks(
  db: Db | undefined,
  userId: string,
): Promise<RoadmapWithTasks> {
  const pool = db ?? getPool();
  const roadmap = await queryRow<RoadmapRow>(
    pool,
    'SELECT * FROM "roadmaps" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [userId],
  );
  if (roadmap === null) {
    throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'No roadmap has been generated yet.', 404);
  }
  const tasks = await queryText<RoadmapTaskRow>(
    pool,
    `SELECT * FROM "roadmap_tasks" WHERE "roadmapId" = $1 ORDER BY "phase", "order"`,
    [roadmap.id],
  );
  return { roadmap, tasks };
}

export async function findRoadmapById(
  db: Db | undefined,
  id: string,
  userId: string,
): Promise<RoadmapWithTasks | null> {
  const pool = db ?? getPool();
  const roadmap = await queryRow<RoadmapRow>(
    pool,
    'SELECT * FROM "roadmaps" WHERE "id" = $1 AND "userId" = $2',
    [id, userId],
  );
  if (roadmap === null) {
    return null;
  }
  const tasks = await queryText<RoadmapTaskRow>(
    pool,
    'SELECT * FROM "roadmap_tasks" WHERE "roadmapId" = $1 ORDER BY "phase", "order"',
    [roadmap.id],
  );
  return { roadmap, tasks };
}

export async function countUserRoadmaps(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "roadmaps" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Loads a single roadmap task only when it belongs to a roadmap owned by the
 * user. Returns null when the task does not exist or belongs to another user
 * (ownership enforced in the query to prevent IDOR - docs/SECURITY_SPEC.md §14).
 */
export async function findOwnedTask(
  db: Db | undefined,
  taskId: string,
  userId: string,
): Promise<RoadmapTaskRow | null> {
  return queryRow<RoadmapTaskRow>(
    db ?? getPool(),
    `SELECT t.*
     FROM "roadmap_tasks" t
     JOIN "roadmaps" r ON r."id" = t."roadmapId"
     WHERE t."id" = $1 AND r."userId" = $2`,
    [taskId, userId],
  );
}

/**
 * Updates a task's status (completing/clearing `completedAt` accordingly) only
 * when it belongs to a roadmap owned by the user. Returns null when the task is
 * missing or not owned.
 */
export async function updateTaskStatus(
  db: Db,
  taskId: string,
  userId: string,
  status: TaskStatus,
): Promise<RoadmapTaskRow | null> {
  const completedAtSql =
    status === 'COMPLETED' ? 'now()' : 'NULL';
  return queryRow<RoadmapTaskRow>(
    db,
    `UPDATE "roadmap_tasks" AS t
       SET "status" = $1,
           "completedAt" = ${completedAtSql},
           "updatedAt" = now()
     FROM "roadmaps" AS r
     WHERE t."id" = $2 AND r."id" = t."roadmapId" AND r."userId" = $3
     RETURNING t.*`,
    [status, taskId, userId],
  );
}

/** Loads an owned task within the same roadmap (for progress recompute after update). */
export async function findTasksForTask(
  db: Db | undefined,
  taskId: string,
  userId: string,
): Promise<RoadmapTaskRow[] | null> {
  const task = await findOwnedTask(db, taskId, userId);
  if (task === null) {
    return null;
  }
  return queryText<RoadmapTaskRow>(
    db ?? getPool(),
    'SELECT * FROM "roadmap_tasks" WHERE "roadmapId" = $1 ORDER BY "phase", "order"',
    [task.roadmapId],
  );
}
