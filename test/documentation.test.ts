import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("bilingual project documentation", () => {
  it("ships linked English and Simplified Chinese readmes with the safe demo path", async () => {
    const [english, chinese, packageText] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("README.zh-CN.md", "utf8"),
      readFile("package.json", "utf8"),
    ]);
    for (const readme of [english, chinese]) {
      expect(readme).toContain("[English](README.md) | [简体中文](README.zh-CN.md)");
      expect(readme).toContain("npx github:YanhanLi/inboxfs --demo");
      expect(readme).toContain("16 MiB");
      expect(readme).toContain("32 KiB");
      expect(readme).toContain("67.12 kB");
    }
    expect(JSON.parse(packageText).files).toContain("README.zh-CN.md");
  });
});
