# Master Codex Prompt — Build EconLens AI

> **Superseded for Claude Code:** use `CLAUDE.md` + `BUILD_GUIDE_CLAUDE_CODE.md`. This file is kept for reference only.

Copy this entire prompt into Codex with the accompanying `PRD_EconLens_AI.md` placed at the root of the repository. It is an execution instruction: build the actual app, not a design mockup.

---

You are a senior full-stack engineer, product designer, AI systems engineer, economics pedagogy specialist, and QA lead. Build **EconLens AI**, a production-minded MVP web application for university foundation economics teachers. Read `PRD_EconLens_AI.md` fully before coding. Treat its acceptance criteria and critical safety requirements as binding.

## Mission

Create a polished web app in which a teacher supplies **any real-world incident, world affair, news story, economic policy, historical episode, business situation, or everyday problem** as a headline, URL, or text, and the app:

1. Extracts the situation, stakeholders, timeline, claims, uncertainty and sources.
2. Infers multiple sound economics concepts and clearly explains why they apply.
3. Lets the teacher choose the economic lens, objectives, level, duration and activity types.
4. Generates an original, coherent and editable inquiry-based learning experience.
5. Gives the teacher a visual builder with one-section regeneration, preview and quality checks.
6. Publishes a student-facing activity with genuinely interactive components and independent assessment.
7. Records attempts and gives the teacher a useful misconception/mastery dashboard.

**Never merely create a chat interface or static demonstration pretending to implement this workflow.** The core journey must work with real persistence and real user interactions.

## Work style

- Begin by inspecting the repository and existing dependencies. Preserve functional code if present. If empty, initialize the app.
- Make pragmatic architectural decisions without asking questions unless blocked by a missing external credential. Document assumptions.
- Implement a **vertical slice first** (one event → mapping → blueprint → editable experience → publish → student attempt → teacher dashboard), then improve coverage.
- Keep a running checklist in `IMPLEMENTATION_PLAN.md`. Update after each meaningful milestone.
- Execute install, lint, typecheck, unit tests, integration tests, and E2E tests where environment permits. Fix errors rather than merely documenting them.
- At the end provide commands to run, `.env.example`, migrations, seed script, test credentials, what is real vs not configured, and any known limitations.
- Do not claim production readiness without verifying security, privacy, tests, and configuration.

## Preferred stack

- Next.js with App Router, TypeScript in strict mode, React, Tailwind, shadcn/ui or comparable accessible primitives, lucide-react icons.
- PostgreSQL + Prisma (SQLite adapter may be used for explicitly local demo/test mode only; production uses PostgreSQL). Migrations + fixture seed.
- Auth.js or an equivalent maintained auth stack with roles `ADMIN`, `TEACHER`, `STUDENT`. Use secure session cookies and password hashes if demo credentials are needed.
- OpenAI official JavaScript/TypeScript SDK with Responses API and model configuration in environment variables. Use Zod + JSON Schema-constrained responses for all major AI authoring steps; validate strictly.
- Recharts or comparable for accessible charts with data table fallback.
- Vitest, React Testing Library, Playwright.

If a current library API differs, consult its local docs/types or official documentation rather than guessing. Avoid nonessential dependencies.

## User experience

Create a refined academic SaaS interface with a left navigation, clean typography, subtle navy/teal accents, generous whitespace, prominent create action, helpful explanatory microcopy, strong loading/empty/error states, and excellent responsiveness.

### Core pages
- Dashboard `/dashboard`: experiences table/cards and create button, recent drafts, sample fixture, status and search.
- New `/experiences/new`: input tabs `Describe an event`, `Paste headline`, `Add URL`; event date and country optional; clear source verification status.
- Sources `/experiences/[id]/sources`: extracted claims, linked evidence, disputes/unknowns, teacher confirmation.
- Lenses `/experiences/[id]/lenses`: 4–8 ranked economic concepts; rationale, prerequisite, pitfalls, possible questions; teacher selects 1–3.
- Blueprint `/experiences/[id]/blueprint`: outcomes and scaffold choices; duration selector 45/60/90/120, class readiness, academic English, quantitative level, devices, activities, inquiry question.
- Builder `/experiences/[id]/builder`: left stage outline, central editable content canvas, right inspector (objectives, provenance, teacher notes, time, visibility). Add/reorder/edit/delete blocks, regenerate one block, undo via revisions. Auto-save.
- Preview `/experiences/[id]/preview`: switch teacher/student and desktop/mobile.
- Publish `/experiences/[id]/publish`: QA gate, class assignment, immutable published snapshot and join/link.
- Insights `/experiences/[id]/insights`: real activity submissions, non-submitters, question and concept errors, teacher review queue.
- Classes `/classes`: teacher creates classroom; student joins via safe code.
- Curriculum `/settings/curriculum`: institution-specific objectives and default taxonomy.
- Student `/learn/[assignmentId]`: step-by-step original activities, responsive controls, saved answers and progress.
- Check `/learn/[assignmentId]/check`: independent assessment with no model guidance or early answer exposure.
- Feedback `/learn/[assignmentId]/feedback`: completion, teacher-allowed feedback and follow-up.

