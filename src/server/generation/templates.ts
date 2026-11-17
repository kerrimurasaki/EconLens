import type { Block, BlockType, Blueprint, Item, Scenario, Stage } from "@/schemas/experience";
import { planStages, splitMinutes } from "./stages";

/**
 * Deterministic template generator used by the demo provider. Every answer key is computed from the content
 * itself (lens text, table values), so keys are correct by construction. It is NOT model-written content.
 */

export interface GenLens {
  key: string;
  name: string;
  mechanism: string;
  prerequisites: string[];
  misconceptions: string[];
  limitations: string[];
  inquiryQuestion: string;
  alternativeLens: string;
  /** corrections[i] rebuts misconceptions[i]; may be empty. */
  corrections: string[];
}
export interface GenContext {
  title: string;
  summary: string;
  essentialQuestion: string;
  blueprint: Blueprint;
  objectives: Array<{ id: string; code: string; title: string; concepts?: string[] }>;
  selected: GenLens[];
  allLenses: GenLens[];
  claims: Array<{ text: string; type: string; status: Block["claims"][number]["status"]; sourceId: string | null }>;
  stakeholders: Array<{ name: string; position: string }>;
  unknowns: string[];
  sources: Array<{ id: string; title: string }>;
}
export interface BlockSpec {
  stage: Stage;
  type: BlockType;
  minutes: number;
  /** 0-based ordinal among blocks of the same type; picks the lens for EXPLAINER blocks. */
  ordinal: number;
}

// ---------- helpers ----------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], seed: string): T[] {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const newId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
export const pctChange = (from: number, to: number) => round1(((to - from) / from) * 100);

function makeOptions(correct: string[], wrong: string[], seed: string) {
  const all = shuffle([...correct.map((t) => ({ t, ok: true })), ...wrong.map((t) => ({ t, ok: false }))], seed);
  const options = all.map((o, i) => ({ id: String.fromCharCode(97 + i), text: o.t }));
  const correctOptionIds = all.flatMap((o, i) => (o.ok ? [String.fromCharCode(97 + i)] : []));
  return { options, correctOptionIds };
}
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

function teacherBase(over: Partial<Item["teacher"]>): Item["teacher"] {
  return { correctOptionIds: [], numericAnswer: null, tolerance: null, computation: null, rationale: "", rubric: [], ...over };
}

// ---------- items ----------
const norm = (t: string) => t.toLowerCase().replace(/_/g, " ").trim();

/** Picks the objective whose concept list mentions the lens; falls back to a round-robin objective. */
function objectiveForLens(ctx: GenContext, lens: GenLens, fallback: number): string {
  const hit = ctx.objectives.find((o) => (o.concepts ?? []).some((c) => norm(c) === norm(lens.key) || norm(c) === norm(lens.name)));
  return (hit ?? ctx.objectives[fallback % ctx.objectives.length]!).id;
}
function objectiveForData(ctx: GenContext, fallback: number): string {
  const hit = ctx.objectives.find((o) => (o.concepts ?? []).some((c) => /data/.test(norm(c))));
  return (hit ?? ctx.objectives[fallback % ctx.objectives.length]!).id;
}

function lensAt(ctx: GenContext, i: number): GenLens {
  return ctx.selected[i % ctx.selected.length]!;
}
function distractorsFor(ctx: GenContext, lens: GenLens, n: number, variant: number): string[] {
  const own = lens.misconceptions;
  const others = ctx.allLenses.filter((l) => l.key !== lens.key).flatMap((l) => l.misconceptions);
  const pool = uniq([...own, ...others]).filter((t) => t !== lens.mechanism);
  const start = own.length ? variant % own.length : 0;
  const rotated = [...own.slice(start), ...own.slice(0, start)];
  return uniq([...rotated, ...pool]).slice(0, n);
}

function mcqFormative(ctx: GenContext, lens: GenLens, objectiveId: string, id: string, variant: number): Item {
  const wrong = distractorsFor(ctx, lens, 3, variant);
  const { options, correctOptionIds } = makeOptions([lens.mechanism], wrong, `${id}-${variant}`);
  return {
    id, kind: "mcq", independent: false, unit: null, objectiveId, options,
    prompt: `Which statement about ${lens.name.toLowerCase()} is correct?`,
    teacher: teacherBase({
      correctOptionIds,
      rationale: `The correct statement describes the mechanism of ${lens.name.toLowerCase()}. Each wrong option is a common misconception: ${wrong.join(" | ")}`,
    }),
  };
}

