# Theme token contract (`ui/`)

Status: standard (approved). Single source of truth for color: `globals.css`
`:root`/`.dark` + `tailwind.config.ts` color table. Rewording to the simple
names in `02-naming.md`; values below preserve today's rendered output
unless marked († visual change, needs explicit approval).
Related: `02-naming.md`, `06-formatting.md`.

## The contract

1. **Every hex/RGB literal lives in `:root`/`.dark` exactly once.**
   Components reference tokens only — never `neutral-*`, never hex
   literals, never `dark:[#…]`.
2. **Parity: every `:root` variable MUST exist in `.dark`.** A missing dark
   var silently renders the light value (this already bit us — see below).
3. **One role, one token.** Same meaning = same token across all pages.
   New shades go through this doc, not inline hex.
4. **Tailwind keys match the simple names** (`bg-base`, `text-faint`,
   `border-edge`, `bg-info-soft` …) so classes read plainly.

## Parity report (measured 2026-10-10, before the rename)

| Gap | Detail | Fix |
|---|---|---|
| Missing in `.dark` | `--destructive`, `--destructive-foreground`, `--ring`, `--radius` absent — destructive buttons + focus rings render light values in dark mode | Add with today's effective values (zero visual change) |
| Collapsed semantics | `--tint-*` (→ `--*-soft`) all `30 30 30` in dark — info/success/warning/error indistinguishable | † Distinct dark tints (deep blue/green/amber/red) — the only visual change in the program; needs approval, otherwise keep flat |
| Token bypass | 100+ `text-neutral-*` (never adapt to dark) + scattered `dark:[#hex]` hardcodes | Codemod to the table below; grep counts to zero |
| Mapped hardcodes | `#1E1E1E`→soft, `#2A2A2A`→edge, `#EAF1FF`→foreground, `#B9C7DE`→muted-foreground already match token values | Mechanical swap, zero visual change |

## Canonical table (simple names)

| Role | `--var` | Light | Dark |
|---|---|---|---|
| Page bg | `--base` | `255 255 255` | `17 17 17` |
| Card bg | `--panel` | `255 255 255` | `17 17 17` |
| Soft wash | `--soft` | `241 245 249` | `30 30 30` |
| Deep bg | `--deep` | `248 250 252` | `0 0 0` |
| Borders | `--edge` | `226 232 240` | `42 42 42` |
| Main text | `--foreground` | `15 23 42` | `234 241 255` |
| Secondary text | `--muted-foreground` | `100 116 139` | `185 199 222` |
| Faint text | `--faint` | `148 163 184` | `126 140 163` |
| Semantic washes | `--info-soft`, `--success-soft`, `--warning-soft`, `--error-soft` | blue/green/amber/red-50 | † distinct darks or flat `30 30 30` |
| Brand | `--primary` (`#2563EB`, both modes), `--primary-foreground` | — | — |
| Danger/focus/shape | `--destructive*`, `--ring`, `--radius` (+ shadcn bridge) | — | parity-filled |

## Adoption rule (codemod phase)

1. Rename vars in `globals.css` + `tailwind.config.ts` (one commit).
2. Codemod usages file-by-file (one commit per file/group): `neutral-*` →
   `faint`/`muted-foreground`, `dark:[#hex]` → token, `bg-surface` →
   `bg-base`, `text-ink-*` → `text-foreground`/`-faint`, etc.
3. Verify each: `tsc` + `lint` + `build` + visual spot-check of one page;
   `grep -r "neutral-\|dark:\[#" ui/app ui/components` counts to zero.
4. Contrast check on the changed pages (faint text on both modes).
