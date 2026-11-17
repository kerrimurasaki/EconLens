# EconLens AI — Product Requirements Document

**Version:** 1.0 | **Date:** 15 November 2026 | **Status:** Build-ready MVP specification
**Audience:** Product, engineering, academic leadership, economics teachers, QA
**Primary setting:** University foundation economics programmes (mixed readiness, international cohorts)

## 1. Product vision

EconLens AI turns a real-world incident, world affair, policy change, business decision, historical event, or everyday socioeconomic problem into a rigorous, scaffolded, interactive economics learning experience. It is a **teacher-authoring platform first**. Teachers review every factual assertion, concept mapping, assessment, and student-facing artifact before publication. Student participation and accountability are included in MVP, but a full adaptive tutoring system is not.

**Core promise:** From **event** to **economic insight** to **classroom experience** to **verified student understanding**.

**North-star metric:** Percentage of published experiences that reach the defined instructional-quality threshold and yield completed independent mastery evidence, while reducing teacher preparation time.

### Guiding pedagogical principles
1. Real-world question first, then evidence, concepts, models, application, and reflection.
2. Explicit scaffolding for foundation students: academic English, mathematics, and prerequisite knowledge.
3. Multiple legitimate economic interpretations; teacher selects focus and framing.
4. Distinguish factual reporting, opinions, causal claims, assumptions, and hypothetical simulation rules.
5. Independent assessment of learning separate from AI-guided practice.
6. Teacher control and transparent AI provenance throughout.
7. Original instructional material; link to CORE Econ rather than reproducing/adapting licensed content without permission.

## 2. Problem and opportunities

Teachers spend substantial time locating credible events, identifying connections to syllabus objectives, finding data, designing activities, adjusting difficulty, writing questions, and creating mark schemes. Outputs differ by teacher and cohort. Students can participate in exciting discussions yet finish without demonstrable understanding. Existing generic AI chat tools generate plausible but often unverified news claims, loose economic mappings, and superficial activities. EconLens solves these problems via a systematic authoring workflow and a common assessment backbone.

## 3. Users and permissions

- **Teacher (MVP):** create and manage events, run analysis, select concepts, configure experiences, edit every artifact, preview, publish to a class, view aggregated and individual attempts, give feedback.
- **Student (MVP):** access assigned experiences, answer activities, receive formative hints when enabled, submit independent checks, review feedback.
- **Academic lead/admin (MVP lightweight):** manage approved syllabus taxonomy, cohorts, teacher access, review publishing audit; no automatic student ranking.
- **System admin (MVP):** manage feature flags, providers, quotas, logs, retention settings.

Role-based server authorization is mandatory. Teacher data and student submissions are scoped to tenant/institution and class.

## 4. Jobs to be done

1. Given a headline, URL, pasted article excerpt, or teacher-written scenario, identify relevant economics concepts and show which are most teachable at foundation level.
2. Explain **why** each concept applies, evidence needed, misconceptions, prerequisites, and uncertainty.
3. Allow teacher to choose 1–3 focus concepts and a central inquiry question rather than accepting a black-box output.
4. Generate a coherent, paced experience in 45/60/90/120-minute configurations and with scaffold level Foundation/Standard/Stretch.
5. Provide ready-to-edit event briefing, inquiry hook, evidence cards, model explanation, original charts or synthetic datasets where necessary (clearly labeled), interactive activity/simulation, discussion/debate, exit ticket, student worksheet, facilitator guide, answer key, and rubric.
6. Publish an accessible student experience and receive independent learning evidence.
7. Summarize common misconceptions and suggest appropriate follow-up without automatically making high-stakes decisions.

## 5. Scope

