import bcrypt from 'bcrypt';
import { loadEnv } from '../src/config/env.js';
import { closeDb, initDb, queryRow, queryText, withTransaction } from '../src/lib/db.js';
import type { Db } from '../src/lib/db.js';
import { calculateAiImpactScore, impactLevelForScore } from '../src/lib/scoring/ai-impact.js';
import {
  insertExperience,
  type EmploymentType,
} from '../src/models/experience.model.js';
import {
  insertParticipantProfile,
  insertUser,
} from '../src/models/user.model.js';
import { upsertCareerProfile } from '../src/models/career-profile.model.js';
import {
  insertCareerAnalysis,
  replaceTransferableSkills,
} from '../src/models/ai.model.js';
import { insertRoadmap, insertRoadmapTask } from '../src/models/roadmap.model.js';
import { upsertUserSkill } from '../src/models/user-skill.model.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { UnconfiguredProvider } from '../src/modules/ai/providers/llm.provider.js';
import { seedCatalogues } from './seed.js';

/**
 * Seeds the example participant journey used for the demo
 * (docs/AGENTS.md §35, docs/PRODUCT_SPEC.md §29).
 *
 * Aisha Abdullah, POS Business Owner with 4 years of experience in Financial
 * Services (Informal Worker). Her AI Discovered skills and the backend-owned
 * scores (AI impact, career match, skill gaps) demonstrate the full journey.
 *
 * Idempotent: the catalogue seed runs first; the demo user is created only when
 * it does not already exist, so re-running never duplicates demo data or
 * resurrects an edited demo account.
 */

const DEMO_EMAIL = 'aisha.demo@hernext.africa';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'AishaDemo123!';
const SALT_ROUNDS = 10;
const DEMO_ROLE = 'PARTICIPANT' as const;

interface SkillRef {
  name: string;
  confidence: number;
  reason: string;
}

/** Skills her POS experience demonstrates (docs/AGENTS.md §35). */
const DEMO_TRANSFERABLE_SKILLS: SkillRef[] = [
  {
    name: 'Transaction Processing',
    confidence: 0.95,
    reason: 'Recorded and processed customer transactions daily on the POS terminal.',
  },
  {
    name: 'Cash Management',
    confidence: 0.9,
    reason: 'Managed daily cash flows, float and reconciliations.',
  },
  {
    name: 'Financial Record Keeping',
    confidence: 0.92,
    reason: 'Kept manual ledgers of every sale and expense.',
  },
  {
    name: 'Customer Service',
    confidence: 0.9,
    reason: 'Resolved customer payment issues face to face.',
  },
  {
    name: 'Reconciliation',
    confidence: 0.85,
    reason: 'Balanced card and transfer totals against cash each evening.',
  },
  {
    name: 'Problem Solving',
    confidence: 0.8,
    reason: 'Investigated failed and disputed transactions.',
  },
  {
    name: 'Attention to Detail',
    confidence: 0.88,
    reason: 'Checked every transaction for accuracy before closing.',
  },
];

