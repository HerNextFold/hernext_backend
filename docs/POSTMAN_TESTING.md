# HerNext Backend — Postman / Newman Testing

Executable QA suite for the HerNext (Team FiveFold) backend. The collection was
generated from the verified route inventory and `docs/API_CONTRACT.md`; it
exercises every registered `/api/v1` endpoint plus ownership/isolation/negative
checks.

Files:

```text
postman/HerNext-MVP-Backend.postman_collection.json   (Collection v2.1, all folders)
postman/HerNext-Local.postman_environment.json.example (environment template)
```

> The environment file is `.example` on purpose — copy it to
> `HerNext-Local.postman_environment.json` (remove the `.example` suffix) before
> importing, so real OTP/password values are never committed.

---

## 0. Prerequisites

```bash
npm install
npm run db:migrate       # applies db/migrations
npm run db:seed          # career + skill catalogues (stable, repeatable)
npm run db:seed:demo     # Aisha Abdullah demo participant (fast no-OTP mode)
npm run db:seed:demo:org # second demo org + participants (folder 12, tenant isolation)
npm run dev              # starts the API on http://localhost:5000
```

Services:

- API base: `http://localhost:5000/api/v1`
- Docs UI: `http://localhost:5000/docs`
- OpenAPI JSON: `http://localhost:5000/docs/json`

### AI provider

AI-origination endpoints (`POST /ai/career-impact/:id`,
`POST /ai/transferable-skills/:id`) call the configured provider
(default Groq: `GROQ_API_KEY`/`AI_MODEL` in `.env`, see `docs/AI_SPEC.md`).
Without a key they intentionally return `503 AI_SERVICE_ERROR` (documented safe
failure — the collection's success-path tests tolerate 503 for these two
calls). Career recommendations, skill gaps, roadmap reuse, progress, and
passport are deterministic and never call the provider.

### Email / OTP

- Email verification is **mandatory**. With `EMAIL_PROVIDER=brevo` the 6-digit
  code arrives in the real mailbox; the provider is in-memory (`test`) has no
  HTTP surface and never logs codes.
- The collection therefore treats OTP as a **manual step**: paste the code into
  the `emailOtp` / `resetOtp` environment values when the run stops for it.
- Wrong-code and reuse probes are deterministic (fixed codes, assert
  `400 INVALID_OTP`) and do not need the mailbox.

---

## 1. Import

1. Copy the environment template and rename:
   `postman/HerNext-Local.postman_environment.json.example` →
   `postman/HerNext-Local.postman_environment.json`.
2. In Postman, **Import** both files (Collection + Environment).
3. Open the Environment, select **HerNext Backend – Local**, and set these
   required values:
   - `testEmailDomain` — a domain you can actually read (e.g. `gmail.com`).
   - `emailOtp` / `resetOtp` — leave blank; you paste codes when the run stops.
   - `testPassword` / `newPassword` — your own values meeting the password policy.
   - `demoEmail` / `demoPassword` / `participantBEmail` — keep the seeded demo
     defaults unless you reseeded with different data.

Variables `baseUrl`, `apiPrefix`, `targetCareerId` (optional override), and the
captured IDs (`experienceId`, `recommendedCareerId`, `qaOrganizationId`,
`qaProgramId`, challenge IDs, …) are managed by the collection's scripts — do
not edit them.

---

## 2. Execution modes

### Mode A — Fast regression (no OTP, recommended)

Uses the seeded demo participant `aisha.demo@hernext.africa` / `AishaDemo123!`
(who already has a profile, experience, AI analysis, transferable skills,
recommendations, and a roadmap with one completed + one in-progress task).

Run folders in this order:

```text
00 – Health & Docs
02 – Demo Login
05 – Career Catalogue Discovery
06 – Profile & Experiences
07 – AI Career Intelligence
08 – Roadmap
09 – Progress & Achievements
10 – Challenges & Evidence
11 – Career Passport
12 – Organizations & Programs
13 – Ownership / Isolation / Negative
```

Notes:

- Folder 12 needs `npm run db:seed:demo:org` and re-authenticates because the
  JWT default lifetime is 15 minutes.
- Folder 13 borrows the roadmap task already completed by the demo user.
- `GET /careers/recommendations` runs **read-first**: until the demo user has
  persisted recommendations it computes them without writing, which is enough to
  resolve `targetCareerId` for profile and roadmap requests.
- The demo user's passport may not exist yet (`404`) or already be generated
  (`200`) — the collection accepts both.

### Mode B — Deep fresh-account gate (manual OTP)

Proves the full registration → verification → reset journey on a brand-new
account. Set `testEmailDomain` to a readable mailbox, then run:

```text
00 – Health & Docs
01 – Fresh Registration & Verification   (STOPS for manual emailOtp)
05 – Career Catalogue Discovery
06 – Profile & Experiences
07 – AI Career Intelligence
08 – Roadmap
09 – Progress & Achievements
10 – Challenges & Evidence
11 – Career Passport
12 – Organizations & Programs
13 – Ownership / Isolation / Negative
03 – Password Reset                        (optional, manual resetOtp)
```

- Folder 01 registers `<testEmailPrefix>.<timestamp>@<testEmailDomain>` and
  waits. Read the code from your mailbox, paste into `emailOtp`, re-run the
  folder, and proceed.
- Folder 03 repeats with `resetOtp` and also asserts reuse of an already used
  reset token returns `400`.
- Fresh-run caveat: roadmap generation (`POST /roadmaps/generate`) calls the
  provider; keep it configured for Mode B.

### Opt-in folders

- `14 – AI Failure (provider intentionally disabled)` — start the backend
  **without** the AI provider key/`AI_MODEL` (default `GROQ_API_KEY`), then run
  this folder to verify the documented `503 AI_SERVICE_ERROR` and that the rest
  of the app still works.
- `15 – Rate Limiting (opt-in, last)` — probe 429s. Run it as the final folder:
  it exhausts the login (10/10 min) and AI (20/min) buckets and intentionally
  treads on the global 100/min limit. For a clean re-run, restart the server or
  wait for the window to expire.

---

## 3. Newman / CLI

Any folder or the whole collection can run headless. Example (Mode A minus the
folders that mutate the demo fixture in place — the collection is designed to be
**re-runnable** against a fresh seed):

```bash
newman run postman/HerNext-MVP-Backend.postman_collection.json \
  -e postman/HerNext-Local.postman_environment.json \
  --folder "00 - Health & Docs" --folder "02 - Demo Login" \
  --folder "05 - Career Catalogue Discovery" --folder "06 - Profile & Experiences" \
  --folder "07 - AI Career Intelligence" --folder "08 - Roadmap" \
  --folder "09 - Progress & Achievements" --folder "10 - Challenges & Evidence" \
  --folder "11 - Career Passport" --folder "12 - Organizations & Programs" \
  --folder "13 - Ownership / Isolation / Negative" \
  --bail
```

Folder 01/03 include the manual OTP gate, so they run to completion only if
`emailOtp`/`resetOtp` are set in the environment before launch.

---

## 4. What the collection asserts

- **Envelope contract**: `{success:true, data}` / `{success:false, error:{code}}`
  on every endpoint, with the documented status codes.
- **Authn**: register → no token; verify-email-otp → first token; unverified
  login → 403 `ACCOUNT_UNVERIFIED`; wrong OTP, missing/malformed bearer token,
  duplicate email, org-role self-registration (403 `FORBIDDEN`).
- **Ownership / isolation**: participant may not read another participant's
  experience, evidence, passport, or progress; non-org-member cannot see the
  demo org/program or its analytics (403 `ORGANIZATION_ACCESS_DENIED` /
  `PROGRAM_ACCESS_DENIED`); `userId` injected into a strict-schema body is
  rejected (`400 VALIDATION_ERROR`).
- **Deterministic backend truth**: progress %, readiness breakdown, skill gaps,
  achievements (idempotent), challenge scores (100 for the documented correct
  answers) come from server calculations, not client-supplied numbers.
- **Public passport privacy**: public view exposes only the allowlisted fields
  (no email/id/passwordHash/organization data); unknown slug is a 404.

---

## 5. Known limitations

- **OTP is manual** — the test provider has no HTTP/log surface by design.
- **No org-list endpoint** — folder 12 discovers the org/program IDs by
  creating them with the org admin (the seeded org uses stable names, not IDs).
- **Demo-fixture mutation** — Mode A mutates the seeded demo user's roadmap task
  status (folder 08) and may create evidence/challenges/passport records. Re-seed
  (`npm run db:seed:demo`) before re-running stress passes or a demo.
- **Rate-limit folder** intentionally trips 429s and consumes the window —
  always run it last, or against a freshly restarted server.
- **AI folders** require a working provider for full 200 coverage; otherwise the
  documented 503 path is asserted.

---

## 6. Relating to the rest of QA

- The authoritative automated matrix lives in
  `tests/openapi.documentation.test.ts` (`ROUTE_MATRIX`).
- Manual end-to-end checklist: `docs/API_SMOKE_TEST.md`.
- These Postman assets are supplementary runtime verification against a live
  local stack; they do not replace `npm test` (`vitest`) or `npm run typecheck`.