### MVP: Must have
- Email/password or managed authentication using a supported auth library; teacher/student/admin RBAC.
- Responsive dashboard with experiences, status, last edited, search, duplicate, archive.
- Create from manual text, title, or news URL. Optional paste of article excerpt; HTML extraction from permitted pages where supported. No general web scraping of paywalled or blocked sites.
- User can enter a date, jurisdiction, source URL, context, and known facts; source metadata and retrieval timestamp recorded.
- Source verification workflow: accessible primary/credible sources; explicit unsupported/unverified markers. Search integration only when valid credentials are configured. Otherwise operate from provided text and transparently mark verification unavailable.
- AI event decomposition and economics concept discovery. Return 4–8 candidate concepts with relevance, pedagogical fit, depth, prerequisites, likely misconceptions, evidence needs, and limitations.
- Teacher approval checkpoint to select concepts and edit inquiry question/learning objectives.
- Experience generation using structured schemas and persisted versioning.
- Drag/reorder, edit, delete, regenerate **one section** (not the entire document), undo by version, save draft, preview desktop/mobile, publish.
- Minimum block types: event briefing, evidence card, data table/chart, concept explainer, inquiry questions, interactive choice/scenario, role-play/debate, guided worksheet, formative quiz, independent exit ticket, reflection.
- Interactive choice/scenario is a real stateful branching activity with rules and outcome explanation; no static mock simulation.
- Quiz types: MCQ, multiple-select, short text (teacher-rubric-review), numeric with tolerance and units, data interpretation. Independent assessment disables AI hints/answer reveal until submitted.
- Share by class assignment and time-bound join code/link; student sessions/attempt persistence.
- Teacher dashboard: completions, concept-level scores, question-level misconception patterns, missing submissions, flags for review; teacher overrides.
- Export: print/PDF-friendly teacher guide and student worksheet using browser print; JSON download for backup. PPTX/LMS integration post-MVP.
- Seeded offline demo mode explicitly labeled as sample data and never presented as verified live news.
- Error, loading, empty, retry states; clear source attributions; accessibility; smoke and integration tests.

### Post-MVP
- Live news discovery/search feed; ingestion of PDFs and files; multilingual scaffolding; classroom group management; LMS LTI 1.3; CSV gradebook export; teacher co-authoring; SSO; adaptive tutoring; more complex economic games; advanced analytics; reusable institutional question bank; curriculum version governance; proctored assessments.

### Non-goals
- Fully autonomous lesson publishing; algorithmic grading of open-ended high-stakes assessments; open-ended chat that invents evidence; automatic reproduction of entire copyrighted news articles or CORE Econ chapters; forecasting real-world economic outcomes as certainty; live source verification without a browsing/search service.

## 6. End-to-end user journey

**Step A — Start:** Teacher chooses “Create from real-world event.” Input modes: (1) freeform situation, (2) link, (3) headline, (4) a historical hypothetical scenario. Optional topic, age/level, duration, class context. Auto-save draft.

**Step B — Event intelligence:** System extracts actors, jurisdiction, timeline, economic stakes, stakeholders, observed facts, contested claims, unknowns, primary-source links, data opportunities. Display a source and confidence panel. Disallow invented citations. Input and sources treated as untrusted data.

**Step C — Economics lens:** Generate ranked concept cards from an approved taxonomy (e.g., scarcity; choice; opportunity cost; incentives; supply/demand; elasticity; externalities; public goods; market failure; government intervention; tax incidence; inequality; economic growth; inflation; unemployment; trade; comparative advantage; exchange rates; development; institutions; behavioural economics; market power; game theory). Each card says “how this applies,” sample inquiry question, related model, prerequisites, misconceptions, caution/limitations. Teacher selects up to 3; can override.

**Step D — Blueprint:** Teacher chooses target objectives, inquiry question, lesson duration, student readiness, English-language level, mathematical complexity, activity modes, class size, student device availability, and whether data must be authentic/verified. UI previews time allocations and learning progression. Teacher approves.

**Step E — Generate:** AI creates structured sections following Hook → Investigate Evidence → Teach Model → Apply/Experiment → Debate/Reflect → Independent Check. All quantitative examples state units, dates, and source or synthetic label. All questions map to objectives and have teacher-only answers/rubrics. No unsupported graph or source claims.

**Step F — Edit and quality review:** Teacher edits rich text, changes sequence and time, regenerates a selected section, reviews provenance, fixes accessibility alerts, checks answer keys, and approves publication. Auto quality checks: objectives alignment, stage coverage, estimated time, factual provenance, graph labeling, answer-key consistency, cognitive load, reading level, scaffold quality.

