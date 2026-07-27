/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

/**
 * Siebel CRM object type classification.
 * Covers all major repository object types from Siebel 15 (IP 2015).
 */
export const SiebelObjectTypeSchema = z.enum([
  'applet',
  'business_component',
  'business_object',
  'view',
  'screen',
  'workflow',
  'integration_object',
  'business_service',
  'escript',
  'web_template',
  'pick_list',
  'table',
  'column',
  'field',
  'link',
  'control',
  'list_column',
  'menu_item',
  'project',
  'user_property',
  'web_template_item',
  'application',
])

/**
 * Siebel environment type.
 */
export const SiebelEnvironmentTypeSchema = z.enum(['dev', 'test', 'staging', 'prod'])

/**
 * Siebel environment configuration.
 */
export const SiebelEnvironmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  version: z.string().min(1),
  type: SiebelEnvironmentTypeSchema,
  composerUrl: z.string().url().optional(),
  restApiUrl: z.string().url().optional(),
  credentials: z
    .object({
      username: z.string().optional(),
      passwordEnvVar: z.string().optional(),
    })
    .optional(),
})

/**
 * Siebel dependency relationship between objects.
 */
export const SiebelDependencyRelationSchema = z.enum([
  'uses',
  'references',
  'contains',
  'extends',
  'based_on',
  'linked_to',
  'parent_of',
  'runtime_depends_on',
])

/**
 * Reference to a Siebel object (name + type pair).
 */
export const SiebelObjectRefSchema = z.object({
  name: z.string().min(1),
  type: SiebelObjectTypeSchema,
})

/**
 * Dependency between two Siebel objects.
 */
export const SiebelDependencySchema = z.object({
  from: SiebelObjectRefSchema,
  to: SiebelObjectRefSchema,
  relationType: SiebelDependencyRelationSchema,
  inferred: z.boolean().optional(),
})

/**
 * Property of a Siebel repository object.
 */
export const SiebelPropertySchema = z.object({
  name: z.string(),
  value: z.string(),
})

/**
 * A Siebel repository object extracted from a SIF file.
 */
export const SiebelObjectSchema: z.ZodType<SiebelObject> = z.object({
  name: z.string().min(1),
  type: SiebelObjectTypeSchema,
  project: z.string().optional(),
  properties: z.array(SiebelPropertySchema),
  children: z.lazy(() => z.array(SiebelObjectSchema)),
  parentName: z.string().optional(),
  inactive: z.boolean().optional(),
})

/**
 * Metadata from a parsed SIF file.
 */
export const SiebelSifMetadataSchema = z.object({
  fileName: z.string(),
  repositoryName: z.string().optional(),
  projectName: z.string().optional(),
  objectCount: z.number().int().min(0),
  objectTypes: z.array(SiebelObjectTypeSchema),
  extractedAt: z.string(),
  sourceEnv: z.string().optional(),
})

/**
 * Complete result of parsing a SIF file.
 */
export const SiebelSifParseResultSchema = z.object({
  metadata: SiebelSifMetadataSchema,
  objects: z.array(SiebelObjectSchema),
  dependencies: z.array(SiebelDependencySchema),
})

/**
 * Siebel Composer action types.
 */
export const SiebelComposerActionSchema = z.enum([
  'navigate',
  'edit_field',
  'toggle_readonly',
  'publish',
  'import_sif',
  'export_sif',
  'capture_state',
])

/**
 * Result of a Siebel Composer automation action.
 */
export const SiebelComposerResultSchema = z.object({
  action: SiebelComposerActionSchema,
  success: z.boolean(),
  message: z.string().optional(),
  capturedContent: z.string().optional(),
  screenshotPath: z.string().optional(),
  timestamp: z.string(),
})

/**
 * Impact analysis result for a Siebel object.
 */
export const SiebelImpactResultSchema = z.object({
  targetObject: SiebelObjectRefSchema,
  directDependents: z.array(SiebelObjectRefSchema),
  transitiveDependents: z.array(SiebelObjectRefSchema),
  totalAffected: z.number().int().min(0),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
})

/**
 * Subset of Siebel object types that can be generated as SIF templates.
 */
export const SifTemplateTypeSchema = z.enum([
  'applet',
  'business_component',
  'business_object',
  'view',
  'screen',
  'workflow',
  'business_service',
  'integration_object',
])

/**
 * Request to generate a new SIF file.
 */
export const SifGenerationRequestSchema = z.object({
  description: z.string().min(1),
  objectTypes: z.array(SiebelObjectTypeSchema).min(1),
  basedOnProject: z.string().optional(),
  properties: z.record(z.string(), z.string()).optional(),
})

/**
 * Validation message for a generated SIF.
 */
export const SifValidationMessageSchema = z.object({
  level: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  objectName: z.string().optional(),
})

/**
 * Validation result for a generated SIF.
 */
export const SifValidationResultSchema = z.object({
  status: z.enum(['valid', 'warnings', 'invalid']),
  messages: z.array(SifValidationMessageSchema),
  score: z.number().int().min(0).max(100),
})

/**
 * Result of SIF generation including content, objects, validation, and metadata.
 */
export const SifGenerationResultSchema = z.object({
  sifContent: z.string(),
  objects: z.array(SiebelObjectRefSchema),
  validation: SifValidationResultSchema,
  metadata: z.object({
    generatedAt: z.string(),
    requestDescription: z.string(),
    objectCount: z.number().int().min(0),
  }),
})

// ---- Inferred TypeScript types ----

export type SiebelObjectType = z.infer<typeof SiebelObjectTypeSchema>
export type SiebelEnvironmentType = z.infer<typeof SiebelEnvironmentTypeSchema>
export type SiebelEnvironment = z.infer<typeof SiebelEnvironmentSchema>
export type SiebelDependencyRelation = z.infer<typeof SiebelDependencyRelationSchema>
export type SiebelObjectRef = z.infer<typeof SiebelObjectRefSchema>
export type SiebelDependency = z.infer<typeof SiebelDependencySchema>
export type SiebelProperty = z.infer<typeof SiebelPropertySchema>

/** Recursive Siebel object type — defined manually due to lazy schema. */
export interface SiebelObject {
  name: string
  type: SiebelObjectType
  project?: string
  properties: SiebelProperty[]
  children: SiebelObject[]
  parentName?: string
  inactive?: boolean
}

export type SiebelSifMetadata = z.infer<typeof SiebelSifMetadataSchema>
export type SiebelSifParseResult = z.infer<typeof SiebelSifParseResultSchema>
export type SiebelComposerAction = z.infer<typeof SiebelComposerActionSchema>
export type SiebelComposerResult = z.infer<typeof SiebelComposerResultSchema>
export type SiebelImpactResult = z.infer<typeof SiebelImpactResultSchema>
export type SifTemplateType = z.infer<typeof SifTemplateTypeSchema>
export type SifGenerationRequest = z.infer<typeof SifGenerationRequestSchema>
export type SifValidationMessage = z.infer<typeof SifValidationMessageSchema>
export type SifValidationResult = z.infer<typeof SifValidationResultSchema>
export type SifGenerationResult = z.infer<typeof SifGenerationResultSchema>
