import { describe, it, expect } from 'vitest'
import {
  applySection,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
  STRANDED_CONTRACT_HEADING,
} from '../core/config/ai-memory-generator.js'
import { generateContractSection } from '../core/output/consumer-contract.js'

const FULL_SECTION = `${MARKER_START}\ncontent here\n${MARKER_END}`

describe('constants', () => {
  it('MARKER_START contains agent-graph-flow', () => {
    expect(MARKER_START).toContain('agent-graph-flow')
    expect(MARKER_START).toContain('start')
  })

  it('MARKER_END contains agent-graph-flow', () => {
    expect(MARKER_END).toContain('agent-graph-flow')
    expect(MARKER_END).toContain('end')
  })

  it('LEGACY markers reference mcp-graph', () => {
    expect(LEGACY_MARKER_START).toContain('mcp-graph')
    expect(LEGACY_MARKER_END).toContain('mcp-graph')
  })
})

describe('applySection — insert into empty file', () => {
  it('inserts section into empty content', () => {
    const result = applySection('', FULL_SECTION)
    expect(result).toContain(MARKER_START)
    expect(result).toContain(MARKER_END)
    expect(result).toContain('content here')
  })

  it('appends section when existing content has no markers', () => {
    const result = applySection('# Existing\n\nSome content', FULL_SECTION)
    expect(result).toContain('# Existing')
    expect(result).toContain(MARKER_START)
  })
})

describe('applySection — replace existing marked section', () => {
  it('replaces existing section in-place', () => {
    const existing = `# Doc\n\n${MARKER_START}\nold content\n${MARKER_END}\n\n## After`
    const newSection = `${MARKER_START}\nnew content\n${MARKER_END}`
    const result = applySection(existing, newSection)
    expect(result).toContain('new content')
    expect(result).not.toContain('old content')
    expect(result).toContain('# Doc')
    expect(result).toContain('## After')
  })

  it('preserves content before and after markers', () => {
    const before = '# Title\n\nIntro paragraph.'
    const after = '## Appendix\n\nFooter text.'
    const existing = `${before}\n\n${MARKER_START}\nstale\n${MARKER_END}\n\n${after}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).toContain('# Title')
    expect(result).toContain('## Appendix')
    expect(result).toContain('content here')
  })
})

describe('applySection — sweeps stranded contract duplication', () => {
  const contract = `${STRANDED_CONTRACT_HEADING}\n\nEvery agf command returns JSON.\n`

  it('collapses N trailing contract copies stranded after MARKER_END to zero', () => {
    const strays = Array.from({ length: 17 }, () => contract).join('\n')
    const existing = `# Doc\n\n${MARKER_START}\nold\n${MARKER_END}\n\n${strays}`
    const result = applySection(existing, FULL_SECTION)
    expect(result.match(new RegExp(STRANDED_CONTRACT_HEADING, 'g'))).toBeNull()
    expect(result).toContain('content here')
    expect(result).toContain('# Doc')
  })

  it('is idempotent — re-applying does not regrow the stranded section', () => {
    const existing = `${MARKER_START}\nold\n${MARKER_END}\n\n${contract}${contract}`
    const once = applySection(existing, FULL_SECTION)
    const twice = applySection(once, FULL_SECTION)
    expect(once).toBe(twice)
    expect((twice.match(new RegExp(STRANDED_CONTRACT_HEADING, 'g')) ?? []).length).toBe(0)
  })

  it('preserves legitimate non-contract content after MARKER_END', () => {
    const existing = `${MARKER_START}\nold\n${MARKER_END}\n\n## Real Appendix\n\nKeep me.\n\n${contract}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).toContain('## Real Appendix')
    expect(result).toContain('Keep me.')
    expect(result).not.toContain(STRANDED_CONTRACT_HEADING)
  })
})

describe('applySection — idempotent re-init (never increments the block)', () => {
  it('re-applying the same section keeps exactly one marker pair (fixed point)', () => {
    const section = `${MARKER_START}\nmanaged block body\n${MARKER_END}`
    const once = applySection('# Project\n\nIntro.', section)
    const twice = applySection(once, section)
    const thrice = applySection(twice, section)

    expect(twice).toBe(once)
    expect(thrice).toBe(once)
    expect((once.match(new RegExp(MARKER_START, 'g')) ?? []).length).toBe(1)
    expect((once.match(new RegExp(MARKER_END, 'g')) ?? []).length).toBe(1)
  })
})

describe('STRANDED_CONTRACT_HEADING — drift guard', () => {
  // The self-heal sweep in applySection() keys on this exact heading string. If the
  // contract section ever renames its heading without updating the constant, the sweep
  // silently stops collapsing stranded duplication and the bloat-class regresses. Bind
  // the constant to the heading the generator actually emits so drift fails loudly here.
  it('matches the heading emitted by generateContractSection()', () => {
    const firstLine = generateContractSection().split('\n')[0]
    expect(firstLine).toBe(STRANDED_CONTRACT_HEADING)
  })

  it('sweeps a freshly generated contract section stranded after MARKER_END', () => {
    const realContract = generateContractSection()
    const existing = `# Doc\n\n${MARKER_START}\nold\n${MARKER_END}\n\n${realContract}\n\n${realContract}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).not.toContain(STRANDED_CONTRACT_HEADING)
    expect(result).toContain('content here')
  })
})

describe('applySection — legacy marker migration', () => {
  it('strips legacy mcp-graph block before inserting new section', () => {
    const legacy = `Before\n\n${LEGACY_MARKER_START}\nlegacy stuff\n${LEGACY_MARKER_END}\n\nAfter`
    const result = applySection(legacy, FULL_SECTION)
    expect(result).not.toContain('legacy stuff')
    expect(result).not.toContain(LEGACY_MARKER_START)
    expect(result).toContain('content here')
    expect(result).toContain('Before')
    expect(result).toContain('After')
  })
})
