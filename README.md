# HerNext Backend

**AI-powered career transition and evidence platform for African women in the Finance, Banking & Investment track** — by Team FiveFold (HerNext hackathon).

HerNext helps users understand how AI affects their current work, discover transferable skills from real-world experience, find suitable career paths, close skill gaps, follow a personalized 30/60/90-day roadmap, complete practical challenges, build evidence, and generate a shareable **Career Passport**.

This repository is the **backend API, database, business logic, AI integration and scoring engine**. The backend is the source of truth: security, ownership checks, score calculations, progress, evidence and analytics are all deterministic server-side logic — AI is only an interpretive intelligence layer and never owns product rules.

---

## 1. Overview

- **REST API** at `/api/v1` built with **Fastify 5** on **Node.js 22+** and **TypeScript**.
- **PostgreSQL** (Neon) accessed exclusively through parameterized `pg` queries — no ORM.
- **Zod** validation for every request, route parameter, query and structured AI output.
- **JWT** authentication (`bcrypt` password hashing) with role-based access control.
- Full **OpenAPI 3.1** documentation served at `/docs` (Swagger UI).
- **AI provider abstraction** (Groq by default, OpenAI-compatible and Gemini supported) with read-first persistence, catalogue grounding and Zod-validated output.
- **Deterministic scoring** in `src/lib/scoring/` for impact, career match, skill gaps, roadmap progress, readiness and more.
- **Docker** multi-stage build and **Render**-ready configuration.

---

## 2. Live Deployment

| Item | Value |
|---|---|
| Live instance (current) | `https://hernext-qelt.onrender.com` |
| Health probe | `GET https://hernext-qelt.onrender.com/health` |
| OpenAPI docs | `GET /docs` |

