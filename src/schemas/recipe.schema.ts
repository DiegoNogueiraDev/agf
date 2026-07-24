/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-playwright-determinism — recipe.json Zod schema (Task 1.1)
 *
 * Neutral step representation. Source-of-truth for run materialization.
 * Can generate Playwright, Cypress, or puppeteer-core from the same recipe.
 *
 * Evidence fields are required on every step — gate for Phase 2 of the PRD.
 */

import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// Assertion shape (assert_after)
// ---------------------------------------------------------------------------

export const AssertionSchema = z.object({
  type: z.enum(['visible', 'hidden', 'text', 'url', 'count']),
  selector: z.string().min(1).optional(),
  value: z.string().optional(),
})
export type Assertion = z.infer<typeof AssertionSchema>

// ---------------------------------------------------------------------------
// Step kinds
// ---------------------------------------------------------------------------

const StepBase = z.object({
  /** Selector (CSS/XPath) to target an element. */
  selector: z.string().min(1).optional(),
  /** Absolute page coordinates as alternative to selector. */
  coords: z.object({ x: z.number(), y: z.number() }).optional(),
  /** Arbitrary step payload (URL, typed text, value, etc.). */
  payload: z.string().optional(),
  /** Screenshot or DOM snapshot taken before the action. Required. */
  evidence_before: z.string().min(1),
  /** Screenshot or DOM snapshot taken after the action. Required. */
  evidence_after: z.string().min(1),
  /** Optional assertion to run after the step completes. */
  assert_after: AssertionSchema.optional(),
})

export const RecipeStepSchema = z.discriminatedUnion('kind', [
  StepBase.extend({ kind: z.literal('navigate') }),
  StepBase.extend({ kind: z.literal('click') }),
  StepBase.extend({ kind: z.literal('type') }),
  StepBase.extend({ kind: z.literal('scroll') }),
  StepBase.extend({ kind: z.literal('wait') }),
  StepBase.extend({ kind: z.literal('assert') }),
  StepBase.extend({ kind: z.literal('screenshot') }),
])

export type RecipeStep = z.infer<typeof RecipeStepSchema>

// ---------------------------------------------------------------------------
// Recipe (top-level)
// ---------------------------------------------------------------------------

export const RecipeSchema = z.object({
  /** Unique run identifier that produced this recipe. */
  runId: z.string().min(1),
  /** Unix timestamp (ms) when the recipe was created. */
  createdAt: z.number().int().nonnegative(),
  /** Ordered list of steps; must contain at least one. */
  steps: z.array(RecipeStepSchema).min(1),
  /** Optional metadata for traceability. */
  meta: z.record(z.string(), z.unknown()).optional(),
})

export type Recipe = z.infer<typeof RecipeSchema>
