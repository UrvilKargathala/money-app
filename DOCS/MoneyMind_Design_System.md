# MoneyMind Design System

**Version:** 1.0
**Date:** August 2026
**Platform:** Web-App (Next.js + React + Tailwind CSS + shadcn/ui + PostgreSQL/Supabase backend)
**Figma File:** [MoneyMind Design System](https://www.figma.com/design/MoJ6qwZKhvVJKs9dndyeun/Extra)

---

## 1. Design Principles

**Clarity over decoration.** Financial data is inherently complex. Every design decision should reduce cognitive load, not add to it. White space, clean typography, and restrained color usage let the numbers breathe.

**Trust through consistency.** A finance app earns trust through visual predictability. Components behave the same way everywhere. Colors mean the same thing in every context. Users should never have to relearn the interface.

**Data first.** Numbers, charts, and financial metrics are the primary content. The UI is a frame around the data, not a competing element. Typography for financial figures is deliberately distinct from body text.

**Personal and private.** MoneyMind is a hosted web app but the design should still feel personal, warm, and private — every user's data is isolated and encrypted, never mixed. The visual language is personal, not corporate SaaS.

---

## 2. Typography

MoneyMind uses a dual-font system. Each font has a clear, non-overlapping role.

### Font Families

| Font | Role | Rationale |
|------|------|-----------|
| **Plus Jakarta Sans** | Headings, labels, buttons, navigation, financial data/numbers | Geometric sans-serif with excellent number legibility. Distinct weight range (Medium through ExtraBold) creates clear visual hierarchy. Tabular figures read cleanly in financial tables. |
| **Questrial** | Body text, descriptions, helper text, captions | Humanist sans-serif with open letterforms. High readability at small sizes. Soft personality balances the structured feel of Jakarta Sans. Single weight (Regular) keeps body text uniform and scannable. |

### Type Scale

#### Headings -- Plus Jakarta Sans

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Display | ExtraBold | 48px | 120% | -2% | Hero sections, onboarding screens |
| H1 | Bold | 36px | 125% | -1.5% | Page titles (Dashboard, Transactions, Reports) |
| H2 | Bold | 30px | 130% | -1% | Section headers within a page |
| H3 | SemiBold | 24px | 135% | -0.5% | Card titles, module headers |
| H4 | SemiBold | 20px | 140% | 0% | Sub-section titles, widget headers |
| H5 | Medium | 18px | 140% | 0% | Tertiary headings, group labels |

#### Body -- Questrial

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Body/Large | Regular | 18px | 160% | 0% | Feature descriptions, onboarding text |
| Body/Default | Regular | 16px | 160% | 0% | Primary body text, transaction notes, descriptions |
| Body/Small | Regular | 14px | 155% | 0% | Secondary text, timestamps, metadata |

#### Labels / UI -- Plus Jakarta Sans

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Label/Large | Medium | 16px | 140% | 0% | Form labels, navigation items |
| Label/Default | Medium | 14px | 140% | 0.5% | Input labels, table headers, filter labels |
| Label/Small | Medium | 12px | 140% | 0.5% | Tag text, small labels, status text |

#### Data / Numbers -- Plus Jakarta Sans

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Data/Large | Bold | 32px | 120% | -1% | Primary dashboard KPIs (Total Balance, Net Worth) |
| Data/Default | SemiBold | 24px | 125% | -0.5% | Secondary metrics (monthly income, total debt) |
| Data/Small | SemiBold | 18px | 130% | 0% | Card-level figures (category spend, goal progress) |
| Data/Micro | Medium | 14px | 130% | 0% | Inline numbers, table cell values |

#### Captions -- Questrial

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Caption/Default | Regular | 12px | 150% | 0.5% | Helper text, footnotes, chart axis labels |
| Caption/Small | Regular | 11px | 145% | 0.5% | Timestamps, micro-metadata |

#### Button Text -- Plus Jakarta Sans

| Style Name | Weight | Size | Line Height | Letter Spacing | Usage |
|-----------|--------|------|-------------|---------------|-------|
| Button/Large | SemiBold | 16px | 100% | 0.5% | Primary CTAs, full-width buttons |
| Button/Default | SemiBold | 14px | 100% | 0.5% | Standard buttons |
| Button/Small | Medium | 12px | 100% | 0.5% | Compact buttons, inline actions |

### Typography Rules

- Never use Questrial for headings, numbers, or buttons. It has only Regular weight and lacks the visual authority needed for those roles.
- Never use Plus Jakarta Sans for long-form body text. Its geometric structure creates reading fatigue in paragraphs.
- Financial figures (amounts, percentages, balances) always use the Data styles, never body text styles. This creates instant visual distinction between "this is a number that matters" and "this is descriptive text."
- INR currency symbol (₹) always accompanies financial amounts. Format: `₹ 1,23,456` (Indian numbering system with commas after the first three digits, then every two).

---

## 3. Color System

### Color Palette

All colors are stored as Figma variables in the "Colors" collection. The system supports a Light theme by default. Dark theme values are documented below for implementation in Tailwind CSS.

#### Primary (Blue)

The primary palette conveys trust, stability, and financial confidence. Blue is the dominant brand color used for interactive elements, active states, and emphasis.

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Primary/50 | `#EFF6FF` | `#0C1929` | Subtle backgrounds, hover states, active nav bg |
| Primary/100 | `#DBEAFE` | `#1E3A5F` | Light tint backgrounds, selected row bg |
| Primary/200 | `#BFDBFE` | `#2563EB` | Secondary borders, tag backgrounds |
| Primary/300 | `#93C5FD` | `#3B82F6` | Focus rings, progress bar tracks |
| Primary/400 | `#60A5FA` | `#60A5FA` | Hover states on primary elements |
| Primary/500 | `#3B82F6` | `#93C5FD` | Primary buttons, links, active indicators, chart primary |
| Primary/600 | `#2563EB` | `#BFDBFE` | Primary button default, key interactive elements |
| Primary/700 | `#1D4ED8` | `#DBEAFE` | Primary button pressed state |

#### Neutral (Slate Gray)

Neutrals form the backbone of the UI -- backgrounds, text, borders, and dividers.

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Neutral/White | `#FFFFFF` | `#0F172A` | Page background, card background |
| Neutral/50 | `#F8FAFC` | `#1E293B` | App shell background, sidebar bg |
| Neutral/100 | `#F1F5F9` | `#1E293B` | Section backgrounds, table row alt |
| Neutral/200 | `#E2E8F0` | `#334155` | Borders, dividers, input borders |
| Neutral/300 | `#CBD5E1` | `#475569` | Disabled borders, subtle separators |
| Neutral/400 | `#94A3B8` | `#94A3B8` | Placeholder text, disabled text, icons |
| Neutral/500 | `#64748B` | `#94A3B8` | Secondary text, helper text |
| Neutral/600 | `#475569` | `#CBD5E1` | Body text (Questrial), secondary labels |
| Neutral/700 | `#334155` | `#E2E8F0` | Strong body text, form labels |
| Neutral/800 | `#1E293B` | `#F1F5F9` | Headings, primary text |
| Neutral/900 | `#0F172A` | `#F8FAFC` | Display text, highest contrast text |

#### Semantic Colors

Each semantic color has three values: Light (backgrounds), Default (icons/badges/fills), and Dark (text on light backgrounds).

**Success (Green) -- Positive financial events**

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Semantic/Success/Light | `#ECFDF5` | `#064E3B` | Success alert bg, income row bg |
| Semantic/Success/Default | `#10B981` | `#34D399` | Income amount text, positive trends, goal completed |
| Semantic/Success/Dark | `#065F46` | `#A7F3D0` | Success text on light background |

**Warning (Amber) -- Attention needed**

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Semantic/Warning/Light | `#FFFBEB` | `#78350F` | Warning alert bg, budget 80-100% bg |
| Semantic/Warning/Default | `#F59E0B` | `#FBBF24` | Warning icons, budget approaching limit |
| Semantic/Warning/Dark | `#92400E` | `#FDE68A` | Warning text on light background |

**Error (Red) -- Negative financial events**

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Semantic/Error/Light | `#FEF2F2` | `#7F1D1D` | Error alert bg, overspent budget bg |
| Semantic/Error/Default | `#EF4444` | `#F87171` | Expense amount text, overspent indicator, delete actions |
| Semantic/Error/Dark | `#991B1B` | `#FCA5A5` | Error text on light background |

**Info (Blue) -- Informational, neutral insights**

| Token | Hex (Light) | Hex (Dark) | Usage |
|-------|------------|------------|-------|
| Semantic/Info/Light | `#EFF6FF` | `#1E3A5F` | Info alert bg, tip backgrounds |
| Semantic/Info/Default | `#3B82F6` | `#60A5FA` | Info icons, links, AI insight indicators |
| Semantic/Info/Dark | `#1E40AF` | `#BFDBFE` | Info text on light background |

### Color Usage Rules

- Expense amounts are always `Semantic/Error/Default` (red).
- Income amounts are always `Semantic/Success/Default` (green).
- Transfer amounts use `Neutral/600` (gray) -- they are neutral events.
- Budget progress bars shift color based on utilization: 0-50% uses `Primary/500`, 50-80% uses `Semantic/Warning/Default`, 80-100% uses `Semantic/Error/Default`.
- Chart colors follow this sequence for multi-category visualizations: `Primary/500`, `#8B5CF6` (violet), `#EC4899` (pink), `Semantic/Warning/Default`, `Semantic/Success/Default`, `Primary/300`, then cycle with reduced opacity.
- Never use semantic colors for decoration. Green means income/success. Red means expense/error. Yellow means warning. Blue means informational. Breaking these associations confuses users.

---

## 4. Spacing System

The spacing scale follows a 4px base unit. All padding, margins, gaps, and layout spacing use values from this scale.

| Token | Value | CSS Variable | Common Usage |
|-------|-------|-------------|--------------|
| Spacing/0 | 0px | `--spacing-0` | No gap (collapsed elements) |
| Spacing/1 | 4px | `--spacing-1` | Tight inline gaps (icon + text in badges) |
| Spacing/2 | 8px | `--spacing-2` | Small gaps (between related small items) |
| Spacing/3 | 12px | `--spacing-3` | Default gap inside compact components |
| Spacing/4 | 16px | `--spacing-4` | Standard component padding, card item spacing |
| Spacing/5 | 20px | `--spacing-5` | Comfortable padding for inputs and buttons |
| Spacing/6 | 24px | `--spacing-6` | Card padding, section gaps within a card |
| Spacing/8 | 32px | `--spacing-8` | Gap between cards, section spacing |
| Spacing/10 | 40px | `--spacing-10` | Major section gaps within a page |
| Spacing/12 | 48px | `--spacing-12` | Page section separators |
| Spacing/16 | 64px | `--spacing-16` | Large layout gaps (sidebar to content) |
| Spacing/20 | 80px | `--spacing-20` | Page-level padding, major layout margins |

### Spacing Rules

- Card internal padding: `Spacing/6` (24px) on all sides.
- Gap between cards in a grid: `Spacing/6` (24px).
- Gap between items inside a card: `Spacing/4` (16px).
- Sidebar width: 280px with `Spacing/4` (16px) internal padding.
- Page content padding: `Spacing/8` (32px) on desktop.
- Transaction row vertical padding: 14px (between Spacing/3 and Spacing/4 -- component-specific override).
- Form field vertical spacing (between fields): `Spacing/5` (20px).

---

## 5. Border Radius

| Token | Value | CSS Variable | Usage |
|-------|-------|-------------|-------|
| Radius/none | 0px | `rounded-none` | Hard edges (dividers, table cells) |
| Radius/sm | 4px | `rounded-sm` | Small elements (badges, tags, icon containers) |
| Radius/md | 8px | `rounded-md` | Inputs, dropdowns, small cards |
| Radius/lg | 12px | `rounded-lg` | Cards, modals, larger containers |
| Radius/xl | 16px | `rounded-xl` | Dashboard cards, stat cards, prominent containers |
| Radius/2xl | 24px | `rounded-2xl` | Hero sections, feature highlights |
| Radius/full | 9999px | `rounded-full` | Avatars, circular icons, toggle knobs, pills |

### Radius Rules

- All cards use `Radius/xl` (16px).
- Buttons use `Radius/md+` (10px -- between md and lg, component-specific).
- Inputs use `Radius/md+` (10px).
- Badges use `Radius/sm+` (6px).
- Avatars and circular indicators use `Radius/full`.

---

## 6. Shadows

| Token | Value | Usage |
|-------|-------|-------|
| Shadow/sm | `0 1px 2px rgba(0, 0, 0, 0.04)` | Toggle knobs, small floating elements |
| Shadow/md | `0 2px 8px rgba(0, 0, 0, 0.04)` | Cards, stat cards, elevated containers |
| Shadow/lg | `0 4px 16px rgba(0, 0, 0, 0.06)` | Modals, dropdown menus, popovers |
| Shadow/xl | `0 8px 32px rgba(0, 0, 0, 0.08)` | Full-screen overlays, notification panels |

Shadows are deliberately subtle. This is a web-based application with a flat, clean aesthetic. Heavy shadows create visual noise that competes with financial data.

---

## 7. Components

All components are built in Figma on the "Components" page and correspond to shadcn/ui components in the codebase (customized with MoneyMind tokens).

### 7.1 Button

Variant-based component set with four options.

| Variant | Background | Text | Border | When to Use |
|---------|-----------|------|--------|-------------|
| Primary | `Primary/600` | `Neutral/White` | None | Primary actions (Save, Add Transaction, Create Budget) |
| Secondary | `Neutral/White` | `Primary/600` | `Primary/100` | Secondary actions (Cancel, Edit, View Details) |
| Ghost | `Neutral/White` | `Neutral/600` | `Neutral/200` | Tertiary actions (filters, toggles, less important actions) |
| Danger | `Semantic/Error/Default` | `Neutral/White` | None | Destructive actions (Delete, Remove, Clear) |

**Sizing:** Padding horizontal 20px, vertical 12px. Font: Button/Default (Plus Jakarta Sans SemiBold 14px). Corner radius: 10px.

**States (implement in code):**
- Default: As defined above.
- Hover: Primary darkens to `Primary/700`. Secondary gets `Primary/50` background. Ghost gets `Neutral/50` background.
- Active/Pressed: Slight scale reduction (0.98). Primary uses `Primary/700`. 
- Disabled: 50% opacity on the entire button. Cursor not-allowed.
- Focus: 2px `Primary/300` ring with 2px offset.

### 7.2 Input Field

Single component with label and helper text.

**Structure:** Vertical auto-layout (spacing 6px). Contains Label (Plus Jakarta Sans Medium 13px, Neutral/700), Input Box (horizontal auto-layout, padding 14px horizontal / 11px vertical, Neutral/White fill, Neutral/200 border, 10px radius), and Helper Text (Questrial Regular 12px, Neutral/400).

**States (implement in code):**
- Default: Neutral/200 border.
- Focus: Primary/500 border, Primary/100 ring.
- Error: Error/Default border, Error/Light background tint, helper text turns Error/Dark.
- Disabled: Neutral/100 background, Neutral/300 border, 60% opacity text.

### 7.3 Badge

Five semantic variants for status indication.

| Variant | Background | Text Color |
|---------|-----------|-----------|
| Success | `Semantic/Success/Light` | `Semantic/Success/Dark` |
| Warning | `Semantic/Warning/Light` | `Semantic/Warning/Dark` |
| Error | `Semantic/Error/Light` | `Semantic/Error/Dark` |
| Info | `Semantic/Info/Light` | `Semantic/Info/Dark` |
| Default | `Neutral/100` | `Neutral/600` |

**Sizing:** Padding 10px horizontal, 4px vertical. Font: Label/Small (Plus Jakarta Sans Medium 12px). Corner radius: 6px.

**Usage:** Transaction status (paid/pending/overdue), budget status (on track/warning/overspent), goal status, bill payment status, subscription status (active/paused/cancelled).

### 7.4 Card

Base container component used across all modules.

**Structure:** Vertical auto-layout. Padding: 24px all sides. Item spacing: 16px. Background: Neutral/White. Border: Neutral/100 (1px). Shadow: Shadow/md. Corner radius: 16px.

**Usage:** Dashboard widgets, transaction list containers, budget category cards, goal cards, debt cards, report sections, settings panels.

### 7.5 Stat Card

Dashboard KPI card showing a metric with trend indicator.

**Structure:** Vertical auto-layout (spacing 12px, padding 24px). Contains: metric label (Plus Jakarta Sans Medium 13px, Neutral/500), value (Plus Jakarta Sans Bold 28px, Neutral/900), and trend row (horizontal: dot indicator + trend text in Success or Error color).

**Usage:** Total Balance, Monthly Income, Monthly Expenses, Savings Rate, Net Worth, Total Debt, Budget Remaining. Each stat card occupies one cell in the dashboard grid.

### 7.6 Nav Item

Sidebar navigation with Active and Default states.

| State | Background | Text Color | Font Weight |
|-------|-----------|-----------|-------------|
| Active | `Primary/50` | `Primary/600` | SemiBold |
| Default | Transparent | `Neutral/600` | Medium |

**Structure:** Horizontal auto-layout (spacing 12px, padding 16px horizontal / 10px vertical). Fixed width 240px. Contains icon placeholder (20x20) and label text. Corner radius: 10px.

**Navigation items for MoneyMind:** Dashboard, Transactions, Budgets, Bills & Subscriptions, Savings & Goals, Debt & Loans, Tax Planning, Investments, Net Worth, Reports, Settings. The AI Chat (Phase 4) appears as a floating button, not in the sidebar.

### 7.7 Progress Bar

Budget and goal progress visualization.

**Structure:** Vertical auto-layout (spacing 8px). Contains: header row (label + percentage, space-between), track (full width, 8px height, Primary/50 background, 4px radius) with fill bar inside, and footer row (spent amount + budget/goal amount).

**Color logic (implement in code):**
- 0-50% utilization: Fill uses `Primary/500`.
- 50-80%: Fill uses `Semantic/Warning/Default`.
- 80-100%: Fill uses `Semantic/Error/Default`.
- 100%+: Fill uses `Semantic/Error/Default`, entire component gets `Semantic/Error/Light` background tint.

### 7.8 Transaction Row

Individual transaction display for list views.

**Structure:** Horizontal auto-layout (spacing 12px, padding 16px horizontal / 14px vertical). Contains: icon container (40x40, Primary/50 background, 10px radius, centered icon placeholder), details column (vertical: merchant name in Label/Default + category/date in Caption/Default), and amount (Data/Micro weight, right-aligned).

**Amount color logic:**
- Expense: `Semantic/Error/Default` with "- ₹" prefix.
- Income: `Semantic/Success/Default` with "+ ₹" prefix.
- Transfer: `Neutral/600` with "₹" prefix (no sign).

### 7.9 Alert

Notification and insight component with four semantic variants.

| Variant | Accent Bar | Background | Title Color |
|---------|-----------|-----------|-------------|
| Info | `Semantic/Info/Default` | `Semantic/Info/Light` | `Semantic/Info/Dark` |
| Success | `Semantic/Success/Default` | `Semantic/Success/Light` | `Semantic/Success/Dark` |
| Warning | `Semantic/Warning/Default` | `Semantic/Warning/Light` | `Semantic/Warning/Dark` |
| Error | `Semantic/Error/Default` | `Semantic/Error/Light` | `Semantic/Error/Dark` |

**Structure:** Horizontal auto-layout (spacing 12px, padding 16px horizontal / 14px vertical, 12px radius). Contains: accent bar (3px wide, 40px tall, 2px radius), and content column (vertical: title in Label/Default weight SemiBold + description in Body/Small Questrial, Neutral/600 color).

**Usage:** Budget overspend warnings, bill due reminders, goal milestone celebrations, AI insights, subscription renewal alerts, low balance warnings, unusual spending alerts.

### 7.10 Toggle

Binary switch for settings and preferences.

| State | Background | Knob Position |
|-------|-----------|--------------|
| On | `Primary/600` | Right |
| Off | `Neutral/300` | Left |

**Structure:** 44x24px container, full radius. Knob: 20x20 white circle with Shadow/sm. Padding 2px.

**Usage:** Enable/disable notifications per type, toggle AI features on/off, theme switching, export preferences.

---

## 8. Layout Patterns

### App Shell

```
┌─────────────────────────────────────────────────┐
│  App Header (64px height)                       │
│  [Logo]            [Search]    [Notif] [Export]  │
├──────────┬──────────────────────────────────────│
│          │                                      │
│ Sidebar  │  Main Content Area                   │
│ (280px)  │  (padding: 32px)                     │
│          │                                      │
│ Nav Items│  ┌──────────────────────────────┐     │
│          │  │ Page Title (H1)              │     │
│          │  ├──────────────────────────────┤     │
│          │  │ Stat Cards Row (grid)        │     │
│          │  ├──────────────────────────────┤     │
│          │  │ Main Content Cards           │     │
│          │  └──────────────────────────────┘     │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### Dashboard Grid

Stat cards display in a responsive grid. Desktop: 4 columns. At narrow widths: 2 columns. Each card has equal width and fixed internal structure.

### Module Page Pattern

Every module page follows the same structure:

1. Page title (H1) + optional subtitle/description (Body/Default)
2. Action bar (filters, date range, add button)
3. Summary stats row (Stat Cards, 2-4 depending on module)
4. Primary content area (transaction list, budget cards, goal cards, etc.)
5. Secondary content (charts, reports, related insights)

---

## 9. Tailwind CSS Configuration

```javascript
// tailwind.config.js (relevant extensions)
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"Questrial"', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        neutral: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        success: {
          light: '#ECFDF5',
          DEFAULT: '#10B981',
          dark: '#065F46',
        },
        warning: {
          light: '#FFFBEB',
          DEFAULT: '#F59E0B',
          dark: '#92400E',
        },
        error: {
          light: '#FEF2F2',
          DEFAULT: '#EF4444',
          dark: '#991B1B',
        },
        info: {
          light: '#EFF6FF',
          DEFAULT: '#3B82F6',
          dark: '#1E40AF',
        },
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '24px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'md': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'lg': '0 4px 16px rgba(0, 0, 0, 0.06)',
        'xl': '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
    },
  },
};
```

### CSS Font Import

```css
/* Import in globals.css or layout */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');
```

---

## 10. Figma Variable Collections Summary

| Collection | Variable Count | Type |
|-----------|---------------|------|
| Colors | 31 | COLOR |
| Spacing | 12 | FLOAT |
| Radius | 7 | FLOAT |

**Total variables:** 50
**Total text styles:** 21

---

## 11. Component Inventory

| Component | Type | Variants | Figma Page |
|-----------|------|----------|-----------|
| Button | Component Set | Primary, Secondary, Ghost, Danger | Components |
| Input Field | Component | Single | Components |
| Badge | Component Set | Success, Warning, Error, Info, Default | Components |
| Card | Component | Single (base container) | Components |
| Stat Card | Component | Single (with trend) | Components |
| Nav Item | Component Set | Active, Default | Components |
| Progress Bar | Component | Single (color logic in code) | Components |
| Transaction Row | Component | Single (amount color in code) | Components |
| Alert | Component Set | Info, Success, Warning, Error | Components |
| Toggle | Component Set | On, Off | Components |

**Total components:** 10 (with 20 variants across component sets)

---

## 12. Accessibility Guidelines

- All text meets WCAG 2.1 AA contrast ratios (4.5:1 for body text, 3:1 for large text).
- Neutral/900 on Neutral/White: 15.4:1 (passes AAA).
- Primary/600 on Neutral/White: 4.6:1 (passes AA).
- Error/Default on Neutral/White: 4.0:1 (passes AA for large text; use Error/Dark for small text).
- Focus states use a visible 2px ring in Primary/300 with 2px offset.
- Interactive elements have minimum 44x44px touch/click targets.
- Color is never the sole indicator of state. Badges use text labels alongside color. Progress bars show percentage numbers alongside the fill.

---

*MoneyMind Design System v1.0 -- August 2026*
*Figma: Plus Jakarta Sans + Questrial -- Web-App (Next.js + PostgreSQL hosted on Supabase, future AWS RDS)*