function multiFormative(ctx: GenContext, objectiveId: string, id: string, variant: number): Item {
  const correct = uniq(ctx.selected.slice(0, 2).map((l) => l.mechanism));
  const first = ctx.selected[0]!;
  // Not the limitation: that text is the keyed answer of an independent item and must not appear elsewhere.
  if (correct.length < 2 && first.alternativeLens) correct.push(`Another valid way to look at it: ${first.alternativeLens}`);
  const wrong = uniq(ctx.selected.flatMap((l) => distractorsFor(ctx, l, 2, variant))).filter((t) => !correct.includes(t)).slice(0, 2);
  const { options, correctOptionIds } = makeOptions(correct, wrong, `${id}-${variant}`);
  return {
    id, kind: "multi", independent: false, unit: null, objectiveId, options,
    prompt: "Select ALL of the statements that are correct.",
    teacher: teacherBase({
      correctOptionIds,
      rationale: `Correct: ${correct.join(" | ")}. Incorrect options are common misconceptions: ${wrong.join(" | ")}`,
    }),
  };
}

function shortFormative(ctx: GenContext, lens: GenLens, objectiveId: string, id: string): Item {
  return {
    id, kind: "short", independent: false, unit: null, objectiveId, options: [],
    prompt: `In 2 to 4 sentences, use the idea of ${lens.name.toLowerCase()} to explain what is happening in this situation. Then say one thing you would still want to find out.`,
    teacher: teacherBase({
      rationale: `Model answer: ${lens.mechanism}${lens.limitations[0] ? ` Extra evidence or limit: ${lens.limitations[0]}` : ""}`,
      rubric: [
        `Uses the mechanism correctly: ${lens.mechanism}`,
        "Links the idea to the specific situation (not a generic definition)",
        `Names a limit or missing piece of evidence${lens.limitations[0] ? ` (for example: ${lens.limitations[0]})` : ""}`,
        "Separates what is known from what is assumed",
      ],
    }),
  };
}

function independentMisconception(ctx: GenContext, lens: GenLens, objectiveId: string, id: string, variant: number): Item | null {
  void ctx;
  const usable = lens.misconceptions.map((m, i) => ({ m, fix: lens.corrections[i] })).filter((x): x is { m: string; fix: string } => Boolean(x.fix));
  if (usable.length === 0) return null; // no accurate correction available: do not invent one
  const pick = usable[variant % usable.length]!;
  const { options, correctOptionIds } = makeOptions(
    [pick.fix],
    ["Yes. That statement is correct in general.", "It is only a matter of opinion, so economics cannot help judge it."],
    `${id}-${variant}`,
  );
  return {
    id, kind: "mcq", independent: true, unit: null, objectiveId, options,
    prompt: `A classmate says: "${pick.m}". Which response is most accurate?`,
    teacher: teacherBase({ correctOptionIds, rationale: `The classmate's statement is a known misconception about ${lens.name.toLowerCase()}. The accurate response gives the correction.` }),
  };
}

function independentCaution(lens: GenLens, objectiveId: string, id: string, variant: number): Item {
  const caution = lens.limitations[0] ?? "Real outcomes depend on the situation and need evidence.";
  const { options, correctOptionIds } = makeOptions(
    [caution],
    ["The model proves the exact size of the effect, so no caution is needed.", "Once the model is drawn, no further evidence about the real situation is needed."],
    `${id}-${variant}`,
  );
  return {
    id, kind: "mcq", independent: true, unit: null, objectiveId, options,
    prompt: `You present an analysis using ${lens.name.toLowerCase()} to your class. Which caution should you include?`,
    teacher: teacherBase({ correctOptionIds, rationale: `Good economic reasoning states the limits of the model: ${caution}` }),
  };
}

const PCT_PAIRS: Array<[number, number]> = [[8, 9.2], [12, 13.5], [20, 17], [5, 6.5], [40, 46]];
function independentNumeric(objectiveId: string, id: string, variant: number): Item {
  const [from, to] = PCT_PAIRS[variant % PCT_PAIRS.length]!;
  return {
    id, kind: "numeric", independent: true, unit: "%", objectiveId, options: [],
    prompt: `Synthetic teaching data: the price of a good changes from ${from.toFixed(2)} to ${to.toFixed(2)} currency units. Calculate the percentage change, to 1 decimal place (use a minus sign for a fall).`,
    teacher: teacherBase({
      numericAnswer: pctChange(from, to), tolerance: 0.1, computation: { kind: "pct_change", from, to },
      rationale: `(${to} - ${from}) / ${from} x 100 = ${pctChange(from, to)}%`,
    }),
  };
}

