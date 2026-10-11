# Scope guards: what changes, what never does

Status: standard (approved). This is the immutable rule of the fix program:
variable names, formatting, and looks may change — business logic never
does. Any conflict between readability and correctness resolves to
correctness, every time.
Related: `04-dead-code.md`, `05-duplication.md`, `06-formatting.md`,
`07-components.md`.

## Frozen (never touched)

- **Business logic**: calculations, filters, validation rules, state
  machines, money math (`Number()` coercions, reduce chains, date logic),
  eligibility/branching conditions.
- **Contracts**: API payloads, query semantics, DB columns, prop types,
  URL routes, auth/session flows, caching semantics, fetch timing.
- **Behavior**: user flows, error-handling paths, empty/loading states
  logic, event sequencing.

## Fixable (the program's scope)

- Variable/class/token **renames with identical values** (find-replace,
  never retype logic).
- **Formatting**: Prettier pass, import order, whitespace (whitespace-only
  commits — `git diff -w` must be empty).
- **Dead code/file removal** per `04-dead-code.md` proof checklist.
- **Duplication merges** per `05-duplication.md` (behavior-identical copies
  only).
- **Visual defects**: dark classes, contrast, heading levels, ARIA
  attributes, token adoption with identical values.
- **Readability within functions**: renaming locals, early returns,
  extracting pure helpers — only where output-identical.

## The tripwire rule

Any edit that *could* change runtime output requires (a) an existing test
covering it, or (b) a before/after behavior checklist in the commit
message. If neither exists, the edit doesn't happen — it becomes a
backlog item, never a drive-by.

## Verification ladder (every commit)

`tsc --noEmit` → `eslint` (0 errors) → `next build` → targeted smoke of
the one page/flow touched. Revert-first on any doubt; each commit
independently revertible.
