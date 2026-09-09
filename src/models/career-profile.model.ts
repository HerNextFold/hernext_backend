import { getPool, queryRow, queryText, type Db } from '../lib/db.js';
import type { EmploymentType } from './experience.model.js';

export interface CareerProfileRow {
  id: string;
  participantProfileId: string;
  currentOccupation: string;
  industry: string;
  yearsOfExperience: number;
  education: string | null;
  employmentType: EmploymentType;
  careerInterests: string[] | null;
  targetCareerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Loads the participant's career profile via the ParticipantProfile row.
 * Returns null when the participant has no career profile yet.
 */
export async function findCareerProfileByUserId(
  db: Db | undefined,
  userId: string,
): Promise<CareerProfileRow | null> {
  const rows = await queryText<CareerProfileRow>(
    db ?? getPool(),
    `SELECT cp.*
     FROM "career_profiles" cp
     JOIN "participant_profiles" pp ON pp."id" = cp."participantProfileId"
     WHERE pp."userId" = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface SaveCareerProfileInput {
  participantProfileId: string;
  currentOccupation: string;
  industry: string;
  yearsOfExperience: number;
  education: string | null;
  employmentType: EmploymentType;
  careerInterests: string[] | null;
  targetCareerId: string | null;
}

/**
 * Creates or replaces the participant's career profile in one upsert. Relies on
 * the UNIQUE ("participantProfileId") constraint added by migration 003, which
 * enforces the documented 1:1 relationship between ParticipantProfile and
 * CareerProfile (docs/DATABASE_SCHEMA.md §5).
 */
export async function upsertCareerProfile(
  db: Db,
  input: SaveCareerProfileInput,
): Promise<CareerProfileRow> {
  const row = await queryRow<CareerProfileRow>(
    db,
    `INSERT INTO "career_profiles"
       ("participantProfileId", "currentOccupation", "industry", "yearsOfExperience",
        "education", "employmentType", "careerInterests", "targetCareerId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ("participantProfileId") DO UPDATE SET
       "currentOccupation" = EXCLUDED."currentOccupation",
       "industry" = EXCLUDED."industry",
       "yearsOfExperience" = EXCLUDED."yearsOfExperience",
       "education" = EXCLUDED."education",
       "employmentType" = EXCLUDED."employmentType",
       "careerInterests" = EXCLUDED."careerInterests",
       "targetCareerId" = EXCLUDED."targetCareerId",
       "updatedAt" = now()
     RETURNING *`,
    [
      input.participantProfileId,
      input.currentOccupation,
      input.industry,
      input.yearsOfExperience,
      input.education,
      input.employmentType,
      input.careerInterests,
      input.targetCareerId,
    ],
  );
  if (row === null) {
    throw new Error('upsertCareerProfile returned no row');
  }
  return row;
}
