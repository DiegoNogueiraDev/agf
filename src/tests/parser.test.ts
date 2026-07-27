/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ─── normalize ──────────────────────────────────────────────────────

import { normalize } from '../core/parser/normalize.js'

describe('normalize', () => {
  it('standardizes CRLF to LF', () => {
    expect(normalize('line1\r\nline2\r\nline3')).toBe('line1\nline2\nline3')
  })

  it('standardizes CR to LF', () => {
    expect(normalize('line1\rline2\rline3')).toBe('line1\nline2\nline3')
  })

  it('collapses 3+ blank lines into 2', () => {
    expect(normalize('a\n\n\n\n\nb')).toBe('a\n\nb')
  })

  it('converts * • ● bullets to -', () => {
    const result = normalize('* item\n• item\n● item')
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    for (const l of lines) expect(l).toMatch(/^- /)
  })

  it('trims trailing whitespace per line', () => {
    expect(normalize('hello   \nworld  ')).toBe('hello\nworld')
  })

  it('trims overall leading/trailing whitespace', () => {
    expect(normalize('  \nhello\n  ')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(normalize('')).toBe('')
  })
})

// ─── segment ─────────────────────────────────────────────────────────

import { segment, extractTableSections } from '../core/parser/segment.js'
import type { Section } from '../core/parser/segment.js'

describe('segment', () => {
  it('splits text by headings', () => {
    const sections = segment('# Epic\nbody1\n## Task\nbody2')
    expect(sections).toHaveLength(2)
    expect(sections[0]!.title).toBe('Epic')
    expect(sections[0]!.level).toBe(1)
    expect(sections[0]!.body).toBe('body1')
    expect(sections[1]!.title).toBe('Task')
    expect(sections[1]!.level).toBe(2)
    expect(sections[1]!.body).toBe('body2')
  })

  it('handles h1 through h6', () => {
    const sections = segment('###### deepest')
    expect(sections).toHaveLength(1)
    expect(sections[0]!.level).toBe(6)
    expect(sections[0]!.title).toBe('deepest')
  })

  it('creates Untitled section for text without headings', () => {
    const sections = segment('just some plain text\nwith multiple lines')
    expect(sections).toHaveLength(1)
    expect(sections[0]!.title).toBe('Untitled')
    expect(sections[0]!.level).toBe(0)
  })

  it('handles empty text', () => {
    expect(segment('')).toHaveLength(0)
  })

  it('sets correct line numbers (1-indexed)', () => {
    const sections = segment('preamble\n## Section A\ncontent\n## Section B\ndetails')
    expect(sections[0]!.startLine).toBe(2)
    expect(sections[0]!.endLine).toBe(3)
    expect(sections[1]!.startLine).toBe(4)
    expect(sections[1]!.endLine).toBe(5)
  })

  it('trims body text', () => {
    const sections = segment('# Title\n\n  body text with spaces  \n\n')
    expect(sections[0]!.body).toBe('body text with spaces')
  })
})

describe('extractTableSections', () => {
  const makeSection = (body: string): Section => ({ level: 1, title: 'Test', body, startLine: 1, endLine: 10 })

  it('extracts markdown tables into separate [table] sections', () => {
    const input = `Some text
| Name  | Type |
|-------|------|
| field | string |
More text`
    const result = extractTableSections([makeSection(input)])
    expect(result).toHaveLength(2)
    expect(result[1]!.title).toBe('[table]')
    expect(result[1]!.body).toContain('| Name  | Type |')
  })

  it('passes through sections without tables', () => {
    const sec = makeSection('just text')
    const result = extractTableSections([sec])
    expect(result).toHaveLength(1)
    expect(result[0]!.body).toBe('just text')
  })

  it('handles multiple tables in one section', () => {
    const input = `| A | B |
|---|---|
| 1 | 2 |
gap
| C | D |
|---|---|
| 3 | 4 |`
    const result = extractTableSections([makeSection(input)])
    expect(result).toHaveLength(3)
    expect(result[0]!.body).toBe('gap')
    expect(result[1]!.title).toBe('[table]')
    expect(result[2]!.title).toBe('[table]')
  })
})

// ─── classify ───────────────────────────────────────────────────────

import {
  classifyText,
  classifySectionTitle,
  classifySection,
  isMetadataLine,
  isStructuralHeading,
} from '../core/parser/classify.js'

describe('classifyText', () => {
  it('classifies checkbox items as acceptance_criteria', () => {
    expect(classifyText('[x] user can login')).toEqual({ type: 'acceptance_criteria', confidence: 0.9 })
    expect(classifyText('[ ] not done yet')).toEqual({ type: 'acceptance_criteria', confidence: 0.9 })
  })

  it('classifies constraint patterns', () => {
    expect(classifyText('não deve depender de X')).toMatchObject({ type: 'constraint' })
    expect(classifyText('not allowed to access')).toMatchObject({ type: 'constraint' })
  })

  it('classifies AC patterns', () => {
    expect(classifyText('given user is logged in when they click submit')).toMatchObject({
      type: 'acceptance_criteria',
    })
    expect(classifyText('user should be able to upload')).toMatchObject({ type: 'acceptance_criteria' })
  })

  it('classifies risk patterns', () => {
    expect(classifyText('risco de timeout')).toMatchObject({ type: 'risk' })
    expect(classifyText('mitigation strategy')).toMatchObject({ type: 'risk' })
  })

  it('classifies task patterns', () => {
    expect(classifyText('implementar login')).toMatchObject({ type: 'task' })
    expect(classifyText('create new endpoint')).toMatchObject({ type: 'task' })
  })

  it('classifies requirement patterns', () => {
    expect(classifyText('o sistema deve validar')).toMatchObject({ type: 'requirement' })
    expect(classifyText('must handle errors')).toMatchObject({ type: 'requirement' })
  })

  it('returns unknown for gibberish', () => {
    expect(classifyText('lorem ipsum dolor')).toMatchObject({ type: 'unknown' })
  })
})

describe('classifySectionTitle', () => {
  it('classifies AC sections', () => {
    expect(classifySectionTitle('Acceptance Criteria', 2)).toMatchObject({ type: 'acceptance_criteria' })
    expect(classifySectionTitle('Critérios de Aceite', 2)).toMatchObject({ type: 'acceptance_criteria' })
  })

  it('classifies risk sections', () => {
    expect(classifySectionTitle('Risk Assessment', 2)).toMatchObject({ type: 'risk' })
  })

  it('classifies constraint sections', () => {
    expect(classifySectionTitle('Constraint', 2)).toMatchObject({ type: 'constraint' })
  })

  it('classifies requirement sections', () => {
    expect(classifySectionTitle('Requisitos', 2)).toMatchObject({ type: 'requirement' })
    expect(classifySectionTitle('Requirements', 2)).toMatchObject({ type: 'requirement' })
  })

  it('uses heading level for fallback', () => {
    expect(classifySectionTitle('Some Epic', 1)).toMatchObject({ type: 'epic' })
    expect(classifySectionTitle('Some Heading', 4)).toMatchObject({ type: 'subtask' })
  })

  it('detects explicit task headings', () => {
    expect(classifySectionTitle('Task 1. Create login', 3)).toMatchObject({ type: 'task' })
    expect(classifySectionTitle('Tarefa E4.T01 — hook-types', 3)).toMatchObject({ type: 'task' })
  })
})

describe('isMetadataLine', () => {
  it('detects size metadata', () => {
    expect(isMetadataLine('**Size:** M')).toBe(true)
    expect(isMetadataLine('**Tamanho:** S')).toBe(true)
  })

  it('detects priority metadata', () => {
    expect(isMetadataLine('**Priority:** high')).toBe(true)
    expect(isMetadataLine('**Prioridade:** 1')).toBe(true)
  })

  it('detects tags metadata', () => {
    expect(isMetadataLine('**Tags:** auth, api')).toBe(true)
  })

  it('detects depends on metadata', () => {
    expect(isMetadataLine('**Depends on:** EPIC-1')).toBe(true)
    expect(isMetadataLine('**Depende de:** TASK-01')).toBe(true)
  })

  it('returns false for normal text', () => {
    expect(isMetadataLine('Implement login feature')).toBe(false)
  })
})

describe('isStructuralHeading', () => {
  it('identifies scaffolding headings', () => {
    expect(isStructuralHeading('TIER A — Infrastructure')).toBe(true)
    expect(isStructuralHeading('Roadmap')).toBe(true)
    expect(isStructuralHeading('Riscos')).toBe(true)
    expect(isStructuralHeading('Sequenciamento (4 sprints)')).toBe(true)
  })

  it('allows implementable headings', () => {
    expect(isStructuralHeading('E4.T01 — hook-types')).toBe(false)
    expect(isStructuralHeading('Sprint 1 — authentication')).toBe(false)
    expect(isStructuralHeading('Implementar login')).toBe(false)
  })

  it('allows TIER with number (not letter)', () => {
    expect(isStructuralHeading('TIER 1 routing logic')).toBe(false)
  })
})

describe('classifySection', () => {
  it('classifies a section with title and body items', () => {
    const block = classifySection('Requirements', '- must login\n- must logout', 2, 1, 3)
    expect(block.type).toBe('requirement')
    expect(block.items).toHaveLength(2)
    expect(block.items[0]!.type).toBe('requirement')
    expect(block.items[1]!.type).toBe('requirement')
  })

  it('promotes unknown sections with mostly task items', () => {
    const block = classifySection('Stuff', '- implement x\n- create y\n- some note', 3, 1, 4)
    expect(block.type).toBe('task')
  })
})

// ─── extract ─────────────────────────────────────────────────────────

import { extractEntities } from '../core/parser/extract.js'

describe('extractEntities', () => {
  it('parses structured PRD text into blocks and counts', () => {
    const result = extractEntities(`# Epic One

- must work
- implement feature

## Requirements

- login required
- logout required

## Tasks

Task 1 — Build API

- [x] endpoint works

## Riscos

- risk of delay`)
    expect(result.blocks.length).toBeGreaterThanOrEqual(4)
    expect(result.summary.totalSections).toBeGreaterThanOrEqual(4)
  })

  it('returns summary with zeroed counts for empty input', () => {
    const result = extractEntities('')
    expect(result.blocks).toHaveLength(0)
    expect(result.summary.totalSections).toBe(0)
    expect(result.summary.epics).toBe(0)
    expect(result.summary.tasks).toBe(0)
  })
})

// ─── prd-diff ────────────────────────────────────────────────────────

import { diffPrd } from '../core/parser/prd-diff.js'

describe('diffPrd', () => {
  it('detects added sections', () => {
    const result = diffPrd('# Old', '# Old\n## New Section\nbody')
    expect(result.addedCount).toBe(1)
    expect(result.sections.find((s) => s.status === 'added')?.title).toBe('New Section')
  })

  it('detects removed sections', () => {
    const result = diffPrd('# Old\n## Removed\nbody', '# Old')
    expect(result.removedCount).toBe(1)
  })

  it('detects modified sections', () => {
    const result = diffPrd('# Old\n## Section\nold body', '# Old\n## Section\nnew body')
    expect(result.modifiedCount).toBe(1)
  })

  it('detects unchanged sections', () => {
    const result = diffPrd('# Title\n## Stable\nsame', '# Title\n## Stable\nsame')
    expect(result.unchangedCount).toBe(2)
  })

  it('handles empty old text', () => {
    const result = diffPrd('', '# New')
    expect(result.addedCount).toBeGreaterThanOrEqual(1)
  })
})

// ─── read-dockerfile ─────────────────────────────────────────────────

import { parseDockerfile } from '../core/parser/read-dockerfile.js'

describe('parseDockerfile', () => {
  it('parses FROM instruction', () => {
    const result = parseDockerfile('FROM node:20')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ type: 'FROM', value: 'node:20' })
  })

  it('parses multiple instructions', () => {
    const result = parseDockerfile('FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm install')
    expect(result.entries).toHaveLength(4)
  })

  it('skips comments and empty lines', () => {
    const result = parseDockerfile('# comment\n\nFROM alpine')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseDockerfile('').entries).toHaveLength(0)
    expect(parseDockerfile('   ').entries).toHaveLength(0)
  })

  it('ignores lines without space-separated instruction', () => {
    const result = parseDockerfile('FROM\nJUNK')
    expect(result.entries).toHaveLength(0)
  })

  it('rejects unrecognized instructions', () => {
    const result = parseDockerfile('BOGUS node:20')
    expect(result.entries).toHaveLength(0)
  })
})

