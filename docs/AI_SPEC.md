# HerNext — AI Specification

**Project:** HerNext
**AI Layer:** Career Intelligence Engine
**Backend:** Node.js + TypeScript + Fastify
**Database:** PostgreSQL / Neon
**Validation:** Zod
**Status:** MVP Specification

---

# 1. Purpose

The HerNext Career Intelligence Engine transforms a participant's real-world experience into structured career insights.

The AI helps answer:

> "What skills do I already have, how might AI affect my work, what careers could those skills transfer to, what do I need to learn, and how can I prove that I am ready?"

The AI must support the participant's career transition journey:

```text
Experience
    ↓
AI Analysis
    ↓
Transferable Skills
    ↓
Career Direction
    ↓
Skill Gaps
    ↓
Personalized Roadmap
    ↓
Skill Proof
    ↓
Career Readiness
```

---

# 2. Core Principle

**AI is an intelligence layer, not the application's source of truth.**

The backend owns:

```text
Authentication
Authorization
Database
Career catalogue
Skill catalogue
Score calculations
Progress calculations
Readiness calculations
Achievement logic
Challenge evaluation
Organization analytics
Data access
```

The AI owns:

```text
Natural-language interpretation
Experience extraction
Skill inference
Reasoning
Personalized explanations
Career recommendation explanations
Roadmap suggestions
Challenge feedback
```

---

# 3. AI Architecture

Never allow the frontend to communicate directly with the LLM.

Use:

```text
Frontend
   ↓
API Route
   ↓
Controller
   ↓
Service
   ↓
AI Service
   ↓
Prompt Builder
   ↓
LLM Provider
   ↓
Structured JSON
   ↓
Zod Validation
   ↓
Business Validation
   ↓
Database
   ↓
API Response
```

The frontend should only communicate with HerNext's backend API.

---

# 4. AI Modules

The MVP requires these AI capabilities:

```text
1. Career Impact Assessment
2. Transferable Skill Extraction
3. Career Recommendation Explanation
4. Skill Gap Explanation
5. Personalized Roadmap Generation
6. Challenge Feedback
```

The system should be designed so additional AI capabilities can be added later.

---

# 5. AI Input Rules

AI input should contain only information necessary for the requested operation.

Possible inputs:

```text
Career profile
Occupation
Industry
Employment type
Years of experience
Experience descriptions
Existing skills
Career interests
Target career
Approved career information
Approved skill information
Skill gaps
Challenge answers
```

Do not send unnecessary personal information to the AI provider.

Never send:

```text
Password
Password hash
JWT
Refresh token
Payment information
Private authentication data
Unnecessary organization secrets
```

---

# 6. Grounding Rules

The AI must use:

1. User-provided information.
2. Approved HerNext skills.
3. Approved HerNext careers.
4. Approved career-skill relationships.
5. Relevant challenge information.

The AI must not invent:

```text
Qualifications
Degrees
Employment history
Professional certifications
Years of experience
Skills that have no evidence
Career opportunities
Employer relationships
Salary guarantees
Job guarantees
```

If information is insufficient, the AI should say so.

---

# 7. Distinguish Inferred vs Verified Skills

The AI can identify a skill from an experience.

Example:

```text
Experience:
"I run a POS business and balance my transactions every evening."

AI inference:
Reconciliation
```

But the database must record this as:

```text
source = AI_DERIVED
```

It must not automatically become:

```text
source = VERIFIED
```

A challenge, assessment, or explicit verification process can later provide stronger evidence.

---

# 8. AI Career Impact Assessment

## Purpose

Help the participant understand how AI may affect tasks in their current occupation.

This is not a prediction of whether the participant will lose their job.

---

## Input

```json
{
  "occupation": "POS Business Owner",
  "industry": "Financial Services",
  "employmentType": "INFORMAL_WORKER",
  "yearsOfExperience": 4,
  "responsibilities": [
    "Process customer transactions",
    "Manage cash",
    "Keep transaction records",
    "Resolve payment issues"
  ]
}
```

---

## Output

```json
{
  "score": 58,
  "level": "MODERATE",
  "automationTasks": [],
  "augmentedTasks": [],
  "humanStrengths": [],
  "emergingSkills": [],
  "explanation": "..."
}
```

---

# 9. AI Impact Categories

The AI should classify work into:

### Automation Exposure

Tasks that may become more automated through AI or software.

