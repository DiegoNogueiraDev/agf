import { z } from 'zod/v4'

export const PromptSlotSchema = z.enum([
  'DeveloperPolicy',
  'DeveloperCapabilities',
  'ContextualUser',
  'SeparateDeveloper',
])

export type PromptSlot = z.infer<typeof PromptSlotSchema>

export const PromptFragmentSchema = z.object({
  slot: PromptSlotSchema,
  text: z.string(),
  priority: z.number().int().min(0).max(100).default(50),
})

export type PromptFragment = z.infer<typeof PromptFragmentSchema>

export interface ConfigContributor<TConfig = Record<string, unknown>> {
  onConfigChanged(prev: TConfig, next: TConfig): void
}

export interface ContextContributor {
  contribute(): PromptFragment[]
}

export interface ToolExecutor {
  name: string
  execute(args: Record<string, unknown>): Promise<unknown>
}

export interface ToolContributor {
  tools(): ToolExecutor[]
}

export interface ToolLifecycleContributor {
  onToolStart(toolName: string, args: Record<string, unknown>): void
  onToolFinish(toolName: string, result: unknown): void
}

export interface TurnLifecycleContributor {
  onTurnStart(): void
  onTurnStop(): void
  onTurnAbort(error: Error): void
  onTurnError(error: Error): void
}

export interface ThreadLifecycleContributor {
  onThreadStart(): void
  onThreadResume(): void
  onThreadIdle(): void
  onThreadStop(): void
}

export interface ContextualFragment {
  slot: PromptSlot
  text: string
  priority: number
}

export interface TurnInputContributor {
  contribute(input: string): ContextualFragment[]
}

export enum ReviewDecision {
  Allow = 'allow',
  Deny = 'deny',
  AskUser = 'ask_user',
}

export interface ApprovalReviewContributor {
  contribute(prompt: string): ReviewDecision | undefined
}

export interface TurnItem {
  role: 'user' | 'assistant' | 'tool'
  content: string
  metadata?: Record<string, unknown>
}

export interface TurnItemContributor {
  contribute(item: TurnItem): void
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  cacheCreationTokens?: number
}

export interface TokenUsageContributor {
  onTokenUsage(usage: TokenUsage): void
}
