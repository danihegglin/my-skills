// The overall PropLens score. Kept free of React so the area ranking worker can use it.

export type SectionId = "noise" | "schools" | "shopping" | "sun";
export const WEIGHTS: Record<SectionId, number> = { noise: 0.3, sun: 0.25, shopping: 0.25, schools: 0.2 };

export function overallScore(scores: Partial<Record<SectionId, number>>): number | null {
  let total = 0;
  let weight = 0;
  for (const [id, w] of Object.entries(WEIGHTS) as [SectionId, number][]) {
    const s = scores[id];
    if (s == null) continue;
    total += s * w;
    weight += w;
  }
  return weight ? Math.round(total / weight) : null;
}
