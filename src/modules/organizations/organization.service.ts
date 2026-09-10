import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool } from '../../lib/db.js';
import {
  createOrganizationWithFounder,
  findOrganizationById,
  findOrganizationMembership,
  type OrganizationRole,
  type OrganizationRow,
} from '../../models/organization.model.js';

/**
 * Organization lifecycle. Every read is authorized from the authenticated
 * user's membership - the client can never gain access by supplying an
 * organization id (docs/SECURITY_SPEC.md §15–§18, docs/API_CONTRACT.md §48).
 */

export interface OrganizationView {
  id: string;
  name: string;
  description: string;
  country: string;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
}

function toView(organization: OrganizationRow, role: OrganizationRole): OrganizationView {
  return {
    id: organization.id,
    name: organization.name,
    description: organization.description,
    country: organization.country,
    role,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

export class OrganizationService {
  /**
   * Creates an organization and makes the authenticated user its founding
   * ADMIN in a single transaction (docs/API_CONTRACT.md §33).
   */
  async createOrganization(userId: string, input: {
    name: string;
    description: string;
    country: string;
  }): Promise<OrganizationView> {
    const { organization } = await createOrganizationWithFounder({
      ...input,
      founderUserId: userId,
    });
    return toView(organization, 'ADMIN');
  }

  /** Returns an organization the authenticated user belongs to (docs/API_CONTRACT.md §34). */
  async getOrganization(userId: string, organizationId: string): Promise<OrganizationView> {
    const membership = await findOrganizationMembership(getPool(), organizationId, userId);
    if (membership === null) {
      throw new AppError(
        errorCodes.ORGANIZATION_ACCESS_DENIED,
        'You do not belong to this organization.',
        403,
      );
    }

    const organization = await findOrganizationById(getPool(), organizationId);
    if (organization === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Organization not found', 404);
    }

    return toView(organization, membership.role);
  }
}