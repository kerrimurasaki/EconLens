# EconLens AI — Build Guide for Claude Code

Replaces `MASTER_CODEX_PROMPT.md` (kept for reference). Instead of one giant prompt, work in **six sessions**, one per milestone. `CLAUDE.md` carries the persistent rules, so each prompt below is short.

## How to use
1. Open Claude Code in this folder. `CLAUDE.md` loads automatically.
2. For each milestone: start in **plan mode**, paste the milestone prompt, review the plan, approve, then let it implement.
3. At the end of each milestone, run the exit checks, then `/clear` (or start a new session) before the next. State persists in the repo via `IMPLEMENTATION_PLAN.md` and `docs/DECISIONS.md`.
4. Suggested checks between milestones: `/code-review` and `/security-review`.

## What changed from the Codex prompt, and why
| Issue found | Resolution |
|---|---|
| One ~170-line prompt for the whole product overflows working context and mixes concerns | Persistent rules -> `CLAUDE.md`; work split into milestone prompts |
| "SQLite for demo" conflicts with Postgres JSON/constraints in production | Postgres only, via `docker compose` |
| Provider hard-wired to OpenAI | `LLMProvider` interface; OpenAI default per PRD, Anthropic optional, labelled demo-fixture provider |
| Data model duplicates content (`ExperienceVersion.contentJson` and `ExperienceBlock`/`AssessmentItem`) with no source of truth | `contentJson` is canonical; block/item rows are derived in one transaction |
| `/join/[code]` page in PRD missing from prompt page list | Added in M4 |
| PRD Scenarios 3 (tariffs), 4 (unverified, no provider) and FR-07 counts (>=5 formative, >=3 independent) not covered by the 12 tests | Added as acceptance tests T13-T15 |
| "verified" status attainable by AI claim alone | `verified` only when a fetched source URL + excerpt + retrievedAt is stored |
| No stated rule for who may regenerate/overwrite edited blocks, or idempotency | Added to M3/M4 |
| Test credentials/demo mode ambiguity | Demo flag + banner + README-only credentials |
| Missing scripts/commands for the agent to verify itself | Standard npm scripts defined in M1 |

## Acceptance tests (binding; extends the original 12)
- T1 Carbon-tax event -> >=4 lenses incl. externalities, intervention, elasticity, tax incidence.
- T2 Select lenses, build 90-min experience, edit one block; others unchanged. Block durations sum to 90.
- T3 Experience has objectives, original evidence exploration, model explanation, interactive activity, questions + answer key, reflection.
- T4 Publish blocked when a `verified` claim lacks a stored source, or any assessment lacks an answer key.
- T5 Student sees only published blocks; raw JSON has no answer keys/teacher notes/rubrics.
- T6 Branching decisions + independent quiz persist; teacher sees score/responses after refresh.
- T7 Supermarket price rise flagged as relative price change, not by itself economy-wide inflation.
- T8 No API key/search: demo fixture is labelled; nothing shown as web-verified.
- T9 Cross-tenant / cross-class / unpublished access is denied (IDOR matrix test).
- T10 Prompt-injection article does not change behaviour or reveal secrets.
- T11 Mobile layout and keyboard-only navigation work for the core flows.
- T12 typecheck, lint, unit, integration, Playwright all green.
- T13 Tariff event: surplus, comparative advantage, distribution, balanced stakeholders, claims dated/contested.
- T14 Unsourced headline + no provider: states it cannot verify, offers hypothetical framing, no invented citations.
- T15 >=5 formative and >=3 independent items, each mapped to an objective, with keyed rubric/answer and rationale.
- T16 SSRF: blocked for 127.0.0.1, 10/8, 169.254.169.254, `file://`, redirect-to-private, DNS rebinding, oversize, timeout.

---

## Milestone 1 — Foundation
```
Read CLAUDE.md, PRD_EconLens_AI.md sections 3, 10, 11, 12. Plan, then build the foundation:
- Initialise Next.js (strict TS, Tailwind, shadcn/ui), ESLint, Vitest, Playwright, docker-compose Postgres, .env.example.
- Prisma schema for all PRD section 11 entities with unique constraints, indices, cascade rules, tenantId everywhere; first migration.
- Auth.js credentials auth, roles, a `requireRole`/`policy` helper, consistent error payload, audit-event helper.
- App shell: left nav, /dashboard (list, search, status, create button, empty/loading/error states), design tokens (navy/teal).
- Seed: tenant, 1 admin, 2 teachers, 1 student (fictitious, hashed), curriculum objectives.
- Create IMPLEMENTATION_PLAN.md and docs/DECISIONS.md and the npm scripts listed in CLAUDE.md.
Exit: npm install, db:migrate, db:seed, dev, typecheck, lint, test all run; login works per role; unauthorised route is denied (test).
```

