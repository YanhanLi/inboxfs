import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function hashFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