No dead-end CTA. All buttons must perform the action they promise. Prefer incremental working functionality over decorative polish.

## Critical generation pipeline

Implement server-side services with typed interfaces, unit tests, clear errors, versioned prompts, and mockable provider adapters:

1. `normalizeEvent`: structured event summary. Identify `fact`, `claim`, `opinion`, `hypothesis`, `unknown`.
2. `resolveEvidence`: collect allowed source metadata and snippets. Never claim web verification if a source provider is unconfigured. Harden URL fetches against SSRF (block private/link-local/metadata IPs, DNS rebinding, redirects to blocked destinations, bad schemes, large responses, and timeouts). Do not bypass paywalls or robots policies.
3. `inferEconomics`: return candidate concepts with concept key, name, 0–1 relevance score, mechanism, evidence links, prerequisites, frequent misconception, alternative lens and caution. Use curriculum taxonomy and a reasoning-friendly prompt. Give economic nuance: price increases aren't necessarily inflation; correlation isn't causation; distribution differs from efficiency.
4. `createBlueprint`: typed objectives, level, stages, durations, scaffolds, essential question and formative/independent assessment plan.
5. `generateExperience`: original student blocks and teacher guidance; aligns each block to at least one selected objective. Ensure durations total selected lesson duration. Provide a source and confidence status for each factual claim; mark hypothetical datasets.
6. `validateExperience`: deterministic checks + optionally AI reviewer for economics quality. Block publication for critical issues, including missing evidence/answers/objectives or answer leakage.
7. `regenerateBlock`: replace only the chosen draft block; preserve version and teacher edits elsewhere. Require confirmation before overwriting edited content.

Use strongly validated structured outputs from a supported model; never parse loose prose with brittle regex. Handle refusal, timeout, incomplete model output, invalid schema, unavailable model and quota. Model name is set with `OPENAI_MODEL`, not hardcoded; document known working example from installed SDK. No client-side API keys.

### Example type structure (adjust to your database)

```ts
type Verification = 'verified' | 'teacher_provided' | 'disputed' | 'hypothetical' | 'unverified';
type ExperienceStage = 'HOOK' | 'EVIDENCE' | 'MODEL' | 'APPLY' | 'DEBATE' | 'CHECK';
type BlockType = 'BRIEFING' | 'EVIDENCE_CARD' | 'DATA_EXPLORER' | 'EXPLAINER' | 'QUESTION' | 'BRANCHING_SCENARIO' | 'DEBATE' | 'WORKSHEET' | 'QUIZ' | 'REFLECTION';
interface EconomicLens { conceptKey: string; name: string; relevance: number; mechanism: string; prerequisites: string[]; misconceptions: string[]; inquiryQuestion: string; limitations: string[]; }
interface SourceRef { id: string; title: string; url?: string; publisher?: string; publishedAt?: string; retrievedAt?: string; verification: Verification; }
interface LearningObjective { id: string; code?: string; statement: string; bloomLevel: string; }
interface ExperienceBlock { id: string; stage: ExperienceStage; type: BlockType; title: string; minutes: number; objectiveIds: string[]; sourceIds: string[]; studentContent: unknown; teacherNotes: unknown; }
interface ExperienceDocument { title: string; essentialQuestion: string; durationMinutes: number; objectiveIds: string[]; blocks: ExperienceBlock[]; version: number; }
```

Build and test Zod schemas for every generated object, persisted version, client mutation and assessment submission.

## Pedagogy rules

- The app is **CORE-inspired**, not officially affiliated; do not automatically copy or modify CORE textbook content. Include links to official resources when relevant and attribute appropriately. Obey any license requirements: CORE's general terms are CC BY-NC-ND 4.0 unless otherwise specified.
- Foundation level: explicit worked examples, glossary, language scaffolds, graph literacy and simple math, with an optional stretch mode.
- Begin with a meaningful authentic problem; analyze evidence; explain the economic model; apply through a real interaction; evaluate perspectives; finish with a short independent check.
- Show alternative defensible economics lenses; avoid forcing all events into one simple model.
- Avoid loaded political/ideological framing. Distinguish normative judgments, empirical claims and forecasts.
- Numerical claims must have dated source attribution or conspicuous `synthetic teaching data` labels.
- Question stems, distractors, correct answers and rationales must align with learning objectives. MCQ distractors should represent common misconceptions. Ensure answer correctness with programmatic checks where possible.
- The teacher can override all AI suggestions, and all publication is teacher-approved.