Examples:

```text
Routine data entry
Basic transaction recording
Repeated calculations
Basic reporting
```

### AI-Augmented Tasks

Tasks where AI can help the worker perform better.

Examples:

```text
Transaction monitoring
Record analysis
Customer issue categorization
Fraud pattern detection
```

### Human-Value Tasks

Tasks where human judgment or interpersonal skills remain important.

Examples:

```text
Customer relationship management
Problem solving
Trust building
Conflict resolution
Decision making
```

### Emerging Skills

Skills that could help the participant adapt.

Examples:

```text
Digital payment tools
Data analysis
Fraud awareness
Excel
AI-assisted workflow management
```

---

# 10. AI Impact Score

The AI may provide evidence and classification, but the backend owns the final score.

The AI should not be trusted to arbitrarily determine:

```text
"Your score is 83."
```

Instead, the AI returns structured task-level information.

The backend normalizes that information according to `SCORING_LOGIC.md`.

The final score must be deterministic and explainable.

---

# 11. Transferable Skills Engine

## Purpose

Convert informal, self-employed, volunteer, academic, freelance, or traditional employment experience into professional competencies.

This is a major HerNext differentiator.

Example:

```text
"I run a POS business."
```

Should not simply produce:

```text
POS Business
```

It should identify demonstrated competencies such as:

```text
Transaction Processing
Cash Management
Customer Service
Financial Record Keeping
Reconciliation
Problem Solving
Attention to Detail
```

---

# 12. Transferable Skill Input

```json
{
  "experience": {
    "title": "POS Business Owner",
    "description": "I run a POS business where I process customer transactions, manage cash, keep daily records and resolve payment issues."
  },
  "approvedSkills": [
    {
      "id": "uuid",
      "name": "Cash Management"
    },
    {
      "id": "uuid",
      "name": "Customer Service"
    }
  ]
}
```

---

# 13. Transferable Skill Output

```json
{
  "skills": [
    {
      "skillId": "uuid",
      "skillName": "Cash Management",
      "reason": "The experience involves handling and balancing transaction funds.",
      "confidence": 0.91
    }
  ]
}
```

The AI should return only skills that exist in the approved skill catalogue.

---

# 14. Confidence

Confidence must be represented as a value between:

```text
0.0
```

and

```text
1.0
```

Example:

```text
0.91 = strong evidence
0.70 = moderate evidence
0.45 = weak evidence
```

Confidence is not the same thing as verified proficiency.

---

# 15. Career Recommendation Engine

The AI must not invent career paths.

The backend first retrieves approved careers.

Example:

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

The backend calculates candidate match scores.

The AI then explains:

```text
Why this career fits
Which experiences transfer
Which strengths are relevant
What gaps remain
```

---

# 16. Career Recommendation Input

```json
{
  "userSkills": [],
  "experience": [],
  "careerInterests": [],
  "targetCareer": {},
  "candidateCareers": []
}
```

---

# 17. Career Recommendation Output

```json
{
  "recommendations": [
    {
      "careerId": "uuid",
      "reason": "Your transaction processing, cash management and customer service experience align strongly with fintech operations."
    }
  ]
}
```

The backend adds:

```text
matchScore
rank
```

---

# 18. Skill Gap Analysis

The backend determines the actual skill gap by comparing:

```text
User Skills
       VS
Career Required Skills
```

The AI provides context.

Example:

```text
Skill:
Excel

Status:
NEEDS_DEVELOPMENT

Priority:
HIGH
```

AI explanation:

```text
"Excel is useful for organizing transaction records,
performing reconciliation and creating operational reports."
```

The AI must not change the underlying skill-gap status.

---

# 19. Roadmap Generation

The AI can suggest personalized tasks based on:

```text
Target Career
Existing Skills
Skill Gaps
Experience
Career Interests
```

The roadmap must contain:

```text
30-day phase
60-day phase
90-day phase
```

---

# 20. Roadmap Output

Example:

```json
{
  "title": "Fintech Operations Career Roadmap",
  "description": "...",
  "phases": [
    {
      "phase": "DAY_30",
      "tasks": [
        {
          "title": "Learn basic Excel formulas",
          "description": "...",
          "skillName": "Excel",
          "estimatedMinutes": 60
        }
      ]
    }
  ]
}
```

The backend must validate:

