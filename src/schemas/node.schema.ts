/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const NodeTypeSchema = z.enum([
  'epic',
  'task',
  'subtask',
  'bug',
  'requirement',
  'constraint',
  'milestone',
  'acceptance_criteria',
  'risk',
  'decision',
  // Game-specific / advanced node types
  'interface',
  'formula',
  'state_machine',
  'contract',
  'scenario',
  'performance_budget',
  'asset',
  'data_table',
  'metric',
  'config_schema',
  // Spec-driven development types
  'constitution',
  // Journey execution
  'journey_run',
  // Browser harness execution nodes
  'browser_test',
])

export const NodeStatusSchema = z.enum(['backlog', 'ready', 'in_progress', 'blocked', 'done'])

export const XpSizeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL'])

export const PrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])

export const SourceRefSchema = z.object({
  file: z.string(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const GraphNodeSchema = z.object({
  id: z.string().max(100),
  type: NodeTypeSchema,
  title: z.string().max(500),
  description: z.string().max(10000).optional(),
  status: NodeStatusSchema,
  priority: PrioritySchema,
  xpSize: XpSizeSchema.optional(),
  estimateMinutes: z.number().min(0).max(100000).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  parentId: z.string().max(100).nullable().optional(),
  sprint: z.string().max(200).nullable().optional(),
  sourceRef: SourceRefSchema.optional(),
  acceptanceCriteria: z.array(z.string().max(2000)).max(50).optional(),
  testFiles: z.array(z.string().max(500)).max(50).optional(),
  implementationFiles: z.array(z.string().max(500)).max(50).optional(),
  blocked: z.boolean().default(false),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