## Milestone 2 — Intelligence (vertical slice, part 1)
```
Build /experiences/new, /sources, /lenses, plus services normalizeEvent, resolveEvidence, inferEconomics.
- LLMProvider interface + OpenAI adapter + demo-fixture adapter (UI banner when active). Structured outputs + Zod, bounded retry, AIJob persistence, rate limit, error taxonomy.
- Prompts as versioned files in prompts/; untrusted input delimited; injection fixtures.
- safeFetch with full SSRF hardening and tests (T16). No search provider -> input-only mode with explicit "verification unavailable".
- Source cards, claim types (fact/claim/opinion/hypothesis/unknown), verification statuses per CLAUDE.md rule 4.
- Lenses: 4-8 ranked concept cards, teacher selects 1-3, edits inquiry question/objectives (FR-04 gate).
- Fixtures: carbon tax, supermarket price rise (T7), tariff (T13).
Exit: T1, T7, T8, T10, T13, T14, T16 pass.
```

## Milestone 3 — Experience building
```
Build /blueprint, createBlueprint, generateExperience, validateExperience, regenerateBlock, /builder, /preview.
- Zod schemas for blocks/stages/assessment items; block types per PRD section 5.
- Six stages Hook->Evidence->Model->Apply->Debate->Check; durations (45/60/90/120) must sum exactly.
- Builder: 3-column desktop, drawer on mobile; add/reorder (keyboard-accessible)/edit/delete; per-block regenerate with overwrite confirmation; autosave with revision conflict handling; version history + undo.
- Deterministic validator: objectives mapping, provenance, durations, answer-key presence and consistency (programmatic checks for numeric/MCQ), answer leakage in student text, graph labels, >=5 formative and >=3 independent items. Optional AI reviewer returns blocking vs warning.
- Preview teacher/student x desktop/mobile using the same student DTO mapper as production.
- Print-friendly teacher guide/worksheet; JSON export.
Exit: T2, T3, T15 pass; regenerating one block leaves others byte-identical.
```

## Milestone 4 — Publish, student, analytics
```
Build /publish, /classes, /join/[code], /learn/*, /insights.
- Publish creates an immutable ExperienceVersion snapshot (idempotent), assignment with time-bound join code; audit event with actor.
- Student DTO mapper omits answer keys/rubrics/notes/unpublished blocks; independent check has no hints and reveals nothing until submit; feedback gated by teacher setting.
- Stateful branching scenario (carbon tax vs subsidy vs regulation) with explicit rules, teacher-editable stylised parameters, labelled hypothetical, causal caveats, debrief; state persisted per attempt.
- Item types: MCQ, multi-select, short text (teacher review), numeric w/ tolerance+units, data interpretation. Server-side scoring only.
- Insights from real attempts: completion, non-submitters, per-item and per-concept results, misconception patterns, review queue, teacher override.
- Seed: sample classroom, assignment, two clearly fictitious attempts.
Exit: T4, T5, T6, T9 pass; Playwright journey teacher->publish->student->insights green.
```

## Milestone 5 — Harden
```
- Run an independent security review subagent on authz, DTOs, SSRF, XSS (sanitise rich text), CSRF, open redirects, rate limits, log redaction, CSP. Fix findings, add regression tests (T5, T9, T10, T16).
- Accessibility pass: axe in Playwright, keyboard-only flows, chart table alternatives, contrast (T11).
- Economics accuracy review subagent over seeded content and prompts: causal nuance, balance, no unsourced numbers.
- Data retention/deletion controls; privacy: no student content in AI prompts or logs.
- Complete README (run, env vars, demo credentials, real vs not configured), known limitations, exact next priorities.
Exit: T1-T16 all pass; /security-review and /code-review clean or findings documented.
```

## Milestone 6 (optional, post-MVP)
Search provider integration, PDF ingestion, CSV export, LTI — see PRD "Post-MVP".

## Final report format (ask Claude Code to end each milestone with this)
Features done · tests run with real results · commands · env vars · not configured / not tested · known limitations · next priorities.
