import { performance } from "node:perf_hooks";
import { aiCacheKey } from "../dist/ai/cache.js";

const fileCount = 10_000;
const contexts = Array.from({ length: fileCount }, (_, index) => ({
  name: `unmatched-${index}.unknown`,
  extension: "unknown",
  size: index * 97,
  modifiedAt: new Date(1_700_000_000_000 + index).toISOString(),
  textBytes: 0,
}));
const destinations = ["Projects", "Finance", "Travel", "Personal", "Archive"];

function evaluateBatch() {
  let checksum = 0;
  for (const context of contexts) checksum += aiCacheKey("/tmp/inboxfs-benchmark", "local-model:1b", destinations, context).charCodeAt(0);
  return checksum;
}

for (let warmup = 0; warmup < 5; warmup += 1) evaluateBatch();
const samples = [];
for (let batch = 0; batch < 25; batch += 1) {
  const started = performance.now();
  if (!evaluateBatch()) throw new Error("AI metadata benchmark produced an invalid checksum.");
  samples.push(performance.now() - started);
}
samples.sort((first, second) => first - second);
const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
console.log(`AI metadata preparation: ${fileCount.toLocaleString()} files, p95 ${p95.toFixed(2)} ms / 75 ms budget`);
if (p95 > 75) throw new Error(`AI metadata preparation exceeded its 75 ms p95 budget: ${p95.toFixed(2)} ms`);
