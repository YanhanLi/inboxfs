import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const maximumBytes = 67_120;
const assets = path.resolve("web-dist/assets");
const entries = (await readdir(assets)).filter((name) => /^index-.*\.js$/.test(name));
if (entries.length !== 1) throw new Error(`Expected one main JavaScript asset, found ${entries.length}.`);

const bytes = gzipSync(await readFile(path.join(assets, entries[0]))).byteLength;
console.log(`Main JavaScript: ${(bytes / 1000).toFixed(2)} kB gzip / ${(maximumBytes / 1000).toFixed(2)} kB budget`);
if (bytes > maximumBytes) throw new Error(`Main JavaScript exceeds the budget by ${bytes - maximumBytes} bytes.`);
