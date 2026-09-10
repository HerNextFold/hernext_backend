import bcrypt from 'bcrypt';
import { loadEnv } from '../src/config/env.js';
import { closeDb, initDb, queryRow, queryText, withTransaction, type Db } from '../src/lib/db.js';
import { calculateAiImpactScore, impactLevelForScore } from '../src/lib/scoring/ai-impact.js';
import type { EmploymentType } from '../src/models/experience.model.js';
import { insertExperience } from '../src/models/experience.model.js';
import { insertParticipantProfile, insertUser } from '../src/models/user.model.js';
import { insertCareerAnalysis } from '../src/models/ai.model.js';
import { insertRoadmap, insertRoadmapTask, type RoadmapPhase } from '../src/models/roadmap.model.js';
import { upsertUserSkill } from '../src/models/user-skill.model.js';
import { createOrganizationWithFounder, type OrganizationRole } from '../src/models/organization.model.js';
import { insertProgram, insertProgramParticipant } from '../src/models/program.model.js';
import { seedCatalogues } from './seed.js';

/**
 * Seeds an opt-in demo ORGANIZATION for the demo (docs/AGENTS.md §35, §34).
 *
 * NOT part of the normal participant demo (`npm run db:seed:demo`). This script
 * demonstrates the organization-side journey: a demo org with an admin and a
 * view-only member, one timed program, and three participants whose monitoring
 * statuses exercise the deterministic rules in SCORING_LOGIC.md §36–§41:
 *
 *   Amina Yusuf   - ON_TRACK      (roadmap ahead of the program timeline)
 *   Ngozi Okafor  - NEEDS_ATTENTION (roadmap 11 points behind expectation)
 *   Fatima Bello  - AT_RISK       (no roadmap at all, 67 points behind)
 *
 * Idempotent: catalogue seeds run first; the demo organization is created only
 * when it does not already exist, so re-running never duplicates demo data.
 */

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'AishaDemo123!';
const SALT_ROUNDS = 10;

const DEMO_ORGANIZATION_NAME = 'HerNext Demo Academy';
const DEMO_ADMIN_EMAIL = 'themba.demo@hernext.africa';
const DEMO_MEMBER_EMAIL = 'hafsa.demo@hernext.africa';

interface DemoParticipant {
  email: string;
  firstName: string;
  lastName: string;
  story: string;
  skills: string[];
  roadmapCompletion: number | null;
}

const DEMO_PARTICIPANTS: DemoParticipant[] = [
  {
    email: 'amina.demo@hernext.africa',
    firstName: 'Amina',
    lastName: 'Yusuf',
    story:
      'Runs a busy POS kiosk, records every sale, reconciles cash against card and transfer totals nightly and handles customer refunds. Started improving her spreadsheet and digital payments skills.',
    skills: ['Excel', 'Digital Payments', 'Reconciliation'],
    roadmapCompletion: 7,
  },
  {
    email: 'ngozi.demo@hernext.africa',
    firstName: 'Ngozi',
    lastName: 'Okafor',
    story:
      'Manages a small distribution ledger for a family business. Reconciles supplier statements and resolves payment discrepancies, but has not started structured skill building yet.',
    skills: ['Financial Record Keeping', 'Reconciliation', 'Customer Service'],
    roadmapCompletion: 5,
  },
  {
    email: 'fatima.demo@hernext.africa',
    firstName: 'Fatima',
    lastName: 'Bello',
    story:
      'Operates a POS terminal for a cooperative, keeping handwritten records. Has completed her AI assessment but has no career roadmap, so she is far behind where she should be.',
    skills: ['Transaction Processing', 'Cash Management'],
    roadmapCompletion: null,
  },
];

const DEMO_SKILL_AREA = 'Fintech Operations Associate';

