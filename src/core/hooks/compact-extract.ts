export type StructuredBlock = { kind: 'json'; parsed: unknown } | { kind: 'list'; lines: string[] }

const JSON_BLOCK = /{[\s\S]*?}|\[[\s\S]*?\]/g
const LIST_LINE = /^[-*]\s+.+|^\d+\.\s+.+/gm

export function extractStructured(output: string): StructuredBlock[] {
  const blocks: StructuredBlock[] = []

  JSON_BLOCK.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = JSON_BLOCK.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(match[0]) as unknown
      if (typeof parsed === 'object' && parsed !== null) {
        blocks.push({ kind: 'json', parsed })
      }
    } catch {
      continue
    }
  }

  LIST_LINE.lastIndex = 0
  const listMatches = output.match(LIST_LINE)
  if (listMatches && listMatches.length >= 2) {
    const lines = listMatches.map((l) => l.replace(/^[-*]\s+|^\d+\.\s+/, ''))
    blocks.push({ kind: 'list', lines })
  }

  return blocks
}

const MAX_BULLETS = 5

export function compactBullets(block: StructuredBlock): string[] {
  switch (block.kind) {
    case 'json': {
      const obj = block.parsed
      if (Array.isArray(obj)) {
        return obj.slice(0, MAX_BULLETS).map((item) => `- ${String(item)}`)
      }
      if (obj && typeof obj === 'object') {
        return Object.entries(obj as Record<string, unknown>)
          .slice(0, MAX_BULLETS)
          .map(([k, v]) => `- ${k}: ${String(v)}`)
      }
      return []
    }
    case 'list': {
      return block.lines.slice(0, MAX_BULLETS).map((l) => `- ${l}`)
    }
  }
}
