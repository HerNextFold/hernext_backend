# HerNext — API Contract

**Project:** HerNext
**Backend:** Node.js + TypeScript + Fastify
**Database:** PostgreSQL / Neon
**API Version:** v1
**Base Path:** `/api/v1`

---

# 1. API Design Principles

The HerNext API follows these rules:

1. All API endpoints use `/api/v1`.
2. JSON is the default request and response format.
3. Protected endpoints require authentication.
4. Authorization is enforced by the backend.
5. Users can only access resources they own or are explicitly authorized to access.
6. Organization admins can only access their own organization and its programs/participants.
7. AI-generated data must be validated before being persisted.
8. Business calculations are performed by the backend, not trusted from the frontend or AI.
9. API responses use a consistent response envelope.
10. Validation errors must be explicit and machine-readable.
11. IDs are UUIDs.
12. Dates are returned as ISO 8601 strings.
13. Sensitive information must never be returned unnecessarily.

---

# 2. Base URL

Development:

```text
http://localhost:5000/api/v1
```

Production:

```text
<deployment-url>/api/v1
```

---

# 3. Response Format

## Success

```json
{
  "success": true,
  "data": {}
}
```

## Success with message

```json
{
  "success": true,
  "data": {},
  "message": "Profile updated successfully"
}
```

## Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": []
  }
}
```

---

# 4. HTTP Status Codes

Use standard HTTP status codes.

| Status | Usage                                    |
| ------ | ---------------------------------------- |
| 200    | Successful request                       |
| 201    | Resource created                         |
| 204    | Successful request with no response body |
| 400    | Bad request                              |
| 401    | Unauthenticated                          |
| 403    | Authenticated but unauthorized           |
| 404    | Resource not found                       |
| 409    | Conflict                                 |
| 422    | Validation/business-rule failure         |
| 429    | Rate limit exceeded                      |
| 500    | Internal server error                    |
| 503    | External dependency unavailable          |

> Statuses actually emitted today: `200`, `201`, `400`, `401`, `403`, `404`,
> `409`, `422`, `429`, `500`, `503`. `204` is reserved for future no-body
> responses and is not currently returned. `422` is used when structured AI
> output cannot be validated; `503` is used when the AI provider is
> unavailable.

---

# 5. Authentication

## POST `/auth/register`

Creates a new user account.

### Request

```json
{
  "firstName": "Aisha",
  "lastName": "Abdullah",
  "email": "aisha@example.com",
  "password": "SecurePassword123!",
  "country": "Nigeria",
  "role": "PARTICIPANT"
}
```

### Rules

* Email must be valid.
* Email must be unique.
* Password must satisfy minimum security requirements.
* Password must be hashed before storage.
* Participant registration creates a `ParticipantProfile`.
* Users must not be able to arbitrarily create privileged organization-admin accounts unless the product explicitly allows it.

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "firstName": "Aisha",
      "lastName": "Abdullah",
      "email": "aisha@example.com",
      "role": "PARTICIPANT",
      "country": "Nigeria"
    },
    "accessToken": "token"
  }
}
```

Never return `passwordHash`.

---

# 6. POST `/auth/login`

Authenticates a user.

### Request

```json
{
  "email": "aisha@example.com",
  "password": "SecurePassword123!"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "firstName": "Aisha",
      "lastName": "Abdullah",
      "email": "aisha@example.com",
      "role": "PARTICIPANT"
    },
    "accessToken": "token"
  }
}
```

Invalid credentials should return a generic authentication error.

Do not reveal whether an email exists.

---

# 7. POST `/auth/logout`

Logs out the authenticated user.

### Authentication

Required.

### Response

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

If refresh tokens/sessions are persisted, revoke the active session.

---

# 8. GET `/auth/me`

Returns the currently authenticated user.

### Authentication

Required.

### Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "firstName": "Aisha",
    "lastName": "Abdullah",
    "email": "aisha@example.com",
    "country": "Nigeria",
    "role": "PARTICIPANT"
  }
}
```

---

# 9. POST `/auth/forgot-password`

Requests a password reset.

### Request

```json
{
  "email": "aisha@example.com"
}
```

### Response

Always return a generic success message to prevent account enumeration.

```json
{
  "success": true,
  "message": "If an account exists, password reset instructions have been sent."
}
```

For the hackathon MVP, email delivery may be mocked if a real email provider is not available.

#### Development-only reset token

When the backend runs outside `production`, the response additionally returns the
raw one-time token so demo/QA flows can complete the reset without an email
provider. The raw token is never returned in production, persisted, or logged.

```json
{
  "success": true,
  "message": "If an account exists, password reset instructions have been sent.",
  "data": {
    "resetToken": "dev-only-token"
  }
}
```

---

# 10. POST `/auth/reset-password`

Resets a password using a valid reset token.

### Request

```json
{
  "token": "reset-token",
  "password": "NewSecurePassword123!"
}
```

### Response

```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

# 11. Career Profile

## GET `/profile`

Returns the authenticated participant's career profile.

### Authentication

Required.

### Response

```json
{
  "success": true,
  "data": {
    "currentOccupation": "POS Business Owner",
    "industry": "Financial Services",
    "yearsOfExperience": 4,
    "education": "Secondary School",
    "employmentType": "INFORMAL_WORKER",
    "careerInterests": [
      "Fintech",
      "Banking Operations"
    ],
    "targetCareer": null
  }
}
```

---

# 12. PUT `/profile`

Creates or updates the participant's career profile.

### Request

```json
{
  "currentOccupation": "POS Business Owner",
  "industry": "Financial Services",
  "yearsOfExperience": 4,
  "education": "Secondary School",
  "employmentType": "INFORMAL_WORKER",
  "careerInterests": [
    "Fintech",
    "Banking Operations"
  ]
}
```

### Response

Returns the saved career profile.

---

# 13. Experiences

## POST `/experiences`

Creates a real-world experience.

### Request

```json
{
  "title": "POS Business Owner",
  "description": "I run a POS business where I process customer transactions, manage cash, keep daily records and resolve payment issues.",
  "organization": null,
  "years": 4,
  "employmentType": "INFORMAL_WORKER",
  "startDate": "2022-01-01"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "POS Business Owner",
    "description": "...",
    "employmentType": "INFORMAL_WORKER"
  }
}
```

---

## GET `/experiences`

Returns the user's experiences.

---

## GET `/experiences/:id`

Returns one experience.

The user must own the experience.

---

## PUT `/experiences/:id`

Updates an experience.

---

## DELETE `/experiences/:id`

Deletes an experience.

The backend must verify ownership before deletion.

---

# 14. AI Career Intelligence

AI endpoints are authenticated and operate on participant-owned data.

---

# 15. POST `/ai/career-impact/:experienceId`

Analyzes how AI may affect the participant's current work for a specific
experience.

### Path Parameter

```text
experienceId  the UUID of an experience owned by the authenticated user
```

### Query Parameters

Optional:

```text
regenerate=true   force a new AI analysis instead of reusing the saved result
```

### Processing

```text
Request
  ↓
Authentication
  ↓
Ownership check
  ↓
Load experience/profile
  ↓
AI Service
  ↓
Structured JSON
  ↓
Schema validation
  ↓
Business validation
  ↓
Calculate/normalize impact score
  ↓
Save CareerAnalysis
  ↓
Return result
```

The saved analysis is reused when the experience has not changed since it was
created (no AI call, avoids rate limits). `regenerate=true` always computes a
new assessment.

### Response

```json
{
  "success": true,
  "data": {
    "score": 58,
    "level": "MODERATE",
    "automationTasks": [
      "Routine transaction record entry"
    ],
    "augmentedTasks": [
      "Transaction monitoring",
      "Record keeping"
    ],
    "humanStrengths": [
      "Customer relationship management",
      "Problem solving"
    ],
    "emergingSkills": [
      "Digital payment tools",
      "Fraud awareness"
    ],
    "explanation": "..."
  }
}
```

