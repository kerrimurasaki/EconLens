# EconLens AI

Teacher-authoring web app that turns a real-world event into a scaffolded, interactive economics lesson, publishes it to a class, and shows teachers what students understood. EconLens is **not** affiliated with CORE Econ; lesson content is original.

Product spec: `PRD_EconLens_AI.md`. Working rules for Claude Code: `CLAUDE.md`. Build sequence: `BUILD_GUIDE_CLAUDE_CODE.md`. Build history and status: `IMPLEMENTATION_PLAN.md`. Design decisions and known gaps: `docs/DECISIONS.md`. Status: **Milestones 1-5 complete (MVP, demo AI mode)**.

## Run locally

Requirements: Node 24, Docker Desktop (for Postgres).

```bash
npm install
cp .env.example .env              # then set NEXTAUTH_SECRET (see below)
docker compose up -d db
npx prisma migrate deploy         # or: npm run db:migrate
npm run db:seed
npm run dev                       # http://localhost:3000
```

### Environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `NEXTAUTH_SECRET` | Session signing secret. **Production refuses to run unless it is at least 32 random characters** (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Public base URL |
| `AI_PROVIDER` | `demo` (default) or `openai`. A misconfigured `openai` returns an explicit error; it never falls back to demo |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Required when `AI_PROVIDER=openai`. Choose a model that supports structured outputs |

## Demo accounts (local only, fictitious people)
Password for all: `EconLens-demo-1!`

- admin@demo.econlens.test (ADMIN)
- teacher1@demo.econlens.test, teacher2@demo.econlens.test (TEACHER)
- student1@demo.econlens.test, student2@demo.econlens.test, student3@demo.econlens.test (STUDENT)

Sample class join code: `DEMO2026` (fictitious class). teacher1 owns a complete 90-minute sample lesson published to it; student1 and student2 have submitted sample attempts and student3 has not started. **Never run the seed against a production database** (it refuses when `NODE_ENV=production`).

## Commands
| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run, build, serve |
| `npm run typecheck` / `lint` | Static checks |
| `npm test` | Unit tests plus the database-backed access-control matrix (the matrix skips itself if Postgres is unreachable) |
| `npm run test:e2e` | Playwright journey, accessibility (axe), keyboard and mobile tests using your installed Chrome (`E2E_CHANNEL=msedge` for Edge). Needs the database and seed; starts `npm run dev` if it is not running |
| `npm run db:migrate` / `db:seed` / `db:reset` | Database |
| `npm run retention:run` | Deletes student attempts older than each tenant's retention period (schedule this daily) |
| `bash tests/e2e-api.sh`, `e2e-edit.sh`, `e2e-learn.sh` | Optional HTTP smoke flows against a running server |
| `tests/cleanup.sql` | Removes data created by smoke runs and Playwright |

## What is real
- Accounts and roles (admin, teacher, student), tenant isolation, audit events.
- Event input (description, headline, URL), SSRF-hardened URL fetching, claim review where a claim can only become *verified* against a fetched source.
- Ranked economics lenses, objectives, blueprint, lesson generation, builder (autosave, per-block regeneration, version history, scenario editor), teacher and student preview, print and JSON export.
- Deterministic quality gate that blocks publishing for missing objectives or answer keys, answer leakage, unsourced "verified" claims, unlabelled synthetic data and more.
- Publishing as an immutable snapshot, classes and join codes, student activity with a server-driven branching simulation, independent check, server-side scoring, gated feedback, teacher insights, marking of written answers, closing assignments.
- Privacy controls (admin): retention period, scheduled purge, per-student erasure.

## What is NOT configured or NOT tested
- **AI is in demo mode by default.** Analysis and lesson generation then come from labelled templates (the UI says so), not a model. The OpenAI adapter (structured outputs, Zod validation, retries, error mapping) has **never been run against the live API**. The Anthropic adapter is not implemented.
- **No search/verification provider.** Nothing is verified automatically. Only a URL the teacher supplies and that EconLens fetched can back a *verified* claim.
- Rate limiting is in memory (one server instance). Use a shared store before running several instances.
- Automated accessibility checks (axe, WCAG 2.2 A/AA) pass on the key pages, but automated tools find only part of the problems. Do a manual screen-reader pass (NVDA/VoiceOver) on the builder and the simulation before a pilot.
- No due-date enforcement, attempt limits, LMS integration, SSO, or curriculum settings page. Formative practice feedback appears only after the independent check is submitted.
- Real-network URL fetching was exercised only with a mocked transport plus blocked-address checks.
- The seeded lesson and demo templates were reviewed for economic accuracy once (findings applied), but real-model output has not been evaluated. Every generated block still needs teacher review.

## Security summary
Server-side role and tenant checks on every mutation; cross-tenant access returns "not found"; student views are an allow-list that never includes keys, notes, rubrics, scenario effects or the independent check during practice; CSRF origin check plus SameSite cookies; CSP, HSTS (production), frame and sniffing protections; request size limits; login, join and event rate limits; AI quota enforced atomically; sessions re-validated against the database; prompt inputs delimited and stripped of delimiter tricks; SSRF controls (scheme and port allow-list, DNS resolution with every answer checked, pinned IP, redirect re-validation, size and total-time caps, robots.txt). An independent review was run in M5; `docs/DECISIONS.md` lists what was fixed and what remains.

## Next priorities
1. Run the OpenAI path with a real key and model; evaluate generated lessons with teachers.
2. Manual screen-reader and keyboard testing; fix findings.
3. Shared-store rate limiting, failed-login auditing, due-date enforcement, attempt limits.
4. Curriculum settings page, immediate formative hints, drag-and-drop reordering.
5. Search-provider integration for real source verification; PDF and file ingestion.
