/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-unified-observability — Task 1.1: Zod schema for event store records.
 */

import { z } from 'zod/v4'

export const EventRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  subjectRef: z.object({
    kind: z.string().min(1),
    id: z.string().min(1),
  }),
  payload: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().min(1),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
})

export type EventRecord = z.infer<typeof EventRecordSchema>
