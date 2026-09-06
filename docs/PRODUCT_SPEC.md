# HerNext — Product Specification

**Project:** HerNext
**Team:** FiveFold
**Track:** Finance, Banking & Investment
**Primary Market:** Africa, starting with Nigeria
**Document Type:** Product Source of Truth
**Status:** MVP Specification

---

# 1. Product Overview

HerNext is an AI-powered career transition and evidence platform designed to help African women navigate changing careers and work environments.

HerNext helps participants:

1. Understand how AI may affect their current work.
2. Discover transferable skills from their existing experience.
3. Identify realistic career paths.
4. Understand their skill gaps.
5. Follow a personalized career roadmap.
6. Prove their abilities through practical challenges and evidence.
7. Measure their career readiness.
8. Generate a professional Career Passport.
9. Become more prepared for future opportunities.

HerNext also provides organizations with tools to run and measure career-development programs for participants.

---

# 2. Core Value Proposition

> **Your experience counts. HerNext helps you understand it, grow it, prove it, and turn it into your next opportunity.**

HerNext should not position itself as a replacement for:

* LinkedIn
* Coursera
* Udemy
* Job boards
* Recruiters
* Universities
* Training providers

Instead, HerNext helps women become more prepared for those ecosystems.

---

# 3. Problem

Many African women have valuable experience that is not represented clearly in conventional professional profiles.

Examples include:

* Running a POS business
* Managing a small business
* Freelancing
* Family business work
* Market trading
* Community work
* Volunteer experience
* Student projects
* Informal financial services
* Side businesses

These experiences may contain valuable professional competencies, but users may not know how to identify, describe, or prove them.

At the same time:

* AI is changing work.
* Some tasks are becoming automated.
* New skills are becoming more valuable.
* Career transitions can be difficult.
* Informal experience is often undervalued.
* Organizations need measurable outcomes from their programs.

HerNext addresses this gap.

---

# 4. Target Users

## 4.1 Participant

Primary user.

A participant may be:

* Employed
* Self-employed
* Freelancing
* A student
* Unemployed
* Working informally

The participant wants to understand their career options and become opportunity-ready.

---

## 4.2 Organization

Organizations may include:

* NGOs
* Universities
* Women-in-tech programs
* Workforce development organizations
* Training organizations
* Career-development programs

Organizations use HerNext to manage participants and measure program outcomes.

---

# 5. Product Principles

HerNext should follow these principles:

### Experience First

Do not assume professional value only comes from formal employment.

### Evidence Over Claims

A participant saying they have a skill is different from demonstrating that skill.

### AI With Boundaries

AI provides interpretation and explanations.

Backend logic remains responsible for business rules and scoring.

### Career Growth, Not Fear

AI impact should help users adapt rather than create fear about job replacement.

### Explainability

Users should understand why HerNext recommends a career, identifies a skill gap, or suggests an action.

### African Context

The product should recognize real African work experiences without treating informal work as inferior.

---

# 6. Participant Journey

The primary participant journey is:

```text
Landing
   ↓
Sign Up / Login
   ↓
Career Profile
   ↓
Tell Us Your Story
   ↓
AI Career Impact Assessment
   ↓
Transferable Skills
   ↓
Career Recommendations
   ↓
Target Career
   ↓
Skill Gap Analysis
   ↓
Personalized Roadmap
   ↓
Progress
   ↓
Practical Challenge
   ↓
Evidence
   ↓
Career Readiness
   ↓
Career Passport
   ↓
Share
```

---

# 7. Authentication

Participants can:

* Register
* Login
* Logout
* View current account
* Reset password

Authentication is handled by the backend.

The frontend must never determine authorization.

The backend derives the authenticated user ID from the authentication context.

---

# 8. Career Profile

The participant provides structured information including:

```text
Name
Country
Occupation
Industry
Years of Experience
Education
Employment Type
Existing Skills
Career Interests
Desired Career
```

Employment type options:

```text
EMPLOYED
SELF_EMPLOYED
FREELANCER
STUDENT
UNEMPLOYED
INFORMAL_WORKER
```

The profile should be editable.

---

# 9. Tell Us Your Story

Participants should be able to describe their experience naturally.

Example:

> "I have been running a POS business for four years. I process transactions, manage cash, keep records, resolve customer payment issues, and monitor daily sales."

The user should not have to manually translate this into:

```text
Transaction Processing
Cash Management
Reconciliation
Customer Service
```

HerNext's AI intelligence layer performs this interpretation.

---

# 10. AI Career Impact Assessment

The system analyzes the participant's current work.

Output should include:

```text
AI Impact Assessment
Impact Level
Tasks that may be automated
Tasks AI can augment
Human-value tasks
Emerging skills
Explanation
```

Example:

```text
AI Impact Assessment: 58%
Impact Level: Moderate
```

The score is a task-level assessment.

It must never be presented as:

```text
"58% chance you will lose your job."
```

---

# 11. Transferable Skills

HerNext converts real-world experience into professional competencies.

Example:

```text
POS Business Owner
        ↓
Transaction Processing
Cash Management
Financial Record Keeping
Customer Service
Reconciliation
Fraud Awareness
Problem Solving
Attention to Detail
```

Each AI-derived skill should have:

```text
Skill
Explanation
Confidence
Source
```

Example:

```text
Transaction Processing
You regularly process customer payments and transactions.

Confidence: 0.91
Source: AI_DERIVED
```

AI-derived does not mean verified.

---

# 12. Career Recommendations

HerNext recommends careers from the approved career catalogue.

The system must not allow the AI to invent careers.

Example recommendations:

```text
Fintech Operations Associate      87%
Banking Operations Officer        81%
Financial Services Customer Success 76%
Risk Operations Associate         72%
Payments Operations Associate     69%
```

Each recommendation should include:

```text
Career
Match Score
Why It Fits
Relevant Existing Skills
Potential Skill Gaps
```

---

# 13. Target Career

The participant selects a target career from available recommendations or the approved career catalogue.

Once selected:

```text
Target Career
       ↓
Required Skills
       ↓
Current Skills
       ↓
Skill Gaps
       ↓
Roadmap
```

The participant should be able to change their target career.

Changing the target career may require recalculating:

* Skill gaps
* Roadmap
* Career readiness
* Next best action

---

# 14. Skill Gap Analysis

The system compares:

```text
Current Skills
VS
Target Career Skills
```

Example:

```text
Already Have:
✓ Customer Service
✓ Transaction Processing
✓ Cash Management

Need to Develop:
○ Excel — High Priority
○ Fraud Awareness — Medium Priority
○ Digital Payments — Medium Priority
```

The backend determines whether a skill is present.

AI can explain why the skill matters.

---

# 15. Personalized Roadmap

The roadmap converts skill gaps into practical actions.

The default structure is:

```text
30 Days
60 Days
90 Days
```

Each phase contains tasks.

Recommended MVP size:

```text
3–5 tasks per phase
9–15 total tasks
```

Each task should contain:

```text
Title
Description
Target Skill
Phase
Estimated Time
Status
```

Task statuses:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

---

# 16. Roadmap Example

### First 30 Days

```text
Learn spreadsheet fundamentals
Practice financial data entry
Complete a transaction reconciliation exercise
```

### Days 31–60

```text
Learn basic fraud indicators
Practice digital payment workflows
Complete customer payment case study
```

### Days 61–90

```text
Complete financial reconciliation challenge
Build a small transaction tracking project
Prepare Career Passport
```

---

# 17. Progress Dashboard

The participant dashboard should provide a clear snapshot of their current journey.

Show:

```text
Overall Progress
Career Readiness
Roadmap Progress
Skills Developed
Skills Remaining
AI Impact
Completed Challenges
Evidence
Achievements
Current Career Goal
Next Best Action
```

The dashboard should not require AI calls every time it loads.

Derived metrics should be calculated from existing records.

---

# 18. Next Best Action

HerNext should display one recommended next action.

Example:

```text
Your next step

Complete your Financial Reconciliation Challenge.

Why it matters:
It will give you evidence for one of the key skills
required for your target career.
```

The backend determines the action.

AI may improve the wording.

---

# 19. Milestones

Participants should receive milestones for meaningful progress.

Examples:

```text
Profile Completed
Career Impact Assessment Completed
First Skill Discovered
First Challenge Completed
First Evidence Added
30-Day Goal Completed
Roadmap Completed
Career Passport Ready
```

---

# 20. Practical Challenges

Challenges allow participants to demonstrate skills.

The MVP should prioritize quality over quantity.

Initial challenges:

### Challenge 1 — Financial Reconciliation

Participant receives fictional transaction data and must:

* Calculate totals
* Identify discrepancies
* Determine closing balance
* Explain the discrepancy

Skills:

```text
Financial Record Keeping
Reconciliation
Attention to Detail
Problem Solving
```

### Challenge 2 — Customer Payment Resolution

Scenario:

A customer's account was debited but the payment did not successfully complete.

Participant explains how they would handle the situation.

Skills:

```text
Customer Service
Problem Solving
Digital Payments
Communication
```

