# HerNext — Database Schema Specification

**Project:** HerNext
**Track:** Finance, Banking & Investment
**Backend:** Node.js + TypeScript + Fastify
**Database:** PostgreSQL (Neon)
**ORM:** Prisma

---

## 1. Database Principles

The HerNext database follows these principles:

1. **User data is private by default.**
2. Users can only access their own participant data.
3. Organization admins can only access participants belonging to their organization/programs.
4. AI-generated information must be distinguishable from verified/user-provided information.
5. Derived metrics such as progress and readiness should be calculated from source records whenever practical.
6. The database should support one participant joining multiple programs.
7. Career recommendations must come from the approved HerNext career catalogue, not careers invented by the AI.
8. Public Career Passports must expose only explicitly public information.
9. Avoid unnecessary duplication of user data.
10. The schema should remain simple enough to implement and test within the hackathon.

---

# 2. Core Relationship Model

```text
User
│
├── ParticipantProfile
│   │
│   ├── CareerProfile
│   ├── Experience[]
│   ├── UserSkill[]
│   ├── CareerRecommendation[]
│   ├── SkillGap[]
│   ├── Roadmap[]
│   ├── ChallengeSubmission[]
│   ├── Evidence[]
│   ├── UserAchievement[]
│   └── CareerPassport
│
└── OrganizationMembership[]
       │
       └── Organization
              │
              └── Program[]
                     │
                     └── ProgramParticipant[]
```

Reference data:

```text
Skill
│
├── UserSkill
├── CareerSkill
├── TransferableSkill
├── SkillGap
├── RoadmapTask
└── Challenge

CareerPath
│
├── CareerSkill[]
├── CareerRecommendation[]
├── SkillGap[]
└── Roadmap[]
```

---

# 3. User

Represents every authenticated account.

### Fields

| Field        | Type     | Required | Description                       |
| ------------ | -------- | -------: | --------------------------------- |
| id           | UUID     |      Yes | Primary key                       |
| email        | String   |      Yes | Unique login email                |
| passwordHash | String   |      Yes | Hashed password                   |
| firstName    | String   |      Yes | First name                        |
| lastName     | String   |      Yes | Last name                         |
| role         | UserRole |      Yes | Participant or organization admin |
| country      | String   |      Yes | User's country                    |
| isActive     | Boolean  |      Yes | Account status                    |
| createdAt    | DateTime |      Yes | Creation timestamp                |
| updatedAt    | DateTime |      Yes | Last update                       |

### Constraints

* Email must be unique.
* Password is never stored in plain text.
* `isActive` defaults to `true`.

---

# 4. ParticipantProfile

Stores participant-specific information without forcing the `User` model to contain participant-only fields.

### Fields

| Field     | Type     | Required |
| --------- | -------- | -------: |
| id        | UUID     |      Yes |
| userId    | UUID     |      Yes |
| createdAt | DateTime |      Yes |
| updatedAt | DateTime |      Yes |

### Relationship

```text
User 1 ─── 1 ParticipantProfile
```

A participant profile belongs to exactly one user.

---

# 5. CareerProfile

Stores the participant's career information.

### Fields

| Field                | Type           | Required |
| -------------------- | -------------- | -------: |
| id                   | UUID           |      Yes |
| participantProfileId | UUID           |      Yes |
| currentOccupation    | String         |      Yes |
| industry             | String         |      Yes |
| yearsOfExperience    | Float          |      Yes |
| education            | String         |       No |
| employmentType       | EmploymentType |      Yes |
| careerInterests      | String[]       |       No |
| targetCareerId       | UUID           |       No |
| createdAt            | DateTime       |      Yes |
| updatedAt            | DateTime       |      Yes |

### Employment Types

```text
EMPLOYED
SELF_EMPLOYED
FREELANCER
STUDENT
UNEMPLOYED
INFORMAL_WORKER
```

`targetCareerId` references an approved `CareerPath`.

---

# 6. Experience

Stores real-world experience submitted by the participant.

This is one of the most important sources for the AI Career Intelligence Engine.