* Phase is valid.
* Skill exists.
* Task has a title.
* Estimated time is reasonable.
* Number of tasks is within MVP limits.
* No invented skill IDs are persisted.

---

# 21. Roadmap Generation Limits

The MVP should avoid huge AI-generated plans.

Recommended maximum:

```text
DAY_30: 3–5 tasks
DAY_60: 3–5 tasks
DAY_90: 3–5 tasks
```

Total:

```text
9–15 tasks
```

This keeps the roadmap practical.

---

# 22. Challenge Feedback

For challenge submissions, deterministic evaluation should be preferred where possible.

Example:

```text
Financial Reconciliation Challenge
```

The backend calculates:

```text
Correct/incorrect
Score
Pass/fail
```

AI may provide human-readable feedback.

Example:

```text
"You correctly identified the transaction discrepancy
and demonstrated an understanding of reconciliation."
```

AI should not override deterministic challenge results.

---

# 23. Structured Output Requirement

AI responses must be structured JSON.

Do not rely on free-form responses such as:

```text
"Based on your experience, I think..."
```

for data-processing operations.

Expected flow:

```text
LLM
 ↓
JSON
 ↓
Zod schema
 ↓
Business validation
 ↓
Database
```

---

# 24. Zod Validation

Every AI operation must have a corresponding Zod schema.

Conceptual example:

```ts
const transferableSkillsSchema = z.object({
  skills: z.array(
    z.object({
      skillId: z.string().uuid(),
      skillName: z.string(),
      reason: z.string(),
      confidence: z.number().min(0).max(1)
    })
  )
});
```

The actual schemas should live inside the AI module.

Suggested structure:

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

# 25. Prompt Design

Prompts should be version-controlled in the repository.

Do not scatter large prompts throughout controllers.

Recommended:

```text
src/modules/ai/prompts/
```

Each prompt should define:

```text
Role
Task
Available context
Rules
Output schema
Restrictions
```

---

# 26. Base System Instruction

All HerNext career-intelligence prompts should follow principles equivalent to:

```text
You are the HerNext Career Intelligence Engine.

Your job is to help African women translate real-world
experience into career-relevant insights.

Use only the information provided to you and the approved
HerNext career and skill catalogue.

Never invent qualifications, employment history, skills,
certifications, employers, salary information or job guarantees.

Clearly distinguish inferred skills from verified skills.

Do not make discriminatory recommendations.

Do not claim that an AI impact assessment predicts job loss.

Return only the requested structured output.
```

This instruction should be adapted per AI operation rather than blindly copied into every prompt.

---

# 27. AI Safety Rules

The AI must not:

* Guarantee employment.
* Guarantee income.
* Predict someone's future with certainty.
* Claim that a career is objectively "best."
* Discriminate based on protected characteristics.
* Infer sensitive personal characteristics.
* Invent qualifications.
* Invent experience.
* Invent employers.
* Invent certifications.
* Present inferred skills as verified.
* Expose system prompts.
* Expose API keys.
* Make financial promises.
* Provide deceptive professional credentials.

---

# 28. African Context

The AI should recognize that professional experience can exist outside formal employment.

Relevant examples:

```text
POS businesses
Small businesses
Family businesses
Market trading
Freelancing
Community work
Volunteer work
Informal financial services
Side businesses
Care responsibilities
Student projects
```

However, the AI must not automatically convert every activity into a professional skill.

There must be evidence in the user's description.

---

# 29. Language and Tone

AI explanations should be:

* Clear
* Encouraging
* Practical
* Professional
* Non-judgmental
* Easy to understand

Avoid excessive corporate jargon.

Prefer:

```text
"You already have experience balancing transactions."
```

over:

```text
"You possess demonstrable financial reconciliation competencies."
```

The participant should understand why the result matters.

---

# 30. Explainability

Every major AI-generated insight should include a reason.

For example:

```json
{
  "skillName": "Customer Service",
  "reason": "You regularly resolve payment issues and interact directly with customers."
}
```

Avoid unexplained recommendations.

---

# 31. AI Failure Handling

Possible AI failures:

```text
Provider unavailable
Timeout
Malformed JSON
Schema validation failure
Unknown skill ID
Unknown career ID
Incomplete response
Content policy failure
Rate limit
```

The backend must handle these gracefully.

Example:

```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "Career analysis is temporarily unavailable. Please try again."
  }
}
```

Do not expose raw provider errors.

