# HerNext — Scoring & Business Logic Specification

**Project:** HerNext
**Purpose:** Define deterministic scoring and business rules
**Status:** MVP Specification

---

# 1. Core Principle

HerNext scores must be:

* Explainable
* Deterministic
* Reproducible
* Based on available data
* Calculated by the backend

The AI may provide analysis and explanations, but it must **not invent or arbitrarily assign business scores**.

For example, the AI should not simply return:

```text
Career Fit: 87%
```

The backend calculates the score.

The AI explains why the participant is a strong or weak match.

---

# 2. Score Range

All percentage-based scores use:

```text
0–100
```

Rules:

```text
0 = lowest
100 = highest
```

Scores must be clamped to the valid range.

Conceptually:

```text
score = max(0, min(100, score))
```

---

# 3. AI Impact Assessment

## Purpose

The AI Impact Assessment estimates how a participant's current work may be affected by AI and automation.

It is **not** a prediction of:

* Job loss
* Income loss
* Employability
* Career success

The score describes **task-level exposure and opportunity for AI augmentation**.

---

# 4. AI Impact Components

The assessment considers three task categories:

```text
Automation Exposure
AI Augmentation Opportunity
Human-Value Tasks
```

The AI identifies tasks belonging to each category.

The backend converts the analysis into a normalized score.

---

# 5. AI Impact Score

For the MVP, use:

```text
Automation Exposure:        50%
AI Augmentation Opportunity: 30%
Human-Value Tasks:           20%
```

The normalized score represents **overall AI impact/exposure**, not job-loss probability.

Higher score:

```text
More opportunity for AI/automation to significantly change
the way the participant performs their work.
```

Lower score:

```text
Less direct AI/automation exposure in the identified tasks.
```

## 5.1 Deterministic Formula (backend-owned)

The three category weights form a weighted average of the task mix. Because the
weights sum to `1.0`, a raw weighted average only spans `0.20` (all tasks are
human-value) to `0.50` (all tasks are automation-exposed). To make the
documented `0–100` scale and the `67–100` HIGH band reachable, the backend maps
that weighted average onto the achievable range.

Given `a`, `u` and `h` as the counts of automation, augmentation and human-value
tasks:

```text
total = a + u + h

weighted = (a · 0.50 + u · 0.30 + h · 0.20) / total

minWeighted = 0.20   # all tasks are human-value
maxWeighted = 0.50   # all tasks are automation-exposed

raw = (weighted − minWeighted) / (maxWeighted − minWeighted) · 100

score = clamp(round(raw))   # clamp to 0–100, round to nearest integer
```

When `total = 0` (no classified tasks) the score is `0`.

This preserves the documented category weights and bandwidths unchanged while
mapping the documented poles onto the scale:

```text
all automation-exposed tasks                     → 100
all human-value tasks                            → 0
all augmentation tasks                           → 33
```

The formula is implemented in `src/lib/scoring/ai-impact.ts` and is covered by
deterministic unit tests. The AI never returns the score; the backend computes
it.

---

# 6. Impact Level

Map the final score to:

```text
0–33   → LOW
34–66  → MODERATE
67–100 → HIGH
```

Examples:

```text
28 → LOW
58 → MODERATE
81 → HIGH
```

---

# 7. Important AI Impact Disclaimer

Whenever the score is displayed to users, the UI should communicate that it is an assessment of task-level AI impact.

It should not imply:

```text
"AI will replace you."
```

Prefer:

```text
"Some parts of this work may change as AI and automation become more common."
```

---

# 8. Career Match Score

Career matching compares the participant's profile against an approved HerNext career.

The backend must calculate the score.

Use four components:

```text
Skill Match       45%
Experience Match  25%
Career Interest   15%
AI Readiness      15%
```

Total:

```text
100%
```

---

# 9. Skill Match Score

Skill Match measures how many relevant career skills the participant already possesses.

Career skills have different importance levels.

Use weights:

```text
REQUIRED       = 3
IMPORTANT      = 2
NICE_TO_HAVE   = 1
```

Formula:

```text
Skill Match =
(User matched skill weight / Total career skill weight) × 100
```

Example:

```text
Career requires:

Transaction Processing → REQUIRED = 3
Customer Service       → IMPORTANT = 2
Excel                  → REQUIRED = 3
Fraud Awareness        → IMPORTANT = 2

Total = 10
```

User has:

```text
Transaction Processing → 3
Customer Service       → 2
Fraud Awareness        → 2
```

Matched weight:

```text
7
```

Skill Match:

```text
7 / 10 × 100 = 70
```

---

# 10. What Counts as a Matched Skill?

A skill counts as matched if the user has a corresponding `UserSkill`.

For MVP:

```text
SELF_REPORTED
AI_DERIVED
CHALLENGE
VERIFIED
```

may count toward skill possession.

However, skill **confidence/proficiency** should influence more advanced scoring later.

For the MVP, keep the calculation simple and deterministic.

---

# 11. Experience Match Score

Experience Match measures how closely the participant's existing experience relates to the target career.

For MVP:

```text
Occupation/industry relevance = 50%
Relevant experience duration   = 50%
```

The backend should use structured career metadata where available.

If exact occupation matching is unavailable, use industry relevance and skill overlap as the fallback.

Do not pretend the score is more precise than the available data supports.

---

# 12. Career Interest Score

Career Interest measures whether the recommended career aligns with the participant's stated interests.

For MVP:

```text
100 = career directly matches stated interest
70  = closely related interest
40  = somewhat related
0   = no meaningful interest match
```

This may be implemented using a controlled category/tag system rather than an AI-generated similarity score.

---

# 13. AI Readiness Score

AI Readiness measures how prepared the participant appears to be for AI-affected work.

For MVP, use:

```text
Existing digital/AI-relevant skills
+
Completion of AI-related roadmap tasks
+
Understanding of AI-augmented tasks
```

A simple MVP calculation:

```text
AI Readiness =
(
Relevant Skill Score
+
AI Roadmap Completion Score
) / 2
```

Both components are normalized to 0–100.

If no AI-related roadmap exists yet, use the available relevant-skill score rather than inventing a value.

---

# 14. Career Match Formula

Final career match:

```text
Career Match =
(
Skill Match × 0.45
)
+
(
Experience Match × 0.25
)
+
(
Career Interest × 0.15
)
+
(
AI Readiness × 0.15
)
```

Example:

```text
Skill Match      = 80
Experience Match = 90
Career Interest  = 100
AI Readiness     = 60
```

Calculation:

```text
80 × 0.45 = 36
90 × 0.25 = 22.5
100 × 0.15 = 15
60 × 0.15 = 9

Final = 82.5
```

Round to:

```text
83%
```

---

# 15. Career Recommendation Ranking

After calculating match scores for approved careers:

```text
1. Calculate score
2. Sort descending
3. Assign rank
4. Return top N
```

Default:

```text
N = 5
```

The frontend may request fewer recommendations.

---

# 16. Recommendation Thresholds

For presentation:

```text
80–100 → Strong Match
60–79  → Good Match
40–59  → Emerging Match
0–39   → Low Match
```

These labels describe the current profile match.

They do not mean the participant cannot pursue a lower-scoring career.

---

# 17. Skill Gap Logic

For a selected career:

```text
Career Required Skills
        VS
Participant User Skills
```

For each career skill:

```text
IF user has skill
    → HAS_SKILL
ELSE
    → NEEDS_DEVELOPMENT
```

The backend then assigns priority based on career-skill importance.

Mapping:

```text
REQUIRED       → HIGH
IMPORTANT      → MEDIUM
NICE_TO_HAVE   → LOW
```

---

# 18. Skill Gap Example

Career:

```text
Fintech Operations Associate
```

Requirements:

```text
Transaction Processing → REQUIRED
Customer Service       → IMPORTANT
Excel                  → REQUIRED
Fraud Awareness        → IMPORTANT
```

User has:

```text
Transaction Processing
Customer Service
```

Result:

```text
Transaction Processing → HAS_SKILL
Customer Service       → HAS_SKILL
Excel                  → NEEDS_DEVELOPMENT / HIGH
Fraud Awareness        → NEEDS_DEVELOPMENT / MEDIUM
```

---

# 19. Roadmap Progress

Roadmap progress is calculated from tasks.

Formula:

```text
Completed Tasks / Total Tasks × 100
```

Example:

```text
6 completed
8 total

6 / 8 × 100 = 75%
```

Do not manually update a stored percentage every time.

Calculate from the underlying tasks.

---

# 20. Roadmap Phase Progress

Each phase uses:

```text
Completed phase tasks / Total phase tasks × 100
```

Example:

```text
DAY_30:
3 / 4 = 75%

DAY_60:
1 / 4 = 25%

DAY_90:
0 / 3 = 0%
```

---

# 21. Challenge Progress

Challenge progress:

```text
Completed/Passed Challenges
/
Assigned or Attempted Challenges
× 100
```

For the participant dashboard, prefer:

```text
Passed Challenges / Available Assigned Challenges
```

If there are no assigned challenges:

```text
0
```

rather than:

```text
100
```

Do not claim progress when no activity exists.

---

# 22. Evidence Progress

Evidence itself is not a percentage-based score.

Track:

```text
Evidence Count
Verified Evidence Count
Skills Supported by Evidence
```

These values contribute to Career Readiness.

---

# 23. Career Readiness Score

Career Readiness is the primary HerNext outcome score.

It measures how prepared the participant currently appears to be for their target career based on:

```text
Experience
Skills
AI Readiness
Evidence
```

---

# 24. Career Readiness Weights

Use:

```text
Experience       25%
Skills           30%
AI Readiness     20%
Evidence         25%
```

Total:

```text
100%
```

---

# 25. Experience Score

For MVP, calculate using:

```text
Relevant Experience
+
Experience Completeness
```

A practical implementation:

```text
Relevant Experience Score:
0   = no relevant experience
50  = some transferable/relevant experience
75  = strong relevant experience
100 = substantial relevant experience
```

The exact implementation may use career/industry relevance and experience records.

Do not award points simply because an experience record exists if it is unrelated.

---

# 26. Skills Score

Skill score compares the participant's current skills against target-career requirements.

Use the same weighted career-skill system:

```text
REQUIRED       = 3
IMPORTANT      = 2
NICE_TO_HAVE   = 1
```

Formula:

```text
Matched Career Skill Weight
/
Total Career Skill Weight
× 100
```

This ensures readiness is connected to the participant's actual target career.

---

# 27. AI Readiness Score

AI Readiness may combine:

```text
Relevant digital/AI skills
+
Completion of AI-related roadmap activities
```

Normalize to 0–100.

If the participant has no AI-specific activity yet, use the available skill component rather than assuming readiness.

---

# 28. Evidence Score

Evidence measures demonstrated proof of skills.

For MVP:

```text
No evidence              → 0
One valid evidence item  → 50
Two or more evidence     → 75
Strong verified coverage → 100
```

A more precise implementation may calculate:

```text
Skills with evidence
/
Target career skills
× 100
```

This is preferred when sufficient data exists.

---

# 29. Final Readiness Formula

```text
Career Readiness =
(
Experience Score × 0.25
)
+
(
Skills Score × 0.30
)
+
(
AI Readiness Score × 0.20
)
+
(
Evidence Score × 0.25
)
```

Example:

```text
Experience     = 80
Skills         = 75
AI Readiness   = 70
Evidence       = 90
```

Calculation:

```text
80 × 0.25 = 20
75 × 0.30 = 22.5
70 × 0.20 = 14
90 × 0.25 = 22.5

Final = 79
```