// ─── read-env ────────────────────────────────────────────────────────

import { parseEnv } from '../core/parser/read-env.js'

describe('parseEnv', () => {
  it('parses simple key=value pairs', () => {
    const result = parseEnv('PORT=3000\nHOST=localhost')
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!).toMatchObject({ key: 'PORT', value: '3000', hasValue: true })
  })

  it('detects secrets by key pattern', () => {
    const result = parseEnv('API_KEY=abc123\nDEBUG=true')
    expect(result.entries[0]!.isSecret).toBe(true)
    expect(result.entries[1]!.isSecret).toBe(false)
  })

  it('marks keys without value', () => {
    const result = parseEnv('EMPTY=')
    expect(result.entries[0]!.hasValue).toBe(false)
  })

  it('skips comments and blank lines', () => {
    const result = parseEnv('# comment\n\nFOO=bar')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseEnv('').entries).toHaveLength(0)
  })

  it('skips lines without =', () => {
    const result = parseEnv('JUST_KEY')
    expect(result.entries).toHaveLength(0)
  })

  it('handles quoted values', () => {
    const result = parseEnv('MSG="hello world"')
    expect(result.entries[0]!.value).toBe('"hello world"')
  })
})

// ─── read-graphql ────────────────────────────────────────────────────

import { parseGraphql } from '../core/parser/read-graphql.js'

