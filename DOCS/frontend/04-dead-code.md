# Dead code & dead file removal playbook (`ui/`)

Status: standard (approved). Prove dead → delete → verify, one file per
commit. Never batch deletions; never delete what you can't prove unused.
Related: `01-structure.md`, `05-duplication.md` (merges, not deletions).

## Dead files (known list, frontend)

| # | Target | Proof | Action |
|---|---|---|---|
| D-1 | `components/mobile/` (empty dir) | `Test-Path` true, 0 files | Delete dir |
| D-2 | `placeholder-page.tsx` | 1 consumer (`modules/[module]/page.tsx`); `empty-state.tsx` (`level` prop) covers it | Merge, then delete (see `05-duplication.md`) |
| D-3 | `lib/analytics.ts` (6 lines), `lib/user-agent.ts` (26 lines) | Stub-scale; verify zero imports first | Delete if unimported, else document why kept |
| D-4 | Root `.next/trace`, `ui/.next-dev/` cruft, `__pycache__`, committed `tsconfig.tsbuildinfo` | Build artifacts on disk (gitignored but present) | Clean on disk; no commit needed |
| D-5 | `Error-logs.txt` (root) | Pasted Vercel log dump, not source | Delete (logs live in Vercel, not the repo) |

## Dead code (process, not a list)

1. **Unused exports** — `tsc --noUnusedLocals` report-only first (do NOT
   enable as gate; the backlog would block everything). Triage output
   file-by-file. `knip`-style unused-export scan as second signal.
2. **Unused Radix sub-exports** — documented, not actioned: tree-shaking
   already drops them (`Sub/Checkbox/Radio/Group` etc. never imported).
3. **Commented-out code** — delete on sight during function passes; git
   history keeps it. No "keep just in case."
4. **`console.*`** — allowed only on error paths (`console.error` with a
   stable `[api]`/component prefix). Anything else is deleted.
5. **Unreachable branches** — flags always true/false, `initialCreate`-style
   props no caller passes, `?? []` fallbacks over non-nullable data. Prove
   with caller grep before deleting.

## The removal checklist (every deletion)

1. Import-graph proof: no `import`/`require`/`dynamic(` references repo-wide
   (grep, not memory).
2. Runtime proof: no string-based references (route strings, `localStorage`
   keys, event names like `AVATAR_UPDATED_EVENT` — grep those too).
3. Test proof: no `*.test.*` references it.
4. Delete → `pnpm typecheck` + `pnpm lint` + `next build` in `ui/`.
5. One commit: `chore(ui): remove dead <name>`.

## Explicitly NOT dead (do not touch)

- Single-consumer colocated cards/dialogs (see `07-components.md` gate 1).
- `initialCreate`/`initialEditId` props with callers in `page.tsx` files.
- In-file dialogs (page-specific; `05-duplication.md` scope if ever merged).
- Anything behind `NEXT_PUBLIC_*` or feature flags — grep `.env*` first.
