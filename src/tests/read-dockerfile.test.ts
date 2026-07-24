import { describe, it, expect } from 'vitest'
import { parseDockerfile } from '../core/parser/read-dockerfile.js'

describe('parseDockerfile', () => {
  it('returns empty entries for empty content', () => {
    const result = parseDockerfile('')
    expect(result.entries).toHaveLength(0)
  })

  it('parses FROM instruction', () => {
    const content = 'FROM node:20-alpine'
    const result = parseDockerfile(content)
    const entry = result.entries.find((e) => e.type === 'FROM')
    expect(entry?.value).toContain('node:20-alpine')
  })

  it('parses EXPOSE instruction', () => {
    const content = 'FROM node:20\nEXPOSE 3000'
    const result = parseDockerfile(content)
    const entry = result.entries.find((e) => e.type === 'EXPOSE')
    expect(entry?.value).toContain('3000')
  })

  it('parses ENV instruction', () => {
    const content = 'FROM node:20\nENV NODE_ENV=production'
    const result = parseDockerfile(content)
    const entry = result.entries.find((e) => e.type === 'ENV')
    expect(entry?.value).toContain('NODE_ENV')
  })

  it('parses RUN instruction', () => {
    const content = 'FROM node:20\nRUN npm install'
    const result = parseDockerfile(content)
    const entry = result.entries.find((e) => e.type === 'RUN')
    expect(entry?.value).toContain('npm install')
  })

  it('parses COPY instruction', () => {
    const content = 'FROM node:20\nCOPY . /app'
    const result = parseDockerfile(content)
    const entry = result.entries.find((e) => e.type === 'COPY')
    expect(entry?.value).toContain('/app')
  })

  it('preserves raw content', () => {
    const content = 'FROM node:20'
    const result = parseDockerfile(content)
    expect(result.raw).toBe(content)
  })

  it('parses multiple instructions', () => {
    const content = 'FROM node:20\nRUN npm i\nCOPY . .\nEXPOSE 8080'
    const result = parseDockerfile(content)
    expect(result.entries.length).toBeGreaterThanOrEqual(4)
  })
})
