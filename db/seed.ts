import { closeDb, initDb, queryText, withTransaction } from '../src/lib/db.js';
import { loadEnv } from '../src/config/env.js';
import type { Db } from '../src/lib/db.js';

/**
 * Seeds the approved HerNext career and skill catalogues with their
 * career-skill relationships (docs/DATABASE_SCHEMA.md §7, §9, §10, §34).
 *
 * Idempotent: skills/careers are matched by stable name so re-running the seed
 * never creates duplicates or resets existing rows.
 */

interface SeedSkill {
  name: string;
  category: string;
  description: string;
}

interface SeedCareer {
  name: string;
  industry: string;
  description: string;
  level: string;
  skills: Record<string, 'REQUIRED' | 'IMPORTANT' | 'NICE_TO_HAVE'>;
}

const SKILLS: SeedSkill[] = [
  { name: 'Customer Service', category: 'CUSTOMER_SERVICE', description: 'Supporting and satisfying customers through communication and service.' },
  { name: 'Transaction Processing', category: 'OPERATIONS', description: 'Executing and recording financial transactions accurately.' },
  { name: 'Cash Management', category: 'FINANCIAL', description: 'Handling, monitoring and controlling cash flows.' },
  { name: 'Financial Record Keeping', category: 'FINANCIAL', description: 'Maintaining accurate financial books and records.' },
  { name: 'Reconciliation', category: 'FINANCIAL', description: 'Comparing records to verify accuracy and resolve discrepancies.' },
  { name: 'Fraud Awareness', category: 'OPERATIONS', description: 'Recognising and mitigating fraud risks.' },
  { name: 'Excel', category: 'DATA_ANALYTICS', description: 'Using spreadsheets for data organisation and analysis.' },
  { name: 'Data Analysis', category: 'DATA_ANALYTICS', description: 'Interpreting data to inform decisions.' },
  { name: 'Financial Analysis', category: 'FINANCIAL', description: 'Analysing financial information to support decisions.' },
  { name: 'Risk Management', category: 'OPERATIONS', description: 'Identifying, assessing and controlling risks.' },
  { name: 'Digital Payments', category: 'DIGITAL', description: 'Understanding and operating electronic payment systems.' },
  { name: 'Communication', category: 'SOFT_SKILLS', description: 'Conveying information clearly and effectively.' },
  { name: 'Problem Solving', category: 'SOFT_SKILLS', description: 'Identifying and resolving issues effectively.' },
  { name: 'Attention to Detail', category: 'SOFT_SKILLS', description: 'Ensuring accuracy and thoroughness in tasks.' },
];

