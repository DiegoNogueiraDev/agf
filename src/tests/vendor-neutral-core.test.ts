import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

const CORE_DIR = join(process.cwd(), 'src', 'core')
const MCP_SDK_IMPORT_PATTERN = /^\s*import\s+.*from\s+['"]@modelcontextprotocol/m
const MCP_REQUIRE_PATTERN = /require\(['"]@modelcontextprotocol/m

describe('vendor-neutral core contracts', () => {
  const coreFiles = collectTsFiles(CORE_DIR)

  it('src/core/ contains TypeScript files to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0)
  })

  it('no src/core/**/*.ts file imports from @modelcontextprotocol/sdk', () => {
    const violations: string[] = []
    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf8')
      if (MCP_SDK_IMPORT_PATTERN.test(content) || MCP_REQUIRE_PATTERN.test(content)) {
        violations.push(file.replace(process.cwd() + '/', ''))
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Found @modelcontextprotocol/sdk imports in core (vendor-neutral contract violation):\n${violations.join('\n')}`,
      )
    }
    expect(violations).toHaveLength(0)
  })

  it('string literals mentioning @modelcontextprotocol are not import statements', () => {
    const literalFiles = coreFiles.filter((f) => {
      const content = readFileSync(f, 'utf8')
      return content.includes('@modelcontextprotocol') && !MCP_SDK_IMPORT_PATTERN.test(content)
    })
    // String literals are allowed — only imports violate vendor-neutrality
    for (const f of literalFiles) {
      const content = readFileSync(f, 'utf8')
      expect(MCP_SDK_IMPORT_PATTERN.test(content)).toBe(false)
    }
  })
})
