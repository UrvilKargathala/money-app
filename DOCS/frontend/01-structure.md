# Frontend structure (`ui/`)

Status: standard (approved). Backend (`api/`) and frontend (`ui/`) remain
separate packages — this doc governs frontend-internal layout only.
Related: `02-naming.md` (file/component conventions), `06-formatting.md`.

## Principles

1. **Routes own pages, nothing else.** `app/` holds route groups, `page`,
   `loading`, `error`, colocated `*-dashboard`, and `actions.ts`. No shared
   components, no utils, no business logic in `app/` files outside dashboards.
2. **Shared code must be shared.** A component used by ≥2 routes lives in
   `components/common/`; used once → colocate with its route.
3. **Primitives stay dumb.** `components/ui/` = styling + Radix behavior only.
   No fetches, no business logic, no app imports.
4. **Shell is separate.** `components/layout/` = app shell only
   (topbar, nav, bells, drawers).
5. **`lib/` is pure.** No JSX. Only exception: the typed `api-client`
   wrappers (documented in `api-client.ts` header).

## Target tree

```text
ui/
  app/
    layout.tsx            # root shell: fonts, theme boot, skip-link
    page.tsx              # public entry (redirects per middleware)
    loading.tsx | not-found.tsx | global-error.tsx
    robots.ts | sitemap.ts | manifest.ts | icon.tsx | apple-icon.tsx
    api/[[...route]]/     # thin bridge to @moneymind/api (no logic)
    (app)/                # authenticated shell: layout, error, loading
      <section>/...       # money|wealth|planning|overview|...
        page.tsx          # server: fetch + render dashboard
        actions.ts        # server actions for this section
        *-dashboard.tsx   # client dashboard (state + layout)
        *-card.tsx        # memo'd row (stable sub-param callbacks)
        *-form-dialog.tsx # code-split (dynamic, gated on open)
    (auth)/               # login|signup|...: page.tsx server shell + *-form.tsx
    pricing/              # public marketing page
  components/
    ui/                   # primitives only (button, dialog, input, select…)
    common/               # shared business kit (dialogs base, cards base,
                          # search, palette, empty-state, guards, providers)
    layout/               # topbar, bottom-nav, mobile-nav, notification-bell
  lib/                    # pure helpers (format, nav, shortcuts, chart-theme…)
  middleware.ts           # auth + public-path allowlist
```

## Required moves (tracked, one commit each)

| # | Move | Reason |
|---|------|--------|
| S-1 | `components/membership.tsx` → `components/common/membership.tsx` | Breaks taxonomy (business kit at top level) |
| S-2 | `components/premium-reports.tsx` → `components/common/` | Same as S-1 |
| S-3 | `components/theme-provider.tsx` → `components/common/` | Same as S-1 |
| S-4 | Delete `components/mobile/` (empty dir) | Dead weight |
| S-5 | Merge `placeholder-page.tsx` → `empty-state.tsx` (`level` prop exists) | Duplicate empty states (see `05-duplication.md`) |
| S-6 | Keep `dashboard/live-widget.tsx + widgets-grid.tsx` where they are | Only 2 files; used once (overview dashboard). Revisit if reused |

## Explicit non-goals

- No barrel (`index.ts`) files — deep imports stay (see `02-naming.md`).
- No feature-folder rewrite — route colocation (`*-dashboard` next to its
  `page`) is the established pattern; keep it.
- No `api/` restructuring in this doc — backend structure is separate work.
- Token renames (`surface` → `base`, …) are `03-theme-tokens.md` scope.

## Verification per move

`pnpm typecheck` + `pnpm lint` + `next build` in `ui/`; route table
unchanged; import paths updated repo-wide (no stale `@/components/...`
references — grep to zero).
