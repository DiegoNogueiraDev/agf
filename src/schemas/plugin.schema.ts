/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

const ID_MAX = 100
const SHORT_TEXT_MAX = 500
const LONG_TEXT_MAX = 10_000
const ARRAY_MAX = 100

export const PluginCapabilitySchema = z.enum([
  'analyzer',
  'validator',
  'template',
  'tool',
  'classifier_pattern',
  'knowledge_source',
  'event_handler',
])

export const PluginManifestSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(LONG_TEXT_MAX),
  author: z.string().max(SHORT_TEXT_MAX).optional(),
  repository: z.string().url().max(LONG_TEXT_MAX).optional(),
  entryPoint: z.string().max(LONG_TEXT_MAX),
  capabilities: z.array(PluginCapabilitySchema).min(1).max(ARRAY_MAX),
  requires: z
    .object({
      mcpGraphVersion: z.string().max(ID_MAX).optional(),
      plugins: z.array(z.string().max(ID_MAX)).max(ARRAY_MAX).optional(),
    })
    .optional(),
  conflicts: z.array(z.string().max(ID_MAX)).max(ARRAY_MAX).optional(),
  config: z.record(z.string().max(ID_MAX), z.unknown()).optional(),
  lifecycleHooks: z.array(z.string().max(ID_MAX)).max(ARRAY_MAX).optional(),
})

export type PluginCapability = z.infer<typeof PluginCapabilitySchema>
export type PluginManifest = z.infer<typeof PluginManifestSchema>