The score must not be presented as a scientific prediction of job loss.

---

# 15a. GET `/ai/career-impact/:experienceId`

Returns the most recent saved Career Impact Assessment for the authenticated
participant's given experience.

### Path Parameter

```text
experienceId  the UUID of an experience owned by the authenticated user
```

### Processing

```text
Request
  ↓
Authentication
  ↓
Ownership check
  ↓
Load latest saved CareerAnalysis
  ↓
Return result
```

This endpoint performs no AI call - it reads the most recently persisted
assessment so the frontend can re-render the result without re-running the
(often rate-limited) AI generation. It returns `404 RESOURCE_NOT_FOUND` when no
assessment has been saved for that experience.

### Response

```json
{
  "success": true,
  "data": {
    "score": 58,
    "level": "MODERATE",
    "automationTasks": [
      "Routine transaction record entry"
    ],
    "augmentedTasks": [
      "Transaction monitoring",
      "Record keeping"
    ],
    "humanStrengths": [
      "Customer relationship management",
      "Problem solving"
    ],
    "emergingSkills": [
      "Digital payment tools",
      "Fraud awareness"
    ],
    "explanation": "..."
  }
}
```

---

# 16. POST `/ai/transferable-skills/:experienceId`

Identifies professional skills demonstrated by a specific experience.

### Path Parameter

```text
experienceId  the UUID of an experience owned by the authenticated user
```

### Query Parameters

Optional:

```text
regenerate=true   force a new AI analysis instead of reusing the saved result
```

### Response

```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "skillId": "uuid",
        "skillName": "Cash Management",
        "reason": "The experience involves managing and balancing customer transactions.",
        "confidence": 0.91
      }
    ]
  }
}
```

AI-derived skills must be stored as `AI_DERIVED`. The saved transferable skills
are reused when the experience has not changed since they were created; an
explicit regenerate replaces them.

---

# 16a. GET `/ai/transferable-skills`

Returns the transferable skills persisted for the authenticated participant
without running an AI analysis. Returns an empty list when no analysis has been
saved.

### Response

Identical shape to `POST /ai/transferable-skills/:experienceId`.

---

# 17. Career Recommendations

## POST `/ai/career-recommendations`

Recalculates and persists the deterministic career match scores for the
authenticated participant.This performs no AI call - matching is backend
logic grounded in the career catalogue (docs/AI_SPEC.md §15, docs/SCORING_LOGIC.md §7).

### Response

```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "careerId": "uuid",
        "careerName": "Fintech Operations Associate",
        "matchScore": 87,
        "rank": 1,
        "reason": "Your transaction processing and customer service experience align strongly with this role."
      }
    ]
  }
}
```

## GET `/careers/recommendations`

Returns the persisted recommendations (recomputing on the fly only when none
have been saved yet). No AI call and no persistence.

### Query Parameters

Optional:

```text
limit=5
```

### Response

Identical shape to `POST /ai/career-recommendations`.

### Important

Career recommendations must come from the HerNext career catalogue.

The AI may explain recommendations but must not invent arbitrary careers.

---

# 18. Skill Gaps

## POST `/ai/skill-gaps/:careerId`

Computes and persists the skill gap for a selected career. No AI call - gaps are
derived deterministically from the user's skills versus the career's required
skills.

### Path Parameter

```text
careerId  the UUID of a career from the approved catalogue
```

### Response

```json
{
  "success": true,
  "data": {
    "career": {
      "id": "uuid",
      "name": "Fintech Operations Associate"
    },
    "skills": [
      {
        "skillId": "uuid",
        "skillName": "Transaction Processing",
        "status": "HAS_SKILL",
        "priority": "HIGH"
      },
      {
        "skillId": "uuid",
        "skillName": "Excel",
        "status": "NEEDS_DEVELOPMENT",
        "priority": "HIGH"
      }
    ]
  }
}
```

