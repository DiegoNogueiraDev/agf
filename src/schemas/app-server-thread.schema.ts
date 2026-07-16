import { z } from 'zod/v4'

export const ThreadStatusSchema = z.union([
  z.literal('NotLoaded'),
  z.literal('Idle'),
  z.literal('SystemError'),
  z.object({ Active: z.object({ flags: z.array(z.string()).default([]) }) }),
])

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>

export const TurnStatusSchema = z.enum(['Starting', 'AwaitingInput', 'Running', 'Stopping', 'Stopped', 'Error'])

export type TurnStatus = z.infer<typeof TurnStatusSchema>

export const UserTextInputSchema = z.object({
  Text: z.string(),
})

export const UserImageInputSchema = z.object({
  Image: z.string(),
})

export const LocalImageInputSchema = z.object({
  LocalImage: z.string(),
})

export const SkillInputSchema = z.object({
  Skill: z.string(),
})

export const MentionInputSchema = z.object({
  Mention: z.string(),
})

export const UserInputSchema = z.union([
  UserTextInputSchema,
  UserImageInputSchema,
  LocalImageInputSchema,
  SkillInputSchema,
  MentionInputSchema,
])

export type UserInput = z.infer<typeof UserInputSchema>

export const GitInfoSchema = z.object({
  remote: z.string().optional(),
  branch: z.string().optional(),
  sha: z.string().optional(),
  isDirty: z.boolean().optional(),
})

export type GitInfo = z.infer<typeof GitInfoSchema>

export const UserMessageItemSchema = z.object({
  type: z.literal('UserMessage'),
  content: z.string(),
  userInput: UserInputSchema.optional(),
  timestamp: z.number().optional(),
})

export const AgentMessageItemSchema = z.object({
  type: z.literal('AgentMessage'),
  content: z.string(),
  model: z.string().optional(),
  timestamp: z.number().optional(),
})

export const PlanItemSchema = z.object({
  type: z.literal('Plan'),
  steps: z.array(z.string()),
  reasoning: z.string().optional(),
})

export const ReasoningItemSchema = z.object({
  type: z.literal('Reasoning'),
  content: z.string(),
  tokens: z.number().int().optional(),
})

export const CommandExecutionItemSchema = z.object({
  type: z.literal('CommandExecution'),
  command: z.string(),
  cwd: z.string().optional(),
  exitCode: z.number().int().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  durationMs: z.number().optional(),
})

export const FileChangeItemSchema = z.object({
  type: z.literal('FileChange'),
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete', 'rename']),
  diff: z.string().optional(),
})

export const McpToolCallItemSchema = z.object({
  type: z.literal('McpToolCall'),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  durationMs: z.number().optional(),
})

export const ToolUseItemSchema = z.object({
  type: z.literal('ToolUse'),
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
})

export const ToolResultItemSchema = z.object({
  type: z.literal('ToolResult'),
  toolUseId: z.string(),
  content: z.array(z.unknown()),
})

export const FileReadItemSchema = z.object({
  type: z.literal('FileRead'),
  filePath: z.string(),
  content: z.string(),
})

export const FileSearchItemSchema = z.object({
  type: z.literal('FileSearch'),
  pattern: z.string(),
  results: z.array(z.string()).optional(),
})

export const WebFetchItemSchema = z.object({
  type: z.literal('WebFetch'),
  url: z.string(),
  content: z.string().optional(),
  statusCode: z.number().int().optional(),
})

export const AgentSkillItemSchema = z.object({
  type: z.literal('AgentSkill'),
  skillName: z.string(),
  result: z.string().optional(),
})

export const DelegateItemSchema = z.object({
  type: z.literal('Delegate'),
  subAgentId: z.string(),
  task: z.string(),
  result: z.string().optional(),
})

export const ErrorItemSchema = z.object({
  type: z.literal('Error'),
  error: z.string(),
  code: z.string().optional(),
})

export const SystemInfoItemSchema = z.object({
  type: z.literal('SystemInfo'),
  message: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
})

export const ProgressItemSchema = z.object({
  type: z.literal('Progress'),
  current: z.number().int(),
  total: z.number().int(),
  label: z.string().optional(),
})

export const CheckpointItemSchema = z.object({
  type: z.literal('Checkpoint'),
  label: z.string(),
  snapshotId: z.string().optional(),
})

export const ThreadItemSchema = z.union([
  UserMessageItemSchema,
  AgentMessageItemSchema,
  PlanItemSchema,
  ReasoningItemSchema,
  CommandExecutionItemSchema,
  FileChangeItemSchema,
  McpToolCallItemSchema,
  ToolUseItemSchema,
  ToolResultItemSchema,
  FileReadItemSchema,
  FileSearchItemSchema,
  WebFetchItemSchema,
  AgentSkillItemSchema,
  DelegateItemSchema,
  ErrorItemSchema,
  SystemInfoItemSchema,
  ProgressItemSchema,
  CheckpointItemSchema,
])

export type ThreadItem = z.infer<typeof ThreadItemSchema>

export const TurnTimestampsSchema = z.object({
  startedAt: z.number(),
  firstTokenAt: z.number().optional(),
  completedAt: z.number().optional(),
})

export type TurnTimestamps = z.infer<typeof TurnTimestampsSchema>

export const TurnSchema = z.object({
  id: z.string(),
  items: z.array(ThreadItemSchema).default([]),
  status: TurnStatusSchema,
  error: z.string().optional(),
  timestamps: TurnTimestampsSchema.optional(),
})

export type Turn = z.infer<typeof TurnSchema>

export const ThreadSourceSchema = z.enum(['user', 'cli', 'api', 'web', 'extension'])

export type ThreadSource = z.infer<typeof ThreadSourceSchema>

export const ThreadSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: ThreadStatusSchema,
  cwd: z.string().optional(),
  modelProvider: z.string().optional(),
  source: ThreadSourceSchema.optional(),
  gitInfo: GitInfoSchema.optional(),
  turns: z.array(TurnSchema).default([]),
})

export type Thread = z.infer<typeof ThreadSchema>
