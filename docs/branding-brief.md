# Puffin — Branding & Design Brief

*A brief for a designer/illustrator. No code or repo access required. If anything here is unclear, the engineering contact can clarify.*

---

## 1. What Puffin is

**Puffin** (Personal Understanding & Forecasting of FINances) is a **local-first personal budgeting desktop app** for Windows. All financial data stays on the user's machine; an optional, encrypted Google Drive sync is the only cloud touchpoint. It's a calm, private, "your money, your machine" tool — not a flashy fintech growth product.

- **Platform:** Windows desktop app (built with Tauri). Also potentially macOS/Linux later.
- **Audience:** individuals managing personal budgets; privacy-conscious; comfortable installing a desktop app.
- **Status:** preparing for a **public open-source release**, so the brand needs to feel finished and trustworthy to strangers.
- **Personality:** trustworthy, calm, precise, a little friendly. Financial-grade seriousness, softened by the puffin character. Not corporate-cold, not playful-toy.

---

## 2. What we need

**The one thing we need is the logo.** Everything else (all the platform icon files, the colour palette, in-app placement) is handled on our side. Please don't spend time exporting icon formats or specifying colours unless you want to.

### The ask — two assets
The app currently ships **two mismatched placeholders**: an abstract cyan/yellow swirl as the OS icon, and a separate gradient "P" square in the sidebar. We want to replace *both* with **one** identity built around a **puffin** (the seabird — a natural fit for the name), plus a matching name treatment.

**1. Puffin logo (the mark)** — a puffin-based symbol. Clean geometric puffin, friendly mascot, or minimal icon — see personality above (trustworthy + a little friendly). Must **read clearly at small sizes** (it becomes a 16–32px app/taskbar icon). This one mark is used everywhere: taskbar, window, and sidebar.

| Deliverable | Format | Notes |
|-------------|--------|-------|
| **Logo master** (required) | **PNG, 1024×1024, transparent, square** | The single source we generate every app/OS icon from |
| Logo vector (**if possible**) | **SVG** (or AI/Figma) | Lets us use it crisply in-app and re-export anything later |

**2. Standalone wordmark** — the word **"Puffin"** as a styled text treatment (example to follow). It sits beside the logo in the sidebar. *Not* square — it's a wide asset, so we spec it by **height**:

| Deliverable | Format | Notes |
|-------------|--------|-------|
| **Wordmark** (required) | **PNG, 512px tall, width proportional, transparent** | ~1200–2000px wide depending on design. (Prefer a fixed canvas? Use **2048×512**, centered with padding.) |
| Wordmark vector (**if possible**) | **SVG** | If a specific font is used, convert text to outlines/paths, or name the font |
| Flat single-colour wordmark (nice-to-have) | PNG or SVG | Solid white/off-white version for tiny sizes / where a gradient won't render |

*Current wordmark is a cyan→blue gradient; open to your interpretation. It must read on a **dark** background.*

### Why these formats
- You do **not** need to produce Windows `.ico`, macOS `.icns`, or the many sized PNGs — we generate the entire platform icon set from your 1024×1024 logo with one command (`npm run tauri icon <master.png>`).
- **SVG is the prize, the PNG is the safety net:** if you supply SVGs, pixel sizes stop mattering (vector scales infinitely and stays crisp). The PNGs guarantee we can ship even without vectors.
- 512px is ~20× the wordmark's in-app display height (~24px), so it downscales razor-sharp with headroom to spare.

### Nice-to-have (only if you're interested — not required)
- **Colour suggestion:** we'll build the app's dark palette ourselves, likely drawing from the puffin's own colours (charcoal/black body, white, vivid orange beak). If you have a palette in mind, jot it down — but it's not a deliverable.
- **Illustrations:** empty-state or login/splash art featuring the puffin would be lovely later, but is well after the logo.

---

## 3. Colour roles (context only — handled in-house)

*You can skip this section — we build the palette. It's here so you understand how colour is used, in case it informs the logo.*

The app is built on a **semantic token system**: every colour maps to a *role*, not a raw swatch, and lives in one file. We'll derive dark-theme values for each role below (likely from the puffin's own colours). All we need from you is the logo.

| Role | Used for | Current value (HSL) | Current feel |
|------|----------|---------------------|--------------|
| `background` | app canvas | `222 84% 5%` | near-black navy |
| `card` / `popover` | panels, tiles, menus | `224 71% 7%` | slightly lighter navy |
| `foreground` | primary text | `210 40% 98%` | near-white |
| `muted` / `muted-foreground` | subtle surfaces, secondary text | `217 33% 12%` / `215 20% 65%` | grey-blue |
| `border` / `input` | dividers, field outlines | `217 33% 18%` | grey-blue |
| `primary` | main accent, buttons, links, focus ring | `187 85% 53%` | **cyan** |
| `secondary` / `accent` | secondary surfaces | `217 33% 18%` | grey-blue |
| `destructive` | delete, errors, negative amounts | `0 63% 50%` | red |
| **Financial semantics** (in-app convention) | | | |
| positive / income | positive amounts, success | emerald (~`160 70% 50%`) | green |
| negative / expense | negative amounts | red | red |
| warning | caution states | amber (~`35 90% 55%`) | amber |
| **Chart series** (5) | dashboard graphs, pie charts | cyan / emerald / amber / purple / pink | vibrant on dark |

**Constraints:**
- Must remain a **dark** scheme.
- Keep **all** the roles above (we can't drop, e.g., a distinct destructive or a 5-colour chart set).
- Chart series colours must be distinguishable from each other *and* from primary/destructive.
- Accent radius/rounding is currently `0.75rem` (soft, not sharp) — keep a soft, modern feel unless you propose otherwise.

---

## 4. In-app brand surfaces (where it shows up)

| Surface | Notes |
|---------|-------|
| **Sidebar header** | logo + "Puffin" wordmark, collapses to just the icon at narrow width |
| **Login / Setup screens** | "Enter your PIN to access Puffin" / "Welcome to Puffin" — prime spot for the mascot |
| **App icon / taskbar** | generated from your logo master |
| **Empty states** | e.g. no transactions yet, no budgets — puffin illustrations welcome (later) |
| **Loading / splash** | optional launch treatment (later) |
| **Dashboard tiles & charts** | governed by the palette we build in-house |

---

## 5. Hard constraints (please respect)

- The logo must be **legible at 16–32px** (it becomes the app/taskbar icon).
- **Transparent background**, square, delivered as a **1024×1024 PNG** (SVG vector strongly preferred on top).
- Works on a **dark** background (the app is dark-only).
- No need to match a specific colour — but be aware the app is dark, so a logo that only reads on white won't work.

---

## 6. Deliverables checklist

**Required:**
- [ ] Puffin logo master — **1024×1024 PNG, transparent, square**
- [ ] Standalone wordmark "Puffin" — **512px tall PNG (width proportional), transparent** (or 2048×512 canvas)

**Preferred (if possible):**
- [ ] Logo vector (SVG / AI / Figma)
- [ ] Wordmark vector (SVG — text outlined, or font named)
- [ ] Flat single-colour wordmark variant (white/off-white)

**Nice-to-have (later, not blocking):**
- [ ] A colour suggestion (we build the palette regardless)
- [ ] Login/splash treatment
- [ ] Empty-state illustrations
- [ ] A short usage note (clear space, min size, do/don't)

---

*Engineering note (not for the artist): everything here maps to the semantic token system documented in `docs/branding-tokens.md`. When assets arrive, they slot into `src-tauri/icons/`, `app/favicon.ico`, and the CSS variables in `app/globals.css`.*