## GET `/careers/:careerId/skill-gaps`

Returns the skill gap for a selected career without persisting anything. No AI
call.

### Path Parameter

```text
careerId  the UUID of a career from the approved catalogue
```

### Response

Identical shape to `POST /ai/skill-gaps/:careerId`, including the read-only
`status`/`priority` fields described in docs/SCORING_LOGIC.md §9.

Skill status is determined from the user's skills versus the career's required skills.

---

# 19. Roadmap

## POST `/roadmaps/generate`

Generates a personalized 30/60/90-day roadmap.

### Request

```json
{
  "careerPathId": "uuid"
}
```

### Processing

```text
Career
+
User Skills
+
Skill Gaps
+
Experience
+
Career Interests
        ↓
AI Roadmap Suggestions
        ↓
Validation (3-5 tasks per phase, catalogue skill names only)
        ↓
Save Roadmap
```

When a current roadmap already exists for the same career it is reused (no AI
call); generating for a different career replaces the roadmap content in place.

### Response

```json
{
  "success": true,
  "data": {
    "roadmap": {
      "id": "uuid",
      "careerPathId": "uuid",
      "title": "Your Fintech Operations Career Roadmap",
      "description": "...",
      "createdAt": "2026-09-06T..."
    },
    "phases": {
      "DAY_30": [],
      "DAY_60": [],
      "DAY_90": []
    }
  }
}
```

## POST `/ai/roadmap/:careerId`

Same behaviour as `POST /roadmaps/generate` with the career carried as a path
parameter.

### Path Parameter

```text
careerId  the UUID of a career from the approved catalogue
```

### Query Parameters

Optional:

```text
regenerate=true   force a new AI roadmap instead of reusing the current one
```

### Response

Identical shape to `POST /roadmaps/generate`.

---

# 20. GET `/roadmaps/current`

Returns the participant's active roadmap with its 30/60/90-day tasks. No AI
call. Returns `404 RESOURCE_NOT_FOUND` when the user has no generated roadmap
yet.

### Response

```json
{
  "success": true,
  "data": {
    "roadmap": {
      "id": "uuid",
      "careerPathId": "uuid",
      "title": "Your Fintech Operations Career Roadmap",
      "description": "...",
      "createdAt": "2026-09-06T..."
    },
    "phases": {
      "DAY_30": [],
      "DAY_60": [],
      "DAY_90": []
    }
  }
}
```

---

# 20a. GET `/ai/roadmap`

Returns the most recently generated roadmap (with its 30/60/90-day tasks) for
the authenticated participant.

### Processing

```text
Request
  ↓
Authentication
  ↓
Load current roadmap + tasks
  ↓
Return result
```

This endpoint performs no AI call - it reads the persisted roadmap so the
frontend can re-render the plan without re-running the (often rate-limited) AI
generation. It returns `404 RESOURCE_NOT_FOUND` when the user has no generated
roadmap yet.

### Response

```json
{
  "success": true,
  "data": {
    "roadmap": {
      "id": "uuid",
      "careerPathId": "uuid",
      "title": "Your Fintech Operations Career Roadmap",
      "description": "...",
      "createdAt": "2026-09-06T..."
    },
    "phases": {
      "DAY_30": [],
      "DAY_60": [],
      "DAY_90": []
    }
  }
}
```

---

# 21. PATCH `/roadmaps/tasks/:taskId`

Updates a roadmap task.

### Request

```json
{
  "status": "COMPLETED"
}
```

### Rules

* Verify the task belongs to the authenticated user.
* Only valid task statuses are accepted.
* Set `completedAt` when status becomes `COMPLETED`.
* Recalculate progress from underlying tasks.

### Response

```json
{
  "success": true,
  "data": {
    "taskId": "uuid",
    "status": "COMPLETED",
    "completedAt": "2026-09-06T..."
  }
}
```

