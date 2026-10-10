# Naming conventions (frontend)

Status: standard (approved). Everything new follows this; renames of old
code happen per the phase plan, never drive-by.
Related: `01-structure.md`, `03-theme-tokens.md` (variable contract),
`06-formatting.md`.

## Files (kebab-case, no exceptions)

- Components, hooks, libs: `bill-form-dialog.tsx`, `use-payments-history.ts`,
  `avatar-upload.ts`. Tests sit next to source: `object-storage.test.ts`.
- Route files keep Next reserved names (`page.tsx`, `layout.tsx`,
  `loading.tsx`, `error.tsx`, `route.ts`).
- Never: spaces, `&`, PascalCase, `SCREAMING_SNAKE`, or ad-hoc
  `index.ts` barrels (deep imports stay — see `01-structure.md`).

## Code

| Kind | Rule | Example |
|---|---|---|
| Components | `PascalCase` | `SubscriptionCard`, `EmptyState` |
| Hooks | `use*`, verb phrase | `useDeleteConfirm`, `usePaymentsHistory` |
| Server actions | `*Action` | `deleteBillAction`, `pauseGoalAction` |
| Event handlers | `handle*` + noun | `handleDelete`, `onOpenChange` (props) |
| Booleans/state | `is/has/show/*Open` | `isActive`, `formOpen`, `showInactive` |
| True constants | `SCREAMING_SNAKE` | `MAX_BYTES`, `AVATAR_MAX_EDGE` |
| Types | `PascalCase`, colocated | `ConfirmDialogState`, `ScheduleRow` |
| CSS variables | simple kebab (table below) | `--base`, `--text-faint` |

## Commits

`type(scope): subject` — types: `perf|fix|feat|a11y|seo|chore|test|refactor|docs`.
Scope is the area (`ui`, `api`, `frontend`). One logical change per commit;
one file per commit where sensible.

## Theme variables (simple names — full contract in `03-theme-tokens.md`)

More variables are fine; variants are fine — names stay plain words.
Banned words: `surface`, `sunken`, `wash`, `line`, `ink`, `tint`.

| Role | Variable | Tailwind class |
|---|---|---|
| Page bg | `--base` | `bg-base` |
| Card bg | `--panel` | `bg-panel` |
| Soft wash | `--soft` | `bg-soft` |
| Deep bg | `--deep` | `bg-deep` |
| Borders | `--edge` | `border-edge` |
| Main text | `--foreground` | `text-foreground` |
| Secondary text | `--muted-foreground` | `text-muted-foreground` |
| Faint text | `--faint` | `text-faint` |
| Semantic washes | `--info-soft`, `--success-soft`, `--warning-soft`, `--error-soft` | `bg-info-soft` … |
| Brand/danger/focus | `--primary*`, `--destructive*`, `--ring`, `--radius` | unchanged |

Rules: every hex/RGB literal lives in `:root`/`.dark` exactly once;
components reference tokens only — never `neutral-*` or hex literals
(including `dark:[#…]`); every `:root` var MUST exist in `.dark`
(parity — see `03-theme-tokens.md`).
