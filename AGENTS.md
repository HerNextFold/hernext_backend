# HerNext Backend — AGENTS.md

## 1. Project Identity

You are working on **HerNext — Team FiveFold**, a hackathon project in the **Finance, Banking & Investment** track.

HerNext is an AI-powered career transition and evidence platform helping African women:

* Understand how AI may affect their current work
* Discover transferable skills from real-world experience
* Identify suitable career paths
* Understand skill gaps
* Follow a personalized career roadmap
* Complete practical challenges
* Build evidence of their abilities
* Measure career readiness
* Generate a shareable Career Passport

### Current developer role

The developer using this agent is responsible for:

> **Backend + AI only**

Therefore, your primary responsibility is the **backend API, database, business logic, AI integration, scoring, security, analytics, and backend testing**.

Do not independently redesign or implement the frontend unless explicitly instructed.

---

# 2. Source of Truth

Before implementing anything, read these files:

```text
docs/PRODUCT_SPEC.md
docs/DATABASE_SCHEMA.md
docs/API_CONTRACT.md
docs/AI_SPEC.md
docs/SCORING_LOGIC.md
docs/SECURITY_SPEC.md
docs/DEVELOPMENT_PLAN.md
```

These documents are the project's technical source of truth.

### Priority order when interpreting requirements

Use this order:

1. Explicit instruction from the developer in the current task
2. `PRODUCT_SPEC.md`
3. `DATABASE_SCHEMA.md`
4. `API_CONTRACT.md`
5. `AI_SPEC.md`
6. `SCORING_LOGIC.md`
7. `SECURITY_SPEC.md`
8. `DEVELOPMENT_PLAN.md`
9. Existing implementation, if consistent with the documents

If existing code conflicts with the specifications, do not silently preserve the incorrect behavior.

Explain the conflict and implement according to the approved specification unless the developer explicitly says otherwise.

### Never

* Rewrite specifications because implementation is difficult
* Invent undocumented product behavior
* Invent database fields
* Invent API endpoints
* Invent career paths
* Invent skills
* Change scoring formulas without approval
* Remove documented requirements just to make implementation easier

---

# 3. Technology Stack

Use the existing project stack unless explicitly instructed otherwise.

### Runtime

* Node.js
* TypeScript

### Backend

* Fastify
* REST API
* `/api/v1` API versioning

### Database

* PostgreSQL
* Neon
* Prisma ORM

### Validation

* Zod

### Authentication/Security

* JWT
* bcrypt
* Fastify security plugins
* CORS
* Helmet
* Rate limiting where required

### Documentation

* OpenAPI
* Swagger UI

### Testing

* Vitest
* TypeScript type checking

Do not introduce another framework or ORM unless explicitly instructed.

---

# 4. Core Architecture

Use this architecture:

```text
Frontend
   ↓
Fastify Route
   ↓
Controller
   ↓
Service
   ↓
Business Logic / AI Service
   ↓
Prisma
   ↓
PostgreSQL
```

For AI:

```text
Controller
   ↓
AI Service
   ↓
Prompt Builder
   ↓
AI Provider
   ↓
Structured JSON
   ↓
Zod Validation
   ↓
Business Validation
   ↓
Database
```

### Architectural rule

Controllers should be thin.

Controllers should primarily:

* Receive validated input
* Access authenticated user context
* Call services
* Return responses

Business rules belong in services or dedicated libraries.

Do not put complex business logic directly inside route handlers.

---

# 5. Project Structure

Use this structure:

```text
backend/
├── AGENTS.md
├── docs/
│   ├── DATABASE_SCHEMA.md
│   ├── API_CONTRACT.md
│   ├── AI_SPEC.md
│   ├── SCORING_LOGIC.md
│   ├── PRODUCT_SPEC.md
│   ├── SECURITY_SPEC.md
│   └── DEVELOPMENT_PLAN.md
│
├── prisma/
│   └── schema.prisma
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── plugins/
│   │   ├── auth.ts
│   │   ├── cors.ts
│   │   ├── helmet.ts
│   │   └── swagger.ts
│   │
│   ├── common/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── profiles/
│   │   ├── experiences/
│   │   ├── ai/
│   │   ├── skills/
│   │   ├── careers/
│   │   ├── roadmaps/
│   │   ├── progress/
│   │   ├── challenges/
│   │   ├── evidence/
│   │   ├── achievements/
│   │   ├── passport/
│   │   ├── organizations/
│   │   └── analytics/
│   │
│   └── lib/
│       ├── prisma.ts
│       └── scoring/
│
└── tests/
```

For a typical module:

```text
module/
├── module.routes.ts
├── module.controller.ts
├── module.service.ts
├── module.schemas.ts
└── module.types.ts
```

Not every module must contain every file if unnecessary.

Keep modules cohesive.

---

# 6. Coding Standards

Write clean, maintainable TypeScript.

### Prefer

* Explicit types
* Small functions
* Single-responsibility services
* Async/await
* Early validation
* Descriptive variable names
* Reusable utilities
* Typed service boundaries
* Constants for repeated values

### Avoid

* `any` unless genuinely unavoidable
* Giant controllers
* Giant service files
* Deeply nested conditionals
* Duplicate business logic
* Magic numbers
* Hardcoded secrets
* Hardcoded database IDs
* Silent error swallowing
* Unnecessary abstractions

Do not over-engineer the hackathon MVP.

The goal is:

> **Reliable, understandable, demo-ready backend code.**

---

# 7. Environment Variables

Never hardcode secrets.

Use:

```text
.env
```

for local secrets.

Use:

```text
.env.example
```

for documented placeholders.

Never commit:

```text
.env
```

Never print:

* passwords
* JWT secrets
* access tokens
* refresh tokens
* database URLs
* API keys

Validate environment variables when the application starts.

---

# 8. Database Rules

Prisma is the only database access layer.

Do not write raw SQL unless explicitly required.

Database access belongs in services/repositories where appropriate.

### Important rules

Every participant's private data must be scoped to their authenticated user.

Never trust:

```text
userId
participantId
organizationId
role
```

from the request body when the value can be derived from authentication or authorization context.

For example:

```text
request.user.id
```

must be used instead of:

```text
body.userId
```

for ownership.

### Organization isolation

Organization users must only access data belonging to organizations they are members of.

Always verify:

```text
authenticated user
→ organization membership
→ organization
→ program
→ participant
```

before returning protected organization data.

---

# 9. Prisma Rules

Use Prisma-generated types.

Do not manually duplicate database types when Prisma types already provide them.

After schema changes:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

Use migrations appropriately.

Do not casually reset the database.

Never run destructive commands such as:

```bash
prisma migrate reset
```

without explicit developer approval.

---

# 10. API Rules

Base API path:

```text
/api/v1
```

Use the response format defined in:

```text
docs/API_CONTRACT.md
```

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Error

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

Use the documented HTTP status codes.

Do not return random response shapes between endpoints.

---

# 11. Validation

Validate:

* request body
* route parameters
* query parameters
* AI output
* important external data

Use Zod.

Do not assume frontend validation is enough.

The backend must independently validate every request.

### Mass assignment protection

Only accept documented fields.

Do not blindly spread request bodies into Prisma:

```text
...request.body
```

without validation and field control.

---

# 12. Authentication

Implement authentication according to:

```text
docs/SECURITY_SPEC.md
```

Required capabilities:

```text
Register
Login
Logout
Current user
Forgot password
Reset password
```

Passwords must be hashed.

Never store plaintext passwords.

Never return password hashes through API responses.

Authentication context should provide the authenticated user ID and role.

---

# 13. Authorization

Implement RBAC.

Supported roles include:

```text
PARTICIPANT
ORGANIZATION_ADMIN
ORGANIZATION_MEMBER
```

Authorization must be enforced server-side.

Do not rely on:

```text
frontend route protection
hidden buttons
disabled UI
```

for security.

A participant must not access another participant's private resources.

An organization must not access another organization's data.

---

# 14. Error Handling

Use centralized error handling where practical.

Errors should be:

* predictable
* safe
* useful to the frontend
* free of sensitive implementation details

Do not expose:

```text
database stack traces
Prisma internals
AI provider errors
API keys
server filesystem paths
```

Example:

Instead of returning:

```text
OpenAI API request failed: <internal provider details>
```

return a safe application error such as:

```text
AI_SERVICE_UNAVAILABLE
```

Log the internal error securely on the server when appropriate.

---

# 15. AI Architecture

AI is an **intelligence layer**, not the application's source of truth.

The AI may:

* Interpret natural language
* Extract potential skills
* Explain career recommendations
* Explain skill gaps
* Suggest roadmap tasks
* Provide challenge feedback

The AI must NOT own:

* Authentication
* Authorization
* Database ownership
* Career catalogue
* Skill catalogue
* Final score calculations
* Progress calculations
* Achievement rules
* Readiness calculations
* Organization analytics
* Access control

---

# 16. AI Catalogue Rules

AI must use approved HerNext catalogue IDs.

It must not invent:

* skill IDs
* career IDs
* challenge IDs
* qualifications
* certifications
* job titles outside the approved catalogue

If AI suggests something outside the catalogue, reject or normalize it.

Do not save unvalidated AI output.

---

# 17. AI Output Validation

Every structured AI response must pass through Zod validation.

Flow:

```text
AI
 ↓
JSON parsing
 ↓
Zod schema
 ↓
Business validation
 ↓
Database
```

Never directly save arbitrary AI output to PostgreSQL.

Handle:

* malformed JSON
* missing fields
* invalid enum values
* unknown skill IDs
* unknown career IDs
* invalid score ranges
* incomplete output
* provider timeout
* provider failure
* provider rate limit

---

# 18. AI Hallucination Rules

Never allow the AI to fabricate user history.

The AI must not claim that a user:

* worked somewhere they did not mention
* has a certification they did not provide
* has a degree they did not provide
* has a skill that has not been inferred or supplied
* completed a challenge they did not complete
* has verified experience without evidence

AI-inferred skills must remain:

```text
AI_DERIVED
```

They are not automatically:

```text
VERIFIED
```

---

# 19. AI Impact Assessment

The AI Impact Assessment is not a scientific prediction of job loss.

Do not describe it as:

```text
"You have an 83% chance of losing your job."
```

Instead describe it as an assessment of:

* automation exposure
* AI augmentation opportunity
* human-value tasks
* emerging skills

The final score must follow:

```text
docs/SCORING_LOGIC.md
```

The backend owns the final score.

---

# 20. Career Recommendations

Career recommendations must come from the approved HerNext career catalogue.

The backend calculates the match score.

The AI can explain:

> Why this career fits the user's experience.

The AI must not independently invent a career and insert it into the career catalogue.

---

# 21. Skill Gaps

Skill gaps are determined by comparing:

```text
User skills
vs
Required career skills
```

The backend owns this comparison.

AI can explain:

* why a skill matters
* how the skill relates to the user's experience
* why the gap should be prioritized

AI cannot arbitrarily mark a required skill as completed.

---

# 22. Roadmaps

Roadmaps should follow the documented:

```text
30-day
60-day
90-day
```

structure.

Recommended task count:

```text
3–5 tasks per phase
```

The backend must validate generated roadmap tasks.

AI-generated roadmap content must reference valid HerNext skills and careers.

Roadmap progress must be calculated by backend logic.

---

# 23. Scoring

All score calculations belong to:

```text
src/lib/scoring/
```

unless a more appropriate documented location exists.

Follow:

```text
docs/SCORING_LOGIC.md
```

Do not modify formulas casually.

Scores must:

* be between 0 and 100
* be clamped
* use documented weights
* handle empty data safely
* have deterministic tests
* use consistent rounding

