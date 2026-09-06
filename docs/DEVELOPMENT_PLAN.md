# HerNext — Backend & AI Development Plan

**Project:** HerNext
**Team:** FiveFold
**Role Covered:** Backend + AI
**Stack:** Node.js + TypeScript + Fastify + Prisma + PostgreSQL/Neon
**Document Type:** Implementation Plan
**Status:** MVP Development Plan

---

# 1. Purpose

This document converts the HerNext product, database, API, AI, scoring, and security specifications into an implementation sequence.

The goal is to give the Backend + AI developer and coding agents a clear order of implementation.

The implementation must prioritize:

```text
Foundation
→ Database
→ Authentication
→ Core Career Journey
→ AI Intelligence
→ Progress
→ Challenges/Evidence
→ Passport
→ Organization Features
→ Analytics
→ Security
→ Integration
```

---

# 2. Source of Truth

Before implementing a feature, refer to:

```text
docs/PRODUCT_SPEC.md
docs/DATABASE_SCHEMA.md
docs/API_CONTRACT.md
docs/AI_SPEC.md
docs/SCORING_LOGIC.md
docs/SECURITY_SPEC.md
```

If implementation conflicts with these documents:

1. Stop.
2. Identify the conflict.
3. Prefer the documented architecture.
4. Update the relevant specification before introducing a major architectural change.

Do not silently invent a different implementation.

---

# 3. Development Principles

## Backend Owns Business Logic

Frontend should display data.

Backend should calculate:

* Scores
* Progress
* Readiness
* Skill gaps
* Achievements
* Participant status
* Organization analytics

---

## AI Is an Intelligence Layer

AI handles:

* Interpretation
* Extraction
* Explanation
* Personalization

AI does not own:

* Authorization
* Database integrity
* Scores
* Ownership
* Roles
* Career catalogue
* Skill catalogue

---

## Build Vertical Slices

Whenever possible, implement features end-to-end rather than creating dozens of empty modules.

Example:

```text
Experience
→ AI Skill Extraction
→ Store Skills
→ Return Skills
```

is more valuable than creating every controller and service without working functionality.

---

# 4. Development Order

Recommended order:

```text
Phase 1   Project Foundation
Phase 2   Database
Phase 3   Authentication
Phase 4   Participant Profile
Phase 5   Experience
Phase 6   AI Career Intelligence
Phase 7   Career Matching
Phase 8   Skill Gaps
Phase 9   Roadmap
Phase 10  Progress & Achievements
Phase 11  Challenges & Evidence
Phase 12  Career Readiness
Phase 13  Career Passport
Phase 14  Organizations
Phase 15  Analytics & Reports
Phase 16  Security & Testing
Phase 17  Frontend Integration
Phase 18  Demo Hardening
```

---

# 5. Phase 1 — Project Foundation

## Tasks

Set up:

```text
Fastify
TypeScript
dotenv
Zod
Prisma
PostgreSQL/Neon
CORS
Helmet
JWT
bcrypt
Swagger/OpenAPI
Vitest
```

Create:

```text
src/
tests/
prisma/
```

Create base server.

Required endpoint:

```text
GET /health
```

Expected:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

---

# 6. Recommended Source Structure

Use modular architecture:

```text
src/
├── app.ts
├── server.ts
├── config/
│   └── env.ts
├── plugins/
│   ├── auth.ts
│   ├── cors.ts
│   ├── helmet.ts
│   └── swagger.ts
├── common/
│   ├── errors/
│   ├── middleware/
│   ├── utils/
│   └── types/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── profiles/
│   ├── experiences/
│   ├── ai/
│   ├── skills/
│   ├── careers/
│   ├── roadmaps/
│   ├── progress/
│   ├── challenges/
│   ├── evidence/
│   ├── achievements/
│   ├── passport/
│   ├── organizations/
│   └── analytics/
└── lib/
    ├── scoring/
    └── prisma.ts
```

---

# 7. Module Structure

Each major module should generally follow:

```text
module/
├── *.routes.ts
├── *.controller.ts
├── *.service.ts
├── *.schemas.ts
├── *.types.ts
```

Not every module needs every file.

Keep modules simple.

---

# 8. Phase 2 — Database

Implement the Prisma schema based on:

```text
docs/DATABASE_SCHEMA.md
```

Run:

```text
npx prisma format
```

Then create the initial migration.

Use:

```text
npx prisma migrate dev
```

for development.

Verify:

```text
npx prisma generate
```

