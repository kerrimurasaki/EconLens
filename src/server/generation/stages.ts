import { STAGES, type Stage } from "@/schemas/experience";

const WEIGHTS: Record<Stage, number> = { HOOK: 0.1, EVIDENCE: 0.2, MODEL: 0.25, APPLY: 0.25, DEBATE: 0.1, CHECK: 0.1 };

/** Allocates the lesson duration across the six stages in 5-minute steps; the total is always exact. */
export function planStages(duration: number): Record<Stage, number> {
  const plan = {} as Record<Stage, number>;
  let sum = 0;
  for (const s of STAGES) {
    plan[s] = Math.max(5, Math.round((duration * WEIGHTS[s]) / 5) * 5);
    sum += plan[s];
  }
  // Fix rounding drift on the largest stages first, keeping the 5-minute floor.
  const order: Stage[] = ["MODEL", "APPLY", "EVIDENCE", "HOOK", "DEBATE", "CHECK"];
  let guard = 0;
  while (sum !== duration && guard++ < 100) {
    const diff = duration - sum;
    const step = Math.sign(diff) * Math.min(5, Math.abs(diff));
    const target = order.find((s) => plan[s] + step >= 5);
    if (!target) break;
    plan[target] += step;
    sum += step;
  }
  return plan;
}

/** Splits `total` minutes into integer parts following `weights`; every part >= 1 and the sum is exact. */
export function splitMinutes(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (total < n) throw new Error("Not enough minutes to split");
  const wsum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.max(1, Math.floor((total * w) / wsum)));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; rest !== 0; i = (i + 1) % n) {
    if (rest > 0) { parts[i]!++; rest--; }
    else if (parts[i]! > 1) { parts[i]!--; rest++; }
  }
  return parts;
}
