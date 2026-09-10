import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

/**
 * Program and program-participant persistence (docs/DATABASE_SCHEMA.md §26–§27).
 *
 * Every program read is scoped to the organization that owns it. Participant
 * views are assembled here with a single scoped SQL query so organization
 * endpoints never scan other tenants' records (docs/SECURITY_SPEC.md §15–§17).
 */

export type ProgramStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface ProgramRow {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  status: ProgramStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProgramInput {
  organizationId: string;
  name: string;
  description: string;
  startDate?: Date | null | undefined;
  endDate?: Date | null | undefined;
  status?: ProgramStatus | undefined;
}

export interface ProgramParticipantRow {
  id: string;
  programId: string;
  userId: string;
  joinedAt: Date;
}

/**
 * Organization-facing participant view. `lastActivityAt` is the most recent
 * "meaningful activity" timestamp (docs/SCORING_LOGIC.md §44): profile update,
 * experience, AI assessment, roadmap task, challenge submission, evidence,
 * passport generation, or skill update - otherwise the enrollment date.
 */
export interface ParticipantViewRow {
  programParticipantId: string;
  userId: string;
  firstName: string;
  lastName: string;
  joinedAt: Date;
  lastActivityAt: Date;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function insertProgram(db: Db, input: CreateProgramInput): Promise<ProgramRow> {
  const row = await queryRow<ProgramRow>(
    db,
    `INSERT INTO "programs" ("organizationId", "name", "description", "startDate", "endDate", "status")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.organizationId,
      input.name,
      input.description,
      input.startDate ?? null,
      input.endDate ?? null,
      input.status ?? 'DRAFT',
    ],
  );
  if (row === null) {
    throw new Error('insertProgram returned no row');
  }
  return row;
}

export async function findProgramById(db: Db | undefined, programId: string): Promise<ProgramRow | null> {
  return queryRow<ProgramRow>(db ?? getPool(), 'SELECT * FROM "programs" WHERE "id" = $1', [programId]);
}

/** Scoped program lookup: a program is only returned when it belongs to the organization. */
export async function findProgramByOrganization(
  db: Db | undefined,
  programId: string,
  organizationId: string,
): Promise<ProgramRow | null> {
  return queryRow<ProgramRow>(
    db ?? getPool(),
    'SELECT * FROM "programs" WHERE "id" = $1 AND "organizationId" = $2',
    [programId, organizationId],
  );
}

export async function listProgramsByOrganization(
  db: Db | undefined,
  organizationId: string,
): Promise<ProgramRow[]> {
  const rows = await queryText<ProgramRow>(
    db ?? getPool(),
    'SELECT * FROM "programs" WHERE "organizationId" = $1 ORDER BY "createdAt" ASC',
    [organizationId],
  );
  return rows;
}

/**
 * Adds a participant to a program. Maps the documented "cannot be added twice"
 * constraint (docs/DATABASE_SCHEMA.md §27) to a 409 so a duplicate enrollment
 * is idempotently reported rather than silently swallowed.
 */
export async function insertProgramParticipant(
  db: Db,
  programId: string,
  userId: string,
): Promise<ProgramParticipantRow> {
  try {
    const row = await queryRow<ProgramParticipantRow>(
      db,
      `INSERT INTO "program_participants" ("programId", "userId")
       VALUES ($1, $2)
       RETURNING *`,
      [programId, userId],
    );
    if (row === null) {
      throw new Error('insertProgramParticipant returned no row');
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        errorCodes.RESOURCE_ALREADY_EXISTS,
        'The participant is already enrolled in this program.',
        409,
      );
    }
    throw error;
  }
}

export async function isProgramParticipant(
  db: Db | undefined,
  programId: string,
  userId: string,
): Promise<boolean> {
  const row = await queryRow<{ id: string }>(
    db ?? getPool(),
    `SELECT "id" FROM "program_participants" WHERE "programId" = $1 AND "userId" = $2 LIMIT 1`,
    [programId, userId],
  );
  return row !== null;
}

/**
 * Participants belonging to ONE program, with basic identity plus the derived
 * "last meaningful activity" timestamp. Scoped entirely by programId so a
 * caller that has been authorized for the program can never see records from
 * another tenant.
 */
/**
 * Single participant view for the detailed monitor endpoint. Scoped to the
 * program in the same way as the list query (docs/SECURITY_SPEC.md §16).
 */
export async function findProgramParticipantView(
  db: Db | undefined,
  programId: string,
  userId: string,
): Promise<ParticipantViewRow | null> {
  const rows = await queryText<ParticipantViewRow>(
    db ?? getPool(),
    `SELECT
        pp."id"        AS "programParticipantId",
        u."id"         AS "userId",
        u."firstName"  AS "firstName",
        u."lastName"   AS "lastName",
        pp."joinedAt"  AS "joinedAt",
        GREATEST(
          pp."joinedAt",
          COALESCE((SELECT MAX(cp."updatedAt")
                    FROM "career_profiles" cp
                    JOIN "participant_profiles" ppr ON ppr."id" = cp."participantProfileId"
                    WHERE ppr."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(GREATEST(e."createdAt", e."updatedAt"))
                    FROM "experiences" e
                    WHERE e."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(ca."createdAt")
                    FROM "career_analyses" ca
                    WHERE ca."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(rt."updatedAt")
                    FROM "roadmap_tasks" rt
                    JOIN "roadmaps" r ON r."id" = rt."roadmapId"
                    WHERE r."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(cs."submittedAt")
                    FROM "challenge_submissions" cs
                    WHERE cs."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(ev."createdAt")
                    FROM "evidence" ev
                    WHERE ev."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(cp2."createdAt")
                    FROM "career_passports" cp2
                    WHERE cp2."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(GREATEST(us."createdAt", us."updatedAt"))
                    FROM "user_skills" us
                    WHERE us."userId" = pp."userId"), pp."joinedAt")
        ) AS "lastActivityAt"
     FROM "program_participants" pp
     JOIN "users" u ON u."id" = pp."userId"
     WHERE pp."programId" = $1 AND pp."userId" = $2`,
    [programId, userId],
  );
  return rows[0] ?? null;
}

export async function listProgramParticipantViews(
  db: Db | undefined,
  programId: string,
): Promise<ParticipantViewRow[]> {
  const rows = await queryText<ParticipantViewRow>(
    db ?? getPool(),
    `SELECT
        pp."id"        AS "programParticipantId",
        u."id"         AS "userId",
        u."firstName"  AS "firstName",
        u."lastName"   AS "lastName",
        pp."joinedAt"  AS "joinedAt",
        GREATEST(
          pp."joinedAt",
          COALESCE((SELECT MAX(cp."updatedAt")
                    FROM "career_profiles" cp
                    JOIN "participant_profiles" ppr ON ppr."id" = cp."participantProfileId"
                    WHERE ppr."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(GREATEST(e."createdAt", e."updatedAt"))
                    FROM "experiences" e
                    WHERE e."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(ca."createdAt")
                    FROM "career_analyses" ca
                    WHERE ca."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(rt."updatedAt")
                    FROM "roadmap_tasks" rt
                    JOIN "roadmaps" r ON r."id" = rt."roadmapId"
                    WHERE r."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(cs."submittedAt")
                    FROM "challenge_submissions" cs
                    WHERE cs."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(ev."createdAt")
                    FROM "evidence" ev
                    WHERE ev."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(cp2."createdAt")
                    FROM "career_passports" cp2
                    WHERE cp2."userId" = pp."userId"), pp."joinedAt"),
          COALESCE((SELECT MAX(GREATEST(us."createdAt", us."updatedAt"))
                    FROM "user_skills" us
                    WHERE us."userId" = pp."userId"), pp."joinedAt")
        ) AS "lastActivityAt"
     FROM "program_participants" pp
     JOIN "users" u ON u."id" = pp."userId"
     WHERE pp."programId" = $1
     ORDER BY u."lastName" ASC, u."firstName" ASC`,
    [programId],
  );
  return rows;
}