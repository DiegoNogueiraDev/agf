/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-hermes — E12-T1: Honcho integration schemas (Zod v4).
 */

import { z } from 'zod/v4'

export const HonchoConfigSchema = z.object({
  apiUrl: z.string().describe('Honcho API base URL'),
  dialecticDepth: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .describe('1=synthesis only, 2=audit+synthesis, 3=all three passes'),
  sessionResolution: z
    .enum(['per-directory', 'per-session', 'per-repo', 'global'])
    .describe('Session scoping strategy'),
  observationMode: z.enum(['directional', 'unified']).describe('Observation accumulation mode'),
})

export type HonchoConfig = z.infer<typeof HonchoConfigSchema>

export const UserRepresentationSchema = z.object({
  userId: z.string(),
  preferences: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().describe('ISO 8601 timestamp'),
  observations: z.array(z.string()).optional(),
})

export type UserRepresentation = z.infer<typeof UserRepresentationSchema>

export const PeerObservationSchema = z.object({
  observerId: z.string(),
  targetId: z.string(),
  observation: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  ts: z.string().describe('ISO 8601 timestamp'),
})

export type PeerObservation = z.infer<typeof PeerObservationSchema>
