# Implementation Plan

## M1 Foundation
- [x] Next.js 16 + strict TS + Tailwind 4, ESLint, Vitest, Playwright config
- [x] docker-compose Postgres, `.env.example`
- [x] Prisma schema for all PRD section 11 entities (client generates)
- [x] Initial migration `init` applied to local Postgres
- [x] next-auth credentials + roles, policy helpers (`assertRole`, `assertSameTenant`), error payload, audit helper
- [x] App shell, login, `/dashboard` (search, status filter, empty/error states), `/api/experiences`
- [x] Seed script executed successfully
- [x] Unit tests (policy, error payload, tenant scoping): passing
- [x] Login verified per role via HTTP (teacher sees own, other teacher empty, student 403, anon 401, wrong password rejected); `next build` OK
- [ ] Playwright smoke test (browsers not installed yet)

## M2 Intelligence
- [x] Migration `m2_analysis` (analysis fields on EventCase, rank/details on ConceptSuggestion, AIJob unique dropped)
- [x] `LLMProvider` interface, OpenAI Responses adapter (structured outputs + Zod), labelled demo provider; no silent fallback when openai is selected but unconfigured
- [x] Versioned prompts in `prompts/`, untrusted-input delimiting
- [x] `safeFetch` (SSRF hardening, pinned IP, redirect re-validation, robots.txt, size/time caps) + `extractExcerpt`
- [x] Services: normalizeEvent, inferEconomics (4-8 lenses, cleaned/ranked), claim review rules, lens selection (FR-04), AIJob logging, 20 jobs/hour limit
- [x] Pages: `/experiences/new`, `/sources`, `/lenses`; APIs: events, analyze, claims, concepts
- [x] Tests T1, T7, T8, T10, T13, T14, T16 as unit tests; API flow verified by HTTP against real Postgres
- [ ] OpenAI adapter NOT tested against the real API (no key/model configured)
- [ ] Anthropic adapter not implemented (selecting it returns NOT_CONFIGURED)
- [ ] No search provider: verification stays teacher-driven; `verified` needs a fetched URL source
- [ ] Real-network URL fetch not exercised (only mocked transport); default transport untested
- [ ] Playwright journey tests; DB-backed integration tests (T9 full matrix) deferred to M4/M5
- [ ] createEvent+analyze is synchronous (no job polling); fine for demo, revisit with real latency

## M3 Experience building
- [x] Schemas: blueprint, blocks, items (teacher-only `teacher` object), tables, scenarios, document; model-facing shapes use nullable fields
- [x] `planStages` (45/60/90/120 always sum exactly), demo template generator with computed answer keys, versioned prompts `generateExperience.v1`, `regenerateBlock.v1`
- [x] Deterministic `validateExperience` quality gate (objectives, stages, durations, answer keys, leakage, provenance, labelling, counts)
- [x] Services: saveBlueprint, generateDraft (FR-04 gate), saveDraft (optimistic concurrency, server-set `edited`), regenerateBlock (confirmation for edited blocks), restoreVersion, validate; derived block/item rows written in the same transaction
- [x] Pages: `/blueprint`, `/builder` (outline, editor, inspector, autosave, history, per-block regenerate), `/preview` (teacher/student, desktop/mobile), `/print`, JSON export
- [x] Student projection `toStudentView` (allow-list) used by preview; tested for key absence in raw JSON
- [x] Seed: complete 90-minute sample (labelled synthetic) that passes the gate
- [x] Tests T2/T3/T4/T15 as unit tests (110 total); API flow (generate, edit, conflict, confirm-overwrite, regenerate one block, restore) verified via `tests/e2e-api.sh` + `tests/e2e-edit.sh`; autosave confirmed in the browser pane
- [ ] OpenAI path for generateExperience/regenerateBlock NOT tested against the real API
- [x] Scenario parameters are editable in the builder (added in M4)
- [ ] Reordering is up/down buttons within a stage (no drag and drop)
- [ ] No Playwright journey tests yet; keyboard-only and mobile builder usage not formally tested (T11 in M5)
- [ ] Reading-level check is a word-count warning only

## M4 Publish, student, analytics
- [x] Migration `m4_publish_learn` (class join-code expiry, assignment feedback mode/release)
- [x] Publish: quality-gated, immutable snapshot, idempotent assignment per (experience, version, class), audit event
- [x] Classes: create, rotate code (14-day expiry), join by code or `/join/[code]` (tenant-scoped; wrong/expired/other-tenant codes give one message)
- [x] Student: `/learn` list, `/learn/[id]` activity, `/check` independent check, `/feedback` (released after submit or when teacher releases)
- [x] Server-side scoring (mcq, multi exact-set, numeric tolerance; short answers wait for the teacher); saving never echoes scores
- [x] Stateful branching scenario: order enforced, outcome computed on the server, choices persisted per attempt, explanations/debrief revealed only as decisions are made, replay supported
- [x] Student view scopes (`learn` excludes the exit ticket, `check` contains only it); allow-list mapper; scenario effects/explanations/debrief stripped
- [x] Insights: enrolled/started/submitted, non-submitters, average independent score, per-objective and per-question results, common wrong answers, scenario choice counts, review queue with teacher marks, feedback release
- [x] Builder scenario editor (labels, start values, option effects, rules, debrief)
- [x] Questions now map to the objective that lists the lens concept (was round-robin)
- [x] Seed: sample class (code DEMO2026), 3 fictitious students, published assignment, 2 submitted sample attempts, 1 non-starter
- [x] Tests: 126 unit tests (scoring, scenario engine, view scopes, access scoping, feedback gating, join codes); `tests/e2e-learn.sh` HTTP flow incl. IDOR, publish idempotency and snapshot immutability; student UI scenario play verified in the browser pane
- [ ] Formative practice shows feedback only after submission (no immediate hints); answers released after the independent check
- [ ] No Playwright journeys; T11 keyboard/mobile audit still to do (M5)
- [ ] No late-submission or due-date enforcement; no attempt limits; no student-facing progress bar
- [ ] Join attempts are not rate limited (M5)
- [ ] Insights show individual students' names to their own teacher only; retention/deletion controls still to do (M5)
- [ ] Curriculum settings page not built

## M5 Harden
- [x] Independent security review and economics review (read-only subagents); all High/Critical and most Medium findings fixed (see `docs/DECISIONS.md`)
- [x] CSRF origin check (`src/proxy.ts`), CSP/HSTS, request size caps, rate limits wired (login, join, events), atomic AI quota, session re-validation, production secret guard
- [x] Retention and deletion: admin page `/settings/privacy`, `npm run retention:run`, per-student erasure
- [x] T9: DB-backed access matrix (`tests/integration/access.test.ts`): every teacher-side call denied for other teachers, other tenants, students and anonymous users; student-side calls denied across tenants and students
- [x] Playwright (installed Chrome): core journey, axe WCAG 2.2 A/AA on teacher/admin/student pages, keyboard-only flows, 375px mobile overflow checks
- [x] Economics fixes: corrected a false "misconception", per-misconception corrections, consistent scenario sizes, tariff scenario, prompts v2
- [ ] Manual screen-reader pass; real OpenAI run; shared-store rate limiting; due-date enforcement (see README next priorities)