---

# 21. Challenge Submission

A participant submits an answer.

The backend:

1. Validates the submission.
2. Evaluates deterministic components where possible.
3. Stores the result.
4. Creates evidence when appropriate.
5. Allows AI-generated feedback where useful.

AI must not override deterministic challenge scoring.

---

# 22. Evidence

Evidence represents demonstrated or documented capability.

Possible evidence sources:

```text
Challenge
Project
Assessment
Activity
Achievement
```

Evidence should contain:

```text
Title
Description
Related Skills
Source
Status
Created At
```

Evidence statuses may include:

```text
PENDING
VALIDATED
REJECTED
```

AI-derived skills should not automatically become verified evidence.

---

# 23. Career Readiness

Career Readiness summarizes how prepared a participant currently appears to be for their target career.

The score considers:

```text
Experience
Skills
AI Readiness
Evidence
```

Example:

```text
Career Readiness
78%
```

The dashboard should also provide a breakdown so users understand what is contributing to the score.

---

# 24. Career Passport

The Career Passport is the participant's professional summary.

It should contain:

```text
Name
Country
Professional Headline
Experience
Transferable Skills
Existing Skills
Target Career
Career Readiness
Developed Skills
Completed Challenges
Evidence
Achievements
Roadmap Progress
```

The Passport should help the participant present their experience professionally.

---

# 25. Public Career Passport

Participants may generate a shareable public Passport.

Example concept:

```text
hernext.app/passport/aisha-abdullah
```

Public Passport data must be intentionally selected.

Never expose:

```text
Password
Password Hash
Private Email
Authentication Tokens
Private Organization Data
Private Program Data
Internal IDs
Sensitive Personal Data
```

The public Passport must only expose fields explicitly designed for public presentation.

---

# 26. Organization Dashboard

Organizations have a separate dashboard.

The dashboard should show:

```text
Total Participants
Active Participants
Assessment Completion
Average Readiness
Average Roadmap Progress
Skills Developed
Challenges Completed
Passports Created
```

---

# 27. Organization Programs

An organization can create a program/cohort.

A program should contain:

```text
Name
Description
Start Date
End Date
Status
Participants
```

Program statuses:

```text
DRAFT
ACTIVE
COMPLETED
ARCHIVED
```

---

# 28. Participant Monitoring

Organizations can view participant-level progress within their programs.

For each participant, show:

```text
Name
Career Goal
Readiness
Roadmap Progress
Assessment Status
Challenge Progress
Evidence
Last Activity
Status
```

Participant status:

```text
ON_TRACK
NEEDS_ATTENTION
AT_RISK
```

The backend determines the status.

---

# 29. Organization Analytics

Organizations should be able to understand program outcomes.

Example:

```text
Participants: 120
Active: 94
Assessment Completion: 82%
Average Readiness: 71%
Average Roadmap Progress: 64%
Challenges Completed: 86
Passports Created: 72
```

Analytics should be derived from actual participant records.

---

# 30. Program Reports

The system should generate program-level reporting data.

Reports should include:

```text
Participant Count
Participation
Assessment Completion
Skills Developed
Roadmap Completion
Challenge Completion
Evidence Creation
Readiness
Passport Creation
Engagement
Participant Status
```

The MVP may return structured report data through the API.

A highly designed PDF export is optional and should not block the core MVP.

---

# 31. Roles

## Participant

Can:

* Manage own profile
* Add own experiences
* Run career analysis
* View own skills
* View career recommendations
* Select target career
* View skill gaps
* Manage roadmap
* Complete challenges
* Create/view evidence
* View achievements
* Generate Passport

Cannot:

* View another participant's private data
* Access organization analytics
* Modify career catalogue
* Modify another user's records

---

## Organization Member

Can access resources permitted by organization membership.

---

## Organization Admin

Can:

* Manage organization
* Create programs
* Add participants
* View participant progress
* View analytics
* Generate reports

Cannot access participants belonging to another organization unless explicitly authorized.

---

# 32. Data Ownership

Participant data is private by default.

A participant can access their own data.

Organization users can only access participant data through valid:

```text
Organization Membership
+
Program Relationship
```

Backend authorization must enforce this.

Frontend route hiding is not sufficient.

---

# 33. AI Boundaries

AI may:

* Interpret natural language
* Extract skills
* Explain recommendations
* Explain skill gaps
* Suggest roadmap tasks
* Provide challenge feedback

AI may not:

* Create users
* Grant permissions
* Modify authorization
* Invent careers
* Invent skills
* Determine database ownership
* Override challenge results
* Decide final readiness scores
* Access unrelated users' data
* Guarantee employment
* Guarantee income
* Predict someone's exact career outcome

