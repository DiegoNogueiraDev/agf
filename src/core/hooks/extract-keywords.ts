import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'extract-keywords.ts' })

export interface ExtractedFact {
  kind: 'keyword' | 'error' | 'decision' | 'warning'
  text: string
  toolName: string
  timestamp: string
}

const PATTERNS: Array<{ kind: ExtractedFact['kind']; regex: RegExp }> = [
  { kind: 'error', regex: /\b(?:Error|erro|fail(?:ed|ure)?|exception|não (?:foi|conseguiu|pode)|falhou)\b/i },
  { kind: 'warning', regex: /\b(?:warning|cuidado|atenção|limitação|not (?:supported|available|found))\b/i },
  {
    kind: 'decision',
    regex: /\b(?:decidido|vamos (?:usar|seguir|adotar)|opted (?:for|to)|chose|escolhido|resolvido)\b/i,
  },
  { kind: 'keyword', regex: /\b(?:refactor|bugfix|feature|hotfix|breaking|deprecated|migration|rollback)\b/i },
]

const MAX_FACTS = 10

export function extractFacts(output: string, toolName: string, timestamp: string): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  const seen = new Set<string>()

  for (const pattern of PATTERNS) {
    const matches = output.match(pattern.regex)
    if (!matches) continue
    for (const match of matches.slice(0, 3)) {
      const key = `${pattern.kind}:${match.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      facts.push({ kind: pattern.kind, text: match, toolName, timestamp })
      if (facts.length >= MAX_FACTS) return facts
    }
  }

  return facts
}

export interface MemoryEntry {
  name: string
  content: string
}

export function formatFactsAsMemory(facts: ExtractedFact[]): MemoryEntry | null {
  if (facts.length === 0) return null
  const lines = facts.map((f) => `- [${f.kind}] ${f.text} (${f.toolName} @ ${f.timestamp})`)
  return {
    name: `extracted-facts-${Date.now().toString(36)}`,
    content: `# Auto-Extracted Facts\n\n${lines.join('\n')}`,
  }
}
