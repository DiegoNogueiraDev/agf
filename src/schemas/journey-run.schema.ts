/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Journey-run Zod schemas (v4). Represents the execution of a JourneyMap
 * variant against a live browser via CDP, producing per-screen step results
 * with optional OCR complement.
 */

import { z } from 'zod/v4'

export const JourneyRunVerdictSchema = z.enum(['pass', 'fail', 'error', 'running'])
export type JourneyRunVerdict = z.infer<typeof JourneyRunVerdictSchema>

export const JourneyStepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  screenId: z.string().nullable(),
  helper: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  ok: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  screenshotPath: z.string().nullable(),
  ocrText: z.string().nullable(),
  domText: z.string().nullable(),
  error: z.string().nullable(),
})
export type JourneyStepResult = z.infer<typeof JourneyStepResultSchema>

export const JourneyPlannedStepSchema = z.object({
  index: z.number().int().nonnegative(),
  screenId: z.string().nullable(),
  helper: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
})
export type JourneyPlannedStep = z.infer<typeof JourneyPlannedStepSchema>

export const JourneyRunSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  variantId: z.string().nullable(),
  nodeId: z.string().nullable(),
  prompt: z.string().nullable(),
  plan: z.array(JourneyPlannedStepSchema),
  results: z.array(JourneyStepResultSchema),
  verdict: JourneyRunVerdictSchema,
  durationMs: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
})
export type JourneyRun = z.infer<typeof JourneyRunSchema>

export const JourneyRunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan'), steps: z.array(JourneyPlannedStepSchema) }),
  z.object({
    type: z.literal('step'),
    index: z.number().int().nonnegative(),
    screenId: z.string().nullable(),
    helper: z.string(),
    ok: z.boolean(),
    durationMs: z.number().int().nonnegative(),
    error: z.string().nullable(),
  }),
  z.object({
    type: z.literal('ocr'),
    index: z.number().int().nonnegative(),
    text: z.string(),
    confidence: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal('verdict'),
    verdict: JourneyRunVerdictSchema,
    ok: z.boolean(),
    runId: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('done'), runId: z.string() }),
  z.object({ type: z.literal('error'), error: z.string() }),
])
export type JourneyRunEvent = z.infer<typeof JourneyRunEventSchema>