> The live Render instance currently runs the build from the combined repository history. This repository is the dedicated backend home (`hernext_backend`) and is **ready to reconnect Render** — see [Deployment to Render](#19-deployment-to-render).

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 22, TypeScript |
| API framework | Fastify 5 |
| Validation | Zod 4 |
| Database | PostgreSQL (Neon), `pg` connection pool |
| Auth | JWT (`@fastify/jwt`), `bcrypt` |
| Security | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` |
| Docs | `@fastify/swagger`, `@fastify/swagger-ui` (OpenAPI 3.1) |
| AI providers | Groq (default) via OpenAI-compatible API; OpenAI, Gemini supported |
| Email | Brevo (`brevo`), in-memory test provider (`test`) |
| Tests | Vitest |
| Container | Docker multi-stage (`node:22-bookworm-slim`) |

No ORM is used. Database access is raw, parameterized SQL through `pg`.

---

## 4. Architecture

### Layered request flow

```text
Frontend
   ↓
Fastify Route
   ↓
Controller            (thin: validate input, read auth context, call services)
   ↓
Service              (business logic)
   ↓
AI Service  ───────────────►  Model (parameterized pg SQL)
   ↓                                  ↓
AI Provider                        PostgreSQL
   ↓
Structured JSON → Zod → Business validation → Database
```

Controllers are thin. Business rules live in **services**, **dedicated libraries** (`src/lib/scoring/`) and **models** (parameterized SQL). Do not put business logic in route handlers.

### AI is an intelligence layer only

The AI may interpret natural language, extract potential skills, explain career recommendations, skill gaps, roadmap tasks and challenge feedback. The AI must **never** own: authentication, authorization, the career/skill catalogues, final score calculations, progress, achievements, readiness, organization analytics or access control. All of those are deterministic backend logic.

---

## 5. Repository Structure

```text
backend/
├── AGENTS.md                         # Working agreements & rules for this backend
├── README.md                         # This file
├── Dockerfile                        # Multi-stage build (builder → runner)
├── .dockerignore
├── .env.example                      # Documented environment placeholders
│
├── docs/                             # Source-of-truth specifications
│   ├── PRODUCT_SPEC.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_CONTRACT.md
│   ├── AI_SPEC.md
│   ├── SCORING_LOGIC.md
│   ├── SECURITY_SPEC.md
│   ├── DEVELOPMENT_PLAN.md
│   ├── API_SMOKE_TEST.md             # End-to-end smoke walkthrough
│   └── POSTMAN_TESTING.md
│
├── postman/
│   ├── HerNext-MVP-Backend.postman_collection.json
│   └── HerNext-Local.postman_environment.json.example
│
├── db/
│   ├── migrations/                   # 001_init … 006_auth_otps_*
│   ├── migrate.ts
│   ├── seed.ts                       # Career & skill catalogue
│   ├── seed-demo.ts                  # Demo participant (Aisha Abdullah)
│   ├── seed-demo-org.ts              # Demo organization + program
│   └── check-connection.ts
│
├── src/
│   ├── app.ts                        # Fastify assembly: plugins + modules
│   ├── server.ts                     # Listen on HOST:PORT, graceful shutdown
│   ├── config/env.ts                 # Strict env validation (fails fast)
│   ├── plugins/                      # cors, helmet, auth, rate-limit, swagger, route-registry
│   ├── common/                       # errors, middleware, types, openapi, utils
│   ├── lib/
│   │   ├── db.ts                     # pg pool
│   │   └── scoring/                  # All deterministic score calculations
│   └── modules/
│       ├── auth/                     # register, login, email verification, OTP reset
│       ├── users/
│       ├── profiles/
│       ├── experiences/
│       ├── ai/                       # impact assessment, skills, recommendations, roadmaps
│       ├── skills/
│       ├── careers/
│       ├── roadmaps/
│       ├── progress/
│       ├── challenges/
│       ├── evidence/
│       ├── achievements/
│       ├── passport/
│       ├── organizations/
│       ├── programs/
│       └── analytics/
│
└── tests/                            # Vitest suites (unit, scoring, integration, OpenAPI)
```

A typical module has `module.routes.ts`, `module.controller.ts`, `module.service.ts`, `module.schemas.ts` and `module.types.ts`.

---

## 6. Getting Started

### Prerequisites

- Node.js **≥ 22**
- PostgreSQL (or a [Neon](https://neon.tech) database URL)
- Optional: Docker for container builds

### Install & run

```bash
git clone https://github.com/HerNextFold/hernext_backend.git
cd hernext-backend
npm ci

# 1. Create environment file
cp .env.example .env          # then fill in real values, see §7

# 2. Apply migrations
npm run db:migrate

# 3. Seed the catalogue (careers + skills) and demo data
npm run db:seed
npm run db:seed:demo

# 4. Start the development server
npm run dev
```

### Verify

```bash
# Liveness + DB connectivity (returned by the running server)
GET http://localhost:5000/health

# OpenAPI / Swagger UI
http://localhost:5000/docs
```

The demo participant (`Aisha Abdullah`, POS Business Owner) and demo credentials are seeded by `db/seed-demo.ts`; the full end-to-end walkthrough (with expected responses) lives in `docs/API_SMOKE_TEST.md`.

---

## 7. Environment Variables

Configuration is validated at startup by `src/config/env.ts` — the server **fails fast** when a required variable is missing or invalid. Placeholders are documented in `.env.example`. Never commit a real `.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production`. Production forces `EMAIL_PROVIDER=brevo`. |
| `PORT` | no | `5000` | HTTP listen port. |
| `HOST` | no | `0.0.0.0` (prod) / `127.0.0.1` (dev) | Bind address. The Dockerfile bakes `0.0.0.0`. |
| `DATABASE_URL` | **yes** | — | `postgresql://` connection string (validated). |
| `DB_SSL` | no | `true` | Use SSL for the DB connection (Neon requires it). |
| `DB_POOL_MAX` | no | `10` | `pg` pool max size (1–50). |
| `JWT_SECRET` | **yes** | — | Access-token signing secret. |
| `JWT_REFRESH_SECRET` | **yes** | — | Secondary secret used by the auth service. |
| `JWT_EXPIRES_IN` | no | `15m` | Access-token lifetime. |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh lifetime. |
| `FRONTEND_URL` | no | `http://localhost:5173,http://localhost:5174` | Comma-separated CORS origins. |
| `LOG_LEVEL` | no | `info` | Pino log level (`fatal`…`silent`). |
| `AI_PROVIDER` | no | `groq` | `groq` \| `openai` \| `openai-compatible` \| `gemini`. |
| `AI_MODEL` | for AI | — | Model name, e.g. `openai/gpt-oss-120b` for Groq. |
| `GROQ_API_KEY` | for Groq | — | Used when `AI_PROVIDER=groq`. |
| `OPENAI_API_KEY` | for OpenAI | — | Primary key for OpenAI-compatible / OpenAI. |
| `AI_API_KEY` | legacy | — | Legacy alias used when `OPENAI_API_KEY` is unset. |
| `EMAIL_PROVIDER` | no | `test` | `test` (in-memory, dev) \| `brevo` (production). |
| `BREVO_API_KEY` | brevo | — | Required when `EMAIL_PROVIDER=brevo`. |
| `BREVO_SENDER_EMAIL` | brevo | — | Required when `EMAIL_PROVIDER=brevo` (validated email). |
| `BREVO_SENDER_NAME` | no | — | Outbound sender name. |

**Production notes**

- `NODE_ENV=production` **errors at startup** if `EMAIL_PROVIDER` is not `brevo` (the `test` mail path must never serve production) and if Brevo key/sender are missing.
- The AI provider is returned as *unconfigured* if the key **or** model is missing — the server never silently falls back to a fake/mock provider.

---

## 8. Database

- **Migrations**: `db/migrations/` (001–006) applied by `db/migrate.ts`.
- **Access**: parameterized `pg` SQL only; explicit row interfaces in models.
- **Checks**: `npm run db:check` verifies connectivity + schema.
- **Seeds**:
  - `db/seed.ts` — approved career catalogue (e.g. Fintech Operations Associate, Banking Operations Officer, Payments Operations Associate) and skill catalogue (Customer Service, Reconciliation, Excel, Fraud Awareness, …).
  - `db/seed-demo.ts` — demo participant.
  - `db/seed-demo-org.ts` — demo organization/administrator and program with participants.

Every participant's private data is scoped to the authenticated user and organization data is tenant-scoped (see §11).

---

## 9. npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with `tsx watch` (hot reload). |
| `npm run build` | Compile to `dist/` (`tsc -p tsconfig.build.json`). |
| `npm start` | Run the compiled server (`node dist/server.js`). |
| `npm run typecheck` | TypeScript check without emitting. |
| `npm test` | Offline, deterministic Vitest suite. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:db` | DB integration suites (`RUN_DB_TESTS=1`; requires `DATABASE_URL` + migrations). |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:seed` | Seed catalogue. |
| `npm run db:seed:demo` | Seed demo participant. |
| `npm run db:seed:demo:org` | Seed demo organization + program. |
| `npm run db:check` | Check DB connectivity and schema. |

---

## 10. API Reference

### Conventions

- Base path: `/api/v1` (plus the standalone `/health` probe).
- Interactive docs: `GET /docs` (Swagger UI).
- Request validation is **Zod-first** (documented schemas never change runtime behaviour).

### Response envelope

**Success**

```json
{ "success": true, "data": {} }
```

**Error**

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data", "details": [] }
}
```

Errors are safe and predictable — no database stack traces, provider internals or secrets are exposed. AI failure surfaces as `AI_SERVICE_UNAVAILABLE` (503) or `AI_OUTPUT_INVALID` (422), never as raw provider errors.

### Endpoints

`Auth` = requires `Authorization: Bearer <jwt>`.

#### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | Liveness + DB connectivity probe. |

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | public | Create a **UNVERIFIED** account; emails a 6-digit verification code. |
| POST | `/api/v1/auth/verify-email-otp` | public | Verify registration code; marks account verified and returns a JWT. |
| POST | `/api/v1/auth/resend-email-verification` | public | Resend verification code (enumeration-safe). |
| POST | `/api/v1/auth/login` | public | Login (requires verified email; `ACCOUNT_UNVERIFIED` otherwise). |
| POST | `/api/v1/auth/logout` | Auth | Revoke the current token client-side. |
| GET | `/api/v1/auth/me` | Auth | Current authenticated user. |
| POST | `/api/v1/auth/forgot-password` | public | Email a password-reset code to verified active accounts. |
| POST | `/api/v1/auth/verify-reset-otp` | public | Validate reset code; returns a **single-use** reset token. |
| POST | `/api/v1/auth/reset-password` | public | Set a new password with the reset token. |

#### Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/profile` | Auth | Current participant profile. |
| PUT | `/api/v1/profile` | Auth | Update profile (ownership-bound to the authenticated user). |