describe('parseGraphql', () => {
  it('parses type definitions', () => {
    const result = parseGraphql('type User { id: ID! }')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ kind: 'type', name: 'User' })
  })

  it('parses input, enum, interface, scalar, union', () => {
    const result = parseGraphql(
      'input Filter {}\nenum Color { RED }\ninterface Node {}\nscalar Date\nunion Result = A | B',
    )
    expect(result.entries).toHaveLength(5)
    expect(result.entries.map((e) => e.kind)).toEqual(['input', 'enum', 'interface', 'scalar', 'union'])
  })

  it('parses query, mutation, subscription, fragment', () => {
    const result = parseGraphql(
      'query GetUser {}\nmutation CreateUser {}\nsubscription OnChange {}\nfragment UserFields on User {}',
    )
    expect(result.entries.map((e) => e.kind)).toEqual(['query', 'mutation', 'subscription', 'fragment'])
  })

  it('skips comments', () => {
    const result = parseGraphql('# this is a comment\ntype Foo {}')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseGraphql('').entries).toHaveLength(0)
  })
})

// ─── read-sql ────────────────────────────────────────────────────────

import { parseSql } from '../core/parser/read-sql.js'

describe('parseSql', () => {
  it('parses CREATE TABLE', () => {
    const result = parseSql('CREATE TABLE users (id INT)')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ kind: 'table', name: 'users' })
  })

  it('parses CREATE TABLE with IF NOT EXISTS and quoted names', () => {
    const result = parseSql('CREATE TABLE IF NOT EXISTS "orders" (id INT)')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.name).toBe('orders')
  })

  it('parses CREATE INDEX', () => {
    const result = parseSql('CREATE UNIQUE INDEX idx_email ON users')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ kind: 'index', name: 'idx_email' })
  })

  it('parses FOREIGN KEY references', () => {
    const result = parseSql('FOREIGN KEY (user_id) REFERENCES users(id)')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ kind: 'foreign_key', ref: 'users' })
  })

  it('skips SQL comments', () => {
    const result = parseSql('-- comment\nCREATE TABLE foo (id INT)')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseSql('').entries).toHaveLength(0)
  })
})