// ---------- synthetic data ----------
function syntheticTable(variant: number) {
  const base = [2.4, 3.1, 4.5, 1.8, 5.2][variant % 5]!;
  // Three distinct small weekly rises so exactly one interval is the largest.
  const deltas = shuffle([0.05, 0.1, 0.15], `deltas-${variant}`);
  const prices = [base];
  for (const d of deltas) prices.push(Math.round((prices.at(-1)! + d) * 100) / 100);
  const qty = [100, 96, 91, 88].map((q, i) => q - (variant % 3) * i);
  return { prices, qty, deltas };
}

function dataItems(blockId: string, objectiveId: string, variant: number) {
  const { prices, qty, deltas } = syntheticTable(variant);
  const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const table: NonNullable<Block["table"]> = {
    caption: "Price and quantity bought in a stylised market over four weeks",
    columns: ["Period", "Price (currency units per unit)", "Quantity bought (units)"],
    rows: weeks.map((w, i) => [w, prices[i]!.toFixed(2), String(qty[i])]),
    synthetic: true,
    label: "Synthetic teaching data (not real observations)",
    sourceId: null,
    asOf: null,
  };
  const biggest = deltas.indexOf(Math.max(...deltas));
  const intervals = ["Week 1 to Week 2", "Week 2 to Week 3", "Week 3 to Week 4"];
  const { options, correctOptionIds } = makeOptions([intervals[biggest]!], intervals.filter((_, i) => i !== biggest), `${blockId}-${variant}`);
  const mcq: Item = {
    id: `${blockId}_i1`, kind: "mcq", independent: false, unit: null, objectiveId, options,
    prompt: "Using the table, between which two weeks did the price rise by the largest amount?",
    teacher: teacherBase({ correctOptionIds, rationale: `Price rises: ${deltas.map((d, i) => `${intervals[i]} = ${d.toFixed(2)}`).join("; ")}.` }),
  };
  const num: Item = {
    id: `${blockId}_i2`, kind: "numeric", independent: false, unit: "%", objectiveId, options: [],
    prompt: "Calculate the percentage change in price from Week 1 to Week 4, to 1 decimal place (use a minus sign for a fall).",
    teacher: teacherBase({
      numericAnswer: pctChange(prices[0]!, prices[3]!), tolerance: 0.1, computation: { kind: "pct_change", from: prices[0]!, to: prices[3]! },
      rationale: `(${prices[3]} - ${prices[0]}) / ${prices[0]} x 100 = ${pctChange(prices[0]!, prices[3]!)}%`,
    }),
  };
  return { table, items: [mcq, num] };
}

// ---------- scenario ----------
const eff = (parameterId: string, delta: number) => ({ parameterId, delta });
const CAVEAT = "Hypothetical stylised model: all numbers are invented for teaching and are not forecasts.";

