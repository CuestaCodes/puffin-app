# Puffin — Theme Tokens: Audit & Migration Plan

*Engineering-facing companion to `docs/branding-brief.md`. Documents the current theming system, the drift away from it, and a plan to centralise. **No code is changed by this document** — it's the map for a future refactor.*

---

## 1. TL;DR

- Puffin **already has** a semantic design-token system in `app/globals.css` (HSL CSS variables + Tailwind `@theme inline`). The plumbing is good.
- The problem is **drift**: ~**2,263** hardcoded Tailwind palette classes (e.g. `bg-slate-800`, `text-red-400`) across **47** `.tsx` files bypass the tokens.
- Net effect: a rebrand today means find-replacing hundreds of classes instead of editing a handful of CSS variables.
- **Goal of the eventual refactor:** route every component colour through a semantic token so future branding changes live in one place (`globals.css`).

---

## 2. The existing token system (source of truth)

Defined in `app/globals.css`:

- **`:root`** holds raw HSL triples for each semantic role.
- **`@theme inline`** exposes them to Tailwind as `--color-*` utilities (so `bg-card`, `text-primary`, etc. work).
- App is **dark-only**: `app/layout.tsx` sets `<html className="dark">`.

| Token | HSL | Role |
|-------|-----|------|
| `--background` | `222.2 84% 4.9%` | app canvas |
| `--foreground` | `210 40% 98%` | primary text |
| `--card`, `--popover` | `224 71% 7%` | panels, menus |
| `--primary`, `--ring` | `187 85% 53%` | **cyan** accent, focus ring |
| `--secondary`, `--accent` | `217.2 32.6% 17.5%` | secondary surfaces |
| `--muted` | `217.2 32.6% 12%` | subtle surfaces |
| `--muted-foreground` | `215 20.2% 65.1%` | secondary text |
| `--destructive` | `0 62.8% 50%` | red / errors |
| `--border`, `--input` | `217.2 32.6% 17.5%` | dividers, fields |
| `--radius` | `0.75rem` | rounding (sm/md/lg/xl derived) |
| `--chart-1..5` | cyan / emerald / amber / purple / pink | chart series |

There are also two utility classes tied to hardcoded HSL: `.glow-cyan` and `.glow-emerald` (`globals.css:110-117`) — these duplicate `--primary`/chart-2 values and should reference tokens post-rebrand.

**Gap:** there is **no token** for the app's de-facto neutral (`slate`) ramp, nor for the financial semantics **positive/income (emerald)** and **warning (amber)**. Components invented these inline. The refactor should add tokens for them (see §5).

---

## 3. The drift (hardcoded palette usage)

~2,263 hardcoded palette-class occurrences across 47 files. By colour family:

| Family | Occurrences | De-facto role |
|--------|-------------|---------------|
| `slate` | 1,475 | neutrals: surfaces, text, borders |
| `red` | 231 | destructive / negative amounts |
| `emerald` | 186 | positive / income / success |
| `cyan` | 178 | primary accent |
| `amber` | 87 | warning |
| `blue` | 69 | gradient partner to cyan (logo, highlights) |
| `pink` | 24 | chart series |
| `purple` | 8 | chart series |
| `green` | 5 | stray (fold into emerald/positive) |

Most-affected files (occurrence count):

| File | Count |
|------|-------|
| `components/import/paste-import.tsx` | 112 |
| `components/settings/sync-management.tsx` | 107 |
| `components/settings/data-management.tsx` | 101 |
| `components/settings/category-management.tsx` | 78 |
| `components/pages/monthly-budget.tsx` | 77 |
| `components/pages/transactions.tsx` | 62 |
| `components/settings/credentials-setup.tsx` | 60 |
| `components/pages/dashboard.tsx` | 60 |
| `components/import/preview-table.tsx` | 49 |
| `components/transactions/monthly-transaction-list.tsx` | 45 |
| `components/pages/net-worth.tsx` | 42 |
| `components/net-worth/record-dialog.tsx` | 42 |

---

## 4. Proposed class → token mapping

The mapping that a refactor would apply. Slate is the bulk of the work; it maps to the existing surface/text/border tokens by shade:

| Hardcoded class | → Semantic token utility | Notes |
|-----------------|--------------------------|-------|
| `bg-slate-900` | `bg-background` | app canvas |
| `bg-slate-800` | `bg-card` | panels/tiles (verify per use — some are `muted`) |
| `bg-slate-700` | `bg-muted` / `bg-secondary` | subtle surfaces |
| `text-slate-100/200` | `text-foreground` | primary text |
| `text-slate-300/400/500` | `text-muted-foreground` | secondary text (may need a 2nd muted tier) |
| `border-slate-700/800` | `border-border` | dividers |
| `text-cyan-400`, `bg-cyan-500` | `text-primary`, `bg-primary` | accent |
| `text-red-400`, `bg-red-500` | `text-destructive`, `bg-destructive` | destructive/negative |
| `text-emerald-400`, `bg-emerald-500` | **new** `--positive` token | income/success (no token today) |
| `text-amber-400` | **new** `--warning` token | caution (no token today) |
| chart fills (`cyan/emerald/amber/purple/pink`) | `--chart-1..5` | already tokenised — wire recharts to them |
| `from-cyan-* to-blue-*` gradients | logo/brand gradient | becomes part of the new brand identity; keep as a documented brand gradient, not a token |

**Note:** the slate ramp spans more shades (100–900) than the current tokens cleanly cover. The refactor likely needs a small **neutral scale** (e.g. `--surface`, `--surface-2`, `--text`, `--text-muted`, `--text-subtle`) rather than forcing everything into the existing 3–4 slots. Decide this when the new palette arrives.

---

## 5. Recommended token additions (for when the palette lands)

Add to `:root` + `@theme inline` in `globals.css`:

- `--positive` / `--positive-foreground` — income/success (currently emerald, inline everywhere)
- `--warning` / `--warning-foreground` — caution (currently amber, inline)
- A neutral scale for surfaces/text if the 4 existing slots can't absorb the slate ramp cleanly
- Keep `--chart-1..5`; ensure recharts components read them instead of hardcoded hex/classes

---

## 6. Migration effort & risk

- **Scale:** ~2,263 edits across 47 files. Not mechanical everywhere — `bg-slate-800` isn't always `card` (sometimes `muted`), so it needs per-use judgement, not blind find-replace.
- **Risk:** visual regressions across every page. Must verify in `npm run tauri:dev` (the real app path) across dashboard, monthly-budget, transactions, net-worth, settings, import, and auth screens.
- **Suggested sequencing (separate task/PR from this doc):**
  1. Add the new tokens (`--positive`, `--warning`, neutral scale) — no visible change.
  2. Migrate **one high-traffic file** end-to-end (e.g. `dashboard.tsx`) as a pattern reference; verify no regressions.
  3. Roll through the remaining files family-by-family (slate first, then semantics), verifying per page.
  4. Point `.glow-*` utilities and recharts series at tokens.
  5. Drop leftover boilerplate: `public/next.svg`, `public/vercel.svg` (and audit the other default SVGs) — unrelated to tokens but part of brand cleanup.
- **Estimate:** roughly a 1–2 day focused refactor once the new palette exists, given the per-use judgement and verification overhead.

---

## 7. Where assets land (when the artist delivers)

- **Colours:** update the HSL vars in `app/globals.css` `:root` (+ any new tokens in §5). One place.
- **Icons:** the artist delivers a single 1024×1024 master PNG (see `docs/branding-brief.md`). Regenerate the whole `src-tauri/icons/` set with `npm run tauri icon path/to/master.png` — this produces `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`, and the Windows Store `Square*` tiles in one step. `src-tauri/tauri.conf.json` `bundle.icon` already references the generated files. Update `app/favicon.ico` from the same master.
- **In-app logo/wordmark:** currently the placeholder in `components/layout/sidebar.tsx:44-50`; swap for the delivered mark/wordmark.
- **Illustrations (empty states/splash):** add under `public/` (after removing the Next.js boilerplate SVGs).

---

## 8. Follow-up task

The actual migration is **not** in scope for this documentation task. It should be filed as its own task (e.g. `tasks/theme-token-migration.md`) and scheduled after the artist's palette + logo are delivered, so the refactor and the new brand land together.