// ─── read-makefile ───────────────────────────────────────────────────

import { parseMakefile } from '../core/parser/read-makefile.js'

describe('parseMakefile', () => {
  it('parses simple target', () => {
    const result = parseMakefile('build:')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ target: 'build', deps: [], isPhony: false })
  })

  it('parses target with dependencies', () => {
    const result = parseMakefile('build: clean lint')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.deps).toEqual(['clean', 'lint'])
  })

  it('detects .PHONY targets', () => {
    const result = parseMakefile('.PHONY: clean\nclean:')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.isPhony).toBe(true)
  })

  it('skips empty lines, comments, and recipe lines', () => {
    const result = parseMakefile('# comment\n\nall:\n\techo hello')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.target).toBe('all')
  })

  it('handles empty content', () => {
    expect(parseMakefile('').entries).toHaveLength(0)
  })
})

// ─── read-terraform ──────────────────────────────────────────────────

import { parseTerraform } from '../core/parser/read-terraform.js'

describe('parseTerraform', () => {
  it('parses resource block', () => {
    const result = parseTerraform('resource "aws_s3_bucket" "my_bucket" {}')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ kind: 'resource', type: 'aws_s3_bucket', name: 'my_bucket' })
  })

  it('parses data, provider, variable, output, module', () => {
    const result = parseTerraform(
      [
        'data "aws_ami" "latest" {}',
        'provider "aws" {}',
        'variable "region" {}',
        'output "ip" {}',
        'module "network" {}',
      ].join('\n'),
    )
    expect(result.entries.map((e) => e.kind)).toEqual(['data', 'provider', 'variable', 'output', 'module'])
  })

  it('parses terraform and locals blocks', () => {
    const result = parseTerraform('terraform {}\nlocals {}')
    expect(result.entries.map((e) => e.kind)).toEqual(['terraform', 'locals'])
  })

  it('skips comments', () => {
    const result = parseTerraform('# comment\n// comment\nresource "x" "y" {}')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseTerraform('').entries).toHaveLength(0)
  })
})