function policyScenario(): Scenario {
  return {
    premise: "You advise a government that wants to cut fuel emissions. In this short-run model, choose a policy instrument, then a supporting measure, and see how the stylised outcomes change.",
    hypotheticalLabel: CAVEAT,
    parameters: [
      { id: "emissions", label: "Emissions", start: 100, unit: "index" },
      { id: "price", label: "Fuel price", start: 1.5, unit: "currency units per litre" },
      { id: "budget", label: "Government budget effect", start: 0, unit: "currency units (millions)" },
      { id: "burden", label: "Burden on low-income households", start: 100, unit: "index" },
      { id: "cost", label: "Resource cost to society of cutting emissions", start: 100, unit: "index" },
    ],
    decisions: [
      {
        id: "d1", prompt: "Which instrument do you choose?",
        options: [
          { id: "tax", label: "Per-litre carbon tax", effects: [eff("emissions", -4), eff("price", 0.2), eff("budget", 30), eff("burden", 15), eff("cost", 6)], explanation: "The tax raises the price buyers face, so they buy somewhat less; fuel demand is often not very responsive in the short run, so the cut is modest. It raises revenue, and in many countries lower-income households spend a larger share of income on fuel." },
          { id: "subsidy", label: "Subsidy for low-emission alternatives", effects: [eff("emissions", -3), eff("price", 0), eff("budget", -25), eff("burden", -5), eff("cost", 8)], explanation: "Cheaper alternatives encourage switching without raising fuel prices, but the government pays and fuel itself does not become more expensive." },
          { id: "regulation", label: "Emissions standard (regulation)", effects: [eff("emissions", -4), eff("price", 0.08), eff("budget", -5), eff("burden", 8), eff("cost", 9)], explanation: "A standard sets a rule rather than a price. It can work, but it may cost more per unit of emissions cut and it raises no revenue (the budget effect here is administration cost)." },
          { id: "none", label: "No new policy (baseline)", effects: [], explanation: "Nothing changes: the price signal does not reflect the external cost and emissions stay at their starting level." },
        ],
      },
      {
        id: "d2", prompt: "Which supporting measure do you add?",
        options: [
          { id: "rebate", label: "Rebate to households", effects: [eff("burden", -12), eff("budget", -15)], explanation: "Returning money reduces the burden on low-income households while a price instrument keeps its price signal." },
          { id: "transit", label: "Fund public transport", effects: [eff("emissions", -2), eff("budget", -20), eff("cost", 3)], explanation: "Creates alternatives so people can respond to the policy more easily, at a budget cost." },
          { id: "none", label: "No extra measure", effects: [], explanation: "No change: effects stay as set by the first decision." },
        ],
      },
    ],
    rules: "Each choice adds its listed effects to the starting values, so outcomes are simple sums that ignore interactions and timing. The options are not calibrated to the same policy stringency, so compare patterns, not exact sizes.",
    debrief: "Compare your result with a classmate's. Which objective did you prioritise: emissions, revenue, cost or fairness? Real outcomes depend on how responsive demand is (more responsive over time), on policy design and on the time horizon, so treat this as a thinking tool, not a prediction.",
  };
}

function tariffScenario(): Scenario {
  return {
    premise: "A small open economy is deciding whether to put a tariff on an imported good. Choose a tariff level, then see what happens when trading partners respond.",
    hypotheticalLabel: CAVEAT,
    parameters: [
      { id: "price", label: "Domestic price of the good", start: 100, unit: "index" },
      { id: "cs", label: "Consumer surplus", start: 100, unit: "index" },
      { id: "ps", label: "Domestic producer surplus", start: 100, unit: "index" },
      { id: "revenue", label: "Tariff revenue", start: 0, unit: "currency units (millions)" },
      { id: "exports", label: "Domestic export sales", start: 100, unit: "index" },
    ],
    decisions: [
      {
        id: "d1", prompt: "What tariff do you choose?",
        options: [
          { id: "moderate", label: "Moderate tariff", effects: [eff("price", 8), eff("cs", -12), eff("ps", 6), eff("revenue", 4)], explanation: "The tariff raises the domestic price. Consumers lose surplus; domestic producers and the government gain; part of the consumers' loss is a deadweight loss that nobody gains." },
          { id: "high", label: "High tariff", effects: [eff("price", 15), eff("cs", -22), eff("ps", 10), eff("revenue", 5)], explanation: "A higher tariff raises the price further, but imports fall so revenue grows less than the tariff, and the deadweight loss grows faster." },
          { id: "none", label: "No tariff (baseline)", effects: [], explanation: "Prices and surpluses stay at their starting values, and the gains from trade are unchanged." },
        ],
      },
      {
        id: "d2", prompt: "How do trading partners respond?",
        options: [
          { id: "none", label: "They do not respond", effects: [], explanation: "No further change in this model." },
          { id: "retaliate", label: "They impose their own tariffs", effects: [eff("exports", -10), eff("ps", -3)], explanation: "Retaliation can reduce demand for the country's exports, hurting exporting firms and workers. Whether partners retaliate is uncertain in practice." },
          { id: "negotiate", label: "They negotiate a partial reduction", effects: [eff("price", -2), eff("cs", 3)], explanation: "A negotiated reduction partly reverses the price rise; the outcome depends on bargaining." },
        ],
      },
    ],
    rules: "Each choice adds its listed effects to the starting values. This is a simple-sum model of a small open economy; a large country's tariff can also change world prices, which is ignored here.",
    debrief: "Which groups gained and which lost? Are the gains and losses shared equally, and could winners compensate losers? Different economists weigh efficiency, fairness and strategic goals differently, and real effects depend on the goods, the countries and the time horizon.",
  };
}