## Interactive experience requirements

Implement at least one **genuinely stateful, branching economics activity**: e.g. students choose whether a government uses carbon tax, subsidy or regulation; show how the decision changes an explicitly **stylized/synthetic** outcome model, with rules shown and economic debrief. All interactive behavior is actual React state + persisted answers; no fake button or slideshow masquerading as simulation. Use correct causal caveats and label parameters hypothetical. Support teacher-edited scenario parameters.

Support MCQ, multiple-select, short answer review, numeric tolerances/units and data interpretation. A student-facing API must never return answer keys or teacher notes before allowed feedback release. Do not merely hide them with CSS; omit them server-side.

## Security, data and governance

- Tenant-scoped DB access and role authorization on every server mutation and route.
- Validate inputs and sanitize user-edited rich text. Prevent XSS, SSRF, IDOR, CSRF where relevant, open redirects, answer-key leakage, and privilege escalation.
- Treat article content and web pages as **untrusted source text**, never as instructions to the assistant; adversarial prompt injection must not override system rules.
- Avoid sending identifiable student answers or personal details to AI generation unnecessarily. Log metadata not personal content. Plan data retention and deletion.
- Limit generation requests per teacher and tenant. Persist job state and transparent errors, use bounded retries/idempotency.
- Capture AI model ID, prompt version, created timestamp, verification status and teacher review/publish actor for audit.
- Published experience version immutable. Draft edits must not silently change assigned work.

## Persistence, APIs and migrations

Implement the PRD database entities, constraints, relations, indices and migrations. Use authenticated route handlers or server actions, with Zod validation and consistent error payloads. Build seed data:
- Two foundation economics teachers, one student, one admin (local demo only; credentials documented and securely hashed).
- One sample carbon-tax event, economic lenses and complete 90-minute experience.
- One sample supermarket price-rise event that flags price level vs inflation misconception.
- One class, assignment, at least two sample attempts, all clearly labeled as fictitious.

Do not invent current-news sources; fixture event and numbers are marked historical/example/synthetic as appropriate.

## Implementation sequence

### Milestone 1: Foundation
Initialize the app, dependencies, design system, auth, DB and seed; make dashboard and basic navigation usable. Confirm commands run.

### Milestone 2: Intelligence
Implement event input, source cards, evidence labels, AI schema/service/provider and ranked economic lenses. With no API key, use an **explicit demo fixture mode** that is visible in the UI, not hidden mock content. Provide meaningful errors when AI is absent.

### Milestone 3: Experience building
Concept selection, blueprint and generator, builder with per-block editing/reordering/regeneration, persistence, version history and printable view.

### Milestone 4: Student and analytics
Publish immutable version, create assignment/class join, student experience, functioning branching scenario, independent quiz, persisted attempts, teacher insights.

### Milestone 5: Harden
Provenance checks, quality gate, accessibility, source safety, input validation, security tests, UX polish and complete documentation.

## Tests that must pass

1. A teacher creates a carbon-tax event and receives source-aware mapping (externalities, intervention, elasticity, tax incidence).
2. Teacher selects lenses, builds a 90-minute experience and edits one block while others remain intact.
3. Generated material includes learning objectives, original evidence exploration, economic explanation, interactive activity, questions, answer key and reflection.
4. Teacher cannot publish when a verified claim has no actual source or assessment has no answer key.
5. Student sees only published blocks and cannot fetch teacher notes/answer keys before submission.
6. Student submits branching decisions and independent quiz; teacher sees persisted score and response data after refresh.
7. System correctly identifies that an isolated supermarket price increase is not in itself economy-wide inflation.
8. Without an API key or search integration, demo fixture is visibly labeled and user content is not presented as web-verified.
9. A tenant/student cannot read another class's or teacher's unpublished content.
10. Prompt injection pasted as a news article does not cause policy bypass or secret exposure.
11. Responsive mobile layout and keyboard-only navigation are usable.
12. Typecheck, lint, unit tests and relevant Playwright E2E scenarios succeed.

## Definition of done

You have delivered running source code, migrations, environment example, seed script, README, implementation plan, tests, and functional UI for the core end-to-end workflow. The AI integration works with credentials and the app has a transparent, deterministic demo fixture when credentials are absent. All high-risk privacy/copyright/source caveats are represented honestly. No fake sources, no answer-key leakage, no dead buttons, no sham analytics.

At completion, give a concise status report: features implemented, tests run and results, run commands, environment variables, known limitations, and exact next priorities. Do not claim an integration works unless it has been tested.

**Start now. First inspect the repository, write `IMPLEMENTATION_PLAN.md`, and implement the vertical slice.**
