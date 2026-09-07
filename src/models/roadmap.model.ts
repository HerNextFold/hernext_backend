import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export type RoadmapPhase = 'DAY_30' | 'DAY_60' | 'DAY_90';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

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