// ─── read-toml ───────────────────────────────────────────────────────

import { parseToml } from '../core/parser/read-toml.js'

describe('parseToml', () => {
  it('parses key-value pairs', () => {
    const result = parseToml('title = "Hello"\ncount = 42')
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!).toMatchObject({ key: 'title', valueType: 'string', hasChildren: false })
    expect(result.entries[1]!).toMatchObject({ key: 'count', valueType: 'number', hasChildren: false })
  })

  it('parses table headers', () => {
    const result = parseToml('[server]\nhost = "localhost"')
    expect(result.entries[0]!).toMatchObject({ key: 'server', valueType: 'table', hasChildren: true })
  })

  it('parses array of tables', () => {
    const result = parseToml('[[products]]\nname = "Widget"')
    expect(result.entries[0]!).toMatchObject({ key: 'products', valueType: 'array', hasChildren: true })
  })

  it('deduplicates top-level keys with same section name', () => {
    const result = parseToml('a = 1\nb = 2')
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!.key).toBe('a')
    expect(result.entries[1]!.key).toBe('b')
  })

  it('skips comments', () => {
    const result = parseToml('# comment\ntitle = "Hello"')
    expect(result.entries).toHaveLength(1)
  })

  it('handles empty content', () => {
    expect(parseToml('').entries).toHaveLength(0)
  })

  it('infers boolean and array types', () => {
    const result = parseToml('enabled = true\nitems = [1,2]')
    expect(result.entries[0]!.valueType).toBe('boolean')
    expect(result.entries[1]!.valueType).toBe('array')
  })
})