#### Experiences

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/experiences` | Auth | Add a work/life experience (`employmentType` enum: EMPLOYED, SELF_EMPLOYED, FREELANCER, STUDENT, UNEMPLOYED, INFORMAL_WORKER). |
| GET | `/api/v1/experiences` | Auth | List own experiences. |
| GET | `/api/v1/experiences/:id` | Auth | Get one own experience. |
| PUT | `/api/v1/experiences/:id` | Auth | Update own experience. |
| DELETE | `/api/v1/experiences/:id` | Auth | Delete own experience. |

#### AI career intelligence & careers

| Method | Path | Auth | Description |
|---|---|---|---|
| POST / GET | `/api/v1/ai/career-impact/:experienceId` | Auth | Run (or reuse) the AI Career Impact Assessment for an experience. `?regenerate=true` forces a fresh call. |
| POST / GET | `/api/v1/ai/transferable-skills/:experienceId` | Auth | Extract (or reuse) transferable skills from an experience. |
| GET | `/api/v1/ai/transferable-skills` | Auth | List persisted skill results. |
| POST | `/api/v1/ai/career-recommendations` | Auth | Trigger/recompute career recommendation analysis. |
| GET | `/api/v1/careers/recommendations` | Auth | Persisted recommendations — **deterministic backend scoring**, no AI call. |
| GET | `/api/v1/careers/:careerId/skill-gaps` | Auth | Skill gaps vs. an approved career — deterministic comparison. |
| POST | `/api/v1/ai/skill-gaps/:careerId` | Auth | Recompute skill gaps for a career (AI explains; backend decides). |
| POST | `/api/v1/ai/roadmap/:careerId` | Auth | Generate (or reuse) a 30/60/90-day roadmap. |
| GET | `/api/v1/ai/roadmap` | Auth | Current persisted roadmap. |

#### Roadmap & progress

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/roadmaps/generate` | Auth | Generate (or reuse) a roadmap for a career. |
| GET | `/api/v1/roadmaps/current` | Auth | Current roadmap (read-first). |
| PATCH | `/api/v1/roadmaps/tasks/:taskId` | Auth | Update task status (`NOT_STARTED` \| `IN_PROGRESS` \| `COMPLETED`). |
| GET | `/api/v1/progress` | Auth | Overall progress (derived from source records). |
| GET | `/api/v1/progress/summary` | Auth | Progress summary breakdown. |
| GET | `/api/v1/progress/next-action` | Auth | Deterministic next-best action. |