Important scores include:

```text
AI Impact
Career Match
Roadmap Progress
Challenge Progress
Career Readiness
Overall Progress
Organization Participant Status
```

---

# 24. Progress

Progress must be derived from actual records.

Do not allow the frontend to submit:

```text
progress: 95
```

and treat it as authoritative.

The backend should derive progress from:

* completed roadmap tasks
* completed challenges
* evidence
* assessments
* profile completion
* milestones
* other documented source records

---

# 25. Achievements

Achievements must be deterministic and idempotent.

Running achievement evaluation multiple times must not create duplicate achievement records.

Example:

```text
Profile completed
Assessment completed
First skill discovered
First challenge
First evidence
30-day goal
Roadmap completed
Passport ready
```

---

# 26. Next Best Action

Next Best Action is deterministic backend logic.

Use the priority order in:

```text
docs/SCORING_LOGIC.md
```

Do not use an LLM to determine the core next-action priority.

The AI may help phrase an explanation, but the backend decides the action.

---

# 27. Challenges

Initial MVP challenges include:

```text
Financial Reconciliation
Customer Payment Resolution
```

Challenge evaluation should preferably be deterministic.

AI may provide human-readable feedback.

AI must not override deterministic challenge results.

Challenge submissions must belong to the authenticated participant.

---

# 28. Evidence

Evidence should connect completed work to skills.

Examples:

```text
Challenge submission
Project
Assessment
Completed activity
Achievement
```

Evidence must not be automatically treated as verified unless the appropriate verification rule has been satisfied.

---

# 29. Career Readiness

Career Readiness is a backend-calculated score.

Follow the documented formula:

```text
Experience
Skills
AI Readiness
Evidence
```

Do not allow AI to directly determine the final readiness percentage.

AI may explain the result.

---

# 30. Career Passport

The Career Passport must only expose fields intentionally marked as public/shareable.

Never expose through a public passport:

```text
password
passwordHash
email
private organization information
private program information
private internal IDs
private analytics
authentication information
```

Public passport access must use the documented public slug/token mechanism.

Do not expose the entire participant database object.

Build a dedicated public response shape.

---

# 31. Organization Data

Organizations are separate tenants.

Every organization request must verify membership.

Example:

```text
User
 ↓
OrganizationMember
 ↓
Organization
 ↓
Program
 ↓
ProgramParticipant
```

Do not assume that possessing an organization ID grants access.

Organization analytics must be derived from actual participant/program records.

---

# 32. Organization Status

Use the documented deterministic rules:

```text
ON_TRACK
NEEDS_ATTENTION
AT_RISK
```

Do not ask an LLM to decide participant risk status.

The backend owns this calculation.

---

# 33. Analytics

Analytics should be derived from source records.

Avoid storing unnecessary duplicate metrics.

Examples:

```text
Total participants
Active participants
Assessment completion
Average readiness
Average roadmap progress
Skills developed
Challenges completed
Passports created
```

Ensure organization analytics are properly tenant-scoped.

---

# 34. Seed Data

The MVP requires seed data for:

### Careers

Examples:

```text
Fintech Operations Associate
Banking Operations Officer
Payments Operations Associate
Financial Services Customer Success
Risk Operations Associate
Fraud Operations Associate
Junior Financial Analyst
Bookkeeping Associate
Compliance Associate
Credit Analyst
```

### Skills

Examples:

```text
Customer Service
Transaction Processing
Cash Management
Financial Record Keeping
Reconciliation
Fraud Awareness
Excel
Data Analysis
Financial Analysis
Risk Management
Digital Payments
Communication
Problem Solving
Attention to Detail
```

Use stable seeded records.

Do not hardcode database IDs throughout application code.

---

# 35. Demo Data

The project has an example participant:

```text
Aisha Abdullah
POS Business Owner
4 years experience
Financial Services
Informal Worker
```

Her example experience should demonstrate:

