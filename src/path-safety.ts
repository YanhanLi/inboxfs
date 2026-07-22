import path from "node:path";

export function assertInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the inbox root: ${candidate}`);
  }
}

export function availableDestination(candidate: string, occupied: Set<string>): string {
  if (!occupied.has(candidate)) return candidate;
  const parsed = path.parse(candidate);
  for (let index = 2; index < 10_000; index += 1) {
    const next = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    if (!occupied.has(next)) return next;
  }
  throw new Error(`Unable to find an available name for ${candidate}`);
}
