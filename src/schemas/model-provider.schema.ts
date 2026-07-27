import { z } from 'zod/v4'

export const ProviderCapabilitiesSchema = z.object({
  namespaceTools: z.boolean(),
  imageGeneration: z.boolean(),
  webSearch: z.boolean(),
})

export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>

export const WireApi = {
  Responses: 'Responses',
} as const

export type WireApi = (typeof WireApi)[keyof typeof WireApi]

export const WireApiSchema = z.enum(['Responses'])

export const AuthInfoSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()),
  timeoutMs: z.number().int().positive(),
  refreshIntervalMs: z.number().int().positive(),
  cwd: z.string(),
})

export type AuthInfo = z.infer<typeof AuthInfoSchema>

export const AwsAuthInfoSchema = z.object({
  profile: z.string().optional(),
  region: z.string().optional(),
})

export type AwsAuthInfo = z.infer<typeof AwsAuthInfoSchema>

export const ModelProviderInfoSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url().optional(),
  envKey: z.string().optional(),
  envKeyInstructions: z.string().optional(),
  auth: AuthInfoSchema.optional(),
  aws: AwsAuthInfoSchema.optional(),
  wireApi: WireApiSchema,
  queryParams: z.record(z.string(), z.string()).optional(),
  httpHeaders: z.record(z.string(), z.string()).optional(),
  requestMaxRetries: z.number().int().min(0).max(100).optional(),
  streamMaxRetries: z.number().int().min(0).max(100).optional(),
  streamIdleTimeoutMs: z.number().int().positive().optional(),
  requiresOpenaiAuth: z.boolean().optional(),
  supportsWebsockets: z.boolean().optional(),
  capabilities: ProviderCapabilitiesSchema,
})

export type ModelProviderInfo = z.infer<typeof ModelProviderInfoSchema>