### Fields

| Field          | Type           | Required |
| -------------- | -------------- | -------: |
| id             | UUID           |      Yes |
| userId         | UUID           |      Yes |
| title          | String         |      Yes |
| description    | Text           |      Yes |
| organization   | String         |       No |
| years          | Float          |       No |
| employmentType | EmploymentType |      Yes |
| startDate      | DateTime       |       No |
| endDate        | DateTime       |       No |
| createdAt      | DateTime       |      Yes |
| updatedAt      | DateTime       |      Yes |

### Example

```text
Title:
POS Business Owner

Description:
I run a POS business where I process customer transactions,
manage cash, keep daily records and resolve payment issues.

Employment Type:
INFORMAL_WORKER
```

The AI can then identify professional competencies from this experience.

---

# 7. Skill

Master catalogue of approved HerNext skills.

### Fields

| Field       | Type          | Required |
| ----------- | ------------- | -------: |
| id          | UUID          |      Yes |
| name        | String        |      Yes |
| category    | SkillCategory |      Yes |
| description | Text          |      Yes |
| createdAt   | DateTime      |      Yes |

### Initial Skill Catalogue

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

The catalogue can grow after the MVP.

---

# 8. UserSkill

Connects users to skills.

This allows the same skill to come from different sources.

### Fields

| Field       | Type        |
| ----------- | ----------- |
| id          | UUID        |
| userId      | UUID        |
| skillId     | UUID        |
| source      | SkillSource |
| confidence  | Float       |
| proficiency | Float       |
| createdAt   | DateTime    |
| updatedAt   | DateTime    |

### Skill Sources

```text
SELF_REPORTED
AI_DERIVED
CHALLENGE
VERIFIED
```

### Important Rule

An AI-derived skill is **not automatically a verified skill**.

For example:

```text
AI_DERIVED
confidence: 0.86
```

means:

> The AI identified strong evidence of this skill.

It does not mean:

> The user has professionally verified this skill.

---

# 9. CareerPath

Approved career catalogue.

The AI must recommend careers from this catalogue.

### Fields

| Field       | Type     |
| ----------- | -------- |
| id          | UUID     |
| name        | String   |
| industry    | String   |
| description | Text     |
| level       | String   |
| createdAt   | DateTime |
| updatedAt   | DateTime |

### Initial Finance Careers

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

---

# 10. CareerSkill

Defines which skills are needed for a career.

### Fields

| Field        | Type            |
| ------------ | --------------- |
| id           | UUID            |
| careerPathId | UUID            |
| skillId      | UUID            |
| importance   | SkillImportance |

### Importance

```text
REQUIRED
IMPORTANT
NICE_TO_HAVE
```

---

# 11. CareerAnalysis

Stores AI Career Impact Assessment results.

### Fields

| Field           | Type        |
| --------------- | ----------- |
| id              | UUID        |
| userId          | UUID        |
| experienceId    | UUID        |
| aiImpactScore   | Int         |
| impactLevel     | ImpactLevel |
| automationTasks | Json        |
| augmentedTasks  | Json        |
| humanStrengths  | Json        |
| emergingSkills  | Json        |
| explanation     | Text        |
| createdAt       | DateTime    |

### Impact Levels

```text
LOW
MODERATE
HIGH
```

### Important

The score is an **assessment**, not a scientific prediction of job loss.

The API must explain the reasoning behind the assessment.

---

# 12. TransferableSkill

Stores skills identified from specific experiences.

### Fields

| Field              | Type     |
| ------------------ | -------- |
| id                 | UUID     |
| userId             | UUID     |
| skillId            | UUID     |
| sourceExperienceId | UUID     |
| reason             | Text     |
| confidence         | Float    |
| createdAt          | DateTime |

Example:

```text
Experience:
POS Business Owner

Skill:
Cash Management

Reason:
Regularly handling customer cash and balancing transactions
demonstrates practical cash-management experience.

Confidence:
0.91
```

---

# 13. CareerRecommendation

Stores recommended careers and their calculated match scores.

### Fields

