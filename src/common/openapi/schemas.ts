/**
 * Shared OpenAPI/JSON-Schema building blocks (Phase 5C).
 *
 * Fastify route `schema` metadata is documentation-only. Request validation is
 * always performed by Zod in the controllers (via `parseOrThrow`); the swagger
 * plugin installs a pass-through validator compiler so these JSON Schemas never
 * run as Ajv validators. Kept in sync with the Zod schemas in the modules and
 * with docs/API_CONTRACT.md.
 */

export type JsonSchema = Record<string, unknown>;

/** OpenAPI security requirement attached to every authenticated route. */
export const bearerAuth: Array<{ bearerAuth: [] }> = [{ bearerAuth: [] }];

/** The documented error envelope (docs/API_CONTRACT.md §3). */
export const errorResponseSchema: JsonSchema = {
  type: 'object',
  required: ['success', 'error'],
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: false },
    error: {
      type: 'object',
      required: ['code', 'message'],
      additionalProperties: false,
      properties: {
        code: { type: 'string', description: 'Stable application error code (docs/API_CONTRACT.md §44)' },
        message: { type: 'string', description: 'Human-readable safe error message' },
        details: {
          type: ['array', 'object'],
          description: 'Machine-readable validation details when applicable (array of Zod issues, or an object for domain errors)',
        },
      },
    },
  },
};

/** Wraps endpoint data in the documented success envelope. */
export function envelope(data: JsonSchema): JsonSchema {
  return {
    type: 'object',
    required: ['success', 'data'],
    additionalProperties: false,
    properties: {
      success: { type: 'boolean', const: true },
      data,
      message: { type: 'string', description: 'Optional human-readable message' },
    },
  };
}

export function okResponse(description: string, data: JsonSchema): JsonSchema {
  return { description, content: { 'application/json': { schema: envelope(data) } } };
}

export function errResponse(description: string): JsonSchema {
  return { description, content: { 'application/json': { schema: errorResponseSchema } } };
}

export function bodySchema(description: string, schema: JsonSchema, example?: unknown): JsonSchema {
  return {
    description,
    required: true,
    // `examples` is placed inside the schema because @fastify/swagger only
    // promotes schema-level examples to the media-type object during
    // serialization.
    content: { 'application/json': { schema: { ...schema, ...(example === undefined ? {} : { examples: [example] }) } } },
  };
}

export function uuidSchema(description = 'A UUID identifier'): JsonSchema {
  return { type: 'string', format: 'uuid', description };
}

/** Params schema for a `/:id`-style route holding a single UUID. */
export function idParams(paramName: string, description = 'Entity id'): JsonSchema {
  return {
    type: 'object',
    required: [paramName],
    additionalProperties: false,
    properties: { [paramName]: uuidSchema(description) },
  };
}

/** Params schema for `/passport/public/:slug`-style routes. */
export function slugParams(paramName: string, pattern: string, description: string): JsonSchema {
  return {
    type: 'object',
    required: [paramName],
    additionalProperties: false,
    properties: {
      [paramName]: {
        type: 'string',
        minLength: 1,
        maxLength: 120,
        pattern,
        description,
      },
    },
  };
}

export function querystring(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    required,
    additionalProperties: false,
    properties,
  };
}

/* ---------- Documented enum values (aligned with Zod + models) ---------- */

export const USER_ROLES = ['PARTICIPANT', 'ORGANIZATION_ADMIN', 'ORGANIZATION_MEMBER'] as const;
export const EMPLOYMENT_TYPES = [
  'EMPLOYED',
  'SELF_EMPLOYED',
  'FREELANCER',
  'STUDENT',
  'UNEMPLOYED',
  'INFORMAL_WORKER',
] as const;
export const TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export const CHALLENGE_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const SUBMISSION_STATUSES = ['PENDING', 'PASSED', 'FAILED'] as const;
export const IMPACT_LEVELS = ['LOW', 'MODERATE', 'HIGH'] as const;
export const READINESS_LABELS = ['Opportunity Ready', 'Developing', 'Building Foundations', 'Early Stage'] as const;
export const SKILL_GAP_STATUSES = ['HAS_SKILL', 'NEEDS_DEVELOPMENT'] as const;
export const GAP_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const SKILL_SOURCES = ['SELF_REPORTED', 'AI_DERIVED', 'CHALLENGE', 'VERIFIED'] as const;

/* ---------- Shared response sub-models ---------- */

export const publicUserSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'firstName', 'lastName', 'email', 'country', 'role', 'emailVerified'],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    country: { type: 'string' },
    role: { type: 'string', enum: [...USER_ROLES] },
    emailVerified: { type: 'boolean', description: 'False until the registration email OTP is proven' },
  },
};

export const experienceViewSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'title', 'description', 'organization', 'years', 'employmentType', 'startDate', 'endDate', 'createdAt', 'updatedAt'],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    title: { type: 'string' },
    description: { type: 'string' },
    organization: { type: ['string', 'null'] },
    years: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
    startDate: { type: ['string', 'null'], format: 'date-time' },
    endDate: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const impactSnapshotSchema: JsonSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100, description: 'AI Impact score (docs/SCORING_LOGIC.md)' },
    level: { type: 'string', enum: [...IMPACT_LEVELS] },
  },
};

export const readinessSnapshotSchema: JsonSchema = {
  type: 'object',
  required: ['score', 'label', 'breakdown'],
  additionalProperties: false,
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    label: { type: 'string', enum: [...READINESS_LABELS] },
    breakdown: {
      type: 'object',
      required: ['experience', 'skills', 'aiReadiness', 'evidence'],
      additionalProperties: false,
      properties: {
        experience: { type: 'number', minimum: 0, maximum: 100 },
        skills: { type: 'number', minimum: 0, maximum: 100 },
        aiReadiness: { type: 'number', minimum: 0, maximum: 100 },
        evidence: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
  },
};