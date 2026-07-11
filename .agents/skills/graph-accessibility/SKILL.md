---
name: graph-accessibility
description: Accessibility compliance audit using WCAG 2.2 AA standards, ARIA validation, screen reader testing, keyboard navigation, color contrast analysis, and i18n readiness
triggers:
  - graph-accessibility
version: 1.1.0
author: Diego Nogueira
date: 2026-06-21
---

# graph-accessibility

Accessibility compliance audit using WCAG 2.2 AA standards, ARIA validation, screen reader testing, keyboard navigation, color contrast analysis, and i18n readiness. Ensures UI components are usable by all users regardless of ability.

## When to Use

- Before DEPLOY phase for UI features
- When adding dashboard components
- During VALIDATE phase for user-facing changes
- Quarterly accessibility reviews
- When targeting WCAG compliance

## Mandatory Flow

```
WCAG 2.2 → ARIA → keyboard → contrast → screen reader → i18n → focus → report → write_memory
```

## Workflow

### Step 1: WCAG 2.2 AA Checklist

Audit against the 4 WCAG principles (POUR). Score each: PASS, PARTIAL, FAIL.

| Principle          | Key checks                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Perceivable**    | `alt` text on images; captions for video/audio; semantic HTML structure                   |
| **Operable**       | All functionality via keyboard; no seizure triggers; pause/stop on auto-advancing content |
| **Understandable** | `lang` attribute set; consistent navigation; form errors with suggestions                 |
| **Robust**         | Valid HTML; correct ARIA usage; works with assistive tech                                 |

#### WCAG 2.2 New Criteria (vs 2.1)

These 4 SCs are new in WCAG 2.2 and not covered by older audit templates:

| SC     | Name                         | Level | Test                                                                    |
| ------ | ---------------------------- | ----- | ----------------------------------------------------------------------- |
| 2.4.11 | Focus Appearance (minimum)   | AA    | Focus indicator has ≥2px perimeter, ≥3:1 contrast vs adjacent color     |
| 2.4.12 | Focus Not Obscured (minimum) | AA    | Focused component not fully hidden by sticky headers/footers            |
| 2.5.7  | Dragging Movements           | AA    | Every drag action has a single-pointer alternative (e.g. click-to-move) |
| 2.5.8  | Target Size (minimum)        | AA    | Interactive targets ≥24×24 CSS pixels (or adequate spacing)             |

> Check 2.4.12 explicitly when the layout has a sticky nav or fixed footer — focused items near the top/bottom of the viewport are the most common failure mode.

### Step 2: Automated vs Manual Split

Use this split to allocate review time. Automated tools catch ~35% of WCAG issues; the rest require human judgment.

**Automated (run axe or Lighthouse — no manual effort needed):**

- Missing `alt` on images
- Missing form `<label>` associations
- Color contrast violations
- Missing `lang` attribute
- Duplicate `id` attributes
- Invalid ARIA roles or attribute combinations

Run color contrast check specifically:

```bash
npx @axe-core/cli --rules color-contrast <url>
```

Run full axe audit:

```bash
npx @axe-core/cli <url>
```

**Manual only (automated tools cannot reliably detect these):**

- Logical focus order (Tab sequence makes sense in context)
- Screen reader announcement quality (label text is meaningful, not "button" or "click here")
- Keyboard trap absence (can always Tab out)
- Focus management on dynamic content (modals, route changes, toasts)
- Drag interaction alternatives (SC 2.5.7)
- Complex widget keyboard patterns (arrow keys in menus, tree views, date pickers)
- Reading order matches visual order for screen reader users

### Step 3: ARIA Validation

Verify ARIA landmarks present: `banner`, `navigation`, `main`, `contentinfo`.