---

# 22. Progress

## GET `/progress`

Returns the participant's overall progress.

### Response

```json
{
  "success": true,
  "data": {
    "overallProgress": 75,
    "roadmapProgress": 75,
    "challengeProgress": 50,
    "evidenceCount": 2,
    "skillsDeveloped": 4,
    "skillsRemaining": 3,
    "readinessScore": 78
  }
}
```

All percentages should be calculated from source records.

---

# 23. GET `/progress/summary`

Returns dashboard-ready progress information.

### Response

```json
{
  "success": true,
  "data": {
    "currentCareerGoal": "Fintech Operations Associate",
    "careerReadiness": 78,
    "roadmapProgress": 75,
    "aiImpact": {
      "score": 58,
      "level": "MODERATE"
    },
    "skillsDeveloped": 4,
    "skillsRemaining": 3,
    "challengesCompleted": 1,
    "evidenceCreated": 1
  }
}
```

---

# 24. GET `/progress/next-action`

Returns one recommended next action.

### Response

```json
{
  "success": true,
  "data": {
    "action": "Complete the Financial Reconciliation Challenge",
    "reason": "This will help demonstrate your reconciliation and financial-record skills.",
    "type": "CHALLENGE",
    "resourceId": "uuid"
  }
}
```

The next action should be selected using deterministic backend rules based on actual incomplete work.

AI may generate wording but should not control the underlying action selection.

---

# 25. Achievements

## GET `/achievements`

Returns earned and available achievements.

### Response

```json
{
  "success": true,
  "data": {
    "achievements": [
      {
        "name": "First Skill Discovered",
        "earned": true,
        "earnedAt": "2026-09-06T..."
      }
    ]
  }
}
```

Achievement awarding is backend-controlled.

---

# 26. Challenges

## GET `/challenges`

Returns available practical challenges.

Optional query:

```text
skillId=uuid
difficulty=BEGINNER
```

### Authentication

Required. Each challenge includes its linked `skills` and the authenticated `latestAttempt` (or `null`).

---

## GET `/challenges/:id`

Returns challenge details.

### Authentication

Required. Returns a `404` for unknown challenge ids and a `400` for malformed ids.

---

# 27. POST `/challenges/:id/submit`

Submits a challenge answer.

### Request

Only documented answer fields are accepted (`strict` validation). Financial Reconciliation Challenge:

```json
{
  "answer": {
    "totalCredits": 250000,
    "totalDebits": 245000,
    "difference": 5000,
    "discrepancyFound": true,
    "explanation": "A debit of 5,000 was recorded on the statement but is missing from the ledger."
  }
}
```

Customer Payment Resolution Challenge:

```json
{
  "answer": {
    "steps": [
      "Verify the transaction status",
      "Contact the customer",
      "Check the payment gateway",
      "Push a refund to reverse the charge",
      "Confirm the outcome with the customer"
    ]
  }
}
```

Unknown answer fields, wrong shapes and unsupported challenges are rejected with `400`/`404`.

### Processing

```text
Submission
   ↓
Validate input
   ↓
Evaluate challenge (deterministic rules, docs/AI_SPEC.md §22 - no LLM)
   ↓
Calculate score
   ↓
Pass/fail (threshold 70/100)
   ↓
Save submission
   ↓
On PASSED: upsert challenge skills (source CHALLENGE) and create evidence per skill (status PENDING, deduplicated)
   ↓
Update achievements
```

### Response

```json
{
  "success": true,
  "data": {
    "submissionId": "uuid",
    "status": "PASSED",
    "score": 100,
    "feedback": "You correctly reconciled the fictional transaction data and identified the discrepancy.",
    "evidenceCreated": 4
  }
}
```

`evidenceCreated` is the number of evidence rows created by this submission (0 on a fail). Repeated passes never duplicate evidence.

---

# 28. Evidence

## GET `/evidence`