function assertRequired(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Required catalogue row missing: ${label}. Run npm run db:seed first.`);
  }
  return value;
}

async function seedDemoUser(client: Db): Promise<void> {
  const existing = await queryRow<{ id: string }>(
    client,
    'SELECT "id" FROM "users" WHERE "email" = $1',
    [DEMO_EMAIL],
  );
  if (existing !== null) {
    console.log(`Demo user ${DEMO_EMAIL} already exists. Skipping demo seeding.`);
    return;
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, SALT_ROUNDS);
  const user = await insertUser(client, {
    email: DEMO_EMAIL,
    passwordHash,
    firstName: 'Aisha',
    lastName: 'Abdullah',
    role: DEMO_ROLE,
    country: 'Nigeria',
  });
  const participant = await insertParticipantProfile(client, user.id);

  // Career profile: Aisha wants to move from her informal POS business into a
  // formal fintech operations role (docs/PRODUCT_SPEC.md §8 maps "desired
  // career" to targetCareerId).
  const target = await queryRow<{ id: string }>(
    client,
    'SELECT "id" FROM "career_paths" WHERE "name" = $1',
    ['Fintech Operations Associate'],
  );
  const targetCareerId = assertRequired(target?.id, 'Fintech Operations Associate');

  await upsertCareerProfile(client, {
    participantProfileId: participant.id,
    currentOccupation: 'POS Business Owner',
    industry: 'Financial Services',
    yearsOfExperience: 4,
    education: 'Secondary School Certificate',
    employmentType: 'INFORMAL_WORKER' as EmploymentType,
    careerInterests: ['Fintech operations', 'Digital payments', 'Customer operations'],
    targetCareerId,
  });

  const experience = await insertExperience(client, {
    userId: user.id,
    title: 'POS Business Owner',
    description:
      'Ran a Point of Sale terminal business. Recorded daily transactions and kept manual ledgers, reconciled card and transfer totals against cash each evening, balanced the float, resolved customer payment issues, and chased discrepancies before closing.',
    organization: 'My POS Kiosk',
    years: 4,
    employmentType: 'INFORMAL_WORKER' as EmploymentType,
  });

  // AI Impact Assessment with a backend-owned score (docs/SCORING_LOGIC.md §4).
  const automationTasks = ['Recording daily transactions', 'Manual ledger entry', 'Balancing cash against recorded sales'];
  const augmentedTasks = ['Transaction monitoring', 'Customer payment resolution', 'Reconciliation review'];
  const humanStrengths = ['Customer relationship management', 'Resolving payment disputes'];
  const emergingSkills = ['Excel for analysis', 'Digital payment tools', 'Fraud awareness'];

  await insertCareerAnalysis(client, {
    userId: user.id,
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
    emergingSkills,
    explanation:
      'Many of Aisha’s routine record-keeping tasks can be automated, but her customer interaction and problem-solving strengths are human-value tasks that AI augments rather than replaces.',
  });

  // Transferable skills + AI_DERIVED user skills grounded in her experience.
  const skillIds = new Map<string, string>();
  const skills = await queryText<{ id: string; name: string }>(client, 'SELECT "id", "name" FROM "skills"');
  for (const skill of skills) {
    skillIds.set(skill.name, skill.id);
  }

  await replaceTransferableSkills(
    client,
    user.id,
    experience.id,
    DEMO_TRANSFERABLE_SKILLS.map((item) => ({
      skillId: assertRequired(skillIds.get(item.name), item.name),
      reason: item.reason,
      confidence: item.confidence,
    })),
  );
  for (const item of DEMO_TRANSFERABLE_SKILLS) {
    await upsertUserSkill(client, {
      userId: user.id,
      skillId: assertRequired(skillIds.get(item.name), item.name),
      source: 'AI_DERIVED',
      confidence: item.confidence,
      proficiency: item.confidence,
    });
  }

  const aiService = new AiService(new UnconfiguredProvider());
  await aiService.runCareerRecommendations(user.id, client);
  await aiService.runSkillGaps(user.id, targetCareerId, client);

  // 30/60/90 roadmap targeting her education gaps (Excel, Fraud Awareness,
  // Digital Payments). Some 30-day tasks are completed so progress/readiness
  // scores demonstrate movement.
  await seedDemoRoadmap(client, user.id, targetCareerId, skillIds);
}

async function seedDemoRoadmap(
  client: Db,
  userId: string,
  careerPathId: string,
  skillIds: Map<string, string>,
): Promise<void> {
  const roadmap = await insertRoadmap(client, {
    userId,
    careerPathId,
    title: 'Your Roadmap to Fintech Operations Associate',
    description:
      'Build on your transaction and cash management strengths while developing the digital skills fintech operations teams expect.',
  });

  const day30 = [
    {
      title: 'Excel fundamentals',
      description: 'Complete a guided course on formulas, sorting and basic formatting.',
      skillName: 'Excel',
      estimatedMinutes: 180,
      status: 'COMPLETED' as const,
    },
    {
      title: 'Build a daily sales tracker',
      description: 'Recreate your ledger in a spreadsheet with totals and a daily summary.',
      skillName: 'Excel',
      estimatedMinutes: 120,
      status: 'COMPLETED' as const,
    },
    {
      title: 'Learn digital payment basics',
      description: 'Review how card, transfer and wallet payments settle.',
      skillName: 'Digital Payments',
      estimatedMinutes: 90,
      status: 'IN_PROGRESS' as const,
    },
  ];
  const day60 = [
    {
      title: 'Fraud red flags',
      description: 'Read about common payment fraud scenarios and red flags.',
      skillName: 'Fraud Awareness',
      estimatedMinutes: 60,
      status: 'NOT_STARTED' as const,
    },
    {
      title: 'Transaction monitoring practice',
      description: 'Practice spotting anomalies in sample transaction batches.',
      skillName: 'Fraud Awareness',
      estimatedMinutes: 120,
      status: 'NOT_STARTED' as const,
    },
    {
      title: 'Data analysis with spreadsheets',
      description: 'Summarise a sample dataset with pivot tables.',
      skillName: 'Data Analysis',
      estimatedMinutes: 150,
      status: 'NOT_STARTED' as const,
    },
  ];
  const day90 = [
    {
      title: 'Reconciliation at scale',
      description: 'Reconcile a multi-day sample ledger against bank records.',
      skillName: 'Reconciliation',
      estimatedMinutes: 120,
      status: 'NOT_STARTED' as const,
    },
    {
      title: 'Payment exceptions workflow',
      description: 'Map how you would handle a failed payment end to end.',
      skillName: 'Problem Solving',
      estimatedMinutes: 90,
      status: 'NOT_STARTED' as const,
    },
    {
      title: 'Audit your digital payments habits',
      description: 'Document the payment tools and security practices fintechs expect.',
      skillName: 'Digital Payments',
      estimatedMinutes: 90,
      status: 'NOT_STARTED' as const,
    },
  ];

  const tasks = [
    { phase: 'DAY_30' as const, items: day30 },
    { phase: 'DAY_60' as const, items: day60 },
    { phase: 'DAY_90' as const, items: day90 },
  ];
  for (const group of tasks) {
    let order = 1;
    for (const task of group.items) {
      await insertRoadmapTask(client, {
        roadmapId: roadmap.id,
        phase: group.phase,
        title: task.title,
        description: task.description,
        skillId: assertRequired(skillIds.get(task.skillName), task.skillName),
        estimatedMinutes: task.estimatedMinutes,
        order,
      });
      if (task.status === 'COMPLETED' || task.status === 'IN_PROGRESS') {
        await queryText(
          client,
          `UPDATE "roadmap_tasks"
           SET "status" = $1,
               "completedAt" = ${task.status === 'COMPLETED' ? 'now()' : 'NULL'},
               "updatedAt" = now()
           WHERE "roadmapId" = $2 AND "order" = $3 AND "phase" = $4`,
          [task.status, roadmap.id, order, group.phase],
        );
      }
      order += 1;
    }
  }
}

async function main(): Promise<void> {
  const config = loadEnv();
  initDb(config);
  await withTransaction(async (client) => {
    await seedCatalogues(client);
    await seedDemoUser(client);
  });
  console.log(`Demo journey seeded. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await closeDb();
}

main().catch((error: unknown) => {
  console.error('Demo seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});