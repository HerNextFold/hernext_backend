import { getPool, queryText, type Db } from '../lib/db.js';
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