#### Achievements

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/achievements` | Auth | Earned achievements (deterministic, idempotent). |

#### Challenges & evidence

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/challenges` | Auth | List challenges (e.g. Financial Reconciliation, Customer Payment Resolution). |
| GET | `/api/v1/challenges/:id` | Auth | Challenge details. |
| POST | `/api/v1/challenges/:id/submit` | Auth | Submit a challenge (deterministic evaluation + optional AI feedback). |
| GET | `/api/v1/evidence` | Auth | Evidence records for the participant. |
| GET | `/api/v1/evidence/:id` | Auth | Single evidence record. |

Evidence is never automatically treated as verified unless the verification rule is satisfied.

#### Career Passport

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/passport` | Auth | Own passport (private view). |
| POST | `/api/v1/passport/generate` | Auth | Generate/refresh the shareable passport. |
| GET | `/api/v1/passport/public/:slug` | public | Public shareable passport. Exposes **only** the intentional public shape — never email, passwords, internal IDs or private analytics. |

#### Organizations & programs

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/organizations` | Org role | Create an organization. |
| GET | `/api/v1/organizations/:organizationId` | Org role | Organization detail (membership verified). |
| POST / GET | `/api/v1/organizations/:organizationId/programs` | Org role | Create / list programs. |
| POST / GET | `/api/v1/programs/:programId/participants` | Org role | Add / list program participants. |
| GET | `/api/v1/programs/:programId/participants/:participantId` | Org role | Participant detail within a program. |
| GET | `/api/v1/programs/:programId/analytics` | Org role | Tenant-scoped program analytics (derived from records). |
| GET | `/api/v1/programs/:programId/report` | Org role | Program report. |

