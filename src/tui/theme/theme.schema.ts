/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_75b845cd1994 — Semantic theme token shape (single typed source of color
 * truth for the TUI). Zod-validated so every boundary (user JSON, bundled default)
 * resolves to the same typed {@link Theme}. Token set mirrors the opencode palette
 * contract (CONTRACT node_3e23b3f0549d). Colors are hex or rgb(a) strings — the
 * `border` token in the source palette is an rgba value, so colors are not hex-only.
 */
import { z } from 'zod/v4'

/** A color token: hex (`#rgb`/`#rrggbb`/`#rrggbbaa`) or `rgb()`/`rgba()`. */
const colorToken = z.string().regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/, 'must be a hex or rgb(a) color string')

/** Syntax-highlighting tokens (opencode set). */
export const syntaxSchema = z.object({
  keyword: colorToken,
  string: colorToken,
  comment: colorToken,
  function: colorToken,
  variable: colorToken,
  number: colorToken,
})

/** The full semantic theme: UI tokens + nested syntax tokens. */
export const themeSchema = z.object({
  name: z.string().min(1),
  primary: colorToken,
  accent: colorToken,
  success: colorToken,
  warning: colorToken,
  error: colorToken,
  text: colorToken,
  textMuted: colorToken,
  background: colorToken,
  surface: colorToken,
  border: colorToken,
  syntax: syntaxSchema,
})

export type Theme = z.infer<typeof themeSchema>
