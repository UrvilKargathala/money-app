# Formatting (`ui/`)

Status: standard (approved). Matched to the current dominant style so the
first format pass is minimal-diff. Enforcement comes after adoption.
Related: `02-naming.md`, `06` here is enforced via Prettier + ESLint.

## Prettier (new config — currently absent)

```json
{
  "printWidth": 120,
  "tabWidth": 2,
  "singleQuote": false,
  "trailingComma": "es5",
  "bracketSameLine": false,
  "semi": true
}
```

Rationale: double quotes + semicolons + 120 width match what the codebase
already does; the config freezes it so formatters stop producing diff
noise. First `prettier --write` is its own commit, reviewed as
whitespace-only (`git diff -w` must be empty).

## Import order (enforced by review, then `eslint-plugin-simple-import-order`)

1. `react` / `next/*` (framework)
2. Third-party libs (`lucide-react`, `sonner`, Radix via `components/ui`)
3. `@/` absolute (`@/components/...`, `@/lib/...`)
4. Relative (`./transaction-row`, `../actions`)
5. Types last within each group (`import type`)

One blank line between groups. No reordering inside a group unless
alphabetical drift — keep diffs small.

## Component template

```tsx
"use client"; // only if client behavior is used

import { ... } from "react";
import dynamic from "next/dynamic"; // only for code-split imports
// ... (groups per import order above)

type Props = { ... }; // colocated, PascalCase, no exported soup

export function FeatureCard({ ... }: Props) {
  // 1. hooks (state, memo, callbacks)
  // 2. derived data (useMemo)
  // 3. early returns (loading/empty/error)
  // 4. JSX
}

export const FeatureCardMemo = memo(FeatureCard); // rows only, not pages
```

Rules: no default exports except Next route files; `cn()` for conditional
classes; stable `(row)`-param callbacks for memo'd rows (never inline
closures into memo'd children); `aria-*` on interactive elements from the
start, not as follow-up.

## Enforcement rollout

1. Add Prettier config + format (whitespace-only commit).
2. `lint-staged` on pre-commit (format changed files only).
3. Format-check in CI as non-blocking warning first, blocking after one
   clean week.