Returns the authenticated user's evidence (newest first). Requires authentication.

Example item:

```json
{
  "id": "uuid",
  "challengeId": "uuid",
  "skillId": "uuid",
  "skillName": "Reconciliation",
  "title": "Financial Reconciliation Challenge",
  "description": "Given fictional transaction data...",
  "result": "PASSED (100/100)",
  "status": "PENDING",
  "createdAt": "2026-09-08T..."
}
```

Evidence is never created empty: fresh participants receive `[]`.

## GET `/evidence/:id`

Returns one evidence item.

### Authentication & Authorization

The user must own the evidence (enforced in the query). Missing, malformed and other users' evidence ids all return the documented error - a `404` for missing/foreign ids, `400` for non-uuid ids, so no information about other participants leaks.

---

# 29. Career Passport

## GET `/passport`

Returns the authenticated user's Career Passport.

### Rules

Returns `404` when no passport has been generated yet - "generate your passport" is a real journey step. The response is the live aggregated view plus the passport row fields (`id`, `slug`, `isPublic`, `createdAt`).

---

# 30. POST `/passport/generate`

Creates or updates the participant's Career Passport.

### Request

Optional body - a passport is private by default and only becomes public through explicit opt-in (docs/SECURITY_SPEC.md §36):

```json
{
  "isPublic": true
}
```

Unknown body fields are rejected with `400`.

### Processing

The backend aggregates:

```text
User
Career Profile
Experiences
Skills
Career Goal
Readiness
Challenges
Evidence
Achievements
Roadmap Progress
```

The passport does not need an LLM to assemble the core data. The slug is stable across regenerations (a shared link never breaks), URL-safe, and contains no internal database ids. PASSPORT_READY is awarded when appropriate.

### Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "slug": "aisha-abdullah-a1b2c3",
    "isPublic": false,
    "name": "Aisha Abdullah",
    "country": "Nigeria",
    "headline": "Aspiring Fintech Operations Associate",
    "profile": {},
    "experience": [],
    "skills": [],
    "careerGoal": "Fintech Operations Associate",
    "readiness": { "score": 78, "label": "Developing", "breakdown": {} },
    "roadmapProgress": 0,
    "phaseProgress": {},
    "challenges": [],
    "evidence": [],
    "achievements": []
  }
}
```

---

# 31. GET `/passport/public/:slug`

Returns a public Career Passport.

### Authentication

Not required.

### Security

A passport is only visible publicly when the participant explicitly set `isPublic: true`. Only intentionally public information may be returned - the backend maps the full view through an explicit allowlist.

Never expose:

```text
passwordHash
email
private organization information
private program information
private analytics
internal database IDs (evidence/challenge/passport/user)
private profile fields
```

Missing and non-public slugs return the same `404` so the endpoint leaks nothing. Malformed slugs return `400`.

### Response

```json
{
  "success": true,
  "data": {
    "name": "Aisha Abdullah",
    "country": "Nigeria",
    "headline": "Aspiring Fintech Operations Associate",
    "experience": [],
    "skills": [],
    "careerGoal": "Fintech Operations Associate",
    "readiness": 78,
    "readinessLabel": "Developing",
    "roadmapProgress": 0,
    "phaseProgress": {},
    "challenges": [{ "title": "Financial Reconciliation Challenge" }],
    "evidence": [],
    "achievements": []
  }
}
```

---

# 32. Organizations

Organization endpoints require `ORGANIZATION_ADMIN` authorization unless otherwise stated.

---

# 33. POST `/organizations`

Creates an organization.

### Request

```json
{
  "name": "Women in Finance Nigeria",
  "description": "Career development program for women.",
  "country": "Nigeria"
}
```

The authenticated user becomes an organization admin/member according to the application's organization onboarding rules.

---

# 34. GET `/organizations/:organizationId`

Returns organization information.

### Authorization

The authenticated user must belong to the organization.

---

# 35. POST `/organizations/:organizationId/programs`

Creates a program.

### Request

```json
{
  "name": "Women in Fintech Career Transition Cohort",
  "description": "A 90-day career transition program.",
  "startDate": "2026-09-15",
  "endDate": "2026-12-15"
}
```

### Authorization

User must be an admin of the organization.

---

# 36. GET `/organizations/:organizationId/programs`

Returns programs belonging to the organization.

---

# 37. POST `/programs/:programId/participants`

Adds a participant to a program.

### Request

```json
{
  "userId": "uuid"
}
```

The organization must own the program.

The participant must exist.

A participant cannot be added twice.

---

# 38. GET `/programs/:programId/participants`

Returns participants belonging to the program.

### Response

```json
{
  "success": true,
  "data": {
    "participants": [
      {
        "id": "uuid",
        "name": "Aisha Abdullah",
        "readinessScore": 78,
        "roadmapProgress": 75,
        "status": "ON_TRACK"
      }
    ]
  }
}
```

Only information appropriate for the organization context should be returned.

---

# 39. GET `/programs/:programId/participants/:participantId`

Returns detailed progress for a participant in the program.

### Authorization

The participant must belong to the specified program.

The organization admin must own the program through their organization membership.

---

# 40. GET `/programs/:programId/analytics`

Returns aggregate program analytics.

### Response

```json
{
  "success": true,
  "data": {
    "totalParticipants": 100,
    "activeParticipants": 78,
    "assessmentCompletion": 82,
    "averageReadiness": 71,
    "averageRoadmapProgress": 64,
    "challengesCompleted": 145,
    "evidenceCreated": 119,
    "passportsCreated": 68
  }
}
```

Analytics are calculated from program participants.

Do not expose unnecessary individual private information.

---

# 41. GET `/programs/:programId/report`

Returns a program impact report.

### Response

```json
{
  "success": true,
  "data": {
    "program": {
      "id": "uuid",
      "name": "Women in Fintech Career Transition Cohort"
    },
    "participants": 100,
    "participationRate": 78,
    "assessmentCompletion": 82,
    "averageReadiness": 71,
    "averageRoadmapProgress": 64,
    "skillsDeveloped": [],
    "challengesCompleted": 145,
    "evidenceCreated": 119,
    "passportsCreated": 68
  }
}
```

The MVP may return JSON only. PDF export can be added later if time permits.

---

# 42. Authentication Header

Protected requests should use:

```http
Authorization: Bearer <access_token>
```

---

# 43. Validation

Use Zod schemas for request validation.

Each endpoint should validate:

```text
Params
Query
Body
```

before entering business logic.

Example:

```text
Route
 ↓
Zod validation
 ↓
Authentication
 ↓
Authorization
 ↓
Controller
 ↓
Service
```

The exact middleware/plugin order may vary according to Fastify architecture, but validation and authorization must happen before sensitive business operations.

### OpenAPI documentation (Phase 5C)

* Every API route carries an OpenAPI 3.1 `schema` block used **only for documentation**.
* The swagger plugin installs a pass-through validator compiler and a pass-through
  response serializer compiler, so Fastify/Ajv never validates request payloads
  and fast-json-stringify never strips or checks response payloads against those
  schemas. Zod (via `parseOrThrow`) remains the single runtime validation layer,
  and the error handler is the single runtime response layer. This guarantees a
  documented schema can never change runtime behaviour.
* Interactive UI is served at `/docs` (relative to the running backend); the raw
  OpenAPI document is available at `/docs/json` and `/docs/yaml`. Documented paths
  are absolute (`/api/v1/...`), so the `/docs` UI resolves them at the backend's
  own base URL.
* Protected operations declare `security: bearerAuth` and a `401` response; the
  documented bearer token is the JWT returned by `POST /auth/login` or
  `POST /auth/register`.
* Kept aligned with this contract; `tests/openapi.documentation.test.ts` verifies
  that every registered API route (including `/health`) is documented, that path
  params and request bodies are declared, and that enums match the Zod schemas.

---

# 44. Error Codes

Use consistent application error codes.

Initial codes:

```text
VALIDATION_ERROR
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
FORBIDDEN
RESOURCE_NOT_FOUND
RESOURCE_ALREADY_EXISTS
INVALID_TOKEN
TOKEN_EXPIRED
ACCOUNT_DISABLED
OWNERSHIP_ERROR
ORGANIZATION_ACCESS_DENIED
PROGRAM_ACCESS_DENIED
AI_SERVICE_ERROR
AI_OUTPUT_INVALID
DATABASE_ERROR
RATE_LIMIT_EXCEEDED
INTERNAL_SERVER_ERROR
```

---

# 45. AI Failure Handling

If the AI provider fails:

```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "Career analysis is temporarily unavailable. Please try again."
  }
}
```

Do not expose provider API errors, prompts, keys, or internal stack traces.

---

# 46. AI Output Validation

Every AI response must follow:

```text
LLM
 ↓
