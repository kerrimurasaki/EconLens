# EconLens AI — Project Rules for Claude Code

Teacher-authoring web app: real-world event -> economics lenses -> editable inquiry lesson -> published student activity -> mastery insights.
Source of truth: `PRD_EconLens_AI.md` (what/why). Build sequence: `BUILD_GUIDE_CLAUDE_CODE.md` (how/when). If they conflict, the PRD wins; record the conflict in `docs/DECISIONS.md`.

## Status
Greenfield: no code yet. Track progress in `IMPLEMENTATION_PLAN.md` (checklist per milestone); update it at the end of every milestone.

## Stack (decided — do not re-litigate)
- Next.js App Router, TypeScript `strict`, React, Tailwind, shadcn/ui, lucide-react
- PostgreSQL + Prisma (local Postgres via `docker compose`; no SQLite — JSON columns and constraints must match production)
- Auth.js with roles `ADMIN | TEACHER | STUDENT`, argon2/bcrypt hashes, secure cookies
- AI behind a `LLMProvider` interface (`src/server/ai/provider.ts`). Adapters: OpenAI (Responses API, default per PRD), Anthropic (optional), and a **visibly labelled demo-fixture** provider. Model IDs come from env (`AI_PROVIDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`), never hardcoded. Check installed SDK types/docs before using an API.
- Zod schemas for every AI output, persisted JSON, API payload and submission; share them client/server (`src/schemas/`)
- Recharts (with data-table fallback), Vitest + React Testing Library, Playwright

## Commands (create these scripts in M1; keep them working)
```
npm run dev | build | lint | typecheck | test | test:e2e
npm run db:migrate | db:seed | db:reset
```
Before saying any task is done: `npm run typecheck && npm run lint && npm test` must pass. Run `test:e2e` for anything touching a user journey. Report real results; never claim a check passed that you did not run.

## Layout
```
src/app/            routes (teacher + /learn + /join + /api)
src/server/         services, authz policies, ai/, sources/, db access
src/schemas/        Zod schemas (single source for types)
src/components/     UI
prisma/             schema, migrations, seed
tests/              unit, integration, e2e
prompts/            versioned prompt files (prompts/<name>.v<N>.md) — bump version on any edit
docs/DECISIONS.md   assumptions and PRD conflicts
```

## Non-negotiable rules
1. **Student/teacher separation is server-side.** Student APIs use dedicated DTO mappers that omit answer keys, rubrics, teacher notes and unpublished blocks. Never rely on CSS/client hiding. Add a test that asserts the keys are absent from raw JSON.
2. **Every route/action/server mutation**: authenticate -> authorize role -> scope by `tenantId` (and class membership for students) -> Zod-validate input. Use a shared policy helper; no ad-hoc checks. Return the consistent error payload `{ error: { code, message } }`.
3. **Published versions are immutable.** Assignments reference `publishedVersionId`. Draft edits never alter assigned work. Block content lives in `ExperienceVersion.contentJson`; `ExperienceBlock`/`AssessmentItem` rows are derived/indexed copies written in the same transaction — never edited independently.
4. **Provenance honesty.** `verified` requires a stored source URL + excerpt + retrievedAt actually fetched. Without a search provider, nothing is auto-`verified`; user text is `teacher_provided`/`unverified`. Never invent URLs, citations, statistics or news. Synthetic numbers carry a `synthetic teaching data` label and units/dates.
5. **Untrusted text.** Articles, URLs, pasted text and student answers are data, never instructions. Wrap them in delimiters in prompts; system rules live only in the system prompt. Add injection fixtures to tests.
6. **SSRF-hardened fetch** (`src/server/sources/safeFetch.ts`): http/https only, resolve DNS and block private/loopback/link-local/metadata ranges, re-check on every redirect (limit hops), pin resolved IP, size cap, timeout, respect robots.txt, no paywall bypass.
7. **AI calls are server-only**, structured-output + Zod validated, bounded retry, rate-limited per teacher/tenant, logged as `AIJob` with model ID + prompt version. Log metadata, not student content. Handle refusal, timeout, truncation, invalid schema, quota, missing key with explicit user-visible errors — never a silent mock.
8. **Demo mode is explicit**: persistent banner, `isDemo` flag in data, never presented as live/verified news.
9. **Publishing is teacher-approved and gated** by `validateExperience` blocking issues (missing objectives/answers/sources for verified claims, answer leakage, no independent check, duration mismatch).
10. **Accessibility**: labelled controls, keyboard operable (incl. simulation), WCAG AA contrast, chart data-table alternative.
11. Copyright: original content only. CORE Econ is CC BY-NC-ND — link, don't copy or adapt. EconLens is not affiliated with CORE.
12. No dead buttons: if an action is not built yet, don't render it (or disable with an explanation).

## Working style
- Plan mode for each milestone start; vertical slice first, then breadth. Make reasonable decisions; ask only when blocked by a missing credential or a genuine product trade-off.
- Small, reviewable commits per feature (only when asked). Don't add dependencies without a reason noted in `docs/DECISIONS.md`.
- Write tests with the feature (service unit tests with mocked provider; integration tests for authz and DTO leakage; Playwright for journeys).
- Seed data must be labelled fictitious/synthetic. Demo credentials live in README only, hashed in DB.
- Use subagents for: independent security review of authz/DTOs, and economics-accuracy review of seeded content. Keep main context for implementation.
- Prefer editing existing files; keep `IMPLEMENTATION_PLAN.md` and `docs/DECISIONS.md` current.