| Element                  | Required ARIA                                           | Common mistake                 |
| ------------------------ | ------------------------------------------------------- | ------------------------------ |
| Buttons (non-`<button>`) | `role="button"`                                         | Clickable `<div>` without role |
| Modals                   | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` | Missing label association      |
| Tabs                     | `role="tablist"` + `tab` + `tabpanel`, `aria-selected`  | Missing selected state         |
| Multiple navs            | `aria-label` on each `<nav>`                            | Indistinguishable landmarks    |

Flag: `aria-hidden="true"` on any interactive element; images without `alt`.

### Step 4: Keyboard Navigation Checklist

Test these 8 interactions manually — tab through the page with a physical keyboard:

| #   | Interaction                          | Expected behavior                                                             |
| --- | ------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Tab through all interactive elements | Logical order: top-to-bottom, left-to-right                                   |
| 2   | Visible focus indicator              | High-contrast ring visible on every focused element (no `outline: none`)      |
| 3   | Skip link                            | First Tab lands on "Skip to content"; activating it moves focus to `<main>`   |
| 4   | Escape on modal/dropdown             | Closes overlay; focus returns to the element that opened it                   |
| 5   | Arrow keys in compound widgets       | Tab panels, menus, radio groups, listboxes use arrow key navigation           |
| 6   | Enter/Space on buttons               | Activates the action (not just mouse click)                                   |
| 7   | Focus trap in modals                 | Tab cycles within modal; cannot Tab to background content while modal is open |
| 8   | No keyboard trap outside modals      | Tab always moves forward; Shift+Tab always moves backward; no dead ends       |

Test with Playwright where possible. `agf` has no accessibility command — drive the browser directly and
bring the findings back into the graph:

```ts
// src/tests/e2e/<page>.a11y.spec.ts — a keyboard trap is a regression test, not a note
await page.keyboard.press('Tab')
await expect(page.locator(':focus')).toBeVisible()
```

### Step 5: Color Contrast

Check all text meets WCAG AA contrast ratios:

| Element                            | Minimum Ratio | How to Check                         |
| ---------------------------------- | ------------- | ------------------------------------ |
| Normal text (<18pt)                | 4.5:1         | Check foreground vs background color |
| Large text (>=18pt or >=14pt bold) | 3:1           | Check foreground vs background color |
| UI components                      | 3:1           | Borders, icons, focus indicators     |
| Non-text contrast                  | 3:1           | Charts, graphs, interactive elements |

Verify information is not conveyed by color alone:

- Error states use icons + color (not just red text)
- Chart data uses patterns + color (not just different colors)
- Links have underline or other non-color indicator

Check dark mode contrast if applicable.

### Step 6: Screen Reader Test Protocol

Minimum 5-step protocol. Run on VoiceOver (Mac) and NVDA (Windows):

| Step | VoiceOver (Mac)        | NVDA (Windows)         | What to verify                                |
| ---- | ---------------------- | ---------------------- | --------------------------------------------- |
| 1    | Cmd+F5; Safari         | Insert+Q; Firefox      | SR starts without errors                      |
| 2    | VO+A (read all)        | Insert+↓ (read all)    | Page title announced; heading order logical   |
| 3    | VO+U → Headings        | Insert+F7 → Headings   | All headings in order; none skipped           |
| 4    | Tab to each form field | Tab to each form field | Label announced before field type             |
| 5    | Trigger form error     | Trigger form error     | Error announced immediately (not on next Tab) |

Also verify: live regions announced without stealing focus; table headers with cell data; button labels are descriptive.

### Step 7: i18n Readiness

| Check                   | Pass Criteria                                 |
| ----------------------- | --------------------------------------------- |
| No hardcoded strings    | UI text in i18n files or constants            |
| Text direction          | RTL support via `dir="rtl"`                   |
| Date/number format      | `Intl.DateTimeFormat` / locale-aware APIs     |
| No string concatenation | i18n interpolation (word order varies)        |
| Content expansion       | Layout holds at 30% longer text (German)      |
| Pluralization           | Plural rules handled beyond simple "s" suffix |

### Step 8: Focus Management

| Scenario           | Expected Behavior                               |
| ------------------ | ----------------------------------------------- |
| Modal opens        | Focus → first focusable element or dialog title |
| Modal closes       | Focus → trigger element                         |
| Form error         | Focus → first error message                     |
| Route change       | Focus → new content or page title               |
| Toast/notification | Does NOT steal focus — use `aria-live`          |
| Dropdown open      | Focus → first option                            |

### Step 9: Accessibility Report

Generate comprehensive accessibility report:

```bash
agf memory write accessibility-audit-<date> \
  --content "<WCAG scores, ARIA compliance, keyboard, contrast, screen reader, i18n, focus management>"
```

Every WCAG failure at level A or AA is filed before it is fixed — otherwise the audit leaves no trace:

```bash
agf node add --title "A11Y: <criterion> falha em <page>" --type bug --tags "a11y,wcag" \
  --ac "<the assertion the Playwright spec will make>"
```

## Anti-Patterns

- Do NOT treat accessibility as optional — it is a legal requirement in many jurisdictions
- Do NOT rely only on automated tools — they catch ~35% of issues; manual testing is required
- Do NOT use `aria-hidden` on interactive elements
- Do NOT remove focus outlines without providing a visible replacement that meets SC 2.4.11
- Do NOT use color as the only indicator of state or meaning
- Do NOT skip screen reader testing — it reveals the real user experience
- Do NOT hardcode strings in UI components — they break i18n
- Do NOT skip WCAG 2.2 new criteria — SC 2.5.8 (target size) fails silently in automated audits

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.

Não precisa de flags. CLI gerencia compressão automaticamente com --ai ativo.
Consulte comandos com `agf retrieve-command "<intenção>"`.
Ver `_agf-rag.md` para detalhes.