| Field        | Type     |
| ------------ | -------- |
| id           | UUID     |
| userId       | UUID     |
| careerPathId | UUID     |
| matchScore   | Int      |
| reason       | Text     |
| rank         | Int      |
| createdAt    | DateTime |

### Important

`matchScore` is calculated by backend business logic.

The AI provides the explanation.

The AI must not arbitrarily return:

```text
87%
```

without the backend calculating that score.

---

# 14. SkillGap

Represents the difference between current skills and requirements for a target career.

### Fields

| Field        | Type           |
| ------------ | -------------- |
| id           | UUID           |
| userId       | UUID           |
| careerPathId | UUID           |
| skillId      | UUID           |
| status       | SkillGapStatus |
| priority     | Priority       |
| reason       | Text           |
| createdAt    | DateTime       |

### Status

```text
HAS_SKILL
NEEDS_DEVELOPMENT
```

### Priority

```text
HIGH
MEDIUM
LOW
```

---

# 15. Roadmap

Represents a personalized career-development roadmap.

### Fields

| Field        | Type     |
| ------------ | -------- |
| id           | UUID     |
| userId       | UUID     |
| careerPathId | UUID     |
| title        | String   |
| description  | Text     |
| createdAt    | DateTime |
| updatedAt    | DateTime |

Do **not** store `overallProgress` permanently unless there is a strong technical reason.

Calculate it from roadmap tasks.

---

# 16. RoadmapTask

Individual activities within a roadmap.

### Fields

| Field            | Type         |
| ---------------- | ------------ |
| id               | UUID         |
| roadmapId        | UUID         |
| phase            | RoadmapPhase |
| title            | String       |
| description      | Text         |
| skillId          | UUID         |
| estimatedMinutes | Int          |
| order            | Int          |
| status           | TaskStatus   |
| completedAt      | DateTime     |
| createdAt        | DateTime     |
| updatedAt        | DateTime     |

### Phases

```text
DAY_30
DAY_60
DAY_90
```

### Status

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

---

# 17. Challenge

Represents practical skill-proof activities.

### Fields

| Field       | Type                |
| ----------- | ------------------- |
| id          | UUID                |
| title       | String              |
| description | Text                |
| difficulty  | ChallengeDifficulty |
| createdAt   | DateTime            |
| updatedAt   | DateTime            |

Challenges can be connected to multiple skills.

---

# 18. ChallengeSkill

Many-to-many relationship between challenges and skills.

### Fields

```text
id
challengeId
skillId
```

---

# 19. ChallengeSubmission

Stores a participant's challenge attempt.

### Fields

| Field       | Type             |
| ----------- | ---------------- |
| id          | UUID             |
| challengeId | UUID             |
| userId      | UUID             |
| answer      | Json             |
| score       | Int              |
| status      | SubmissionStatus |
| feedback    | Text             |
| submittedAt | DateTime         |
| evaluatedAt | DateTime         |

### Submission Status

```text
PENDING
PASSED
FAILED
```

For the MVP, challenge evaluation can use deterministic backend rules.

---

# 20. Evidence

Represents proof of developed or demonstrated skills.

### Fields

| Field       | Type           |
| ----------- | -------------- |
| id          | UUID           |
| userId      | UUID           |
| challengeId | UUID           |
| skillId     | UUID           |
| title       | String         |
| description | Text           |
| result      | Text           |
| status      | EvidenceStatus |
| createdAt   | DateTime       |

### Evidence Status

```text
PENDING
VERIFIED
```

A passed challenge can automatically create evidence.

---

# 21. Achievement

Master list of milestones.

### Fields

| Field       | Type     |
| ----------- | -------- |
| id          | UUID     |
| name        | String   |
| description | Text     |
| criteria    | Json     |
| createdAt   | DateTime |

### Initial Achievements

```text
PROFILE_COMPLETED
ASSESSMENT_COMPLETED
FIRST_SKILL_DISCOVERED
FIRST_CHALLENGE_COMPLETED
FIRST_EVIDENCE_CREATED
30_DAY_GOAL_COMPLETED
ROADMAP_COMPLETED
PASSPORT_READY
```

