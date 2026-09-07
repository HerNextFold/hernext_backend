import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export interface CareerAnalysisRow {
  id: string;
  userId: string;
  experienceId: string;
  aiImpactScore: number;
  impactLevel: 'LOW' | 'MODERATE' | 'HIGH';
  automationTasks: string[];
  augmentedTasks: string[];
  humanStrengths: string[];
  emergingSkills: string[];
  explanation: string;
  createdAt: Date;
}

export interface TransferableSkillRow {
  id: string;
  userId: string;
  skillId: string;
  sourceExperienceId: string | null;
  reason: string;
  confidence: number;
  createdAt: Date;
}

export async function insertCareerAnalysis(
  db: Db,
  input: {
    userId: string;
    experienceId: string;
    aiImpactScore: number;
    impactLevel: CareerAnalysisRow['impactLevel'];
    automationTasks: string[];
    augmentedTasks: string[];
    humanStrengths: string[];
    emergingSkills: string[];
    explanation: string;
  },
): Promise<CareerAnalysisRow> {
  const row = await queryRow<CareerAnalysisRow>(
    db,
    `INSERT INTO "career_analyses"
       ("userId", "experienceId", "aiImpactScore", "impactLevel",
        "automationTasks", "augmentedTasks", "humanStrengths", "emergingSkills", "explanation")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
     RETURNING *`,
    [
      input.userId,
      input.experienceId,
      input.aiImpactScore,
      input.impactLevel,
      JSON.stringify(input.automationTasks),
      JSON.stringify(input.augmentedTasks),
      JSON.stringify(input.humanStrengths),
      JSON.stringify(input.emergingSkills),
      input.explanation,
    ],
  );
  if (row === null) {
    throw new Error('insertCareerAnalysis returned no row');
  }
  return row;
}

export async function findLatestAnalysis(
  db: Db | undefined,
  userId: string,
  experienceId: string,
): Promise<CareerAnalysisRow | null> {
  return queryRow<CareerAnalysisRow>(
    db ?? getPool(),
    'SELECT * FROM "career_analyses" WHERE "userId" = $1 AND "experienceId" = $2 ORDER BY "createdAt" DESC LIMIT 1',
    [userId, experienceId],
  );
}

export async function replaceTransferableSkills(
  db: Db,
  userId: string,
  sourceExperienceId: string,
  items: Array<{ skillId: string; reason: string; confidence: number }>,
): Promise<void> {
  await queryText(db, 'DELETE FROM "transferable_skills" WHERE "userId" = $1 AND "sourceExperienceId" = $2', [
    userId,
    sourceExperienceId,
  ]);
  for (const item of items) {
    await queryText(
      db,
      `INSERT INTO "transferable_skills"
         ("userId", "skillId", "sourceExperienceId", "reason", "confidence")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, item.skillId, sourceExperienceId, item.reason, item.confidence],
    );
  }
}

export async function listTransferableSkills(
  db: Db | undefined,
  userId: string,
): Promise<TransferableSkillRow[]> {
  return queryText<TransferableSkillRow>(
    db ?? getPool(),
    'SELECT * FROM "transferable_skills" WHERE "userId" = $1 ORDER BY "confidence" DESC, "createdAt" DESC',
    [userId],
  );
}
