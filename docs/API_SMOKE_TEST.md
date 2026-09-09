# HerNext API — Smoke Test Checklist (Phase 5C)

Goal: prove the backend is demo-ready by exercising every documented endpoint.

The authoritative matrix for this document is `tests/openapi.documentation.test.ts`
(`ROUTE_MATRIX`). That test verifies every entry below is (a) a registered Fastify
route and (b) documented in the OpenAPI document. This checklist is the manual,
end-to-end pass on top of those automated checks.

---

## 0. Prerequisites

```bash
npm install
npm run db:migrate      # applies db/migrations
npm run db:seed         # catalogues: careers + skills (stable, repeatable)
npm run db:seed:demo    # optional Aisha Abdullah demo participant
npm run dev             # starts the API on http://localhost:5000
```

Services:

- Documentation UI: `http://localhost:5000/docs`
- OpenAPI JSON: `http://localhost:5000/docs/json`
- Health probe: `http://localhost:5000/health`

Notes:

- All API paths below are relative to the base `/api/v1` (e.g. `POST /api/v1/auth/register`).
- Windows PowerShell aliases `curl` to `Invoke-WebRequest`; use `curl.exe` or Postman.
- AI endpoints require a configured `AI_PROVIDER`/`AI_API_KEY` (docs/AI_SPEC.md).
  Without a key they intentionally return `503 AI_SERVICE_ERROR` — that is the
  documented safe behaviour, not a bug.
- `db:check`: `npm run db:check` verifies the connection string/SSL quickly.

---

## 1. Health & Docs

| # | Method | Path        | Auth  | Expected        |
|---|--------|-------------|-------|-----------------|
| 1 | GET    | /health     | none  | 200 `{ success: true, data: { status: "ok", database: "connected" } }` |
| 2 | GET    | /docs       | none  | 200 Swagger UI renders every documented path |
| 3 | GET    | /docs/json  | none  | 200 valid OpenAPI 3.1 JSON, `paths` has `home` routes |

---

## 2. Authentication (public)

| # | Method | Path                 | Body (example)                                        | Expected |
|---|--------|----------------------|-------------------------------------------------------|----------|
| 4 | POST   | /auth/register       | `{"firstName":"Aminata","lastName":"Diallo","email":"a.diallo@example.com","password":"super-secret-1","country":"Nigeria"}` | 201 + `accessToken` |
| 5 | POST   | /auth/login          | `{"email":"a.diallo@example.com","password":"super-secret-1"}` | 200 + `accessToken` |
| 6 | POST   | /auth/forgot-password| `{"email":"a.diallo@example.com"}`                     | 200 (development mode returns a reset token) |
| 7 | POST   | /auth/reset-password | `{"token":"<reset-token>","newPassword":"super-secret-2"}` | 200 |
| 8 | POST   | /auth/logout         | not required                                          | 200, then the token is no longer valid |

> Capture `accessToken` from register/login and paste into the **Authorize** button
> of the Swagger UI, or send `Authorization: Bearer <token>`.

---

## 3. Authenticated ("me" + profile)

| # | Method | Path          | Auth    | Expected                                        |
|---|--------|---------------|---------|-------------------------------------------------|
| 9 | GET    | /auth/me      | bearer  | 200 current user (no password hash)             |
|10 | GET    | /profile      | bearer  | 200 profile (or 404 before first save)          |
|11 | PUT    | /profile      | bearer  | 200 saved profile view                          |

Example profile body:

```json
{
  "currentOccupation": "POS Business Owner",
  "industry": "Financial Services",
  "yearsOfExperience": 4,
  "employmentType": "INFORMAL_WORKER",
  "education": "Secondary",
  "careerInterests": ["Fintech Operations", "Payments"],
  "skillIds": []
}
```

---

## 4. Experience Story

