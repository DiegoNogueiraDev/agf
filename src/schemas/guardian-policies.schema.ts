export interface GuardianPolicy {
  toolPattern: string
  conditions?: {
    commandContains?: string
    pathsContain?: string
    argContains?: string
  }
  action: 'allow' | 'deny' | 'ask_user'
  riskLevel: 'low' | 'medium' | 'high'
}

export interface GuardianPolicyConfig {
  guardian: {
    model?: string
    policies: GuardianPolicy[]
  }
}

export const DEFAULT_POLICIES: GuardianPolicy[] = [
  {
    toolPattern: 'bash',
    conditions: { commandContains: 'rm -rf' },
    action: 'deny',
    riskLevel: 'high',
  },
  {
    toolPattern: 'write',
    conditions: { pathsContain: '/etc,/var,/opt,/usr' },
    action: 'ask_user',
    riskLevel: 'medium',
  },
  {
    toolPattern: '*',
    action: 'allow',
    riskLevel: 'low',
  },
]

/** Returns the first guardian policy matching the tool name and serialized args, or null if none apply. */
export function matchPolicy(
  toolName: string,
  args: Record<string, unknown>,
  policies: GuardianPolicy[],
): GuardianPolicy | null {
  const commandStr = JSON.stringify(args).toLowerCase()

  const deny: GuardianPolicy[] = []
  const askUser: GuardianPolicy[] = []
  const allow: GuardianPolicy[] = []

  for (const policy of policies) {
    if (!matchesTool(toolName, policy.toolPattern)) continue
    if (policy.conditions && !matchesConditions(commandStr, policy.conditions)) continue

    if (policy.action === 'deny') deny.push(policy)
    else if (policy.action === 'ask_user') askUser.push(policy)
    else allow.push(policy)
  }

  return deny[0] ?? askUser[0] ?? allow[0] ?? null
}

function matchesTool(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern === toolName) return true
  if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) return true
  if (pattern.startsWith('*') && toolName.endsWith(pattern.slice(1))) return true
  return false
}

function matchesConditions(commandStr: string, conditions: NonNullable<GuardianPolicy['conditions']>): boolean {
  if (conditions.commandContains) {
    const parts = conditions.commandContains.split(',')
    if (!parts.some((p) => commandStr.includes(p.trim().toLowerCase()))) return false
  }
  if (conditions.pathsContain) {
    const parts = conditions.pathsContain.split(',')
    if (!parts.some((p) => commandStr.includes(p.trim().toLowerCase()))) return false
  }
  if (conditions.argContains) {
    if (!commandStr.includes(conditions.argContains.toLowerCase())) return false
  }
  return true
}