All organization endpoints verify `user → organization membership → organization → program → participant` before returning data.

---

## 11. Authentication & Authorization

### Registration → verified account

1. `POST /auth/register` creates an account with `verificationStatus: PENDING` and emails a 6-digit code. **No token is returned at registration.**
2. `POST /auth/verify-email-otp` marks the account verified and issues the first JWT.
3. `POST /auth/login` **requires a verified email** (rejects with `ACCOUNT_UNVERIFIED` otherwise).

### Password & tokens

- Passwords hashed with `bcrypt`; never stored or returned in plaintext.
- Passwords must be **8–128 characters**.
- `forgot-password` → `verify-reset-otp` (returns a **single-use** reset token; no token in emails) → `reset-password`.

### Rate limiting

Per-IP limits via `@fastify/rate-limit`, tuned per endpoint (e.g. 100 req/min general; tighter on auth; AI endpoints capped at 20/60s). Rate limiting is disabled under `NODE_ENV=test`.

### Roles & ownership

- Roles: `PARTICIPANT`, `ORGANIZATION_ADMIN`, `ORGANIZATION_MEMBER`.
- **Never trust `userId` / `participantId` / `organizationId` / `role` from the request body** when the value can be derived from the authenticated context (`request.user.id`).
- A participant cannot access another participant's private resources (IDOR prevention).
- Organizations are separate tenants; membership is always verified server-side.

---

## 12. AI Integration

### Provider abstraction

`src/modules/ai/providers/factory.ts` selects a provider from `AI_PROVIDER`:

- **groq** (default) → OpenAI-compatible client against `https://api.groq.com/openai/v1` (model `openai/gpt-oss-120b` in seeded config).
- **openai** / **openai-compatible** → `https://api.openai.com/v1`.
- **gemini** → Gemini provider.

If the key or model is missing the provider is **Unconfigured** and the server fails safely — there are **no fake/mock providers in the backend**; tests mock at the HTTP/factory boundary.

### Catalogue grounding

AI output must reference **approved HerNext catalogue IDs/names** (careers, skills). Unresolvable output is rejected with `422` rather than persisted partially. AI-inferred skills stay `AI_DERIVED` — they are never auto-promoted to `VERIFIED`.

### Read-first persistence

Every AI analysis is persisted and **reused** on later calls so the rate-limited provider is not hit on every request:

- `?regenerate=true` (or an explicit recompute endpoint) forces a fresh AI call.
- A persisted result whose source experience has not changed is returned from storage.
- No AI call happens on every dashboard request.

### Validation pipeline

```text
AI → JSON parse → Zod schema → business validation → database
```

Malformed JSON, missing fields, invalid enums, unknown catalogue IDs, out-of-range scores, provider timeouts/rate limits/provider failures are all handled deterministically. AI never determines final scores, progress, risk status or next-best action — those are backend-owned (`src/lib/scoring/`).

---

## 13. Email & OTP

- `EMAIL_PROVIDER=test` → in-memory provider: codes are captured in memory for development/tests (never sent).
- `EMAIL_PROVIDER=brevo` → real transactional email.
- `NODE_ENV=production` **requires** `brevo`.
- OTPs (6-digit) are single-purpose (`EMAIL_VERIFICATION`, `PASSWORD_RESET`), time-limited, and the code is **never logged or returned through API responses**. Reset tokens are single-use.

---

## 14. Scoring, Progress & Next-Best-Action

All score calculations live in **`src/lib/scoring/`** and follow `docs/SCORING_LOGIC.md`. Scores are:

- between 0 and 100, clamped, deterministically rounded;
- sourced from **actual records**, never supplied by the frontend (a submitted `progress: 95` is not authoritative);
- backend-calculated for: AI Impact (automation exposure / augmentation opportunity / human-value tasks / emerging skills — **not** a job-loss prediction), Career Match, Skill Gaps, Roadmap Progress, Challenge Progress, Career Readiness (Experience + Skills + AI Readiness + Evidence), Achievements, and overall progress.

**Next-Best-Action** is deterministic priority logic — no LLM decides the action (AI may only phrase the explanation). Achievements are idempotent (re-evaluating never duplicates records).

---

## 15. Organization Analytics

Analytics are derived from source participant/program records (total & active participants, assessment completion, average readiness, average roadmap progress, skills developed, challenges completed, passports created). Reported participant status uses the deterministic rules `ON_TRACK` / `NEEDS_ATTENTION` / `AT_RISK` — never an LLM decision. All analytics are strictly tenant-scoped.

---

## 16. Security

- Helmet, CORS (allow-listed origins), rate limiting.
- JWT bearer auth; bcrypt password hashing.
- Zod validation on bodies, params, query strings, AI output and external data.
- Mass-assignment protection (documented fields only — no blind `...body` spreads).
- Resource ownership + organization tenant isolation enforced server-side.
- Safe error responses (no stack traces, provider internals, keys or paths).
- Public passport exposes only the intentional public shape.
- Startup fails fast on missing/invalid configuration; secrets never leave env.

---

## 17. Testing

**Test harness**: Vitest. `tests/vitest.setup.ts` pins `NODE_ENV=test` + `EMAIL_PROVIDER=test` so suites are deterministic and never send real email.

| Command | Suites | Notes |
|---|---|---|
| `npm test` | Offline, deterministic suite (unit, scoring, integration with in-memory email, AI via mocked provider, OpenAPI matrix, routing) | **Last verified: 237 passed, 108 skipped.** |
| `npm run test:db` | DB-gated suites behind `RUN_DB_TESTS=1` | Requires `DATABASE_URL` + applied migrations. Use a disposable DB, not shared demo data. |

- The 108 skips are the DB suites gated behind `RUN_DB_TESTS=1` — they are deliberately **skipped, not passed**, in the default offline suite.
- AI tests mock provider responses (valid output, malformed JSON, invalid catalogue IDs, missing fields, out-of-range scores, provider timeout/unavailable).
- Scoring tests cover boundaries, empty/missing data, rounding and expected formulas.
- `openapi.documentation.test.ts` asserts every registered route is documented (and vice-versa).

---

## 18. Docker

Multi-stage build on `node:22-bookworm-slim`:

- **builder**: apt build tools → `npm ci` → `tsc` build → `npm prune --omit=dev`.
- **runner**: production deps + `dist/` only, `USER node`, `ENV HOST=0.0.0.0`, `EXPOSE 5000`, healthcheck using the built-in `fetch` against `/health` (no curl required).

```bash
docker build -t hernext-backend .
docker run --rm --env-file .env -p 5000:5000 hernext-backend
```

**Verified locally** (Docker 29.4.3): clean multi-stage build succeeded (apt/npm/tsc/prune), and the image booted under `NODE_ENV=production` with placeholder env values — `/health` returned 200 and `/docs` returned 200. DB reported `disconnected` only because the probe used a non-connectable URL.

---

## 19. Deployment to Render

| Config | Value |
|---|---|
| Repository | `HerNextFold/hernext_backend` |
| Branch | `main` |
| Root directory | `/` (repo root) |
| Build | `docker build .` (Dockerfile at root) |
| Start command | `node dist/server.js` (baked into the image) |
| Health check | `/health` |

**Environment variables (secrets on Render, names only — values are yours):**

```text
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://…          # required
JWT_SECRET=…                          # required
JWT_REFRESH_SECRET=…                  # required
FRONTEND_URL=https://<frontend-origin>,http://localhost:5173,http://localhost:5174
EMAIL_PROVIDER=brevo                  # required in production
BREVO_API_KEY=…
BREVO_SENDER_EMAIL=…
AI_PROVIDER=groq
AI_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=…
LOG_LEVEL=info
```

**Reconnect steps (no code changes needed):**

