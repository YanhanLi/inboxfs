# InboxFS rule configuration v2

InboxFS 0.9 adds ordered multi-condition rules while continuing to read version 1 extension-only configurations.

## Migration behavior

- Existing `version: 1` files are read without modification.
- Every v1 rule becomes an enabled v2 rule with the same name, destination, and extensions.
- Opening the rule editor or requesting a preview does not write a configuration file.
- Choosing **Save rules** writes the normalized v2 document atomically with private file permissions.
- Duplicate extensions remain an error in v1, preserving its unambiguous behavior. In v2, overlaps are allowed because explicit order determines the winner and the preview reports conflicts.

For example, this v1 rule:

```json
{
  "version": 1,
  "rules": [
    {
      "name": "Reading",
      "destination": "Books",
      "extensions": ["epub", "mobi"]
    }
  ]
}
```

is saved as:

```json
{
  "version": 2,
  "rules": [
    {
      "name": "Reading",
      "destination": "Books",
      "enabled": true,
      "match": { "extensions": ["epub", "mobi"] }
    }
  ]
}
```

## Matching semantics

Rules are evaluated in array order. The first enabled rule whose populated condition groups all match wins. Values within an extension or file-name glob group use OR semantics.

```json
{
  "name": "Large reports",
  "destination": "Reports",
  "enabled": true,
  "match": {
    "extensions": ["pdf", "docx"],
    "nameGlobs": ["report-*", "quarterly-????.*"],
    "size": { "minBytes": 1000000, "maxBytes": 50000000 }
  }
}
```

This rule requires a PDF or DOCX extension, either file-name pattern, and a size from 1 MB through 50 MB inclusive.

Extensions and globs are case-insensitive. `*` matches zero or more characters and `?` matches one Unicode code point. Patterns apply only to the base file name: `/`, `\\`, control characters, recursive `**`, arbitrary regular expressions, and executable fields are rejected. InboxFS never reads file contents while matching or previewing rules.

## Limits and safety

- 100 rules per configuration
- 50 extensions and 20 globs per rule
- 100 characters per glob
- 64 KB maximum configuration size
- non-negative safe integers for byte limits
- one visible destination folder name, with no path separators or traversal

Preview requests use the same parser and matcher as saved rules. They list at most 100 detailed destination changes while still counting every loose regular file. Saving remains protected by the loopback, same-origin, path-canonicalization, symbolic-link, and atomic-write boundaries used elsewhere in InboxFS.
