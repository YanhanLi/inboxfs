# Local AI preview

InboxFS 0.10 adds an optional review layer for files that do not match a custom or built-in deterministic rule. It is disabled by default, runs after those rules, and cannot move a file without the normal preview and selection workflow.

## Data flow

1. InboxFS scans loose regular files in the selected inbox and keeps only fallback classifications, up to 100 files per job.
2. It sends file metadata to one model already listed by Ollama on `http://127.0.0.1:11434`.
3. If **Read supported text locally** is enabled, it may also read at most 32 KiB from an allowlisted plain-text file. Binary, symbolic-link, changed, and unsupported files are not read as text.
4. The model must return one allowed destination, a confidence from 0 to 1, and a short explanation. Unexpected fields and invalid destinations fail closed.
5. Results below 0.75 confidence require review. Every successful result can still be deselected or corrected.
6. **Add to plan** recalculates destination paths without creating folders. A fresh scan validates the selected IDs again when **Organize** is used.

Analysis is sequential, cancellable, and limited to 60 seconds per file. A cancelled, failed, stale, duplicate, or unselected result cannot be submitted as an organization decision.

## Network and storage boundary

The Ollama origin is compiled into InboxFS. There is no configurable endpoint, redirect following, API key, cloud fallback, analytics call, or upload path. Model names containing common cloud or remote markers are not selectable. Ollama must report a positive local model size and digest.

Settings and cache files are atomically written with mode `0600` under `~/.inboxfs/`; parent directories use mode `0700`. Symbolic-link targets are rejected. The bounded cache stores only validated destination, confidence, explanation, timestamps, and SHA-256 cache keys. It does not store the inbox path, file name, or source text in plaintext. Keys change with the prompt version, hashed inbox root, model, allowed destinations, and file context.

These controls prove that InboxFS itself calls only the local Ollama HTTP service. They cannot prove what arbitrary Ollama model files, custom aliases, plugins, or a compromised local service do internally. Use models you trust, keep Ollama local, and leave text access off when metadata is sufficient.

## Model evaluation

Model quality is not interchangeable. Before relying on a model, build InboxFS and run the included 200-file balanced filename corpus:

```bash
npm run build
INBOXFS_AI_MODEL='your-installed-model:tag' npm run evaluate:ai
```

The evaluator requires zero invalid outputs and at least 85% top-1 accuracy across Projects, Finance, Travel, and Personal. This is a smoke gate, not proof that the model will classify your files correctly. Review results on a backed-up test folder, use low confidence as a warning rather than a guarantee, and convert stable patterns into deterministic rules.

`npm run check` does not invoke a real model. It uses deterministic test providers for safety and workflow coverage, and separately enforces a 75 ms p95 budget for preparing cache keys for 10,000 metadata-only records.

## Prompt injection and file safety

File names and optional text are framed as untrusted data, and model output is schema-validated. This reduces prompt-injection risk but does not make model reasoning trustworthy. The model cannot select a path outside the configured destination names, and its explanation is display-only.

Text extraction checks file metadata before reading, resolves the canonical inbox boundary, rejects symbolic links, uses an allowlist, and caps content size. InboxFS does not parse PDFs, office files, images, archives, or executable formats for AI review in this preview.
