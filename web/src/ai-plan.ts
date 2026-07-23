import type { AiPlanItem, AiReviewItem, Scan } from "./types";

export function mergeAiPlan(scan: Scan, plan: AiPlanItem[], results: AiReviewItem[]): Scan {
  const planned = new Map(plan.map((item) => [item.id, item]));
  const reviewed = new Map(results.map((item) => [item.suggestionId, item]));
  const suggestions = scan.suggestions.map((item) => {
    const destination = planned.get(item.id);
    const review = reviewed.get(item.id);
    if (!destination || !review) return item;
    return { ...item, category: destination.destination, destinationPath: destination.destinationPath, classification: {
      type: "local-ai" as const,
      pattern: `Local AI · ${Math.round((review.confidence ?? 0) * 100)}%`,
      explanation: review.explanation ?? "Reviewed by a local model.",
      ruleName: review.model,
      source: "Ollama · 127.0.0.1",
      confidence: review.confidence,
      textBytes: review.textBytes,
      cached: review.cached,
    } };
  });
  return {
    ...scan,
    suggestions,
    categoryCounts: suggestions.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
  };
}