Parse JSON
 ↓
Zod schema validation
 ↓
Business validation
 ↓
Database
```

Malformed AI output must never be directly persisted.

---

# 47. Ownership Rules

For participant-owned resources:

```text
experiences
career analyses
skills
transferable skills
recommendations
skill gaps
roadmaps
roadmap tasks
submissions
evidence
achievements
passport
```

The backend must derive the authenticated user ID from the authentication context.

Do not trust:

```json
{
  "userId": "some-other-user"
}
```

from the frontend.

---

# 48. Organization Authorization

Every organization request must verify:

```text
Authenticated User
       ↓
Organization Membership
       ↓
Organization Role
       ↓
Requested Organization
       ↓
Requested Program
       ↓
Requested Participant
```

Never authorize access solely because the frontend supplied an organization ID.

---

# 49. Pagination

List endpoints should support pagination when needed.

Recommended format:

```text
?page=1&limit=20
```

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

For hackathon MVP, pagination may be omitted from small fixed datasets but the API should be designed so it can be added cleanly.

---

# 50. Health Check

## GET `/health`

This endpoint does not require authentication.

### Response

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

Optionally include database connectivity:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected"
  }
}
```

Do not expose credentials or infrastructure secrets.

---

# 51. API Module Structure

Recommended backend modules:

```text
src/modules/
├── auth/
├── users/
├── profiles/
├── experiences/
├── ai/
├── skills/
├── careers/
├── roadmaps/
├── progress/
├── challenges/
├── evidence/
├── achievements/
├── passport/
├── organizations/
└── analytics/
```

Each module should separate:

```text
routes
controller
service
schema
types
```

where useful.

---

# 52. Controller/Service Rule

Controllers should remain thin.

Preferred flow:

```text
Route
 ↓
Validation
 ↓
Controller
 ↓
Service
 ↓
Model (parameterized SQL via pg)
```

For AI:

```text
Controller
 ↓
Career Intelligence Service
 ↓
AI Service
 ↓
LLM Provider
 ↓
Validated AI Output
 ↓
Business Logic
 ↓
pg Model
```

Do not place large business rules directly inside route handlers.

---

# 53. API Definition of Done

The API layer is ready when:

* [ ] All MVP endpoints are implemented.
* [ ] Protected endpoints require authentication.
* [ ] Role-based authorization works.
* [ ] Ownership checks work.
* [ ] Organization isolation works.
* [ ] Request validation works.
* [ ] Responses follow the standard envelope.
* [ ] Errors use consistent codes.
* [ ] AI outputs are validated.
* [ ] Business scores are calculated by backend logic.
* [ ] Public passport exposes only approved information.
* [ ] `/health` works.
* [ ] Swagger/OpenAPI documentation is available.
* [ ] Core endpoints have automated tests.
* [ ] The complete participant flow works end-to-end.
* [ ] The organization flow works end-to-end.