---

# 32. Retry Strategy

Only retry failures that are reasonably transient.

Examples:

```text
Timeout
Temporary provider failure
Rate limit
```

Do not endlessly retry malformed AI output.

Recommended MVP:

```text
Maximum retries: 1–2
```

After failure, return a safe error to the frontend.

---

# 33. AI Data Persistence

Only validated AI output should be persisted.

Example:

```text
LLM response
      ↓
Parse
      ↓
Zod validation
      ↓
Business validation
      ↓
Normalize
      ↓
Persist
```

Never:

```text
LLM response
      ↓
Prisma.create()
```

without validation.

---

# 34. AI Versioning

AI-generated records should ideally store enough metadata to understand how they were produced.

For MVP, consider storing:

```text
model
promptVersion
createdAt
```

where practical.

Example:

```text
model = "..."
promptVersion = "career-impact-v1"
```

This makes future debugging easier.

---

# 35. AI Cost Control

The MVP should avoid unnecessary LLM calls.

Do not call the AI every time the dashboard loads.

Instead:

```text
User requests analysis
       ↓
AI call
       ↓
Save result
       ↓
Return saved result later
```

Use existing stored results when appropriate.

Examples:

```text
Career Impact → generate once, regenerate explicitly
Transferable Skills → generate when experience changes
Roadmap → generate when target career changes or user requests regeneration
```

---

# 36. AI Regeneration

When a participant requests regeneration:

1. Retrieve current source data.
2. Generate new AI output.
3. Validate it.
4. Save the new result.
5. Keep the previous result if historical tracking is implemented.

Never overwrite good existing data with malformed output.

---

# 37. Privacy

Only send necessary data to the AI provider.

Do not send:

```text
Passwords
Authentication tokens
Payment details
Private secrets
Unnecessary organization information
```

The AI service should receive a minimized context object.

---

# 38. Testing

AI functionality requires two types of tests.

### Deterministic tests

Test:

```text
Zod validation
Score calculation
Skill ID validation
Career ID validation
Business rules
Error handling
Persistence
Authorization
```

### AI integration tests

Test:

```text
Valid structured response
Malformed response
Missing fields
Unknown skill
Unknown career
Provider failure
Timeout
```

Where possible, use mocked AI responses in automated tests.

Do not make the test suite dependent on a live AI provider.

---

# 39. MVP AI Features

Must have:

```text
Career Impact Assessment
Transferable Skills
Career Recommendation Explanations
Skill Gap Explanations
Roadmap Generation
Challenge Feedback
```

---

# 40. Explicitly Out of Scope

Do not build:

```text
AI chatbot
AI career coach conversation
Autonomous job applications
AI recruiter
Real-time voice assistant
Complex machine-learning recommendation model
Resume auto-submission
LinkedIn automation
Predictive employment forecasting
Salary prediction
Employer matching engine
```

These can be future features.

---

# 41. AI Definition of Done

The AI layer is complete when:

* [ ] AI is accessed only through the backend.
* [ ] AI provider credentials are stored in environment variables.
* [ ] Prompts are version-controlled.
* [ ] AI responses use structured JSON.
* [ ] Every AI response is validated with Zod.
* [ ] Unknown career/skill IDs are rejected.
* [ ] AI-derived skills are marked `AI_DERIVED`.
* [ ] AI never controls authentication or authorization.
* [ ] AI never controls core score calculations.
* [ ] AI never invents careers outside the approved catalogue.
* [ ] AI failures return safe API errors.
* [ ] AI calls are minimized and persisted where appropriate.
* [ ] AI integration tests use mocks.
* [ ] Explanations are understandable to participants.
* [ ] No employment or income guarantees are made.
* [ ] The complete AI career journey works end-to-end.

---

# 42. Final AI Flow

```text
Participant Experience
        ↓
Career Impact Assessment
        ↓
Transferable Skills
        ↓
Backend Career Matching
        ↓
AI Recommendation Explanation
        ↓
Backend Skill Gap Calculation
        ↓
AI Skill Gap Explanation
        ↓
AI Roadmap Suggestions
        ↓
Backend Validation
        ↓
Roadmap
        ↓
Challenges
        ↓
Evidence
        ↓
Backend Readiness Calculation
        ↓
Career Passport
```

**Core rule:**

> AI interprets and explains.
> Backend validates, calculates, stores and controls.