// ─── read-yaml ───────────────────────────────────────────────────────

import { parseYaml } from '../core/parser/read-yaml.js'

describe('parseYaml', () => {
  it('parses top-level keys with types', () => {
    const result = parseYaml('name: test\ncount: 42\nactive: true')
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]!).toMatchObject({ key: 'name', valueType: 'string' })
    expect(result.entries[1]!).toMatchObject({ key: 'count', valueType: 'number' })
    expect(result.entries[2]!).toMatchObject({ key: 'active', valueType: 'boolean' })
  })

  it('detects nested objects as hasChildren', () => {
    const result = parseYaml('server:\n  host: localhost\n  port: 8080')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!).toMatchObject({ key: 'server', valueType: 'object', hasChildren: true })
  })

  it('detects arrays', () => {
    const result = parseYaml('items:\n  - a\n  - b')
    expect(result.entries[0]!).toMatchObject({ valueType: 'array', hasChildren: true })
  })

  it('returns empty for invalid YAML', () => {
    const result = parseYaml(': : invalid')
    expect(result.entries).toHaveLength(0)
  })

  it('handles empty content', () => {
    expect(parseYaml('').entries).toHaveLength(0)
  })

  it('returns empty for scalar YAML', () => {
    expect(parseYaml('just a string').entries).toHaveLength(0)
  })
})

// ─── read-html (cheerio) ─────────────────────────────────────────────

describe('readHtmlContent', () => {
  it('extracts text from simple HTML', async () => {
    const { readHtmlContent } = await import('../core/parser/read-html.js')
    const text = await readHtmlContent('<html><body><h1>Title</h1><p>Hello</p></body></html>')
    expect(text).toContain('# Title')
    expect(text).toContain('Hello')
  })

  it('converts headings to markdown', async () => {
    const { readHtmlContent } = await import('../core/parser/read-html.js')
    const text = await readHtmlContent('<h2>Subtitle</h2>')
    expect(text).toContain('## Subtitle')
  })

  it('converts list items to bullets', async () => {
    const { readHtmlContent } = await import('../core/parser/read-html.js')
    const text = await readHtmlContent('<ul><li>Item A</li><li>Item B</li></ul>')
    expect(text).toContain('- Item A')
    expect(text).toContain('- Item B')
  })

  it('strips script and style elements', async () => {
    const { readHtmlContent } = await import('../core/parser/read-html.js')
    const text = await readHtmlContent('<script>alert(1)</script><style>.cls{}</style><p>visible</p>')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('.cls')
    expect(text).toContain('visible')
  })

  it('handles empty HTML', async () => {
    const { readHtmlContent } = await import('../core/parser/read-html.js')
    const text = await readHtmlContent('')
    expect(text).toBe('')
  })
})

// ─── read-swagger ────────────────────────────────────────────────────

import { parseSwaggerContent, parseWsdlContent } from '../core/parser/read-swagger.js'