---

# 9. Database Seed

Create a seed script containing:

### Careers

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

---

# 10. Demo Seed Data

Create an optional demo seed for:

```text
Aisha Abdullah
```

with:

```text
Occupation:
POS Business Owner

Experience:
4 years

Industry:
Financial Services

Employment:
INFORMAL_WORKER
```

The seed should create realistic related records.

Do not hardcode demo scores into production scoring logic.

Scores should result from actual records.

---

# 11. Phase 3 — Authentication

Implement:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET /auth/me
POST /auth/forgot-password
POST /auth/reset-password
```

Tasks:

* Registration validation
* Duplicate email handling
* Password hashing
* Login
* JWT generation
* Authentication decorator/plugin
* Logout/session invalidation strategy
* Password reset
* Protected routes

---

# 12. Authentication Tests

Test:

```text
Valid registration
Duplicate email
Weak password
Invalid login
Valid login
Missing token
Invalid token
Expired token
Authenticated /me
Logout
Password reset
```

---

# 13. Phase 4 — Participant Profile

Implement:

```text
GET /profile
PUT /profile
```

Support:

```text
Name
Country
Occupation
Industry
Years of Experience
Education
Employment Type
Career Interests
Desired Career
```

Rules:

* User can access only their own profile.
* Validate all fields.
* Do not accept user ID from the client for ownership.

---

# 14. Phase 5 — Experiences

Implement:

```text
POST   /experiences
GET    /experiences
GET    /experiences/:id
PUT    /experiences/:id
DELETE /experiences/:id
```

Validate:

* Title
* Description
* Dates/duration where applicable
* Industry
* Employment type
* User ownership

The experience description becomes an input to the AI career intelligence pipeline.

---

# 15. Phase 6 — AI Career Intelligence

Implement the AI service architecture:

```text
src/modules/ai/
├── ai.routes.ts
├── ai.controller.ts
├── ai.service.ts
├── ai.schemas.ts
├── ai.types.ts
├── prompts/
│   ├── career-impact.prompt.ts
│   ├── transferable-skills.prompt.ts
│   ├── roadmap.prompt.ts
│   └── challenge-feedback.prompt.ts
└── providers/
    └── llm.provider.ts
```

---

# 16. AI Provider Abstraction

Do not couple the entire application directly to one AI SDK.

Create an interface similar to:

```text
LLMProvider
```

Responsibilities:

```text
generateStructuredResponse()
```

This allows the AI provider to be replaced later.

---

# 17. AI Career Impact

Implement:

```text
POST /ai/career-impact
```

Flow:

```text
Authenticated User
        ↓
Load Career Profile
        ↓
Load Experience
        ↓
Build Prompt
        ↓
Call LLM
        ↓
Parse JSON
        ↓
Zod Validation
        ↓
Business Validation
        ↓
Calculate/Normalize Score
        ↓
Store CareerAnalysis
        ↓
Return Result
```

Do not call the AI provider directly from the controller.

---

# 18. Transferable Skills

Implement:

```text
POST /ai/transferable-skills
```

Flow:

```text
Experience
 ↓
AI Analysis
 ↓
Candidate Skill IDs
 ↓
Validate against Skill Catalogue
 ↓
Store AI_DERIVED UserSkills
 ↓
Return Skills
```

Unknown skills must be rejected or ignored safely.

Do not create arbitrary new Skill records from raw AI output.

---

# 19. Phase 7 — Career Matching

Implement:

```text
GET /careers/recommendations
```

Process:

```text
User Profile
+
User Skills
+
Experience
+
Career Interests
+
AI Readiness
        ↓
Approved Career Catalogue
        ↓
Calculate Career Match
        ↓
Sort
        ↓
Return Top Careers
```

AI may explain the recommendation.

Backend calculates the score.

---

# 20. Career Details

Implement:

```text
GET /careers/:careerId/skill-gaps
```

Validate that:

```text
careerId
```

exists in the approved career catalogue.

---

# 21. Phase 8 — Skill Gap Analysis

Compare:

```text
CareerSkill
VS
UserSkill
```

Generate:

```text
HAS_SKILL
NEEDS_DEVELOPMENT
```

Prioritize:

```text
REQUIRED → HIGH
IMPORTANT → MEDIUM
NICE_TO_HAVE → LOW
```

Persist gaps if needed for roadmap generation and history.

---

# 22. Phase 9 — Roadmap

Implement:

```text
POST /roadmaps/generate
GET /roadmaps/current
PATCH /roadmaps/tasks/:taskId
```

Roadmap generation flow:

```text
Target Career
+
Skill Gaps
+
Existing Skills
+
Experience
        ↓
