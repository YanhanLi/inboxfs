import path from "node:path";
import type { Category, ClassificationMatch } from "./model.js";

const GROUPS: Array<[Category, Set<string>]> = [
  ["Documents", new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "epub"])],
  ["Images", new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "avif", "raw"])],
  ["Audio", new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"])],
  ["Video", new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v"])],
  ["Archives", new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"])],
  ["Installers", new Set(["dmg", "pkg", "exe", "msi", "deb", "rpm", "appimage", "apk"])],
  ["Code & Data", new Set(["json", "csv", "xml", "yaml", "yml", "sql", "ipynb", "js", "ts", "py", "java", "go", "rs"])],
  ["Fonts", new Set(["ttf", "otf", "woff", "woff2"])]
];

export function extensionOf(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

export function classify(filename: string): Category {
  return explainClassification(filename).category;
}

export function explainClassification(filename: string): { category: Category; classification: ClassificationMatch } {
  const extension = extensionOf(filename);
  for (const [category, extensions] of GROUPS) {
    if (extensions.has(extension)) {
      return {
        category,
        classification: {
          type: "extension",
          pattern: `*.${extension}`,
          explanation: `The .${extension} extension maps to ${category}.`
        }
      };
    }
  }
  return {
    category: "Other",
    classification: {
      type: "fallback",
      pattern: extension ? `*.${extension}` : "No extension",
      explanation: extension ? `No category rule matches the .${extension} extension.` : "Files without an extension use the fallback category."
    }
  };
}