const CAREERS: SeedCareer[] = [
  {
    name: 'Fintech Operations Associate',
    industry: 'Financial Services',
    description: 'Manages day-to-day operations across digital financial products.',
    level: 'Entry',
    skills: {
      'Transaction Processing': 'REQUIRED',
      'Reconciliation': 'REQUIRED',
      'Customer Service': 'IMPORTANT',
      'Excel': 'REQUIRED',
      'Fraud Awareness': 'IMPORTANT',
      'Cash Management': 'IMPORTANT',
      'Digital Payments': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
    },
  },
  {
    name: 'Banking Operations Officer',
    industry: 'Financial Services',
    description: 'Oversees banking operations including accounts, records and compliance.',
    level: 'Entry',
    skills: {
      'Transaction Processing': 'REQUIRED',
      'Financial Record Keeping': 'REQUIRED',
      'Reconciliation': 'REQUIRED',
      'Customer Service': 'IMPORTANT',
      'Cash Management': 'IMPORTANT',
      'Excel': 'IMPORTANT',
      'Fraud Awareness': 'IMPORTANT',
      'Risk Management': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
    },
  },
  {
    name: 'Payments Operations Associate',
    industry: 'Financial Technology',
    description: 'Supports payment processing operations and issue resolution.',
    level: 'Entry',
    skills: {
      'Transaction Processing': 'REQUIRED',
      'Digital Payments': 'REQUIRED',
      'Reconciliation': 'IMPORTANT',
      'Customer Service': 'IMPORTANT',
      'Problem Solving': 'IMPORTANT',
      'Fraud Awareness': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
    },
  },
  {
    name: 'Financial Services Customer Success',
    industry: 'Financial Services',
    description: 'Builds relationships and helps customers succeed with financial products.',
    level: 'Entry',
    skills: {
      'Customer Service': 'REQUIRED',
      'Communication': 'REQUIRED',
      'Problem Solving': 'REQUIRED',
      'Transaction Processing': 'IMPORTANT',
      'Digital Payments': 'IMPORTANT',
      'Financial Record Keeping': 'NICE_TO_HAVE',
    },
  },
  {
    name: 'Risk Operations Associate',
    industry: 'Financial Services',
    description: 'Supports risk identification, monitoring and mitigation.',
    level: 'Entry',
    skills: {
      'Risk Management': 'REQUIRED',
      'Fraud Awareness': 'REQUIRED',
      'Data Analysis': 'IMPORTANT',
      'Excel': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
      'Problem Solving': 'IMPORTANT',
    },
  },
  {
    name: 'Fraud Operations Associate',
    industry: 'Financial Services',
    description: 'Investigates and responds to suspected fraud and transaction anomalies.',
    level: 'Entry',
    skills: {
      'Fraud Awareness': 'REQUIRED',
      'Transaction Processing': 'REQUIRED',
      'Attention to Detail': 'REQUIRED',
      'Data Analysis': 'IMPORTANT',
      'Problem Solving': 'IMPORTANT',
      'Risk Management': 'IMPORTANT',
    },
  },
  {
    name: 'Junior Financial Analyst',
    industry: 'Financial Services',
    description: 'Assists with financial modelling, reporting and analysis.',
    level: 'Junior',
    skills: {
      'Excel': 'REQUIRED',
      'Financial Analysis': 'REQUIRED',
      'Data Analysis': 'REQUIRED',
      'Financial Record Keeping': 'IMPORTANT',
      'Attention to Detail': 'IMPORTANT',
      'Communication': 'IMPORTANT',
    },
  },
  {
    name: 'Bookkeeping Associate',
    industry: 'Accounting',
    description: 'Maintains financial records and supports accurate bookkeeping.',
    level: 'Entry',
    skills: {
      'Financial Record Keeping': 'REQUIRED',
      'Reconciliation': 'REQUIRED',
      'Excel': 'IMPORTANT',
      'Transaction Processing': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
      'Cash Management': 'IMPORTANT',
    },
  },
  {
    name: 'Compliance Associate',
    industry: 'Financial Services',
    description: 'Supports compliance with regulations, policies and procedures.',
    level: 'Entry',
    skills: {
      'Risk Management': 'REQUIRED',
      'Fraud Awareness': 'IMPORTANT',
      'Attention to Detail': 'REQUIRED',
      'Financial Record Keeping': 'IMPORTANT',
      'Communication': 'IMPORTANT',
      'Excel': 'IMPORTANT',
    },
  },
  {
    name: 'Credit Analyst',
    industry: 'Financial Services',
    description: 'Assesses creditworthiness and supports lending decisions.',
    level: 'Junior',
    skills: {
      'Financial Analysis': 'REQUIRED',
      'Data Analysis': 'REQUIRED',
      'Excel': 'REQUIRED',
      'Financial Record Keeping': 'IMPORTANT',
      'Risk Management': 'IMPORTANT',
      'Attention to Detail': 'IMPORTANT',
    },
  },
];

async function seedSkills(client: Db): Promise<Map<string, string>> {
  const idByName = new Map<string, string>();
  for (const skill of SKILLS) {
    await queryText(
      client,
      `INSERT INTO "skills" ("name", "category", "description")
       VALUES ($1, $2::skill_category, $3)
       ON CONFLICT ("name") DO UPDATE SET "category" = EXCLUDED."category", "description" = EXCLUDED."description"`,
      [skill.name, skill.category, skill.description],
    );
  }
  const rows = await queryText<{ id: string; name: string }>(client, 'SELECT "id", "name" FROM "skills"');
  for (const row of rows) {
    idByName.set(row.name, row.id);
  }
  return idByName;
}

async function seedCareers(client: Db, skillIds: Map<string, string>): Promise<void> {
  for (const career of CAREERS) {
    await queryText(
      client,
      `INSERT INTO "career_paths" ("name", "industry", "description", "level")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("name") DO UPDATE SET "industry" = EXCLUDED."industry", "description" = EXCLUDED."description", "level" = EXCLUDED."level"`,
      [career.name, career.industry, career.description, career.level],
    );
    const careerRow = await queryText<{ id: string }>(
      client,
      'SELECT "id" FROM "career_paths" WHERE "name" = $1',
      [career.name],
    );
    const careerId = careerRow[0]?.id;
    if (careerId === undefined) {
      throw new Error(`Career not found after insert: ${career.name}`);
    }
    for (const [skillName, importance] of Object.entries(career.skills)) {
      const skillId = skillIds.get(skillName);
      if (skillId === undefined) {
        throw new Error(`Skill not found for career ${career.name}: ${skillName}`);
      }
      await queryText(
        client,
        `INSERT INTO "career_skills" ("careerPathId", "skillId", "importance")
         VALUES ($1, $2, $3::skill_importance)
         ON CONFLICT ("careerPathId", "skillId") DO UPDATE SET "importance" = EXCLUDED."importance"`,
        [careerId, skillId, importance],
      );
    }
  }
}

async function main(): Promise<void> {
  const config = loadEnv();
  initDb(config);
  await withTransaction(async (client) => {
    const skillIds = await seedSkills(client);
    await seedCareers(client, skillIds);
  });
  console.log('Catalogue seeded.');
  await closeDb();
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