AI Roadmap Suggestion
        ↓
Validate Skill IDs
        ↓
Validate Phases
        ↓
Validate Task Count
        ↓
Store Roadmap
```

Target:

```text
30 days
60 days
90 days
```

Recommended:

```text
3–5 tasks per phase
```

---

# 23. Roadmap Task Completion

When a participant updates a task:

```text
Authenticate
→ Verify Task Ownership
→ Validate Status
→ Update Task
→ Recalculate Derived Progress
→ Evaluate Achievements
→ Return Updated Progress
```

---

# 24. Phase 10 — Progress

Implement:

```text
GET /progress
GET /progress/summary
GET /progress/next-action
GET /achievements
```

Progress should be calculated from source records.

Do not trust frontend-supplied progress percentages.

---

# 25. Achievement Engine

Create deterministic achievement rules.

Example:

```text
Profile Completed
Assessment Completed
First Skill Discovered
First Challenge Completed
First Evidence Added
30-Day Goal Completed
Roadmap Completed
Passport Ready
```

Make achievement awarding idempotent.

---

# 26. Next Best Action Service

Create:

```text
next-action.service.ts
```

The service evaluates the participant's current state.

Return exactly one primary action.

Example:

```text
{
  "type": "COMPLETE_CHALLENGE",
  "title": "Complete your Financial Reconciliation Challenge",
  "reason": "This will help you build evidence for your target career."
}
```

---

# 27. Phase 11 — Challenges

Implement:

```text
GET /challenges
GET /challenges/:id
POST /challenges/:id/submit
```

Start with:

```text
Financial Reconciliation Challenge
```

Then optionally add:

```text
Customer Payment Resolution Challenge
```

---

# 28. Challenge Evaluation

Where possible:

```text
Deterministic Evaluation
```

For example:

```text
Correct Total
Correct Discrepancy
Correct Closing Balance
```

AI can provide explanatory feedback.

AI must not override deterministic results.

---

# 29. Evidence Creation

A successful challenge may create evidence.

Flow:

```text
Challenge Submission
        ↓
Evaluation
        ↓
Passed
        ↓
Create Evidence
        ↓
Link Evidence to Skills
        ↓
Update Readiness
        ↓
Evaluate Achievements
```

Avoid duplicate evidence creation if the same submission is processed twice.

---

# 30. Phase 12 — Career Readiness

Implement scoring utilities:

```text
src/lib/scoring/
├── career-match.ts
├── readiness.ts
├── ai-impact.ts
├── progress.ts
└── participant-status.ts
```

Implement formulas from:

```text
docs/SCORING_LOGIC.md
```

Readiness:

```text
Experience       25%
Skills           30%
AI Readiness     20%
Evidence         25%
```

---

# 31. Phase 13 — Career Passport

Implement:

```text
GET /passport
POST /passport/generate
GET /passport/public/:slug
```

Passport generation should aggregate:

```text
Profile
Experience
Skills
Target Career
Readiness
Challenges
Evidence
Achievements
Roadmap Progress
```

---

# 32. Public Passport

The public endpoint must use a dedicated response object.

Do not simply return the entire database user object.

Example:

```text
User
 ↓
Public Passport Mapper
 ↓
Approved Public Fields
 ↓
