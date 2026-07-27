/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { GraphNodeSchema } from './node.schema.js'
import { GraphEdgeSchema } from './edge.schema.js'

const ID_MAX = 100
const NAME_MAX = 500
const PATH_MAX = 2000
const ARRAY_MAX = 100_000

export const GraphIndexesSchema = z.object({
  byId: z.record(z.string().max(ID_MAX), z.number()),
  childrenByParent: z.record(z.string().max(ID_MAX), z.array(z.string().max(ID_MAX)).max(ARRAY_MAX)),
  incomingByNode: z.record(z.string().max(ID_MAX), z.array(z.string().max(ID_MAX)).max(ARRAY_MAX)),
  outgoingByNode: z.record(z.string().max(ID_MAX), z.array(z.string().max(ID_MAX)).max(ARRAY_MAX)),
})

export const GraphProjectSchema = z.object({
  id: z.string().max(ID_MAX),
  name: z.string().max(NAME_MAX),
  fsPath: z.string().max(PATH_MAX).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const GraphMetaSchema = z.object({
  sourceFiles: z.array(z.string().max(PATH_MAX)).max(ARRAY_MAX),
  lastImport: z.string().nullable(),
})

export const GraphDocumentSchema = z.object({
  version: z.string().max(ID_MAX),
  project: GraphProjectSchema,
  nodes: z.array(GraphNodeSchema).max(ARRAY_MAX),
  edges: z.array(GraphEdgeSchema).max(ARRAY_MAX),
  indexes: GraphIndexesSchema,
  meta: GraphMetaSchema,
})