function marketScenario(): Scenario {
  return {
    premise: "A market price has jumped. You advise a local authority that must decide how to respond. Choose a response, then a follow-up, and see the stylised effects.",
    hypotheticalLabel: CAVEAT,
    parameters: [
      { id: "price", label: "Market price before any subsidy", start: 4, unit: "currency units" },
      { id: "unmet", label: "Shoppers unable to buy", start: 0, unit: "units" },
      { id: "strain", label: "Low-income households priced out", start: 100, unit: "index" },
      { id: "budget", label: "Government budget effect", start: 0, unit: "currency units (millions)" },
    ],
    decisions: [
      {
        id: "d1", prompt: "How do you respond to the price rise?",
        options: [
          { id: "cap", label: "Impose a price cap below the new price", effects: [eff("price", -0.5), eff("unmet", 15), eff("strain", 5)], explanation: "A cap below the market price lowers the price, but quantity supplied falls, so some shoppers cannot buy at all." },
          { id: "subsidy", label: "Subsidise shoppers", effects: [eff("price", 0.1), eff("budget", -20), eff("strain", -10)], explanation: "Extra demand puts slight upward pressure on the market price while shoppers pay less after the subsidy; the government pays." },
          { id: "wait", label: "Monitor and wait", effects: [eff("price", -0.1), eff("strain", 4)], explanation: "If the rise is a temporary cost shock, competition and new supply may bring prices down slowly. If the shock is permanent the price may not fall, and meanwhile low-income shoppers bear the higher price." },
        ],
      },
      {
        id: "d2", prompt: "Which follow-up do you choose?",
        options: [
          { id: "info", label: "Publish price information for shoppers", effects: [eff("price", -0.05), eff("budget", -2)], explanation: "Better information can increase competition at small cost." },
          { id: "none", label: "No follow-up", effects: [], explanation: "No further change." },
        ],
      },
    ],
    rules: "Each choice adds its listed effects to the starting values, so outcomes are simple sums that ignore interactions and timing.",
    debrief: "What would you need to know to tell whether supply fell or demand rose? One price rising is a relative price change, not by itself general inflation. Which households matter most for your choice, and why?",
  };
}

const TARIFF_KEYS = ["consumer_producer_surplus", "comparative_advantage", "trade"];
const POLICY_KEYS = ["externalities", "government_intervention"];

function scenarioFor(ctx: GenContext): Scenario {
  const sel = ctx.selected.map((l) => l.key);
  const all = ctx.allLenses.map((l) => l.key);
  for (const pool of [sel, all]) {
    if (pool.some((k) => TARIFF_KEYS.includes(k))) return tariffScenario();
    if (pool.some((k) => POLICY_KEYS.includes(k))) return policyScenario();
  }
  return marketScenario();
}

// ---------- blocks ----------
function frames(bp: Blueprint): string {
  return bp.english === "developing"
    ? "\n\nSentence starters: \"When the price rises, buyers ...\" / \"This happens because ...\" / \"One thing we still do not know is ...\""
    : "";
}
function formula(bp: Blueprint): string {
  return bp.quant === "low" ? "\n\nFormula: percentage change = (new value - old value) / old value x 100." : "";
}

export function planSpecs(ctx: GenContext): BlockSpec[] {
  const bp = ctx.blueprint;
  const plan = planStages(bp.durationMinutes);
  const specs: BlockSpec[] = [];
  const add = (stage: Stage, types: BlockType[], weights: number[]) => {
    const mins = splitMinutes(plan[stage], weights);
    const counts: Partial<Record<BlockType, number>> = {};
    types.forEach((type, i) => {
      const ordinal = counts[type] ?? 0;
      counts[type] = ordinal + 1;
      specs.push({ stage, type, minutes: mins[i]!, ordinal });
    });
  };
  add("HOOK", ["BRIEFING"], [1]);
  add("EVIDENCE", ["EVIDENCE_CARD", "DATA_EXPLORER"], [4, 6]);
  const n = ctx.selected.length;
  add("MODEL", [...Array<BlockType>(n).fill("EXPLAINER"), "QUIZ"], [...Array<number>(n).fill(3), 2]);
  if (bp.includeWorksheet) add("APPLY", ["BRANCHING_SCENARIO", "WORKSHEET"], [3, 2]);
  else add("APPLY", ["BRANCHING_SCENARIO"], [1]);
  if (bp.includeDebate) add("DEBATE", ["DEBATE", "REFLECTION"], [3, 2]);
  else add("DEBATE", ["REFLECTION"], [1]);
  add("CHECK", ["EXIT_TICKET"], [1]);
  return specs;
}

