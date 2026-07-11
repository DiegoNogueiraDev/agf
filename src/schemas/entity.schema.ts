/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

// ── Entity Types ──────────────────────────────────────

export const EntityTypeSchema = z.enum([
  'concept',
  'technology',
  'pattern',
  'module',
  'api_endpoint',
  'function',
  'class',
  'file',
  'package',
  'domain_term',
  'config',
])

export const EntityRelationTypeSchema = z.enum([
  'uses',
  'implements',
  'depends_on',
  'related_to',
  'part_of',
  'alternative_to',
  'extends',
  'calls',
])

// ── Entity Schemas ────────────────────────────────────

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EntityTypeSchema,
  normalizedName: z.string(),
  aliases: z.array(z.string()),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  mentionCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const EntityRelationSchema = z.object({
  id: z.string(),
  fromEntityId: z.string(),
  toEntityId: z.string(),
  relationType: EntityRelationTypeSchema,
  weight: z.number().min(0).max(1),
  sourceDocId: z.string().nullable(),
  createdAt: z.string(),
})

export const EntityMentionSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  docId: z.string(),
  context: z.string().nullable(),
  position: z.number().int().min(0),
  createdAt: z.string(),
})

// ── Derived Types ─────────────────────────────────────

export type EntityType = z.infer<typeof EntityTypeSchema>
export type EntityRelationType = z.infer<typeof EntityRelationTypeSchema>
export type Entity = z.infer<typeof EntitySchema>
export type EntityRelation = z.infer<typeof EntityRelationSchema>
export type EntityMention = z.infer<typeof EntityMentionSchema>