**Step G — Publish and run:** Share to cohort; student completes interactive guided activities and a final unaided exit ticket. Experience may be self-paced or teacher-facilitated. Record timestamps and answer evidence (not intrusive behaviour tracking).

**Step H — Review:** Teacher sees aggregate concept mastery, participation and common wrong answers; manually assesses open responses; assigns targeted re-practice; export/download as needed.

## 7. Functional requirements / acceptance criteria

| ID | Requirement | Acceptance criterion | Priority |
|----|-------------|--------------------|---------|
| FR-01 | Input event | Paste text/headline/URL; validation and draft save | P0 |
| FR-02 | Evidence provenance | Every external fact has source URL/date or Unverified label | P0 |
| FR-03 | Economic mapping | 4–8 ranked concepts with explanation, prerequisite, misconception | P0 |
| FR-04 | Teacher checkpoint | Cannot generate final experience until concept/objective selection | P0 |
| FR-05 | Structured lesson | Six stages, duration allocation, objectives, teacher/student separation | P0 |
| FR-06 | Section editing | Edit/reorder/regenerate single block; persist versions | P0 |
| FR-07 | Assessment | At least 5 formative questions and 3 independent exit-ticket questions (configurable) with keyed rubrics | P0 |
| FR-08 | Simulation | At least one selectable branching economics scenario with outcome and debrief | P0 |
| FR-09 | Publish | Students only see teacher-approved published version | P0 |
| FR-10 | Student evidence | Attempts persisted; no early answer leakage in independent check | P0 |
| FR-11 | Reporting | Completion, item-level score, concept-level outcomes, non-submitters | P0 |
| FR-12 | Export | Printable teacher/student views, valid JSON export | P1 |
| FR-13 | Search/filter | Search drafts/published, topic, date, class | P1 |
| FR-14 | Demo | End-to-end sample with clear synthetic-data labels | P0 |
| FR-15 | Robustness | Graceful API failure, provider absent, retry/timeout and no misleading success | P0 |
| FR-16 | Quality gate | Publication blocked for critical missing objectives, unsourced claims represented as verified, or answer-key errors | P0 |
| FR-17 | Accessibility | Keyboard navigation, labels, screen reader text, accessible charts/tables | P0 |

## 8. Learning-objective taxonomy and mappings

Represent a curriculum objective with code, title, level, Bloom verb, concepts, prerequisites, required graph/quantitative skills, assessment evidence specification, and approved teaching notes. Experiences must store explicit objective-to-block mappings, objective-to-question mappings, and review statuses. Teachers may use institution-specific objectives. Foundation presets: introductory microeconomics and macroeconomics, descriptive data literacy, introductory evaluation of policy trade-offs, academic literacy.

## 9. AI workflow and prompt architecture

Use separate, auditable stages:
1. **Normalize input** — classify event type and distinguish user assertions vs source facts.
2. **Resolve sources** — optional search provider; fetch permitted public URL excerpts; record source metadata and retrieval date. No fabricated URLs. Mark `verified`, `teacher_provided`, `disputed`, `hypothetical`, `unverified`.
3. **Economic inference** — suggest concepts with causal reasoning, strengths, limitations, and alternate interpretations. Avoid making causal certainty from correlation.
4. **Blueprint plan** — outcomes, prerequisite scaffolds, pacing, evidence plan, activity plan, assessment plan.
5. **Block authoring** — generate original content as schema-conforming objects; each fact linked to evidence records; synthetic data labeled.
6. **Validator** — schema validation plus deterministic checks (duration sum, citations, objective mapping, answer-key correctness constraints, student/teacher visibility, accessibility). Optionally a separate AI critique with explicit issues.
7. **Revision** — only teacher-approved targeted rewrites and preserved version history.

Use structured JSON outputs, a fixed system policy, versioned prompts, schema validation and retry-on-failure with a bounded limit. AI does not make unreviewed changes to published experiences.

