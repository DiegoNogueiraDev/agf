/*!
 * ANSI fallback map for agf default theme.
 *
 * WHY: TrueColor (#rrggbb) tokens degrade on 16-color and 256-color terminals.
 * This map documents the nearest named ANSI color (or xterm-256 index) so the
 * TUI renderer can substitute without crashing on old terminals.
 *
 * Degradation strategy:
 *   TrueColor (16m) → use raw hex; modern terminals handle it.
 *   256-color       → use nearest xterm-256 index (see xterm color chart).
 *   16-color        → use the nearest ANSI name from the 8/16 palette.
 *
 * Contract: `toAnsiFallback(key)` returns a string safe for terminal output.
 * Never throws — missing keys return 'white' (safe default).
 */

/** Nearest ANSI 16-color name for each theme token. */
export const ANSI_FALLBACK_MAP = {
  primary: 'yellow', // #e7a44b → warm amber nearest: yellow
  accent: 'yellow', // #c9a468 → muted amber nearest: yellow
  success: 'green', // #86b86a → warm green nearest: green
  warning: 'red', // #d97a35 → orange nearest: red (no orange in 16-color)
  error: 'red', // #e08a5a → salmon-red nearest: red
  text: 'white', // #f0ead9 → off-white nearest: white
  textMuted: 'gray', // #cabfa6 → warm gray nearest: gray (bright black)
  background: 'black', // #3a3122 → dark brown nearest: black
  surface: 'black', // #0b0a07 → near-black nearest: black
  border: 'gray', // rgba amber → gray
} as const

export type AnsiKey = keyof typeof ANSI_FALLBACK_MAP

/**
 * Return the nearest ANSI 16-color name for a theme token.
 * Falls back to 'white' for unknown keys.
 */
export function toAnsiFallback(key: AnsiKey): string {
  return ANSI_FALLBACK_MAP[key] ?? 'white'
}