```text
Transaction Processing
Cash Management
Financial Record Keeping
Customer Service
Reconciliation
Problem Solving
Attention to Detail
```

Potential target:

```text
Fintech Operations Associate
```

Potential gaps:

```text
Excel
Fraud Awareness
Digital Payments
```

Use demo data only where appropriate.

Do not accidentally make demo data appear as real production user data.

---

# 36. Testing

Every significant business rule should have tests.

Prioritize tests for:

### Authentication

* registration
* login
* invalid credentials
* password hashing
* protected routes

### Authorization

* participant ownership
* organization isolation
* role restrictions
* IDOR prevention

### Validation

* invalid body
* invalid params
* invalid query
* malformed AI output

### Scoring

* boundaries
* empty data
* missing data
* rounding
* expected formulas

### AI

Mock the provider.

Do not require a live AI provider for the normal test suite.

### Database

Test important persistence behavior.

### Progress

Test actual calculations rather than trusting supplied values.

---

# 37. AI Testing

AI tests should mock provider responses.

Include cases for:

```text
valid output
malformed JSON
invalid skill ID
invalid career ID
missing field
out-of-range score
provider timeout
provider unavailable
```

The backend must fail safely.

---

# 38. API Documentation

Keep Swagger/OpenAPI documentation aligned with:

```text
docs/API_CONTRACT.md
```

When adding or changing an endpoint, update the relevant documentation.

Do not silently introduce undocumented endpoints.

---

# 39. Dependencies

Do not install random packages.

Before adding a dependency:

1. Check whether the existing stack already solves the problem.
2. Check whether the dependency is genuinely necessary.
3. Prefer lightweight, established packages.
4. Explain why it is needed.

Do not replace existing dependencies without a reason.

---

# 40. Git Rules

Work in small, logical changes.

Do not make huge unrelated commits.

Do not rewrite unrelated files.

Do not delete working code merely to implement a feature differently.

Before finishing a task:

```text
git diff
```

should be inspected.

Never commit:

```text
.env
secrets
API keys
credentials
node_modules
generated sensitive data
```

Do not create commits automatically unless explicitly instructed.

---

# 41. Inspect Before Editing

Before changing code:

1. Inspect the existing file.
2. Understand surrounding architecture.
3. Search for related implementations.
4. Check whether the functionality already exists.
5. Read relevant documentation.
6. Make the smallest appropriate change.

Do not blindly overwrite files.

Do not recreate existing functionality because you did not search for it.

---

# 42. Incremental Development

Build the backend in vertical slices.

After implementing a meaningful feature:

```text
format
typecheck
test
validate
```

where applicable.

Do not wait until the entire backend is written before testing.

Prefer:

```text
Auth
 ↓
Test
 ↓
Profile
 ↓
Test
 ↓
Experience
 ↓
Test
 ↓
AI
 ↓
Test
```

over building everything at once.

---

# 43. Implementation Order

Follow this order unless the developer explicitly changes it:

```text
1. Foundation
2. Database
3. Authentication
4. Participant Profile
5. Experience
6. AI Career Intelligence
7. Career Matching
8. Skill Gaps
9. Roadmap
10. Progress & Achievements
11. Challenges & Evidence
12. Career Readiness
13. Career Passport
14. Organizations
15. Analytics & Reports
16. Security & Testing
17. Frontend Integration
18. Demo Hardening
```

Do not jump to advanced organization analytics while authentication and ownership checks are incomplete.

---

# 44. Hackathon MVP Priority

If time becomes limited, prioritize:

```text
1. Authentication
2. Participant profile
3. Experience/story input
4. AI impact assessment
5. Transferable skills
6. Career recommendation
7. Skill gaps
8. Roadmap
9. Progress
10. Challenge
11. Evidence
12. Career readiness
13. Career Passport
14. Organization dashboard
```

The participant journey should work end-to-end before polishing secondary features.

---

# 45. Do Not Build

Unless explicitly requested, do NOT build:

* AI chatbot
* AI voice assistant
* Autonomous job applications
* AI recruiter
* LinkedIn automation
* Resume auto-submission
* Complex ML recommendation model
* Salary prediction
* Employment-loss prediction
* Employer matching engine
* Real-time conversational career coach
* Social network
* Payment processing unrelated to the product requirements
* Complex notification infrastructure
* Microservices architecture
* Kubernetes
* Event-driven infrastructure
* Unnecessary caching infrastructure
* Unnecessary background workers

Keep the architecture appropriate for a hackathon MVP.

---

# 46. Handling Ambiguity

When requirements are unclear:

1. Check the documentation.
2. Check existing code.
3. Prefer the simplest implementation consistent with the product.
4. Do not invent major behavior.

If ambiguity affects:

* database schema
* authentication
* security
* scoring
* API contracts
* AI behavior

stop and report the ambiguity before making a potentially destructive architectural decision.

For minor implementation details, use reasonable engineering judgment.

---

# 47. Handling Conflicts

If two documents conflict:

1. Identify the conflict.
2. Do not silently choose a behavior that changes product requirements.
3. Follow the documented source-of-truth priority.
4. Tell the developer what conflicts.
5. Make the smallest safe implementation.

Never silently modify the specification to match the code.

---

# 48. Performance

For MVP:

* Avoid unnecessary database queries.
* Use Prisma `select` where appropriate.
* Avoid N+1 queries.
* Avoid AI calls on every dashboard request.
* Store/cache completed AI analyses where appropriate.
* Regenerate AI output only when source data changes or the user explicitly requests it.
* Use transactions for related multi-write operations.

Do not prematurely optimize.

Reliability is more important than theoretical scalability for the hackathon.

---

# 49. Security Priority

Security implementation priority:

```text
1. Authentication
2. Password hashing
3. Authorization
4. Resource ownership
5. Organization tenant isolation
6. Input validation
7. Secret protection
8. Rate limiting
9. Safe errors
10. AI output validation
11. Public Passport privacy
```

Treat security as part of implementation, not as a final cleanup task.

---

# 50. Definition of Done

A backend feature is not complete merely because the code compiles.

A feature is done when:

* Requirements are understood
* Relevant documentation is followed
* Database changes are valid
* API behavior matches the contract
* Input is validated
* Authorization is enforced
* Business logic is server-side
* Errors are handled safely
* Tests exist for important behavior
* TypeScript passes
* Prisma validation passes where applicable
* No secrets are exposed
* No unrelated files were changed
* The feature integrates cleanly with existing modules

---

# 51. Required Verification

Before reporting a task as complete, run the appropriate checks.

At minimum, when available:

```bash
npm run typecheck
npm test
npx prisma validate
```

If scripts are not yet configured, use the appropriate equivalent commands already available in the project.

Also inspect:

```bash
git diff
```

Do not claim tests passed if they were not actually run.

Do not claim an endpoint works if it was not verified.

---

# 52. Final Task Report

After completing a task, report concisely:

### Implemented

List what was added or changed.

### Files changed

List exact files.

### Verification

List commands actually run and whether they passed.

Example:

```text
Implemented:
- Registration endpoint
- Password hashing
- JWT authentication
- Auth middleware

Files:
- src/modules/auth/auth.routes.ts
- src/modules/auth/auth.controller.ts
- src/modules/auth/auth.service.ts
- src/modules/auth/auth.schemas.ts

Verification:
- npm run typecheck ✓
- npm test ✓
- npx prisma validate ✓
```

### Important

Do not claim functionality that has not been implemented or tested.

---

# 53. Most Important Rule

When in doubt, remember:

> **HerNext backend must be deterministic, secure, explainable, and grounded in real user data.**

AI provides intelligence.

The backend provides:

```text
truth
rules
security
scores
data ownership
progress
evidence
analytics
```

Never let AI replace backend business logic.

Never let the frontend replace backend security.

Never let convenience override the documented product requirements.

Build the smallest reliable implementation that makes the complete HerNext journey work.
