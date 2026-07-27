import { z } from 'zod/v4'

export const DecisionSchema = z.enum(['Allow', 'Prompt', 'Forbidden'])

export type Decision = z.infer<typeof DecisionSchema>

export const ExecPolicyRuleSchema = z.object({
  type: z.enum(['prefix', 'exact', 'regex']),
  value: z.union([z.string(), z.array(z.string())]),
  decision: DecisionSchema,
  justification: z.string().optional(),
})

export type ExecPolicyRule = z.infer<typeof ExecPolicyRuleSchema>

export const NetworkRuleSchema = z.object({
  domain: z.string().min(1),
  protocol: z.enum(['https', 'http', 'tcp', 'all']),
  decision: z.enum(['Allow', 'Deny']),
})

export type NetworkRule = z.infer<typeof NetworkRuleSchema>

export const ExecApprovalRequirementSchema = z.enum(['Skip', 'NeedsApproval', 'Forbidden'])

export type ExecApprovalRequirement = z.infer<typeof ExecApprovalRequirementSchema>

export const ExecPolicyConfigSchema = z.object({
  rules: z.array(ExecPolicyRuleSchema).optional().default([]),
  networkRules: z.array(NetworkRuleSchema).optional().default([]),
  allowedHosts: z.array(z.string()).optional().default([]),
})

export type ExecPolicyConfig = z.infer<typeof ExecPolicyConfigSchema>