Career Readiness:

```text
79%
```

---

# 30. Readiness Labels

Use:

```text
80–100 → Opportunity Ready
60–79  → Developing
40–59  → Building Foundations
0–39   → Early Stage
```

These labels should encourage progress rather than imply failure.

---

# 31. Overall Progress

Overall participant progress should summarize completion of the major journey stages.

Recommended MVP components:

```text
Career Profile
AI Assessment
Transferable Skills
Career Selection
Skill Gap
Roadmap
Challenges
Evidence
Passport
```

Each completed stage contributes equally for the MVP unless product design specifies otherwise.

Example:

```text
7 completed stages / 9 total stages × 100
= 78%
```

Do not artificially inflate progress because the participant has a large amount of data.

---

# 32. Milestones

Milestones are event-based and deterministic.

Examples:

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

# 33. Achievement Rules

Achievements should be awarded automatically when their criteria become true.

Example:

```text
PROFILE_COMPLETED
```

Criteria:

```text
Required career profile fields are completed.
```

Example:

```text
FIRST_CHALLENGE_COMPLETED
```

Criteria:

```text
At least one ChallengeSubmission has status PASSED.
```

Achievements must be idempotent.

If an achievement has already been earned, do not create another `UserAchievement`.

---

# 34. Next Best Action

The Next Best Action is deterministic.

The backend should evaluate incomplete journey steps in priority order.

Recommended priority:

```text
1. Complete Career Profile
2. Add Experience
3. Complete AI Impact Assessment
4. Discover Transferable Skills
5. Select Target Career
6. Review Skill Gaps
7. Complete Roadmap Task
8. Complete Challenge
9. Create Evidence
10. Generate Career Passport
```

The system returns **one** next action.

---

# 35. Next Best Action Rules

Example:

If the participant has no career profile:

```text
Complete your career profile.
```

If profile exists but no experience:

```text
Tell us about your experience.
```

If analysis is incomplete:

```text
Complete your AI Career Impact Assessment.
```

If a roadmap exists and has incomplete tasks:

```text
Complete your next roadmap task.
```

If a relevant challenge is available and not completed:

```text
Complete the recommended challenge.
```

If readiness is sufficient but passport does not exist:

```text
Generate your Career Passport.
```

The AI may personalize the wording, but the underlying action must come from backend rules.

---

# 36. Organization Participant Status

Organization dashboards classify participants using deterministic rules.

Statuses:

```text
ON_TRACK
NEEDS_ATTENTION
AT_RISK
```

---

# 37. On Track

A participant is `ON_TRACK` when:

```text
Recent activity exists
AND
Roadmap progress is reasonably aligned with expected progress
```

For MVP, define recent activity as activity within:

```text
14 days
```

---

# 38. Needs Attention

A participant is `NEEDS_ATTENTION` when:

```text
Some activity exists
BUT
Roadmap progress is behind expected progress
OR
There has been moderate inactivity.
```

Suggested inactivity threshold:

```text
15–29 days
```

---

# 39. At Risk

A participant is `AT_RISK` when:

```text
No meaningful activity for 30+ days
OR
Roadmap progress is significantly behind expected progress.
```

The backend should calculate expected progress based on the program timeline where dates are available.

---

# 40. Expected Roadmap Progress

For a program with a defined start and end date:

```text
Elapsed Program Time
/
Total Program Time
× 100
```

Compare this against participant roadmap progress.

Example:

```text
Program elapsed = 50%
Participant roadmap progress = 25%
```

The participant is significantly behind.

---

# 41. Status Threshold

For MVP:

```text
ON_TRACK:
Participant progress >= expected progress - 10 points

NEEDS_ATTENTION:
Participant progress is 11–25 points behind expected

AT_RISK:
Participant progress is >25 points behind
OR
30+ days inactive
```

These thresholds can be tuned after testing.

---

# 42. Organization Analytics

Analytics should be derived from participant records.

Calculate:

```text
Total Participants
Active Participants
Assessment Completion Rate
Average Readiness
Average Roadmap Progress
Challenges Completed
Evidence Created
Passports Created
```

---

# 43. Assessment Completion Rate

```text
Participants with completed AI assessment
/
Total participants
× 100
```

If there are zero participants:

```text
0
```

---

# 44. Active Participants

For MVP:

```text
Active = participant with meaningful activity within 14 days
```

Meaningful activity includes:

```text
Profile update
Experience submission
AI assessment
Roadmap task update
Challenge submission
Evidence creation
Passport generation
```

---

# 45. Average Readiness

```text
Sum of participant readiness scores
/
Number of participants with readiness scores
```

If no participant has a readiness score:

```text
0
```

Do not include nonexistent scores as zero when calculating an average.

---

# 46. Average Roadmap Progress

```text
Sum of participant roadmap progress
/
Participants with active roadmaps
```

Participants without a roadmap should not automatically count as 0% unless the product explicitly wants that interpretation.

---

# 47. Score Rounding

Display scores as whole numbers.

Example:

```text
82.6 → 83
78.2 → 78
```

Calculations may retain decimal precision internally.

---

# 48. Missing Data Rules

Do not fabricate missing information.

Examples:

If no experience exists:

```text
Experience Score = 0
```

If no skills exist:

```text
Skills Score = 0
```

If no evidence exists:

```text
Evidence Score = 0
```

If a component cannot reasonably be calculated, the backend should use a documented fallback rather than asking the AI to invent a score.

---

# 49. Score Recalculation

Scores should be recalculated when their underlying data changes.

Examples:

```text
New skill added
→ Career Match may change

Challenge passed
→ Evidence may change
→ Readiness may change

Roadmap task completed
→ Roadmap progress changes
→ AI Readiness may change
→ Readiness may change
```

Do not require the frontend to calculate these values.

---

# 50. Score Storage

Prefer calculating derived scores from source data.

Do not permanently store:

```text
overallProgress
roadmapProgress
averageReadiness
```

unless caching becomes necessary.

If a score is stored for historical reasons, clearly define when it is recalculated.

---

# 51. Business Logic Location

Scoring logic must live in backend services.

Recommended:

```text id="9p5qk8"
src/lib/scoring/
├── career-match.ts
├── readiness.ts
├── ai-impact.ts
├── progress.ts
└── participant-status.ts
```

The AI module should not contain these calculations.

---

# 52. Testing Requirements

Every scoring function must have unit tests.

Test:

```text
0 values
100 values
partial matches
complete matches
missing data
empty arrays
boundary values
rounding
```

Examples:

```text
33 → LOW
34 → MODERATE
66 → MODERATE
67 → HIGH
```

And:

```text
79 → Developing
80 → Opportunity Ready
```

---

# 53. Definition of Done

Scoring is complete when:

* [ ] All scores are deterministic.
* [ ] AI does not arbitrarily assign business scores.
* [ ] Career match uses approved career data.
* [ ] Skill matching uses career-skill importance.
* [ ] Skill gaps are calculated from actual data.
* [ ] Roadmap progress is calculated from tasks.
* [ ] Readiness uses the documented formula.
* [ ] Achievements use deterministic criteria.
* [ ] Next Best Action uses backend rules.
* [ ] Organization status uses deterministic thresholds.
* [ ] Analytics are calculated from source records.
* [ ] Missing data is handled safely.
* [ ] Score boundaries are tested.
* [ ] Scoring logic has unit tests.

---

# 54. Core Scoring Flow

```text
USER DATA
   ↓
Career / Skill Catalogue
   ↓
Career Match
   ↓
Target Career
   ↓
Skill Gap
   ↓
Roadmap
   ↓
Progress
   ↓
Challenges
   ↓
Evidence
   ↓
Career Readiness
   ↓
Career Passport
```

The central rule remains:

> **AI explains the participant's journey. Backend logic measures it.**
