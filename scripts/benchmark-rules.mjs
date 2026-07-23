import { performance } from "node:perf_hooks";
import { parseInboxConfig } from "../dist/config.js";
import { ruleMatches } from "../dist/rules.js";

const ruleCount = 100;
const fileCount = 10_000;
const maximumP95Ms = 100;
const rules = parseInboxConfig({
  version: 2,
  rules: Array.from({ length: ruleCount }, (_, index) => ({
    name: `Rule ${index}`,
    destination: `Group-${index}`,
    enabled: true,
    match: {
      extensions: [`e${index}`],
      nameGlobs: [`file-*-${index}.e${index}`],
      size: { minBytes: index, maxBytes: 1_000_000 + index },
    },
  })),
}).rules;
const files = Array.from({ length: fileCount }, (_, index) => {
  const rule = index % ruleCount;
  return { name: `file-${index}-${rule}.e${rule}`, extension: `e${rule}`, size: 10_000 + rule };
});

function evaluateBatch() {
  let matches = 0;
  for (const file of files) {
    if (rules.find((rule) => ruleMatches(rule, file))) matches += 1;
  }
  return matches;
}

for (let index = 0; index < 5; index += 1) evaluateBatch();
const durations = [];
for (let index = 0; index < 25; index += 1) {
  const start = performance.now();
  if (evaluateBatch() !== fileCount) throw new Error("Rule benchmark produced an incorrect match count.");
  durations.push(performance.now() - start);
}
durations.sort((first, second) => first - second);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
console.log(`Rule evaluation: ${ruleCount} rules x ${fileCount.toLocaleString("en-US")} files, p95 ${p95.toFixed(2)} ms / ${maximumP95Ms} ms budget`);
if (p95 > maximumP95Ms) throw new Error(`Rule evaluation p95 exceeds the budget by ${(p95 - maximumP95Ms).toFixed(2)} ms.`);
