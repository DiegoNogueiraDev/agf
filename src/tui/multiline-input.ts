/*!
 * multiline-input — pure helpers for Ctrl-J newline insertion.
 *
 * WHY: ink-text-input fires onSubmit on Enter. Ctrl-J lets users compose
 * multi-line prompts without triggering submission. Fully pure — no Ink
 * imports so this is trivially testable.
 *
 * Composes with: command-bar.tsx (useInput intercepts Ctrl-J),
 * interactive-app.tsx (onChange handler).
 */

/** Minimal key descriptor compatible with Ink's useInput key object. */
export interface KeyHint {
  ctrl?: boolean
  [key: string]: unknown
}

/** Returns true when the key combination is Ctrl-J (newline insert). */
export function isCtrlJ(input: string, key: KeyHint): boolean {
  return key.ctrl === true && input === 'j'
}

/** Returns the current input value with a newline appended. */
export function applyCtrlJ(value: string): string {
  return value + '\n'
}
