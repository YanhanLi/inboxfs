import { OllamaProvider } from "../dist/ai/ollama.js";

const model = process.env.INBOXFS_AI_MODEL;
if (!model) throw new Error("Set INBOXFS_AI_MODEL to an installed local Ollama model before running this evaluation.");

const destinations = ["Projects", "Finance", "Travel", "Personal"];
const groups = [
  ["Projects", (index) => `project-${index}-roadmap-and-milestones.unknown`],
  ["Finance", (index) => `invoice-${index}-vendor-payment.unknown`],
  ["Travel", (index) => `flight-itinerary-${index}-hotel-booking.unknown`],
  ["Personal", (index) => `family-recipe-${index}-weekend-notes.unknown`],
];
const corpus = groups.flatMap(([destination, filename]) => Array.from({ length: 50 }, (_, index) => ({ destination, name: filename(index + 1) })));
const provider = new OllamaProvider();
const models = await provider.listModels(AbortSignal.timeout(5_000));
if (!models.some((item) => item.name === model)) throw new Error(`Model "${model}" is not installed locally.`);

let correct = 0;
let invalid = 0;
const confusion = Object.fromEntries(destinations.map((destination) => [destination, Object.fromEntries(destinations.map((candidate) => [candidate, 0]))]));
for (const [index, item] of corpus.entries()) {
  try {
    const result = await provider.classify({ name: item.name, extension: "unknown", size: 1024 + index, modifiedAt: new Date(1_700_000_000_000 + index).toISOString(), textBytes: 0 }, destinations, model, AbortSignal.timeout(60_000));
    if (!result || typeof result !== "object" || !destinations.includes(result.destination) || typeof result.confidence !== "number" || typeof result.explanation !== "string") {
      invalid += 1;
      continue;
    }
    confusion[item.destination][result.destination] += 1;
    if (result.destination === item.destination) correct += 1;
  } catch {
    invalid += 1;
  }
}

const accuracy = correct / corpus.length;
console.log(JSON.stringify({ model, samples: corpus.length, correct, invalid, accuracy, confusion }, null, 2));
if (invalid > 0) throw new Error(`Local model returned ${invalid} invalid result${invalid === 1 ? "" : "s"}.`);
if (accuracy < 0.85) throw new Error(`Top-1 accuracy ${(accuracy * 100).toFixed(1)}% is below the 85% target.`);