Response
```

---

# 33. Phase 14 — Organizations

Implement:

```text
POST /organizations
GET /organizations/:organizationId
POST /organizations/:organizationId/programs
GET /organizations/:organizationId/programs
POST /programs/:programId/participants
GET /programs/:programId/participants
GET /programs/:programId/participants/:participantId
```

Every organization endpoint requires:

```text
Authentication
+
Membership Check
+
Role Check
+
Resource Ownership/Tenant Check
```

---

# 34. Program Management

Organizations can:

* Create programs
* Add participants
* View participants
* Monitor progress
* View readiness
* View participant status

Participant data must remain tenant-isolated.

---

# 35. Phase 15 — Analytics

Implement:

```text
GET /programs/:programId/analytics
GET /programs/:programId/report
```

Calculate:

```text
Total Participants
Active Participants
Assessment Completion
Average Readiness
Average Roadmap Progress
Challenges Completed
Evidence Created
Passports Created
Participant Status
```

---

# 36. Phase 16 — Security

Review:

```text
docs/SECURITY_SPEC.md
```

Verify:

```text
Authentication
Authorization
Ownership
Tenant Isolation
Input Validation
Rate Limiting
CORS
Security Headers
Secret Management
AI Validation
Safe Errors
Public Passport
```

---

# 37. Phase 17 — Testing Strategy

Use:

```text
Vitest
```

Testing layers:

### Unit Tests

Test:

```text
Scoring
Validation
Business rules
Achievement rules
Next best action
Status calculation
```

### Service Tests

Test:

```text
Authentication
Profile
Experience
AI service
Roadmap
Challenges
Passport
Organizations
```

### Integration Tests

Test important API flows:

```text
Register
→ Login
→ Profile
→ Experience
→ AI
→ Career
→ Roadmap
→ Challenge
→ Evidence
→ Passport
```

---

# 38. AI Testing

Do not depend on a live AI provider for every automated test.

Mock the provider.

Test:

```text
Valid AI response
Malformed JSON
Invalid schema
Unknown skill
Unknown career
Timeout
Provider failure
Rate limit
Prompt injection attempt
```

---

# 39. API Documentation

Keep Swagger/OpenAPI documentation aligned with:

```text
docs/API_CONTRACT.md
```

Every production endpoint should document:

* Method
* Path
* Authentication
* Request schema
* Response schema
* Error responses

---

# 40. Frontend Integration

Once the API is stable:

```text
Frontend
    ↓
API Contract
    ↓
Backend
```

Frontend should consume real endpoints rather than duplicate business logic.

The frontend should not calculate:

```text
Career Match
Readiness
Roadmap Progress
Organization Status
```

---

# 41. Recommended Integration Order

Frontend integration should happen in this order:

```text
1. Authentication
2. Profile
3. Experience
4. AI Analysis
5. Skills
6. Career Recommendations
7. Skill Gaps
8. Roadmap
9. Progress
10. Challenges
11. Evidence
12. Passport
13. Organization Dashboard
14. Analytics
```

---

# 42. API Stability Rule

Once the frontend starts integrating an endpoint:

Do not casually change:

```text
Request body
Response shape
Field names
Enum values
Error format
```

If a breaking change is necessary:

1. Update API contract.
2. Update backend.
3. Notify frontend.
4. Update integration.

---

# 43. Environment Variables

Expected variables:

```text
NODE_ENV
PORT
DATABASE_URL
JWT_SECRET
FRONTEND_URL
AI_API_KEY
```

Optional:

```text
JWT_EXPIRES_IN
AI_MODEL
LOG_LEVEL
```

All environment variables must be validated at startup.

The application should fail fast when required variables are missing.

---

# 44. Development Commands

Expected scripts:

```text
npm run dev
npm run build
npm run start
npm run test
npm run test:watch
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Exact commands may vary according to the final package configuration.

---

# 45. Git Workflow

Use small, focused commits.

Examples:

```text
feat: add authentication module
feat: add career profile endpoints
feat: add transferable skills analysis
feat: add career matching
feat: add roadmap generation
feat: add challenge evaluation
fix: enforce participant ownership
test: add readiness scoring tests
```

Avoid giant commits containing unrelated features.

---

# 46. Pull Request / Review Checklist

Before merging:

```text
[ ] Feature follows product spec.
[ ] API follows API contract.
[ ] Database changes follow schema.
[ ] Validation exists.
[ ] Authorization exists.
[ ] Tests exist.
[ ] Error handling exists.
[ ] No secrets committed.
[ ] No unnecessary AI calls.
[ ] AI output is validated.
[ ] Documentation updated if behavior changed.
```

---

# 47. 14-Day Hackathon Execution Plan

## Day 1

Preparation:

```text
Architecture
Repository
Environment
Documentation
Task breakdown
```

---

## Day 2

Foundation:

```text
Fastify
TypeScript
Prisma
Neon
Security plugins
Error handling
```

---

## Day 3

Database:

```text
Schema
Migration
Seed data
Prisma client
```

Begin authentication.

---

## Day 4

Authentication:

```text
Register
Login
Logout
Me
Password hashing
Protected routes
```

---

## Day 5

Participant:

```text
Profile
Experience CRUD
Validation
Ownership
```

---

## Day 6

AI:

```text
AI provider abstraction
Career Impact
Structured output
Zod validation
```

---

## Day 7

Career Intelligence:

```text
Transferable Skills
Career Recommendations
Career Match
Skill Gaps
```

