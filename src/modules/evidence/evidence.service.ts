import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool } from '../../lib/db.js';
import { findOwnedEvidence, listEvidenceForUser, type EvidenceStatus } from '../../models/evidence.model.js';

export interface EvidenceItem {
  id: string;
  challengeId: string | null;
  skillId: string | null;
  skillName: string | null;
  title: string;
  description: string;
  result: string;
  status: EvidenceStatus;
  createdAt: Date;
}

function toItem(row: {
  id: string;
  challengeId: string | null;
  skillId: string | null;
  skillName: string | null;
  title: string;
  description: string;
  result: string;
  status: EvidenceStatus;
  createdAt: Date;
}): EvidenceItem {
  return {
    id: row.id,
    challengeId: row.challengeId,
    skillId: row.skillId,
    skillName: row.skillName,
    title: row.title,
    description: row.description,
    result: row.result,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export class EvidenceService {
  /** Every evidence item owned by the authenticated participant. */
  async list(userId: string): Promise<EvidenceItem[]> {
    const rows = await listEvidenceForUser(getPool(), userId);
    return rows.map(toItem);
  }

  /**
   * Loads one evidence item only when it is owned by the participant. Returns
   * a 404 for missing or other people's rows so nothing about another user's
   * data leaks (docs/SECURITY_SPEC.md §14).
   */
  async getById(userId: string, evidenceId: string): Promise<EvidenceItem> {
    const row = await findOwnedEvidence(getPool(), evidenceId, userId);
    if (row === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Evidence not found', 404);
    }
    return toItem(row);
  }
}