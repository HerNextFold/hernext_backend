import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool } from '../../lib/db.js';
import {
  findOrganizationById,
  findOrganizationMembership,
  findMembershipForProgram,
  type OrganizationMemberRow,
} from '../../models/organization.model.js';
import {
  findProgramById,
  insertProgram,
  insertProgramParticipant,
  listProgramsByOrganization,
  listProgramParticipantViews,
  type ProgramRow,
  type ProgramStatus,
} from '../../models/program.model.js';
import { findUserById } from '../../models/user.model.js';
import { buildParticipantMonitors, type MonitorContext } from './program-monitor.js';

/**
 * Program lifecycle and participant enrollment. Every program-scoped operation
 * is authorized through the authenticated user's organization membership and
 * the program-to-organization relationship before any data is returned
 * (docs/SECURITY_SPEC.md §15–§16, docs/API_CONTRACT.md §48).
 */

export interface ProgramView {
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

export interface ProgramParticipantSummary {
  id: string;
  name: string;
  readinessScore: number;
  roadmapProgress: number;
  status: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK';
}

export interface AddParticipantResult {
  programId: string;
  userId: string;
  joinedAt: Date;
}

export interface ProgramAccess {
  program: ProgramRow;
  membership: OrganizationMemberRow;
}

function toProgramView(program: ProgramRow): ProgramView {
  return {
    id: program.id,
    organizationId: program.organizationId,
    name: program.name,
    description: program.description,
    startDate: program.startDate,
    endDate: program.endDate,
    status: program.status,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}

/**
 * Resolves a program and the caller's membership in its owning organization.
 * A missing program is a 404; any program without an authorized membership is
 * a 403 - callers can never probe another tenant's programs (docs/API_CONTRACT.md §48).
 */
export async function resolveProgramAccess(programId: string, userId: string): Promise<ProgramAccess> {
  const program = await findProgramById(getPool(), programId);
  if (program === null) {
    throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Program not found', 404);
  }
  const membership = await findMembershipForProgram(getPool(), programId, userId);
  if (membership === null) {
    throw new AppError(
      errorCodes.PROGRAM_ACCESS_DENIED,
      'You do not have access to this program.',
      403,
    );
  }
  return { program, membership };
}

export function requireAdminRole(membership: OrganizationMemberRow): void {
  if (membership.role !== 'ADMIN') {
    throw new AppError(
      errorCodes.FORBIDDEN,
      'Organization admin role is required for this action.',
      403,
    );
  }
}

export class ProgramService {
  /** Creates a program inside an organization (admin required, docs/API_CONTRACT.md §35). */
  async createProgram(
    userId: string,
    organizationId: string,
    input: {
      name: string;
      description: string;
      startDate?: string | undefined;
      endDate?: string | undefined;
      status?: ProgramStatus | undefined;
    },
  ): Promise<ProgramView> {
    const membership = await findOrganizationMembership(getPool(), organizationId, userId);
    if (membership === null) {
      throw new AppError(
        errorCodes.ORGANIZATION_ACCESS_DENIED,
        'You do not belong to this organization.',
        403,
      );
    }
    requireAdminRole(membership);

    const organization = await findOrganizationById(getPool(), organizationId);
    if (organization === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Organization not found', 404);
    }

    const program = await insertProgram(getPool(), {
      organizationId: organization.id,
      name: input.name,
      description: input.description,
      startDate: input.startDate === undefined ? null : new Date(input.startDate),
      endDate: input.endDate === undefined ? null : new Date(input.endDate),
      status: input.status,
    });
    return toProgramView(program);
  }

  /** Lists programs of an organization the authenticated user belongs to (docs/API_CONTRACT.md §36). */
  async listPrograms(userId: string, organizationId: string): Promise<ProgramView[]> {
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
    const programs = await listProgramsByOrganization(getPool(), organizationId);
    return programs.map(toProgramView);
  }

  /**
   * Enrolls a participant into a program (admin required, docs/API_CONTRACT.md §37).
   * The participant must be an existing user; duplicates are rejected.
   */
  async addParticipant(
    userId: string,
    programId: string,
    participantUserId: string,
  ): Promise<AddParticipantResult> {
    const { program, membership } = await resolveProgramAccess(programId, userId);
    requireAdminRole(membership);

    const participant = await findUserById(getPool(), participantUserId);
    if (participant === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Participant user not found.', 404);
    }

    const row = await insertProgramParticipant(getPool(), program.id, participant.id);
    return { programId: row.programId, userId: row.userId, joinedAt: row.joinedAt };
  }

  /**
   * Organization-facing participant summaries for a program
   * (docs/API_CONTRACT.md §38). Status is deterministic backend classification.
   */
  async listParticipants(userId: string, programId: string): Promise<ProgramParticipantSummary[]> {
    await resolveProgramAccess(programId, userId);
    const contexts = await this.loadMonitorContext(userId, programId);
    const monitors = await buildParticipantMonitors(contexts);
    return monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      readinessScore: monitor.readinessScore,
      roadmapProgress: monitor.roadmapProgress,
      status: monitor.status,
    }));
  }

  /** Shared monitor inputs for a program the caller is authorized for. */
  async loadMonitorContext(userId: string, programId: string): Promise<MonitorContext> {
    const { program } = await resolveProgramAccess(programId, userId);
    const views = await listProgramParticipantViews(getPool(), program.id);
    const now = new Date();
    return { program, views, now };
  }
}