1. Push `main` to `HerNextFold/hernext_backend`.
2. In Render → the existing HerNext service: point the Blueprint/Service at this repo.
3. Ensure the env vars above exist (production startup **fails fast** if `EMAIL_PROVIDER` is not `brevo` or Brevo secrets are missing).
4. Trigger a manual deploy and confirm `GET /health` returns 200 with `database: connected`, then re-run the smoke flow in `docs/API_SMOKE_TEST.md`.

> `HOST`, `PORT` and `NODE_ENV` are baked into the image so a plain `docker run` also works on Render without extra service settings.

---

## 20. Postman

- Collection: `postman/HerNext-MVP-Backend.postman_collection.json`.
- Environment template: `postman/HerNext-Local.postman_environment.json.example`.
- Walkthrough: `docs/POSTMAN_TESTING.md`.

---

## 21. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `/health` shows `database: disconnected` | Neon goes to sleep after idleness; retry after wake-up. Verify `DATABASE_URL` (SSL is on by default). |
| AI endpoints take 10–20 s | Provider latency; results are cached/persisted afterwards (read-first) so only the first call is slow. |
| `503 AI_SERVICE_UNAVAILABLE` | Provider timeout/rate-limit/outage — safe error, retry shortly. |
| `422 AI_OUTPUT_INVALID` | Provider returned unreadable/un-grounded JSON; retry or use `regenerate=true`. |
| Login → `ACCOUNT_UNVERIFIED` | Email verification OTP not verified yet. |
| No email received | `EMAIL_PROVIDER=test` prints/captures codes in app memory — switch to `brevo` for real sending. Production forces `brevo`. |
| `429` on AI routes | 20 req/min per IP limit. |
| CORS blocked | Missing/extra origin in `FRONTEND_URL` (comma-separated list). |
| Production won't start | Failing env validation — read the startup error; it lists the missing/invalid variable(s). |
| Local `docker build` stalls on apt | `deb.debian.org` reachability; retry (transient). |

---

## 22. Documentation Index

The `docs/` folder is the **source of truth**. Read before changing behaviour:

- `PRODUCT_SPEC.md` — product view of the journey.
- `DATABASE_SCHEMA.md` — schema.
- `API_CONTRACT.md` — endpoint contracts and response shapes.
- `AI_SPEC.md` — AI architecture, grounding and hallucination rules.
- `SCORING_LOGIC.md` — score formulas and weights.
- `SECURITY_SPEC.md` — auth/authz and security requirements.
- `DEVELOPMENT_PLAN.md` — implementation order.
- `API_SMOKE_TEST.md` — end-to-end verification walkthrough.
- `POSTMAN_TESTING.md` — Postman usage.

When requirements conflict, follow the priority listed in `AGENTS.md` and surface the conflict rather than silently choosing.

---

## 23. Development Guidelines

- Keep controllers thin; business logic in services and `src/lib/`.
- Prefer explicit types, small single-responsibility functions, async/await, early validation.
- Use parameterized `pg` SQL with explicit row interfaces.
- Validate input (Zod) on the backend regardless of frontend validation.
- Never trust client-supplied ownership IDs; use the authenticated context.
- Don't add dependencies without first checking whether the existing stack already covers it.
- Format, typecheck, test, validate after each vertical slice.

See `AGENTS.md` for the full working agreement.

---

## 24. Verification Status

Last full run on this repository (local, against Neon):

| Check | Result |
|---|---|
| `npm ci` | Passed — 161 packages, 0 vulnerabilities |
| `npm run typecheck` | Passed |
| `npm test` | 237 passed / 108 skipped (skips are `RUN_DB_TESTS`-gated DB suites) |
| `npm run db:check` | Passed (after Neon idle-sleep retry) |
| `npm run build` | Passed (`tsc -p tsconfig.build.json` → `dist/`) |
| Production boot (`node dist/server.js`) | Passed — `/health` 200 + DB connected, `/docs` 200, login + `/auth/me` OK |
| Docker multi-stage build + image smoke | Passed — `/health` 200, `/docs` 200 |

**Status: `READY TO RECONNECT RENDER`** — no application code changes are required to deploy this repository.

---

## 25. License

ISC — © Team FiveFold. Hackathon project (HerNext).