export function buildBlock(ctx: GenContext, spec: BlockSpec, variant: number, index = 0, id: string = newId("b")): Block {
  const objs = ctx.objectives;
  const objFor = (i: number) => objs[i % objs.length]!.id;
  const bp = ctx.blueprint;
  const base: Block = {
    id, stage: spec.stage, type: spec.type, title: "", minutes: spec.minutes, objectiveIds: [objFor(index)], sourceIds: [],
    body: "", table: null, scenario: null, items: [], teacherNotes: "", claims: [], edited: false,
  };
  const lens = lensAt(ctx, spec.ordinal);
  const finish = (b: Block): Block => ({ ...b, objectiveIds: b.items.length ? [...new Set(b.items.map((i) => i.objectiveId))] : b.objectiveIds });

  switch (spec.type) {
    case "BRIEFING":
      return finish({
        ...base, title: "Event briefing",
        body: `${ctx.summary}\n\nEssential question: ${ctx.essentialQuestion}\n\nKey ideas we will use: ${ctx.selected.map((l) => l.name).join(", ")}.${frames(bp)}`,
        teacherNotes: `Open with the essential question and ask students for a first prediction before showing any evidence. Everything in this briefing is the teacher-provided description; check it before class. Unknowns to raise: ${ctx.unknowns.slice(0, 3).join("; ") || "none recorded"}.`,
      });
    case "EVIDENCE_CARD": {
      const claims = ctx.claims.slice(0, 8).map((c) => ({ text: c.text, status: c.status, sourceId: c.sourceId }));
      const label = (s: string) => ({ verified: "checked against a source", teacher_provided: "teacher-provided, not independently verified", disputed: "disputed", hypothetical: "hypothetical", unverified: "unverified" }[s] ?? s);
      return finish({
        ...base, title: "Evidence cards: what do we know?", claims, sourceIds: [...new Set(claims.flatMap((c) => (c.sourceId ? [c.sourceId] : [])))],
        body: claims.length
          ? `Read each statement. The label shows how far it has been checked. Decide which statements are facts, claims, opinions or predictions.\n\n${claims.map((c, i) => `${i + 1}. [${label(c.status)}] ${c.text}`).join("\n")}`
          : "No statements were recorded for this event.",
        teacherNotes: "Ask students to sort statements into fact, claim, opinion and prediction, then discuss what evidence would verify each one.",
      });
    }
    case "DATA_EXPLORER": {
      const { table, items } = dataItems(id, objectiveForData(ctx, index), variant);
      return finish({
        ...base, title: "Data explorer: reading the numbers", table, items,
        body: `This table uses synthetic teaching data, not real observations. Study it, then answer the questions. A table can show what changed; it cannot by itself show why.${formula(bp)}`,
        teacherNotes: "Point out the synthetic label. Ask: what would we need to know to explain the change (costs? demand? other prices)?",
      });
    }
    case "EXPLAINER":
      return finish({
        ...base, title: `Concept: ${lens.name}`, objectiveIds: [objectiveForLens(ctx, lens, spec.ordinal)],
        body: [
          `Key idea: ${lens.mechanism}`,
          lens.prerequisites.length ? `You should already know: ${lens.prerequisites.join("; ")}.` : "",
          lens.misconceptions.length ? `Watch out for these mistakes: ${lens.misconceptions.join("; ")}.` : "",
          lens.limitations.length ? `Limits: ${lens.limitations.join("; ")}.` : "",
          lens.alternativeLens ? `Another way to look at it: ${lens.alternativeLens}` : "",
          `Question to keep in mind: ${lens.inquiryQuestion}`,
        ].filter(Boolean).join("\n\n"),
        teacherNotes: `Model the reasoning aloud, linking ${lens.name.toLowerCase()} back to the event. Check prerequisites first: ${lens.prerequisites.join("; ") || "none listed"}.`,
      });
    case "QUIZ": {
      const items: Item[] = ctx.selected.map((l, i) => mcqFormative(ctx, l, objectiveForLens(ctx, l, i), `${id}_i${i + 1}`, variant + i));
      items.push(multiFormative(ctx, objectiveForLens(ctx, ctx.selected[0]!, items.length), `${id}_i${items.length + 1}`, variant));
      if (!bp.includeWorksheet) items.push(shortFormative(ctx, ctx.selected[0]!, objectiveForLens(ctx, ctx.selected[0]!, 0), `${id}_i${items.length + 1}`));
      return finish({ ...base, title: "Check your understanding", items, body: "Answer these practice questions. You will get feedback after you finish.", teacherNotes: "Formative: review wrong answers as misconceptions, not mistakes." });
    }
    case "BRANCHING_SCENARIO":
      return finish({
        ...base, title: "Policy choice simulation (hypothetical)", scenario: scenarioFor(ctx),
        body: "Make decisions and watch how the stylised outcomes change. The numbers are invented for teaching.",
        teacherNotes: "Run it twice with different choices and compare. Ask students to justify a choice using the concepts, then name what the model leaves out.",
      });
    case "WORKSHEET":
      return finish({
        ...base, title: "Guided worksheet", items: [shortFormative(ctx, lens, objectiveForLens(ctx, lens, index), `${id}_i1`)],
        body: `Use the concept from this lesson to answer.${frames(bp)}${bp.level === "Stretch" ? "\n\nStretch: compare two possible explanations and say which extra evidence would distinguish them." : ""}`,
        teacherNotes: "Short answers need teacher review; use the rubric. Students may use the sentence starters.",
      });
    case "DEBATE": {
      const roles = ctx.stakeholders.length ? ctx.stakeholders : [{ name: "Group A", position: "Position not stated; build it from the evidence" }, { name: "Group B", position: "Position not stated; build it from the evidence" }];
      return finish({
        ...base, title: "Stakeholder debate",
        body: `Each group takes one role and argues for its interests using evidence and economic reasoning. Separate facts from value judgements and predictions.\n\n${roles.map((r) => `${r.name}: ${r.position}`).join("\n")}`,
        teacherNotes: "Make sure every perspective gets a fair hearing. Ask each group to state one fact, one value judgement and one prediction.",
      });
    }
    case "REFLECTION":
      return finish({ ...base, title: "Reflection", body: `Answer in your notebook: ${ctx.essentialQuestion}\n\nWhat did you change your mind about, and what evidence would convince you further?`, teacherNotes: "Not scored. Use for discussion and to spot lingering misconceptions." });
    case "EXIT_TICKET": {
      const l0 = ctx.selected[0]!;
      const l1 = ctx.selected[1] ?? l0;
      const candidates = [
        independentMisconception(ctx, l0, objectiveForLens(ctx, l0, 0), `${id}_i1`, variant),
        independentCaution(l1, objectiveForLens(ctx, l1, 2), `${id}_i3`, variant),
        independentMisconception(ctx, l1, objectiveForLens(ctx, l1, 2), `${id}_i3`, variant + 1),
        independentCaution(l0, objectiveForLens(ctx, l0, 0), `${id}_i1`, variant),
      ].filter((x): x is Item => x !== null);
      const picked: Item[] = [];
      for (const c of candidates) {
        const correct = c.options.filter((o) => c.teacher.correctOptionIds.includes(o.id)).map((o) => o.text);
        if (picked.some((p) => p.prompt === c.prompt || p.options.some((o) => correct.includes(o.text)))) continue;
        picked.push(c);
        if (picked.length === 2) break;
      }
      const items = [{ ...picked[0]!, id: `${id}_i1` }, independentNumeric(objectiveForData(ctx, 1), `${id}_i2`, variant), { ...picked[1]!, id: `${id}_i3` }];
      return finish({ ...base, title: "Independent exit ticket", items, body: "Answer on your own. No hints are shown and answers appear only after you submit.", teacherNotes: "Independent check: no notes, no AI help. Review results by misconception before the next lesson." });
    }
    case "QUESTION":
    default:
      return finish({ ...base, title: "Inquiry questions", body: ctx.essentialQuestion });
  }
}

export function buildDemoExperience(ctx: GenContext, variant = 0) {
  const specs = planSpecs(ctx);
  return {
    title: ctx.title,
    essentialQuestion: ctx.essentialQuestion,
    blocks: specs.map((s, i) => buildBlock(ctx, s, variant, i)),
  };
}
