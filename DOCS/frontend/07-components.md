# Component declaration rules (`ui/`)

Status: standard (approved). Decides what becomes a shared component, what
stays colocated, and what stays duplicated — deliberately.
Related: `01-structure.md` (where things live), `02-naming.md`,
`05-duplication.md` (merge process).

## The 3-gate rule

Extract a shared component **iff all three hold**:

1. **Used in ≥2 places.** One consumer = colocate with its route, no matter
   how "reusable" it looks. (Counter-examples kept inline on purpose:
   `recurring-dashboard.tsx` entity card, investments SIP card, debts cost
   tiles — single consumer each.)
2. **Visually and behaviorally identical.** Same layout, same states, same
   interactions. Cousins with different density/color/context
   (mini stat tiles: `bg-sunken` vs `bg-tint-*` vs `bg-success/10`,
   `p-2` vs `p-6`) stay duplicated — unifying them would force
   lowest-common-denominator props.
3. **Props stay ≤5.** More than 5 props (or boolean soup like
   `variant × size × dismissable × animated`) means the abstraction is wrong:
   split it or leave the copies alone.

Fail any gate → colocate (single use) or duplicate deliberately (varied use).

## The catalog (where things live)

| Layer | Contains | Examples | Must never contain |
|---|---|---|---|
| `components/ui/` | Dumb primitives: styling + Radix behavior | `card`, `dialog`, `button`, `input`, `badge` | Fetches, business logic, app imports |
| `components/common/` | Shared business kit passing the 3 gates | `page-header`, `empty-state`, `confirm-dialog`, `entity-form-dialog`, `stat-card` | Single-use entities |
| Colocated (`app/<section>/`) | Single-consumer entities | `*-card.tsx`, `*-dialog.tsx`, panels | Anything imported by another section |
| `components/layout/` | App shell only | topbar, navs, bells, drawers | Page content |

## Approved shared components (worked examples)

- `PageHeader({ title, description, actions })` — extracted from 18
  identical `flex-col/sm:row + h1 + meta + buttons` page headers.
- `FieldError` — adopted in 11 dialogs; the 12 auth + 6 SIP/dividend raw
  `<p>` error paragraphs were misses, converted to it.
- `StatCard` (gradient heroes, 14 dashboards), `Badge` (7 variants,
  87 usages), `ConfirmDialog` + `useConfirm`/`useDeleteConfirm`,
  `EntityFormDialog`, `FormGrid`, `FormSelect`.

## Anti-patterns (with history)

- **Premature extraction.** A `recurring-card.tsx` for one consumer adds a
  file, an import hop, and a false promise of reuse. Don't.
- **Prop sprawl.** If the props table needs a matrix, the copies were clearer.
- **Wrapper that adds nothing.** A component that only forwards `className`
  to a `div` with no behavior is a longer way to write a `div`.
- **`asChild` misuse.** `asChild` exists for polymorphism (`Button`→`Link`),
  not to smuggle layout into primitives.
- **Token bypass in new components.** New shared code uses theme tokens
  (`03-theme-tokens.md`) — never `neutral-*` or hex literals.

## Review checklist (every future "new component?" PR)

1. Which ≥2 call sites use it today (paths)?
2. Are they pixel- and behavior-identical (or what differs)?
3. Props table — ≤5 and stable?
4. Which layer of the catalog does it belong to?
5. What breaks if we duplicate instead (answer must be concrete)?