function assertRequired(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Required catalogue row missing: ${label}. Run npm run db:seed first.`);
  }
  return value;
}

/** Dates for the program timeline: 60 days elapsed of a 90-day program. */
function programDates(): { startDate: Date; endDate: Date } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    startDate: new Date(now - 60 * day),
    endDate: new Date(now + 30 * day),
  };
}

async function seedDemoUser(client: Db, email: string, firstName: string, lastName: string) {
  const existing = await queryRow<{ id: string }>(client, 'SELECT "id" FROM "users" WHERE "email" = $1', [email]);
  if (existing !== null) {
    return existing.id;
  }
  const user = await insertUser(client, {
    email,
    passwordHash: bcrypt.hashSync(DEMO_PASSWORD, SALT_ROUNDS),
    firstName,
    lastName,
    role: 'PARTICIPANT',
    country: 'Nigeria',
  });
  await insertParticipantProfile(client, user.id);
  return user.id;
}

async function seedParticipantJourney(
  client: Db,
  participant: DemoParticipant,
  skillIds: Map<string, string>,
  targetCareerId: string,
): Promise<string> {
  const userId = await seedDemoUser(client, participant.email, participant.firstName, participant.lastName);

  const experience = await insertExperience(client, {
    userId,
    title: 'POS Business Owner',
    description: participant.story,
    organization: 'My POS Kiosk',
    years: 4,
    employmentType: 'INFORMAL_WORKER' as EmploymentType,
  });

  const automationTasks = ['Recording daily transactions', 'Manual ledger entry', 'Balancing cash against recorded sales'];
  const augmentedTasks = ['Transaction monitoring', 'Customer payment resolution', 'Reconciliation review'];
  const humanStrengths = ['Customer relationship management', 'Resolving payment disputes'];
  await insertCareerAnalysis(client, {
    userId,
    experienceId: experience.id,
    aiImpactScore: calculateAiImpactScore({
      automationCount: automationTasks.length,
      augmentedCount: augmentedTasks.length,
      humanCount: humanStrengths.length,
    }),
    impactLevel: impactLevelForScore(
      calculateAiImpactScore({
        automationCount: automationTasks.length,
        augmentedCount: augmentedTasks.length,
        humanCount: humanStrengths.length,
      }),
    ),
    automationTasks,
    augmentedTasks,
    humanStrengths,
    emergingSkills: ['Excel for analysis', 'Digital payment tools', 'Fraud awareness'],
    explanation:
      'Routine record-keeping is automatable, while customer interaction and problem-solving remain human-value tasks that AI augments.',
  });

  for (const skillName of participant.skills) {
    await upsertUserSkill(client, {
      userId,
      skillId: assertRequired(skillIds.get(skillName), skillName),
      source: 'AI_DERIVED',
      confidence: 0.85,
      proficiency: 0.85,
    });
  }

  if (participant.roadmapCompletion !== null) {
    await seedRoadmap(client, userId, targetCareerId, participant.roadmapCompletion, skillIds);
  }

  return userId;
}

async function seedRoadmap(
  client: Db,
  userId: string,
  careerPathId: string,
  completedCount: number,
  skillIds: Map<string, string>,
): Promise<void> {
  const roadmap = await insertRoadmap(client, {
    userId,
    careerPathId,
    title: 'Your Roadmap to Fintech Operations Associate',
    description:
      'Build on transaction and cash management strengths while developing the digital skills fintech operations teams expect.',
  });

  const phases: RoadmapPhase[] = ['DAY_30', 'DAY_60', 'DAY_90'];
  const titles = [
    'Excel fundamentals',
    'Build a daily sales tracker',
    'Learn digital payment basics',
    'Fraud red flags',
    'Transaction monitoring practice',
    'Data analysis with spreadsheets',
    'Reconciliation at scale',
    'Payment exceptions workflow',
    'Audit your digital payments habits',
  ];
  const descriptions = [
    'Complete a guided course on formulas, sorting and basic formatting.',
    'Recreate your ledger in a spreadsheet with totals and a daily summary.',
    'Review how card, transfer and wallet payments settle.',
    'Read about common payment fraud scenarios and red flags.',
    'Practice spotting anomalies in sample transaction batches.',
    'Summarise a sample dataset with pivot tables.',
    'Reconcile a multi-day sample ledger against bank records.',
    'Map how you would handle a failed payment end to end.',
    'Document the payment tools and security practices fintechs expect.',
  ];

  for (let index = 0; index < titles.length; index += 1) {
    const phase = phases[Math.floor(index / 3)] as RoadmapPhase;
    const order = (index % 3) + 1;
    const skillName = [...skillIds.keys()][index % skillIds.size] as string;
    const task = await insertRoadmapTask(client, {
      roadmapId: roadmap.id,
      phase,
      title: titles[index] as string,
      description: descriptions[index] as string,
      skillId: assertRequired(skillIds.get(skillName), skillName),
      estimatedMinutes: 90,
      order,
    });
    const isCompleted = index < completedCount;
    if (isCompleted) {
      await queryText(
        client,
        `UPDATE "roadmap_tasks" SET "status" = 'COMPLETED', "completedAt" = now() WHERE "id" = $1`,
        [task.id],
      );
    }
  }
}

async function main(): Promise<void> {
  const config = loadEnv();
  initDb(config);
  await withTransaction(async (client) => {
    await seedCatalogues(client);

    const existingOrg = await queryRow<{ id: string }>(
      client,
      'SELECT "id" FROM "organizations" WHERE "name" = $1',
      [DEMO_ORGANIZATION_NAME],
    );
    if (existingOrg !== null) {
      console.log(`Demo organization "${DEMO_ORGANIZATION_NAME}" already exists. Skipping demo org seeding.`);
      return;
    }

    const { organization } = await createOrganizationWithFounder({
      name: DEMO_ORGANIZATION_NAME,
      description: 'Demo organization exercising participant monitoring, analytics and reports.',
      country: 'Nigeria',
      founderUserId: await seedDemoUser(client, DEMO_ADMIN_EMAIL, 'Themba', 'Okoye'),
    });

    const memberId = await seedDemoUser(client, DEMO_MEMBER_EMAIL, 'Hafsa', 'Ali');
    await queryText(
      client,
      `INSERT INTO "organization_members" ("organizationId", "userId", "role")
       VALUES ($1, $2, $3)
       ON CONFLICT ("organizationId", "userId") DO NOTHING`,
      [organization.id, memberId, 'MEMBER' as OrganizationRole],
    );

    const dates = programDates();
    const program = await insertProgram(client, {
      organizationId: organization.id,
      name: 'Fintech Operations Career Accelerator',
      description: 'A 90-day transition program for operations roles.',
      startDate: dates.startDate,
      endDate: dates.endDate,
      status: 'ACTIVE',
    });

    const skillIds = new Map<string, string>();
    const skills = await queryText<{ id: string; name: string }>(client, 'SELECT "id", "name" FROM "skills"');
    for (const skill of skills) {
      skillIds.set(skill.name, skill.id);
    }
    const career = await queryRow<{ id: string }>(
      client,
      'SELECT "id" FROM "career_paths" WHERE "name" = $1',
      [DEMO_SKILL_AREA],
    );
    const careerId = assertRequired(career?.id, DEMO_SKILL_AREA);

    for (const participant of DEMO_PARTICIPANTS) {
      const userId = await seedParticipantJourney(client, participant, skillIds, careerId);
      await insertProgramParticipant(client, program.id, userId);
    }
  });
  console.log(
    `Demo organization seeded. Admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_PASSWORD} (member: ${DEMO_MEMBER_EMAIL}).`,
  );
  await closeDb();
}

main().catch((error: unknown) => {
  console.error('Demo org seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});