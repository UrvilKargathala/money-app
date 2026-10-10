# Duplication triage (`ui/`)

Status: standard (approved). Not all duplication is debt: this doc separates
intentional copies (keep, documented) from accidental ones (merge), with the
merge pattern for each.
Related: `04-dead-code.md` (deletions), `07-components.md` (3-gate rule).

## Intentional — keep, do not "fix"

| Pattern | Why it stays |
|---|---|
| Route ↔ colocated query twins (`bills-dashboard` ↔ page fetch, `api` routes ↔ queries) | Different layers (HTTP vs SQL); merging would tangle transport with data |
| In-file dialogs (debts 5, goals 3, tax 2, bills 2, subs 2) | Page-specific fields/validation; extraction serves 1 consumer (fails gate 1) |
| Per-mount `ConfirmDialog` states | Each mount owns its lifecycle; sharing state across deletes would couple them |
| Mini stat tiles (`bg-sunken` vs `bg-tint-*`, `p-2` vs `p-6`) | Intentionally varied density/color (fails gate 2) |
| Dense-row pills (2 sites, `10px`) | `Badge` would be oversized; intentional sizing (fails gate 2) |
| Per-entity `*-card.tsx` × 7 | Same shape, different fields/actions per domain; unified card would need prop sprawl (fails gate 3) |
| Form open/edit triples per dashboard | Per-entity types (`Debt|Goal|Sip…`) + divergent payloads (FormData vs JSON) |

## Accidental — merge (tracked)

| # | Duplication | Merge target | Pattern |
|---|---|---|---|
| U-1 | 18 hand-rolled page headers (`h1 + meta + buttons`) | New `components/common/page-header.tsx` | Extract component → migrate 3 section batches → verify each |
| U-2 | 18 raw error `<p>` (12 auth + 6 SIP/dividend; wrong `text-error` token in 6) | Existing `FieldError` | Mechanical swap, one commit |
| U-3 | `placeholder-page.tsx` vs `empty-state.tsx` | `empty-state.tsx` (`level` prop exists) | Migrate 1 consumer (`modules/[module]`) → delete placeholder |
| U-4 | Stat/filter derivations per dashboard | `useMemo` + stable callbacks | Done for 7 dashboards; pattern documented, apply to new code |

## Merge process (every U-item)

1. Confirm the copies are behavior-identical (read all call sites; diff props).
2. Build/extend the shared target — no new props beyond the 3-gate limit.
3. Migrate call sites in small batches (one commit per batch).
4. Verify each batch: `pnpm typecheck` + `pnpm lint` + `next build` +
   side-by-side screenshot of one migrated page.
5. Delete the old copy only when grep shows zero consumers (see
   `04-dead-code.md` checklist).

## Detection (ongoing, not one-off)

- Per-domain read-throughs during function-by-function passes — primary
  method. Similarity tools are a hint, never a verdict: they can't tell
  intentional (table above) from accidental.
- New-code gate: the `07-components.md` review checklist on every PR that
  adds a second copy of anything.