### Example prompts for sub-agents
- `event_analyzer`: "Extract only what is given or evidenced; return fact_claims, contested_claims, unknowns, stakeholder positions, event timeline, and economics opportunities. Never infer a source URL."
- `concept_mapper`: "Rank economically defensible concepts based on the event and selected foundation objectives. Explain mechanism, prerequisite, non-example, misconception, and source evidence. Include alternate lenses."
- `experience_architect`: "Plan a 90-minute guided inquiry with explicit instruction and formative checks. Align every activity with one selected outcome."
- `assessment_author`: "Create original diagnostic and independent assessment items with balanced distractors, keyed answers, rationales, and curriculum mappings."
- `quality_reviewer`: "Return machine-readable blocking vs warning issues, including unsupported facts, answer leaks, unsupported graph labels, cognitive overload, and trivial assessments."

### Provenance model
A claim is either `verified` (source URL and excerpt accessible), `teacher_provided` (not independently checked), `disputed` (credible contradictory source evidence), `hypothetical`, or `unverified`. Source ranking should favour official statistics/primary documents then established reporting; do not call opinion a verified fact. Display article publication date separately from event date. Evidence review is mandatory before publish for factual event activities.

## 10. UX / information architecture

### Teacher pages
- `/dashboard` — created experiences, templates, recent activity, create CTA.
- `/experiences/new` — Step 1 event input.
- `/experiences/[id]/sources` — Step 2 fact/source review.
- `/experiences/[id]/lenses` — Step 3 ranked economics connections, teacher selection.
- `/experiences/[id]/blueprint` — Step 4 objective, level, duration and activity plan.
- `/experiences/[id]/builder` — Step 5/6 editable blocks and inspector (sources/objectives/time/teacher notes); regenerate per block.
- `/experiences/[id]/preview` — student vs teacher, desktop/mobile preview.
- `/experiences/[id]/publish` — quality gate, class assignment and publish.
- `/experiences/[id]/insights` — student submissions and outcomes.
- `/classes` — cohorts and join codes.
- `/settings/curriculum` — admin-approved learning outcomes.

### Student pages
- `/join/[code]` — authenticated join.
- `/learn/[assignmentId]` — staged experience, with progress, interactive activities, saved responses.
- `/learn/[assignmentId]/check` — independent mastery check with no hints or answer display until submitted.
- `/learn/[assignmentId]/feedback` — safe feedback and next steps according to teacher settings.

### Visual direction
Calm, premium academic SaaS; generous white space, navy/teal accents, readable typography, accessible contrast, clear stepper, source badges, visual economics diagrams. No dense chat-only interface. Three-column builder on desktop, responsive sheet/drawer on mobile. Include sample event content on first login, but label it illustrative.

## 11. Data model (PostgreSQL / Prisma suggested)

- `User(id, tenantId, name, email, role, createdAt)`
- `Tenant(id, name, settingsJson)`
- `Classroom(id, tenantId, name, teacherId, joinCode, term)`
- `ClassEnrollment(id, classId, studentId)`
- `CurriculumObjective(id, tenantId, code, title, level, bloomLevel, conceptsJson, prerequisitesJson)`
- `EventCase(id, tenantId, creatorId, title, inputType, inputText, eventDate, geography, factStatus, createdAt)`
- `Source(id, eventCaseId, url, title, publisher, publicationDate, retrievedAt, excerpt, status)`
- `EvidenceClaim(id, eventCaseId, text, claimType, verificationStatus, sourceIdNullable)`
- `ConceptSuggestion(id, eventCaseId, conceptKey, score, explanation, limitationsJson, prerequisitesJson, misconceptionJson, selected)`
- `Experience(id, tenantId, eventCaseId, creatorId, title, status, durationMinutes, level, settingsJson, currentVersionId)`
- `ExperienceVersion(id, experienceId, versionNumber, createdBy, generatedAt, contentJson, promptVersion, modelId, validationJson)`
- `ExperienceBlock(id, experienceVersionId, order, type, title, durationMinutes, contentJson, teacherNotesJson, objectiveIdsJson, sourceIdsJson, visibility)`
- `AssessmentItem(id, experienceVersionId, blockId, type, promptJson, optionsJson, answerKeyJson, explanationJson, rubricJson, objectiveId, independent)`
- `Assignment(id, experienceId, publishedVersionId, classId, startAt, dueAt, status)`
- `Attempt(id, assignmentId, studentId, startedAt, submittedAt, score, reviewStatus)`
- `Response(id, attemptId, assessmentItemId, responseJson, autoScore, teacherScore, feedbackJson)`
- `AIJob(id, tenantId, userId, operation, status, retryCount, inputHash, promptVersion, modelId, errorCode, createdAt)`
- `AuditEvent(id, tenantId, actorId, action, objectType, objectId, createdAt, metadataJson)`

