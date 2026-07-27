import { describe, it, expect } from 'vitest'
import { generateReadmeStats, generateArchToolSection, generateToolRefSummary } from '../core/docs/doc-generator.js'
import type { ToolInfo } from '../core/docs/tool-introspector.js'
import type { RouteInfo } from '../core/docs/route-introspector.js'

function makeTool(name: string, deprecated = false): ToolInfo {
  return { name, description: `${name} tool`, category: 'general', deprecated, sourceFile: `${name}.ts` }
}

function makeRoute(routerName: string, endpointCount: number): RouteInfo {
  return {
    routerName,
    mountPath: `/${routerName}`,
    endpoints: Array.from({ length: endpointCount }, (_, i) => ({ method: 'GET', path: `/${routerName}/${i}` })),
    sourceFile: `${routerName}.ts`,
  }
}

describe('generateReadmeStats', () => {
  it('returns a markdown table string', () => {
    const result = generateReadmeStats([makeTool('bash'), makeTool('read')], [makeRoute('graph', 3)])
    expect(result).toContain('MCP Tools')
    expect(result).toContain('REST Endpoints')
  })

  it('includes correct active and deprecated counts', () => {
    const tools = [makeTool('bash'), makeTool('old-tool', true)]
    const result = generateReadmeStats(tools, [])
    expect(result).toContain('1 + 1 deprecated')
  })

  it('handles empty tools and routes', () => {
    const result = generateReadmeStats([], [])
    expect(result).toContain('MCP Tools')
  })
})

describe('generateArchToolSection', () => {
  it('returns a non-empty string for non-empty tool list', () => {
    const result = generateArchToolSection([makeTool('bash'), makeTool('write')])
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empty tool list without throwing', () => {
    expect(() => generateArchToolSection([])).not.toThrow()
  })
})

describe('generateToolRefSummary', () => {
  it('returns a string for a given tool list', () => {
    const result = generateToolRefSummary([makeTool('read'), makeTool('write')])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empty list without throwing', () => {
    expect(() => generateToolRefSummary([])).not.toThrow()
  })
})