describe('parseSwaggerContent', () => {
  it('parses OpenAPI 3.0 YAML', () => {
    const yaml = `openapi: "3.0.0"
info:
  title: My API
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      responses:
        "200":
          description: OK`
    const result = parseSwaggerContent(yaml)
    expect(result.title).toBe('My API')
    expect(result.version).toBe('1.0')
    expect(result.endpoints).toHaveLength(1)
    expect(result.endpoints[0]!).toMatchObject({ method: 'GET', path: '/users', operationId: 'listUsers' })
  })

  it('parses OpenAPI 2.0 JSON', () => {
    const json = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Legacy API', version: '2.0' },
      paths: {
        '/items': {
          get: {
            operationId: 'getItems',
            summary: 'Get items',
            responses: { '200': { description: 'success' } },
          },
        },
      },
    })
    const result = parseSwaggerContent(json)
    expect(result.title).toBe('Legacy API')
    expect(result.format).toBe('openapi2')
    expect(result.endpoints).toHaveLength(1)
  })

  it('extracts parameters', () => {
    const yaml = `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /items/{id}:
    get:
      operationId: getItem
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK`
    const result = parseSwaggerContent(yaml)
    expect(result.endpoints[0]!.parameters).toHaveLength(1)
    expect(result.endpoints[0]!.parameters[0]!).toMatchObject({ name: 'id', location: 'path', required: true })
  })

  it('extracts component schemas', () => {
    const yaml = `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
components:
  schemas:
    User:
      type: object
      required: [name]
      properties:
        name:
          type: string
        email:
          type: string`
    const result = parseSwaggerContent(yaml)
    expect(result.schemas).toHaveLength(1)
    expect(result.schemas[0]!.name).toBe('User')
    expect(result.schemas[0]!.properties).toHaveLength(2)
    expect(result.schemas[0]!.properties[0]!.required).toBe(true)
  })

  it('throws on empty content', () => {
    expect(() => parseSwaggerContent('')).toThrow()
  })

  it('throws on unrecognized format', () => {
    expect(() => parseSwaggerContent('random: 1')).toThrow()
  })
})

describe('parseWsdlContent', () => {
  it('parses WSDL with operations and schemas', () => {
    const wsdl = `<?xml version="1.0"?>
<definitions name="TestService" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <portType name="TestPortType">
    <operation name="GetData">
      <input message="tns:GetDataRequest"/>
      <output message="tns:GetDataResponse"/>
    </operation>
  </portType>
  <types>
    <xsd:schema>
      <xsd:element name="GetDataResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>
</definitions>`
    const result = parseWsdlContent(wsdl)
    expect(result.title).toBe('TestService')
    expect(result.format).toBe('wsdl')
    expect(result.endpoints).toHaveLength(1)
    expect(result.endpoints[0]!).toMatchObject({ method: 'SOAP', operationId: 'GetData' })
    expect(result.schemas).toHaveLength(1)
    expect(result.schemas[0]!.name).toBe('GetDataResponse')
    expect(result.schemas[0]!.properties).toHaveLength(1)
    expect(result.schemas[0]!.properties[0]!.name).toBe('result')
  })

  it('throws on empty content', () => {
    expect(() => parseWsdlContent('')).toThrow()
  })
})

// ─── file-reader ─────────────────────────────────────────────────────

import { isSupportedFormat } from '../core/parser/file-reader.js'

describe('isSupportedFormat', () => {
  it('returns true for supported extensions', () => {
    expect(isSupportedFormat('file.md')).toBe(true)
    expect(isSupportedFormat('file.txt')).toBe(true)
    expect(isSupportedFormat('file.pdf')).toBe(true)
    expect(isSupportedFormat('file.html')).toBe(true)
    expect(isSupportedFormat('file.htm')).toBe(true)
    expect(isSupportedFormat('file.yaml')).toBe(true)
    expect(isSupportedFormat('file.yml')).toBe(true)
    expect(isSupportedFormat('file.json')).toBe(true)
    expect(isSupportedFormat('file.wsdl')).toBe(true)
    expect(isSupportedFormat('file.sif')).toBe(true)
    expect(isSupportedFormat('file.docx')).toBe(true)
  })

  it('returns false for unsupported extensions', () => {
    expect(isSupportedFormat('file.exe')).toBe(false)
    expect(isSupportedFormat('file.zip')).toBe(false)
    expect(isSupportedFormat('file')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isSupportedFormat('file.PDF')).toBe(true)
    expect(isSupportedFormat('file.HTML')).toBe(true)
    expect(isSupportedFormat('file.MD')).toBe(true)
  })
})