---

# 22. UserAchievement

Connects users to earned achievements.

### Fields

```text
id
userId
achievementId
earnedAt
```

A user should not receive the same achievement more than once.

---

# 23. CareerPassport

Represents the participant's public professional profile.

### Fields

| Field     | Type     |
| --------- | -------- |
| id        | UUID     |
| userId    | UUID     |
| slug      | String   |
| isPublic  | Boolean  |
| createdAt | DateTime |
| updatedAt | DateTime |

### Important

Do not duplicate the entire user's career information into the passport.

The passport should aggregate data from:

```text
User
CareerProfile
Experience
UserSkill
CareerRecommendation
Roadmap
ChallengeSubmission
Evidence
UserAchievement
```

This prevents stale duplicated data.

---

# 24. Organization

Represents an organization using HerNext.

Examples:

```text
NGO
University
Women-in-Tech Program
Training Organization
Workforce Development Organization
```

### Fields

| Field       | Type     |
| ----------- | -------- |
| id          | UUID     |
| name        | String   |
| description | Text     |
| country     | String   |
| createdAt   | DateTime |
| updatedAt   | DateTime |

---

# 25. OrganizationMember

Connects users to organizations.

### Fields

```text
id
organizationId
userId
role
createdAt
```

### Organization Roles

```text
ADMIN
MEMBER
```

For MVP, the organization admin role is the main one needed.

---

# 26. Program

Represents an organization program/cohort.

### Fields

| Field          | Type          |
| -------------- | ------------- |
| id             | UUID          |
| organizationId | UUID          |
| name           | String        |
| description    | Text          |
| startDate      | DateTime      |
| endDate        | DateTime      |
| status         | ProgramStatus |
| createdAt      | DateTime      |
| updatedAt      | DateTime      |

### Program Status

```text
DRAFT
ACTIVE
COMPLETED
ARCHIVED
```

---

# 27. ProgramParticipant

Connects participants to programs.

### Fields

```text
id
programId
userId
joinedAt
```

### Constraints

A participant should not be added to the same program twice.

---

# 28. Analytics

Do not create a large analytics table for the MVP.

Organization analytics should be calculated from existing records.

Examples:

```text
Total participants
Active participants
Assessment completion
Average readiness
Average roadmap progress
Challenges completed
Evidence created
Passports created
```

These values should be derived from participant data.

---

# 29. Authentication Sessions / Tokens

For MVP, authentication can use JWT access tokens with a secure refresh-token strategy.

If refresh tokens are persisted, create a session/token table containing:

```text
id
userId
tokenHash
expiresAt
createdAt
revokedAt
```

Never store raw refresh tokens if avoidable.

---

# 30. Enums

The Prisma schema should contain enums for controlled values.

```text
UserRole
EmploymentType
SkillCategory
SkillSource
SkillImportance
ImpactLevel
SkillGapStatus
Priority
RoadmapPhase
TaskStatus
ChallengeDifficulty
SubmissionStatus
EvidenceStatus
ProgramStatus
OrganizationRole
```

---

# 31. Indexing

Important indexes should include:

```text
User.email
CareerProfile.participantProfileId
Experience.userId
UserSkill.userId
UserSkill.skillId
CareerRecommendation.userId
CareerRecommendation.careerPathId
SkillGap.userId
SkillGap.careerPathId
Roadmap.userId
RoadmapTask.roadmapId
ChallengeSubmission.userId
Evidence.userId
CareerPassport.slug
OrganizationMember.userId
OrganizationMember.organizationId
Program.organizationId
ProgramParticipant.programId
ProgramParticipant.userId
```

Unique constraints should be used where appropriate.

Examples:

```text
User.email
CareerPassport.slug
ProgramParticipant(programId, userId)
UserAchievement(userId, achievementId)
CareerSkill(careerPathId, skillId)
ChallengeSkill(challengeId, skillId)
```

---

# 32. Data Ownership Rules

## Participant

A participant can access:

```text
Own User
Own ParticipantProfile
Own CareerProfile
Own Experiences
Own Skills
Own AI Analyses
Own Recommendations
Own Skill Gaps
Own Roadmap
Own Challenges/Submissions
Own Evidence
Own Achievements
Own Career Passport
```

A participant cannot access another participant's private records.

## Organization Admin

An organization admin can access:

```text
Own Organization
Own Programs
Participants belonging to own programs
Aggregate program analytics
Program reports
Participant progress within own programs
```

An organization admin cannot access:

```text
Other organizations
Participants outside their programs
Private data unrelated to program participation
```

---

# 33. AI vs Backend Responsibility

### AI may generate

```text
Experience interpretation
Transferable skill suggestions
AI impact explanations
Automation task suggestions
AI-augmented task suggestions
Emerging skill suggestions
Career recommendation explanations
Skill-gap explanations
Roadmap suggestions
Challenge feedback
```

### Backend must control

```text
Authentication
Authorization
Database writes
Career catalogue
Skill catalogue
Career match score
Readiness score
Roadmap progress
Challenge status
Evidence status
Achievements
Organization status
Analytics
Data access
Validation
```

The AI must never be trusted with authorization or core business calculations.

---

# 34. MVP Seed Data

The database should contain enough seed data for a complete demo.

### Demo Participant

```text
Name:
Aisha Abdullah

Occupation:
POS Business Owner

Experience:
4 years

Industry:
Financial Services

Employment Type:
INFORMAL_WORKER
```

### Example Experience

```text
I run a POS business where I process customer transactions,
manage cash, keep daily records and resolve payment issues.
I interact with customers every day and make sure transactions
are properly recorded and balanced.
```

### Expected Demo Skills

```text
Transaction Processing
Cash Management
Financial Record Keeping
Customer Service
Reconciliation
Problem Solving
Attention to Detail
```

### Example Career

```text
Fintech Operations Associate
```

### Example Skill Gaps

```text
Excel
Fraud Awareness
Digital Payments
```

### Example Challenge

```text
Financial Reconciliation Challenge
```

The seed data should allow the team to demonstrate the complete participant journey without manually entering everything during the demo.

---

# 35. Migration Strategy

Development workflow:

```text
Modify prisma/schema.prisma
        ↓
Run migration
        ↓
Generate Prisma Client
        ↓
Run seed
        ↓
Test API
```

Typical development commands:

```bash
npx prisma migrate dev --name init
npx prisma generate
npx prisma db seed
```

Do not manually edit production database tables.

---

# 36. Final MVP Relationship Summary

```text
USER
 │
 ├── PARTICIPANT PROFILE
 │      │
 │      └── CAREER PROFILE
 │
 ├── EXPERIENCES
 │      └── CAREER ANALYSIS
 │
 ├── USER SKILLS
 │      └── SKILLS
 │
 ├── TRANSFERABLE SKILLS
 │
 ├── CAREER RECOMMENDATIONS
 │      └── CAREER PATH
 │             └── CAREER SKILLS
 │
 ├── SKILL GAPS
 │
 ├── ROADMAP
 │      └── ROADMAP TASKS
 │
 ├── CHALLENGE SUBMISSIONS
 │      └── EVIDENCE
 │
 ├── ACHIEVEMENTS
 │
 └── CAREER PASSPORT


ORGANIZATION
 │
 ├── ORGANIZATION MEMBERS
 │
 └── PROGRAMS
        │
        └── PROGRAM PARTICIPANTS
               │
               └── USER
```

---

## Schema Definition of Done

The database layer is ready when:

* [ ] Prisma schema matches this specification.
* [ ] PostgreSQL migration succeeds on Neon.
* [ ] Prisma Client generates successfully.
* [ ] Seed data loads successfully.
* [ ] Foreign-key relationships work.
* [ ] Unique constraints work.
* [ ] Authentication can reference users.
* [ ] Participant data can be isolated.
* [ ] Organization data can be isolated.
* [ ] Demo participant can complete the intended data flow.
* [ ] No AI output bypasses backend validation.
