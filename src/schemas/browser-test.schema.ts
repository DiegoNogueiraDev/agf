/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-browser-harness — Task 4.1: Zod schema for browser_test nodes.
 */

import { z } from 'zod/v4'

const EvidenceSchema = z.object({
  selector: z.string().min(1),
  action: z.string().min(1),
  screenshot: z.string().optional(),
})

export const BrowserTestNodeSchema = z.object({
  runId: z.string().min(1),
  targetUrl: z.string().min(1),
  featureNodeId: z.string().min(1),
  adrNodeId: z.string().optional(),
  unitTestPath: z.string().optional(),
  status: z.enum(['running', 'pass', 'fail', 'broken']),
  evidences: z.array(EvidenceSchema),
  pathTaken: z.array(z.string()),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
})

export type BrowserTestNode = z.infer<typeof BrowserTestNodeSchema>