Include unique constraints, indices, proper cascade semantics, tenancy enforced by server query and policies where available. Do not place sensitive student data in model prompts unless strictly needed; pseudonymize aggregations.

## 12. Suggested implementation

- Frontend: Next.js App Router + TypeScript + Tailwind CSS + accessible component primitives.
- Server: Next.js server routes/actions for authenticated business logic; background generation queue can be deferred using job table and polling in MVP; avoid request timeouts.
- Database: PostgreSQL with Prisma or Drizzle; documented migrations and demo seed.
- Authentication: supported library (Auth.js or equivalent) with teacher/student/admin roles; production secure configuration.
- AI: official OpenAI SDK + Responses API and schema-constrained output (validated with Zod); model configurable via env, not hardcoded to an unverified identifier; server-side only.
- Source retrieval: pluggable verified web/news provider; URL server-side fetch with SSRF protections and content parsing, no scraping of prohibited pages.
- Charting: Recharts or similar, with table alternatives and stated synthetic/verified data labels.
- Testing: Vitest + React Testing Library + Playwright; deterministic AI/provider mocks.
- Deployment: Vercel or equivalent + managed Postgres; secrets in environment, CI build checks.

Never place API keys in the browser. Rate-limit generation, verify tenant/class authorization on every route, enforce input length, sanitize rich text, use strict CSP, redact logs, and maintain audit logs. Follow institution policy and applicable privacy regulations for educational data. Retention and deletion controls required before production student deployment.

## 13. API surface (illustrative)

- `POST /api/events` create
- `POST /api/events/:id/analyze` inference job
- `GET /api/jobs/:id` status/structured output
- `PATCH /api/events/:id/concepts` teacher selection
- `POST /api/experiences` generate from selected concept/blueprint
- `PATCH /api/experiences/:id` update metadata
- `POST /api/experiences/:id/blocks/:blockId/regenerate` targeted regeneration
- `POST /api/experiences/:id/validate` quality gate
- `POST /api/experiences/:id/publish` publish immutable version
- `POST /api/classes/:id/assignments` assign
- `GET /api/assignments/:id` student safe view
- `POST /api/assignments/:id/attempts` start
- `POST /api/attempts/:id/responses` save responses
- `POST /api/attempts/:id/submit` finalize independent assessment
- `GET /api/experiences/:id/insights` teacher reporting

API contracts should be encoded in Zod schemas shared between client and server. Student APIs must never serialize answer keys before submission.

## 14. Nonfunctional requirements

- Aim p95 under 2 seconds for non-AI navigation, excluding generation (pilot target, not guarantee).
- Generation jobs must expose status, cancellation when feasible, bounded retries, and informative error.
- WCAG 2.2 AA as target; keyboard and screen-reader checks for critical flows.
- Support desktop and mobile; classroom projector/print mode.
- Idempotency for generation/publish; auto-save with conflict-aware revision handling.
- Observability: failures, AI latency/cost, token usage, quality-block rates, schema validation failures, feature adoption. Avoid logging student answer content unnecessarily.
- Accessible chart alternatives, keyboard-operable simulation controls, sufficient contrast.

## 15. Quality rubric

Each dimension is rated 0–4; any critical flaw blocks publication:
1. Economics accuracy and causal nuance.
2. Evidence validity and source transparency.
3. Alignment between objectives, teaching activities, and assessment.
4. Foundation-level scaffolding (language, mathematics, prerequisites).
5. Student cognitive engagement and authentic application.
6. Assessment quality, independent evidence and answer-key correctness.
7. Balance of viewpoints for contested policies.
8. Timings, practical feasibility and accessibility.

Critical issues: invented source presented as real, mislabeled synthetic data, misleading major economic claim, answer key leaked to student, no independent check, no selected objective, inaccessible core assessment, broken source access represented as verified.

