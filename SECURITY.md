# Security Policy

InboxFS moves user files, so data-loss and path-boundary bugs are security issues.

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected version, operating system, reproduction steps, and whether files were moved, overwritten, or exposed.

The current supported line is `0.12.x`. Until InboxFS reaches 1.0, use it only on folders that are already backed up. The `--demo` workspace is created under the operating system's temporary directory and is removed when the InboxFS process stops; it never scans a user-selected folder.

Local AI review is disabled by default and connects only to Ollama on `127.0.0.1:11434`. Reports involving model selection, prompt injection, unexpected network access, symbolic-link or file changes during reads, malformed PDF/DOCX handling, parser resource exhaustion, or unreviewed AI decisions are in scope. Include whether text access was enabled and the Ollama model name in your report; do not attach private file contents.