---

## Day 8

Roadmap:

```text
Roadmap generation
Roadmap retrieval
Task updates
Progress calculation
```

---

## Day 9

Progress:

```text
Dashboard summary
Achievements
Next Best Action
Readiness
```

---

## Day 10

Challenges:

```text
Financial Reconciliation
Submission
Evaluation
Evidence
```

---

## Day 11

Passport:

```text
Passport generation
Public Passport
Privacy filtering
```

---

## Day 12

Organization:

```text
Organization
Programs
Participants
Analytics
Participant status
```

---

## Day 13

Integration:

```text
Frontend integration
End-to-end testing
Security testing
Bug fixing
```

---

## Day 14

Freeze:

```text
Demo data
Final testing
Performance checks
API documentation
Deployment
Demo rehearsal
```

No major new features should be introduced on the final day.

---

# 48. MVP Cut Line

If time becomes limited, preserve this exact path:

```text
Auth
 ↓
Profile
 ↓
Experience
 ↓
AI Impact
 ↓
Transferable Skills
 ↓
Career Recommendation
 ↓
Skill Gap
 ↓
Roadmap
 ↓
Progress
 ↓
Challenge
 ↓
Evidence
 ↓
Readiness
 ↓
Passport
```

Organization functionality comes after the participant journey is working.

---

# 49. Emergency Scope Reduction

If implementation falls behind:

### First Remove

```text
Second challenge
PDF Passport
Advanced analytics
Complex report formatting
Additional careers
Additional achievements
```

### Never Remove

```text
Authentication
Authorization
Core AI journey
Skill gaps
Roadmap
Progress
At least one challenge
Evidence
Readiness
Passport
```

---

# 50. Performance Rules

Avoid unnecessary AI calls.

Do not call AI when:

```text
Dashboard loads
Progress loads
Passport loads
Organization analytics loads
```

unless the specific feature genuinely requires new AI processing.

Store generated AI results where appropriate.

---

# 51. AI Regeneration

AI analysis should be regenerated when:

```text
Relevant source data changes
OR
Participant explicitly requests regeneration
```

Avoid automatically regenerating expensive analysis on every request.

---

# 52. Demo Reliability

For the hackathon demo:

* Seed known demo data.
* Keep AI responses deterministic enough for the demo.
* Have fallback behavior if AI provider is temporarily unavailable.
* Avoid depending on live external services unnecessarily.
* Test the complete demo journey multiple times.

The demo must not depend on manually editing database records during presentation.

---

# 53. Final Backend Definition of Done

Backend is MVP-ready when:

```text
[ ] Server starts successfully.
[ ] Database connection works.
[ ] Migrations work.
[ ] Seed data works.
[ ] Authentication works.
[ ] Protected routes work.
[ ] Participant ownership is enforced.
[ ] Organization isolation is enforced.
[ ] Profile works.
[ ] Experiences work.
[ ] AI Impact works.
[ ] Transferable Skills works.
[ ] Career recommendations work.
[ ] Skill gaps work.
[ ] Roadmap generation works.
[ ] Roadmap progress works.
[ ] Challenges work.
[ ] Evidence works.
[ ] Readiness works.
[ ] Achievements work.
[ ] Next Best Action works.
[ ] Passport works.
[ ] Public Passport is safe.
[ ] Organization dashboard works.
[ ] Analytics work.
[ ] Tests pass.
[ ] Swagger documentation works.
[ ] No secrets are committed.
[ ] Production environment is configured.
```

---

# 54. Final Architecture Flow

```text
                    HERNext API
                        │
          ┌─────────────┴─────────────┐
          │                           │
      Participant                Organization
          │                           │
          ▼                           ▼
       Profile                    Programs
          │                           │
      Experience                 Participants
          │                           │
          ▼                           ▼
    AI Intelligence              Analytics
          │
          ▼
   Transferable Skills
          │
          ▼
   Career Recommendations
          │
          ▼
      Skill Gaps
          │
          ▼
       Roadmap
          │
          ▼
       Progress
          │
          ▼
      Challenges
          │
          ▼
       Evidence
          │
          ▼
   Career Readiness
          │
          ▼
    Career Passport
```

---

# 55. Final Implementation Principle

The implementation should always answer:

> **What is the smallest reliable version of this feature that proves the product's value?**

Build the complete journey first.

Then improve individual features.

Do not sacrifice the end-to-end participant experience for technically impressive features that are not required for the MVP.
