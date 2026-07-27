import { z } from 'zod/v4'

export const ApprovalPolicySchema = z.enum(['Never', 'OnFailure', 'OnRequest', 'UnlessTrusted', 'Granular'])

export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>

export const CodeModeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  systemPromptTemplate: z.string().min(1),
  allowedTools: z.array(z.string()).min(0),
  approvalPolicy: ApprovalPolicySchema,
})

export type CodeMode = z.infer<typeof CodeModeSchema>

export const builtInCodeModes: Record<string, CodeMode> = {
  'pair-programming': {
    id: 'pair-programming',
    name: 'Pair Programming',
    description: 'Sugere alternativas, explica raciocínio, colabora ativamente',
    systemPromptTemplate:
      'You are in pair-programming mode with {{user}}. Think aloud, suggest alternatives, and explain your reasoning. Use {{model}}.',
    allowedTools: ['bash', 'read', 'write', 'search', 'grep', 'edit'],
    approvalPolicy: 'OnRequest',
  },
  'code-review': {
    id: 'code-review',
    name: 'Code Review',
    description: 'Foco em qualidade, segurança, antipadrões',
    systemPromptTemplate:
      'You are reviewing code for {{user}}. Focus on quality, security, and best practices. Identify antipatterns and suggest improvements. Read-only.',
    allowedTools: ['read', 'search', 'grep'],
    approvalPolicy: 'OnRequest',
  },
  'plan-only': {
    id: 'plan-only',
    name: 'Plan Only',
    description: 'Apenas análise e planejamento, sem edição de arquivos',
    systemPromptTemplate:
      'You are in planning mode. Analyze the problem, propose solutions, and create a plan. Do NOT edit any files. Use {{model}}.',
    allowedTools: ['read', 'search', 'grep'],
    approvalPolicy: 'OnRequest',
  },
  debug: {
    id: 'debug',
    name: 'Debug',
    description: 'Diagnóstico de bugs, stack traces, root cause analysis',
    systemPromptTemplate:
      'You are in debug mode. Focus on diagnosing bugs, reading stack traces, and finding root causes. Run diagnostic commands as needed.',
    allowedTools: ['bash', 'read', 'search', 'grep', 'edit'],
    approvalPolicy: 'OnRequest',
  },
  explain: {
    id: 'explain',
    name: 'Explain',
    description: 'Documentação e explicação de código existente',
    systemPromptTemplate:
      'You are in explain mode. Explain how the code works, document the architecture, and provide examples. Do NOT modify files.',
    allowedTools: ['read', 'search', 'grep'],
    approvalPolicy: 'OnRequest',
  },
}

/** Substitutes `{{name}}` placeholders in a template with values; unknown keys are left intact. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match
  })
}