| # | Method | Path               | Auth    | Expected                                |
|---|--------|--------------------|---------|------------------------------------------|
|12 | POST   | /experiences       | bearer  | 201 experience view                      |
|13 | GET    | /experiences       | bearer  | 200 list                                 |
|14 | GET    | /experiences/:id   | bearer  | 200 detail (404 for someone else's id)   |
|15 | PUT    | /experiences/:id   | bearer  | 200 updated                              |
|16 | DELETE | /experiences/:id   | bearer  | 200 removed                              |

---

## 5. AI Career Intelligence

| # | Method | Path                               | Auth    | Expected |
|---|--------|------------------------------------|---------|----------|
|17 | POST   | /ai/career-impact/:experienceId    | bearer  | 200 impact assessment or 503 (no AI key) |
|18 | GET    | /ai/career-impact/:experienceId    | bearer  | 200 stored analysis (404 if unanalysed)  |
|19 | POST   | /ai/transferable-skills/:experienceId | bearer | 200 skill suggestions                 |
|20 | GET    | /ai/transferable-skills            | bearer  | 200 all inferred skills                 |
|21 | POST   | /ai/career-recommendations         | bearer  | 200 recommendations (catalogue-based, score by backend) |
|22 | GET    | /careers/recommendations           | bearer  | 200 deterministic matching from stored skills |
|23 | POST   | /ai/skill-gaps/:careerId           | bearer  | 200 gaps vs selected career             |
|24 | GET    | /careers/:careerId/skill-gaps      | bearer  | 200 deterministic gaps                  |

---

## 6. Roadmap

| # | Method | Path                        | Auth    | Expected                          |
|---|--------|-----------------------------|---------|-----------------------------------|
|25 | POST   | /roadmaps/generate          | bearer  | 201 roadmap (30/60/90-day phases) |
|26 | GET    | /roadmaps/current           | bearer  | 200 current roadmap               |
|27 | GET    | /ai/roadmap                 | bearer  | 200 stored roadmap                |
|28 | POST   | /ai/roadmap/:careerId       | bearer  | 200 generated roadmap             |
|29 | PATCH  | /roadmaps/tasks/:taskId     | bearer  | 200 updated task status           |

PATCH body: `{ "status": "IN_PROGRESS" }` (or `"COMPLETED"`).

---

## 7. Progress & Achievements

| # | Method | Path                 | Auth    | Expected |
|---|--------|----------------------|---------|----------|
|30 | GET    | /progress            | bearer  | 200 overview (progress + readiness) |
|31 | GET    | /progress/summary    | bearer  | 200 summary with readiness label   |
|32 | GET    | /progress/next-action| bearer  | 200 deterministic next best action |
|33 | GET    | /achievements        | bearer  | 200 earned achievements            |

---

## 8. Challenges & Evidence

| # | Method | Path                  | Auth    | Expected |
|---|--------|-----------------------|---------|----------|
|34 | GET    | /challenges           | bearer  | 200 list (optional `?difficulty=BEGINNER`) |
|35 | GET    | /challenges/:id       | bearer  | 200 detail                          |
|36 | POST   | /challenges/:id/submit | bearer  | 200 deterministic result (PENDING/PASSED/FAILED) |
|37 | GET    | /evidence             | bearer  | 200 evidence list                   |
|38 | GET    | /evidence/:id         | bearer  | 200 detail (404 if not owned)       |

---

## 9. Career Passport

| # | Method | Path                  | Auth    | Expected |
|---|--------|-----------------------|---------|----------|
|39 | GET    | /passport             | bearer  | 200 own passport (404 before generation) |
|40 | POST   | /passport/generate    | bearer  | 200 passport + public slug          |
|41 | GET    | /passport/public/:slug | none   | 200 public passport (allowlisted fields only) |

> Repeated calls to `POST /passport/generate` are idempotent (same slug, no duplicates).

---

## 10. Ownership + Isolation Spot Checks

Critical security checks to perform manually once:

- Register two users; user B must get `404` reading/writing user A's experiences,
  evidence, roadmap tasks, and passport.
- `PUT /profile` must never create data attributed to a `userId` from the body.
- `GET /passport/public/:slug` returns only public fields (no email, no hash,
  no internal IDs).
- An invalid/expired/missing `Authorization` header returns `401 AUTHENTICATION_REQUIRED`.

---

## 11. Automated gate before demo

```bash
npm run typecheck
npm test                                  # includes tests/openapi.documentation.test.ts
npm run db:check                          # verifies database connectivity
```

With a live database available (slow on Neon free tier — allow generous timeout):

```bash
$env:RUN_DB_TESTS = "1"                        # Windows PowerShell
npx vitest run --isolate=false                 # runs the DB-backed suite
```

If any endpoint fails during the checklist, treat it as a demo blocker and fix
before presenting.