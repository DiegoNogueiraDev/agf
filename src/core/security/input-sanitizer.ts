/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Input Sanitization Layer — detects prompt injection, invisible Unicode, and exfiltration patterns.
 * Inspired by hermes-agent security hardening. Detection-only mode: logs, does not block.
 */

import { createLogger } from '../utils/logger.js'
import type {
  SanitizationReport,
  ExfiltrationReport,
  ToolArgsSanitizationResult,
} from '../../schemas/security.schema.js'

const log = createLogger({ layer: 'core', source: 'input-sanitizer.ts' })

export type { SanitizationReport, ExfiltrationReport, ToolArgsSanitizationResult }

// ── Invisible Unicode characters to strip ──

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\u206A-\u206F\uFEFF\uFFF9-\uFFFB]/gu

// ── Prompt injection patterns ──

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<\|im_start\|>/i, label: '<|im_start|>' },
  { pattern: /<\|im_end\|>/i, label: '<|im_end|>' },
  { pattern: /\[INST\]/i, label: '[INST]' },
  { pattern: /\[\/INST\]/i, label: '[/INST]' },
  { pattern: /<<SYS>>/i, label: '<<SYS>>' },
  { pattern: /<<\/SYS>>/i, label: '<</SYS>>' },
  { pattern: /^SYSTEM:/m, label: 'SYSTEM:' },
  { pattern: /^Human:/m, label: 'Human:' },
  { pattern: /^Assistant:/m, label: 'Assistant:' },
]

// ── Safe URL domains (not flagged as exfiltration) ──

const SAFE_DOMAINS = new Set([
  'nodejs.org',
  'github.com',
  'npmjs.com',
  'developer.mozilla.org',
  'stackoverflow.com',
  'docs.anthropic.com',
  'api.anthropic.com',
  'modelcontextprotocol.io',
  'vitejs.dev',
  'typescriptlang.org',
  'eslint.org',
  'vitest.dev',
  'tailwindcss.com',
  'reactjs.org',
  'react.dev',
  'localhost',
  '127.0.0.1',
])

// ── Exfiltration command patterns ──

const EXFIL_COMMAND_PATTERNS = [
  /curl\s+.*-[dX]\s/i,
  /curl\s+.*--data/i,
  /wget\s+.*--post/i,
  /fetch\s*\(/i,
  /nc\s+-[^l]/i,
]

// ── URL extraction ──

const URL_REGEX = /https?:\/\/[^\s"'<>)}\]]+/gi

// ── Base64 detection (100+ chars of base64-like content) ──

const BASE64_REGEX = /[A-Za-z0-9+/]{100,}={0,2}/g

/**
 * Sanitize text by stripping invisible Unicode and detecting injection patterns.
 * Does NOT modify the text beyond invisible char removal — injection markers stay
 * so the caller can decide how to handle them.
 */
export function sanitizeText(input: string): SanitizationReport {
  // Strip invisible characters
  const matches = input.match(INVISIBLE_CHARS_REGEX)
  const invisibleCharsRemoved = matches ? matches.length : 0
  const sanitized = input.replace(INVISIBLE_CHARS_REGEX, '')

  // Detect injection patterns (check against sanitized text)
  const injectionPatterns: string[] = []
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      injectionPatterns.push(label)
    }
  }

  return {
    sanitized,
    injectionDetected: injectionPatterns.length > 0,
    injectionPatterns,
    invisibleCharsRemoved,
  }
}

/**
 * Detect potential exfiltration patterns in text: suspicious URLs, base64 blocks,
 * and exfiltration commands (curl, wget, fetch, nc).
 */
export function detectExfiltration(text: string): ExfiltrationReport {
  if (!text) {
    return { detected: false, suspiciousUrls: [], base64Blocks: [], suspiciousCommands: [] }
  }

  // Find URLs, filter out known-safe domains
  const allUrls = text.match(URL_REGEX) ?? []
  const suspiciousUrls = allUrls.filter((url) => {
    try {
      const hostname = new URL(url).hostname
      return !SAFE_DOMAINS.has(hostname)
    } catch {
      return true // Malformed URL = suspicious
    }
  })

  // Find large base64 blocks
  const base64Blocks = (text.match(BASE64_REGEX) ?? []).map((b) => (b.length > 50 ? b.slice(0, 50) + '...' : b))

  // Find exfiltration commands
  const suspiciousCommands: string[] = []
  for (const pattern of EXFIL_COMMAND_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern)
      if (match) {
        suspiciousCommands.push(match[0].trim())
      }
    }
  }

  const detected = suspiciousUrls.length > 0 || base64Blocks.length > 0 || suspiciousCommands.length > 0

  return { detected, suspiciousUrls, base64Blocks, suspiciousCommands }
}

/**
 * Recursively sanitize all string values in a tool arguments object.
 * Returns sanitized args and aggregated injection detection.
 */
export function sanitizeToolArgs(args: Record<string, unknown>): ToolArgsSanitizationResult {
  let totalInvisible = 0
  let anyInjection = false

  function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const report = sanitizeText(value)
      totalInvisible += report.invisibleCharsRemoved
      if (report.injectionDetected) anyInjection = true
      return report.sanitized
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue)
    }
    if (value !== null && typeof value === 'object') {
      return sanitizeRecord(value as Record<string, unknown>)
    }
    return value
  }

  function sanitizeRecord(obj: Record<string, unknown>): Record<string, unknown> {
    const resultValue: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      resultValue[key] = sanitizeValue(val)
    }
    return resultValue
  }

  const sanitized = sanitizeRecord(args)

  if (anyInjection) {
    log.warn('security:sanitize_tool_args', { injectionDetected: true })
  }

  return { sanitized, injectionDetected: anyInjection, invisibleCharsRemoved: totalInvisible }
}
