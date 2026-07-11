/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Browser-harness Zod schemas (v4). Single source of truth for harness types.
 */

import { z } from 'zod/v4'

export const HelperOriginSchema = z.enum(['builtin', 'agent'])
export type HelperOrigin = z.infer<typeof HelperOriginSchema>

export const HelperSignatureSchema = z.object({
  params: z.array(z.object({ name: z.string(), type: z.string() })),
  returns: z.string(),
})
export type HelperSignature = z.infer<typeof HelperSignatureSchema>

export const HelperRecordSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case identifier required'),
  version: z.number().int().positive(),
  source: z.string().min(1).max(8192),
  signature: HelperSignatureSchema,
  origin: HelperOriginSchema,
  createdAt: z.number().int().nonnegative(),
  createdBy: z.string().nullable(),
})
export type HelperRecord = z.infer<typeof HelperRecordSchema>

export const HarnessSessionStatusSchema = z.enum(['starting', 'ready', 'closed', 'error'])
export type HarnessSessionStatus = z.infer<typeof HarnessSessionStatusSchema>

export const HarnessSessionSchema = z.object({
  id: z.string(),
  cdpEndpoint: z.string().url(),
  pid: z.number().int().nullable(),
  status: HarnessSessionStatusSchema,
  startedAt: z.number().int(),
  closedAt: z.number().int().nullable(),
})
export type HarnessSession = z.infer<typeof HarnessSessionSchema>

export const HarnessAuditActionSchema = z.enum(['start', 'stop', 'call', 'add_helper', 'cdp_raw', 'safety_block'])
export type HarnessAuditAction = z.infer<typeof HarnessAuditActionSchema>

export const HarnessAuditRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  action: HarnessAuditActionSchema,
  payload: z.record(z.string(), z.unknown()),
  result: z.union([z.record(z.string(), z.unknown()), z.string(), z.null()]),
  at: z.number().int(),
})
export type HarnessAuditRecord = z.infer<typeof HarnessAuditRecordSchema>

export const PlannedStepSchema = z.object({
  index: z.number().int().nonnegative(),
  helper: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  expect: z.string().optional(),
})
export type PlannedStep = z.infer<typeof PlannedStepSchema>

export const StepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  helper: z.string(),
  ok: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  screenshotPath: z.string().nullable(),
  error: z.string().nullable(),
})
export type StepResult = z.infer<typeof StepResultSchema>

export const HarnessRunVerdictSchema = z.enum(['pass', 'fail', 'error'])
export type HarnessRunVerdict = z.infer<typeof HarnessRunVerdictSchema>

export const HarnessRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  nodeId: z.string().nullable(),
  prompt: z.string(),
  plan: z.array(PlannedStepSchema),
  results: z.array(StepResultSchema),
  verdict: HarnessRunVerdictSchema,
  durationMs: z.number().int().nonnegative(),
  createdAt: z.number().int(),
})
export type HarnessRun = z.infer<typeof HarnessRunSchema>

export const HarnessActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    cdpEndpoint: z.string().url().optional(),
    headless: z.boolean().optional(),
  }),
  z.object({ action: z.literal('stop'), sessionId: z.string() }),
  z.object({
    action: z.literal('call_helper'),
    sessionId: z.string(),
    name: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('list_helpers'),
    origin: HelperOriginSchema.optional(),
  }),
  z.object({
    action: z.literal('add_helper'),
    sessionId: z.string(),
    name: z.string(),
    source: z.string(),
    signature: HelperSignatureSchema.optional(),
  }),
  z.object({
    action: z.literal('cdp_raw'),
    sessionId: z.string(),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  }),
])
export type HarnessAction = z.infer<typeof HarnessActionSchema>

export const HarnessGuardrailSchema = z.object({
  allowedDomains: z.array(z.string()).default(['*']),
  forbiddenCdpMethods: z.array(z.string()).default([]),
  selfHealPolicy: z
    .object({
      requireTest: z.boolean().default(false),
      maxSourceBytes: z.number().int().positive().default(4096),
      forbiddenApis: z.array(z.string()).default(['fs', 'child_process', 'process.exit']),
    })
    .default({
      requireTest: false,
      maxSourceBytes: 4096,
      forbiddenApis: ['fs', 'child_process', 'process.exit'],
    }),
})
export type HarnessGuardrail = z.infer<typeof HarnessGuardrailSchema>