describe('readFileContent', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'parser-test-'))
    writeFileSync(join(tmpDir, 'hello.txt'), 'Hello, World!')
    writeFileSync(join(tmpDir, 'hello.md'), '# Markdown\nContent')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads a text file', async () => {
    const { readFileContent } = await import('../core/parser/file-reader.js')
    const result = await readFileContent(join(tmpDir, 'hello.txt'))
    expect(result.text).toBe('Hello, World!')
    expect(result.format).toBe('.txt')
    expect(result.sizeBytes).toBeGreaterThan(0)
  })

  it('reads a markdown file', async () => {
    const { readFileContent } = await import('../core/parser/file-reader.js')
    const result = await readFileContent(join(tmpDir, 'hello.md'))
    expect(result.text).toContain('Markdown')
    expect(result.format).toBe('.md')
  })

  it('rejects unsupported extension', async () => {
    const { readFileContent } = await import('../core/parser/file-reader.js')
    await expect(readFileContent(join(tmpDir, 'fake.exe'))).rejects.toThrow('Unsupported')
  })

  it('rejects non-existent file', async () => {
    const { readFileContent } = await import('../core/parser/file-reader.js')
    await expect(readFileContent(join(tmpDir, 'nope.txt'))).rejects.toThrow()
  })
})

// ─── read-file ───────────────────────────────────────────────────────

describe('readPrdFile', () => {
  let tmpDir: string
  let prdPath: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-prd-'))
    prdPath = join(tmpDir, 'test.prd')
    writeFileSync(prdPath, '# PRD Title\n\nSome requirement text.')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads a .prd file', async () => {
    const { readPrdFile } = await import('../core/parser/read-file.js')
    const result = await readPrdFile(prdPath)
    expect(result.content).toContain('PRD Title')
    expect(result.sizeBytes).toBeGreaterThan(0)
  })

  it('rejects unsupported extension', async () => {
    const { readPrdFile } = await import('../core/parser/read-file.js')
    const badPath = join(tmpDir, 'test.exe')
    writeFileSync(badPath, 'data')
    await expect(readPrdFile(badPath)).rejects.toThrow('Unsupported')
  })

  it('rejects non-existent file', async () => {
    const { readPrdFile } = await import('../core/parser/read-file.js')
    await expect(readPrdFile(join(tmpDir, 'missing.prd'))).rejects.toThrow()
  })
})

// ─── read-pdf ────────────────────────────────────────────────────────

describe('readPdfBuffer', () => {
  it('throws on invalid buffer (not a PDF)', async () => {
    const { readPdfBuffer } = await import('../core/parser/read-pdf.js')
    await expect(readPdfBuffer(Buffer.from('not a pdf'))).rejects.toThrow()
  })
})

// ─── read-docx ───────────────────────────────────────────────────────

describe('readDocxContent', () => {
  it('throws on empty file', async () => {
    const { readDocxContent } = await import('../core/parser/read-docx.js')
    await expect(readDocxContent('/nonexistent/docx/file.docx')).rejects.toThrow()
  })
})

describe('isDocxSupported', () => {
  it('returns true for .doc and .docx', async () => {
    const { isDocxSupported } = await import('../core/parser/read-docx.js')
    expect(isDocxSupported('.docx')).toBe(true)
    expect(isDocxSupported('.doc')).toBe(true)
    expect(isDocxSupported('.DOCX')).toBe(true)
  })

  it('returns false for other extensions', async () => {
    const { isDocxSupported } = await import('../core/parser/read-docx.js')
    expect(isDocxSupported('.pdf')).toBe(false)
    expect(isDocxSupported('.txt')).toBe(false)
  })
})
