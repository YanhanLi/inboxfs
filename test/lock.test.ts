import { describe, expect, it } from "vitest";
import { MutationLock } from "../src/mutation-lock.js";

describe("MutationLock", () => {
  it("runs mutations one at a time and preserves their order", async () => {
    const lock = new MutationLock();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = lock.run(async () => { events.push("first:start"); await gate; events.push("first:end"); });
    const second = lock.run(async () => { events.push("second:start"); events.push("second:end"); });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toEqual(["first:start"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});
