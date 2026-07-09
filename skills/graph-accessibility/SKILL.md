---
name: graph-accessibility
description: Accessibility audit — WCAG 2.2 AA, ARIA validation, screen-reader and keyboard testing, color contrast, i18n readiness, focus management
triggers:
  - graph-accessibility
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-accessibility

WCAG 2.2 AA audit: ARIA, screen-reader/keyboard testing, contrast, i18n, focus management. Ensures UI is usable regardless of ability.

## When to Use

- Pre-DEPLOY for UI features
- Adding dashboard components
- VALIDATE phase for user-facing changes
- Quarterly a11y reviews / targeting WCAG compliance

## Mandatory Flow

```
WCAG checklist → ARIA → keyboard → contrast → screen reader → i18n → focus → report → agf memory write
```

## Workflow

### Step 1: WCAG 2.2 AA Checklist (POUR)

| Principle          | Check                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Perceivable**    | Images have `alt`, icons `aria-label`, decorative `alt=""`; video/audio captions; semantic HTML (`h1-h6`, `nav`, `main`, `aside`) |
| **Operable**       | Keyboard-only access; pause/stop on auto-advance; no flashing >3/sec                                                              |
| **Understandable** | `lang` declared, clear labels, consistent terms; predictable nav; form errors identified + label-associated                       |
| **Robust**         | Valid HTML, correct ARIA, works with assistive tech                                                                               |

Score each PASS/PARTIAL/FAIL; record failures.

### Step 2: ARIA Validation

| Element | Required ARIA                               | Common Mistake                    |
| ------- | ------------------------------------------- | --------------------------------- |
| Buttons | `role="button"` if not `<button>`           | clickable `<div>` no role         |
| Forms   | `aria-label` or `<label>`                   | missing input labels              |
| Modals  | `role="dialog"`, `aria-modal="true"`        | no `aria-labelledby`              |
| Tabs    | `role="tablist"/"tab"/"tabpanel"`           | missing `aria-selected`           |
| Nav     | `<nav>` or `role="navigation"`              | no `aria-label` for multiple navs |
| Images  | `alt` or `aria-hidden="true"` if decorative | empty alt on informative img      |

Verify landmarks (`banner`, `navigation`, `main`, `contentinfo`). Flag missing input labels, clickable `<div>` without `role`, images without `alt`, `aria-hidden` on interactive elements.

### Step 3: Keyboard Navigation

| Check             | Pass Criteria                                  |
| ----------------- | ---------------------------------------------- |
| Tab order         | logical top→bottom, left→right                 |
| Focus indicators  | visible high-contrast ring (no `outline:none`) |
| Skip link         | "Skip to content" present + functional         |
| No keyboard traps | always Tab out of any component                |
| Escape            | closes overlay, returns focus                  |
| Arrow keys        | navigate within tabs/menus/radio groups        |

Automate where possible (Playwright `browser_press_key`/`browser_snapshot`).

### Step 4: Color Contrast

| Element                          | Min Ratio |
| -------------------------------- | --------- |
| Normal text (<18pt)              | 4.5:1     |
| Large text (≥18pt or ≥14pt bold) | 3:1       |
| UI components / non-text         | 3:1       |

Info must not rely on color alone (errors use icon+color, charts use patterns, links underlined). Check dark mode. Tools: axe-core, Lighthouse.

### Step 5: Screen Reader Testing (VoiceOver / NVDA)

Verify: page title announced; heading hierarchy logical (no skipped levels); form labels read on focus; errors announced via `aria-live`; dynamic content announced (`aria-live="polite"/"assertive"`); tables use `<th scope>`; lists announced with count. Automate via Playwright accessibility tree snapshot.

### Step 6: i18n Readiness

| Check                                  | Why                                   |
| -------------------------------------- | ------------------------------------- |
| No hardcoded strings (extract to i18n) | translation needs extractable strings |
| RTL support (`dir="rtl"`)              | Arabic/Hebrew                         |
| Locale-aware date/number (`Intl.*`)    | US vs EU formats                      |
| No string concatenation                | word order varies                     |
| Handle 30% longer text                 | German expansion breaks layout        |
| Plural rules                           | not just "s" suffix                   |

### Step 7: Focus Management

| Scenario       | Expected                               |
| -------------- | -------------------------------------- |
| Modal opens    | focus → modal (first focusable/title)  |
| Modal closes   | focus → trigger                        |
| Form error     | focus → first error                    |
| Route change   | focus → new content/title              |
| Toast          | does NOT steal focus (use `aria-live`) |
| Dropdown opens | focus → first option                   |

### Step 8: Report

```bash
agf memory write accessibility-audit-<date>
```

Content: WCAG scores, ARIA compliance, keyboard, contrast, screen reader, i18n, focus.

## Output Format

```
Phase: ACCESSIBILITY AUDIT
WCAG: Perceivable/Operable/Understandable/Robust = PASS/PARTIAL/FAIL
ARIA: N%  Keyboard: N/10  Contrast: N%  Screen reader: N%  i18n: N%
Critical Issues: N  Focus: N/10  Overall: A-F
Saved: "Accessibility Audit — <date>"
```

> Loop link → DEPLOY: feed findings into `agf gate deploy` (harness ≥ 70).

## Anti-Patterns

- A11y is a legal requirement, not optional
- Don't rely on automated tools alone — manual testing catches 50%+
- No `aria-hidden` on interactive elements
- Don't remove focus outlines without a visible replacement
- Color must never be the only state indicator
- Don't skip screen reader testing or hardcode UI strings

## Codex Notes

- In Codex Plan Mode, plan only — don't mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
