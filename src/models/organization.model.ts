import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import { getPool, queryRow, queryText, withTransaction, type Db } from '../lib/db.js';

/**
 * Organization persistence (docs/DATABASE_SCHEMA.md §25–§27).
 *
 * Organizations are separate tenants: every service query that resolves
 * organization-scoped data returns it joined to, or checked against, the
 * authenticated user's organization membership (docs/SECURITY_SPEC.md §15–§16).
 */

export type OrganizationRole = 'ADMIN' | 'MEMBER';

export interface OrganizationRow {
  id: string;
  name: string;
  description: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  description: string;
  country: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** Creates a member row, mapping a duplicate membership to an ownership error. */
export async function insertOrganizationMember(
  db: Db,
  input: { organizationId: string; userId: string; role: OrganizationRole },
): Promise<OrganizationMemberRow> {
  try {
    const row = await queryRow<OrganizationMemberRow>(
      db,
      `INSERT INTO "organization_members" ("organizationId", "userId", "role")
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.userId, input.role],
    );
    if (row === null) {
      throw new Error('insertOrganizationMember returned no row');
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        errorCodes.RESOURCE_ALREADY_EXISTS,
        'The user is already a member of this organization.',
        409,
      );
    }
    throw error;
  }
}

/** Creates an organization together with its founding member in one transaction. */
export async function createOrganizationWithFounder(
  input: CreateOrganizationInput & { founderUserId: string },
): Promise<{ organization: OrganizationRow; member: OrganizationMemberRow }> {
  return withTransaction(async (client) => {
    const organization = await queryRow<OrganizationRow>(
      client,
      `INSERT INTO "organizations" ("name", "description", "country")
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.description, input.country],
    );
    if (organization === null) {
      throw new Error('createOrganization returned no row');
    }
    const member = await insertOrganizationMember(client, {
      organizationId: organization.id,
      userId: input.founderUserId,
      role: 'ADMIN',
    });
    return { organization, member };
  });
}

export async function findOrganizationById(
  db: Db | undefined,
  organizationId: string,
): Promise<OrganizationRow | null> {
  return queryRow<OrganizationRow>(
    db ?? getPool(),
    'SELECT * FROM "organizations" WHERE "id" = $1',
    [organizationId],
  );
}

/**
 * The authenticated user's membership in an organization, if any. This is the
 * only acceptable source of organization identity - never a client-supplied
 * organization id (docs/SECURITY_SPEC.md §18, docs/API_CONTRACT.md §48).
 */
export async function findOrganizationMembership(
  db: Db | undefined,
  organizationId: string,
  userId: string,
): Promise<OrganizationMemberRow | null> {
  return queryRow<OrganizationMemberRow>(
    db ?? getPool(),
    'SELECT * FROM "organization_members" WHERE "organizationId" = $1 AND "userId" = $2',
    [organizationId, userId],
  );
}

export async function findOrganizationIdForUser(
  db: Db | undefined,
  userId: string,
): Promise<string | null> {
  const row = await queryRow<{ organizationId: string }>(
    db ?? getPool(),
    'SELECT "organizationId" FROM "organization_members" WHERE "userId" = $1 ORDER BY "createdAt" ASC LIMIT 1',
    [userId],
  );
  return row?.organizationId ?? null;
}

/** Uses the program's owning organization to derive membership (program-scoped routes). */
export async function findMembershipForProgram(
  db: Db | undefined,
  programId: string,
  userId: string,
): Promise<OrganizationMemberRow | null> {
  return queryRow<OrganizationMemberRow>(
    db ?? getPool(),
    `SELECT om.*
     FROM "programs" p
     JOIN "organization_members" om ON om."organizationId" = p."organizationId"
     WHERE p."id" = $1 AND om."userId" = $2`,
    [programId, userId],
  );
}

export async function deleteOrganizationMember(
  db: Db | undefined,
  organizationId: string,
  userId: string,
): Promise<void> {
  await queryText(
    db ?? getPool(),
    'DELETE FROM "organization_members" WHERE "organizationId" = $1 AND "userId" = $2',
    [organizationId, userId],
  );
}