## 16. Success criteria and experiment

Pilot 2–4 economics classes with comparable baseline readiness, common assessment, and similar contact time. Record teacher prep time using time logs. Measure quality using blinded expert rating of generated vs control lessons. Track process measures and student outcomes separately.

Proposed **hypotheses (not promised results):**
- At least 25% reduction in median teacher weekly lesson preparation time without worse blinded lesson-quality scores.
- At least 90% of published experiences pass teacher-reviewed quality gate.
- At least 90% of assigned students complete a weekly independent mastery check.
- Improve bottom-quartile scores and reduce cross-class variance without lowering cohort mean.
- Improved 3–4-week delayed retention; compare against a control/cohort baseline.

Do not interpret observational association as causal impact. Avoid grading teachers based solely on generated analytics.

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI invents or overstates event claims | Claim-level source panel; teacher verification; blocking gate |
| Slanted political/policy treatment | Stakeholder analysis; alternative interpretations; distinguish evidence and value judgments |
| Incorrect economics mapping | Ranked lenses with rationale; concept/objective selection by teacher; evaluation set |
| High cognitive load for foundation learners | Adjustable reading/quant level; explicit teaching blocks; vocabulary and worked examples |
| Student uses AI to bypass thinking | Independent assessment with no hints, fresh variants, answer keys server-only |
| Copyright issues | Link to official CORE resources; original assets; respect third-party source licenses |
| Privacy and security | RBAC, tenancy, minimisation, encryption, retention/deletion, audit trails |
| Non-working demo disguised as product | Real database persistence, real publishing/attempt logic, labeled fixtures, E2E tests |
| Unsustainable AI cost | Model routing, quotas, caching, targeted regeneration, job status |
| Search unavailable | Clearly labeled input-only mode; never claim sources were externally verified |

## 18. Roadmap

**Phase 1 — Vertical slice:** Authentication, create event, concept mapping, blueprint, one generated end-to-end experience, builder, preview, publish, student attempt, results dashboard, seeded sample.

**Phase 2 — Quality & coverage:** Robust source verification, objective mapping, richer block library, version history, role-play and simulation variants, print export, analytics, accessibility and evaluation suite.

**Phase 3 — Scale:** SSO/LMS, collaboration, question banks, curriculum governance, cohort insights, more complex experiences and data imports.

**Release gate:** End-to-end acceptance scenarios pass with both a real configured AI provider and deterministic fixture mode. No hidden hardcoded substitute when provider is configured. Student answer key never reaches student client before permitted disclosure.

## 19. Acceptance scenarios

**Scenario 1 (policy):** Teacher inputs a carbon-tax event, sees at least 4 defensible concepts, selects externalities + tax incidence, generates and edits a 90-minute lesson, publishes, student completes branching emissions-tax decision and independent quiz, teacher sees actual recorded results.

**Scenario 2 (business):** Teacher inputs supermarket price rise; system proposes inflation vs relative price change and supply/demand, explicitly warns that one price increase does not by itself demonstrate general inflation, and designs an original demand/supply lesson.

**Scenario 3 (global affair):** Teacher inputs trade tariff news, system identifies consumer/producer surplus, comparative advantage, distributional effects and policy uncertainty; presents balanced stakeholder perspectives, dates and verified/contested claims.

**Scenario 4 (unverified):** Teacher enters an unsourced headline and no search provider is available. The app clearly states that it cannot verify the event, offers a hypothetical framing, and does not invent citations.

**Scenario 5 (security):** Student tries to access `/api/experiences/:id` or quiz answer keys through network calls; server denies unauthorized access and excludes teacher-only fields from student JSON.

## 20. Grounding / reference links

- CORE Econ terms: https://www.core-econ.org/terms-of-use/ (checked November 2026; general CC BY-NC-ND 4.0 unless otherwise specified)
- CORE Econ: https://www.core-econ.org/
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Responses API: https://developers.openai.com/api/reference/responses/overview
- Next.js App Router: https://nextjs.org/docs/app

**Important:** The pedagogical stages in this PRD are an original synthesis informed by inquiry and active learning; EconLens is not represented as an official CORE Econ product or endorsement.