---

# 34. Career Catalogue

Careers must come from an approved catalogue.

Initial MVP careers:

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

This catalogue can expand after the hackathon.

---

# 35. Initial Skill Catalogue

Initial skills include:

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

The catalogue should remain controlled during the MVP.

---

# 36. Example Participant

Use the following participant for demos and development testing:

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

Example experience:

> "I have operated a POS business for four years. I process customer transactions, manage cash, maintain daily records, resolve payment issues, and monitor my daily sales."

Expected transferable skills:

```text
Transaction Processing
Cash Management
Financial Record Keeping
Customer Service
Reconciliation
Problem Solving
Attention to Detail
```

Example target:

```text
Fintech Operations Associate
```

Example skill gaps:

```text
Excel
Fraud Awareness
Digital Payments
```

Example assessment:

```text
AI Impact Assessment: 58%
Impact Level: Moderate
```

Example career match:

```text
Fintech Operations Associate: 87%
```

Example readiness:

```text
Career Readiness: approximately 78%
```

These values are demo expectations, not hardcoded production values.

---

# 37. Participant Success Path

A successful participant should be able to move through:

```text
Unknown Career Direction
        ↓
Understands Current Experience
        ↓
Discovers Transferable Skills
        ↓
Understands AI Impact
        ↓
Identifies Career Options
        ↓
Chooses Target Career
        ↓
Understands Skill Gaps
        ↓
Follows Roadmap
        ↓
Completes Practical Work
        ↓
Builds Evidence
        ↓
Improves Readiness
        ↓
Creates Career Passport
        ↓
Becomes Opportunity-Ready
```

---

# 38. MVP Scope

## Must Have

### Participant

* Authentication
* Career profile
* Experience/story input
* AI career impact assessment
* Transferable skills
* Career recommendations
* Target career
* Skill gaps
* Roadmap
* Task progress
* Dashboard
* At least one practical challenge
* Evidence
* Career readiness
* Achievements
* Career Passport
* Public Passport

### Organization

* Organization authentication
* Organization creation
* Program/cohort creation
* Add participants
* Participant monitoring
* Dashboard analytics
* Participant status
* Basic program report

---

# 39. Should Have

If time permits:

* Second challenge
* Better evidence validation
* More detailed analytics
* PDF Passport
* Program invitations
* Better report formatting
* Additional career paths
* Additional skills

---

# 40. Out of Scope for Hackathon MVP

Do not build:

```text
Mentor marketplace
Employer recruitment marketplace
LinkedIn integration
Automated job applications
Blockchain credentials
Complex certificate verification
Payment system
AI chatbot
Real-time messaging
Advanced notification infrastructure
Complex ML recommendation engine
Large challenge library
Salary prediction
Job-loss prediction
Employer matching engine
Autonomous recruiting
LinkedIn automation
```

These may become future roadmap items.

---

# 41. MVP Quality Rule

It is better to have:

```text
1 excellent participant journey
+
1 excellent challenge
+
1 useful organization dashboard
```

than:

```text
20 partially working features.
```

The hackathon MVP should prioritize:

```text
Completeness
Reliability
Explainability
Demo quality
Data integrity
Security
```

---

# 42. End-to-End Definition of Done

A participant can:

```text
Register
→ Complete profile
→ Describe experience
→ Receive AI impact assessment
→ Discover transferable skills
→ View career recommendations
→ Select target career
→ View skill gaps
→ Receive roadmap
→ Complete roadmap tasks
→ Complete challenge
→ Generate evidence
→ View readiness
→ Earn milestone
→ Generate Career Passport
→ Share Passport
```

An organization can:

```text
Create account
→ Create organization
→ Create program
→ Add participants
→ Monitor progress
→ View readiness
→ Identify at-risk participants
→ View analytics
→ Generate report
```

---

# 43. Product Success Metric

The North Star Metric is:

> **Number of women who move from uncertain about their career future to verified and opportunity-ready.**

Supporting metrics:

```text
Profile Completion
Assessment Completion
Transferable Skills Discovered
Career Goals Selected
Roadmap Completion
Challenges Completed
Evidence Created
Career Readiness Improvement
Career Passports Created
Program Participation
```

---

# 44. Final Product Principle

HerNext should not tell women:

> "Your current career is obsolete."

It should help them understand:

> **"Here is what you already know. Here is how your experience translates. Here is where AI may change your work. Here is where you can grow. Here is how you can prove it. And here is how you can present yourself for your next opportunity."**
