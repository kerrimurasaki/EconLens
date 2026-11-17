# Decisions and assumptions

- **Auth:** next-auth 4.24 (stable, supports Next 16) with credentials + JWT sessions, instead of the v5 beta. Revisit if SSO is needed. Passwords hashed with bcryptjs (pure JS, no native build on Windows).
- **Prisma 7:** driver adapter (`@prisma/adapter-pg`), client generated to `src/generated/prisma` (gitignored), connection URL in `prisma.config.ts`.
- **TypeScript 5.9** pinned (TS 7 not yet validated with Next/ESLint tooling).
- **ESLint 9** (eslint-config-next peer range).
- **Cross-tenant access** returns NOT_FOUND, not FORBIDDEN, to avoid leaking existence.
- **Student/non-teacher routes:** students are redirected to `/learn`; M4 fills it in.
- **Seed experience** is a labelled placeholder shell; real sample content arrives in M3.
- **AIJob:** unique constraint dropped in M2 (index kept) so failed analyses can be retried; hourly rate limit of 20 jobs per user instead.
- **Known gap:** no login rate limiting yet (add in M5 hardening).
- **M2 verification policy:** nothing is auto-`verified`. Pasted text -> `teacher_provided`; fetched URL -> `unverified` until the teacher links a claim to a source that has URL + excerpt + retrievedAt. Opinions can never be verified. Enforced server-side in `canMarkVerified`.
- **M2 demo provider:** claims are the teacher's own sentences (never `fact`); lenses come from keyword-selected templates. Banner shown on sources/lenses whenever `analysisMode = demo`.
- **M2 fetch policy:** ports 80/443 only, no embedded credentials, `.local/.internal/.localhost` blocked, mixed DNS answers rejected, connection pinned to validated IP, robots.txt `User-agent: *` honoured, 1 MB cap, 8 s timeout, 3 redirects.
- **M2 OpenAI:** `openai` 7.x, `responses.parse` + `zodTextFormat`, `store: false`. Array size limits are enforced in code (not in the model-facing schema).
- **Prompt edit policy:** `inferEconomics.v1` was reworded before first real use; any edit after a real model has used it requires a version bump.
- **Analysis is synchronous** in the request (max 120 s route duration). Job table is written for audit/rate limiting but not polled.
- **M3 content model:** block text is plain text only (React escapes it; no HTML/markdown) so there is nothing to sanitise. Teacher-only data lives under `item.teacher` and `block.teacherNotes`; `toStudentView` is an allow-list so future fields are hidden by default.
- **M3 versions:** every autosave/regenerate/restore writes a new immutable `ExperienceVersion` (client debounces 1.2 s). Stale writes get CONFLICT via `baseVersion` plus the unique `(experienceId, versionNumber)` constraint. Restore creates a new version rather than rewriting history.
- **M3 `edited` flag** is computed on the server by comparing with the previous version; clients cannot clear it. Regenerating an edited block needs `confirmOverwrite` (409 CONFIRMATION_REQUIRED).
- **M3 demo generator:** MCQ correct answers are the lens mechanism and distractors are the lens misconceptions; numeric keys are computed from the displayed numbers; the validator re-derives them. The validator caught one real template leak during development (a keyed limitation reused as a multi-select option), now fixed and covered by tests.
- **M3 blueprint:** authentic-data requirement is not offered (no data source integration); all data is labelled synthetic. Length/level are fixed once a draft exists.
- **M3 scenario student view** currently carries option explanations and effects (needed client-side for the M4 simulation). Revisit when M4 decides whether the simulation state is computed server-side.
- **Manual smoke scripts:** `tests/e2e-api.sh`, `tests/e2e-edit.sh`, `tests/cleanup.sql` (need a running dev server and Docker Postgres; not part of `npm test`).
- **M4 publishing:** publishing marks the *current* draft version `isPublished` and creates an Assignment on it; nothing updates that row again. Editing afterwards writes a new version. Republishing the same version to the same class returns the same assignment.
- **M4 AssessmentItem ids** are `<versionId>:<itemId>` so a Response always points at an item of one immutable version.
- **M4 feedback policy:** all answer keys, explanations and rubrics are withheld until the student submits the independent check, and then only if the assignment is `after_submit` or the teacher released it. Formative questions therefore also get feedback only at that point (simpler and leak-proof; immediate formative hints are a later option).
- **M4 scenario:** effects and explanations stay on the server and are returned one decision at a time; the debrief only after the last decision. Decisions are sequential and immutable until the student restarts the scenario.
- **M4 scoring:** attempt `score` is independent-check mastery (0-1) over scored items; unanswered auto items count 0; short answers stay pending until a teacher marks them and the score is recomputed then.
- **M4 join codes:** 8 characters from a 31-character alphabet, 14-day expiry, rotatable; lookup is scoped to the student's tenant.
- **M4 login redirect:** `callbackUrl` accepts only same-site relative paths.
- **M4 objective mapping (demo generator):** uses the objective's concept list; the real-model path relies on the prompt and the validator.

## M5 hardening
- **Independent reviews:** a read-only security reviewer and an economics reviewer were run as separate subagents. Their reports are model output, so each finding was checked against the code before acting.
- **Fixed (security):** model output could upgrade a claim to verified (now statuses come only from the teacher-reviewed claim, and the builder cannot set verified); regex slowdown in the page reader (linear tokenizer, input cap); rate limits now wired (login by email, join, event creation) and the AI quota is atomic (advisory lock); delimiter breakout by nesting; JWTs re-checked against the database on each request; production refuses a weak `NEXTAUTH_SECRET`; independent questions outside the exit ticket are blocking and never served in practice; request size cap and bounded document arrays; open-redirect check by URL parsing; malformed join links; submit and publish race handling; duplicate item ids; insights scoped to the teacher's own classes; extra reserved IP ranges, total fetch deadline, wildcard robots rules; CSP and HSTS; assignments can be closed.
- **Fixed (economics):** a true statement was listed as a misconception (and would have been keyed wrong); the independent misconception item now keys a per-misconception correction (new `misconceptionCorrections` field, required from the model); scenario effect sizes now match the lesson's own inelastic short-run claim, with a no-policy baseline, a resource-cost measure and a "not calibrated to equal stringency" rule; a tariff scenario was added and scenario choice follows the lenses; incidence wording states direction; market-power pass-through softened; stakeholders include those harmed; table steps are small; prompts promoted to v2 with question-quality, short/long-run, ceteris paribus, mixed-evidence and balance rules.
- **Not fixed (by decision):** a recall-style feel remains in some demo practice questions (correct options still use the explainer's wording, and distractors borrow other lenses' misconceptions when a lens has only one); due dates are stored but not enforced; failed-login auditing; error messages from the fetcher still distinguish blocked addresses from other failures (small reconnaissance signal); rate limiting is per process.
- **Accessibility:** axe (WCAG 2.2 A/AA) found and we fixed: unlabelled preview inputs, low-contrast minutes text and 20-pixel reorder targets in the builder; mobile overflow in the nav and builder grid.
- **Tests:** Playwright runs on the installed Chrome (no browser download). The T9 matrix runs against the dev database and creates then removes a second tenant.
