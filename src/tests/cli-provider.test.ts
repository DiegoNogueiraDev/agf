/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  type CliDetection,
  type CliDetector,
  opencodeDetector,
  codexDetector,
  claudeDetector,
  copilotDetector,
  detectActiveCLI,
} from '../core/cli-provider/cli-provider.js'

describe('opencodeDetector', () => {
  it('detects via env var OPENCODE=1', () => {
    const result = opencodeDetector.detect({ OPENCODE: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('opencode')
    expect(result!.mode).toBe('hook')
    expect(result!.confidence).toBe(1)
  })

  it('returns null when env var is not set', () => {
    const result = opencodeDetector.detect({})
    expect(result).toBeNull()
  })

  it('returns null when env var is set to 0', () => {
    const result = opencodeDetector.detect({ OPENCODE: '0' })
    expect(result).toBeNull()
  })

  it('detects via .opencode filesystem marker with lower confidence', () => {
    const result = opencodeDetector.detect({}, (marker) => marker === '.opencode')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('opencode')
    expect(result!.confidence).toBe(0.7)
  })
})

describe('codexDetector', () => {
  it('detects via env var CODEX=1', () => {
    const result = codexDetector.detect({ CODEX: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('codex')
    expect(result!.mode).toBe('hook')
    expect(result!.confidence).toBe(1)
  })

  it('returns null when env var is not set', () => {
    const result = codexDetector.detect({})
    expect(result).toBeNull()
  })
})

describe('claudeDetector', () => {
  it('detects via env var CLAUDE_CODE=1', () => {
    const result = claudeDetector.detect({ CLAUDE_CODE: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('claude')
    expect(result!.mode).toBe('hook')
    expect(result!.confidence).toBe(1)
  })

  it('detects via env var CLAUDE_CODE=true', () => {
    const result = claudeDetector.detect({ CLAUDE_CODE: 'true' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('claude')
  })

  it('returns null when env var is not set', () => {
    const result = claudeDetector.detect({})
    expect(result).toBeNull()
  })

  it('detects via .claude filesystem marker with lower confidence', () => {
    const result = claudeDetector.detect({}, (marker) => marker === '.claude')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('claude')
    expect(result!.confidence).toBe(0.7)
  })
})

describe('copilotDetector', () => {
  it('detects via env var COPILOT=1', () => {
    const result = copilotDetector.detect({ COPILOT: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('copilot')
    expect(result!.mode).toBe('direct')
    expect(result!.confidence).toBe(0.8)
  })

  it('detects via the live-confirmed Copilot markers (COPILOT_CLI / AGENT_SESSION_ID / CLI_BINARY_VERSION) + config fallbacks', () => {
    for (const env of [
      { COPILOT_CLI: '1' },
      { COPILOT_AGENT_SESSION_ID: 'uuid-123' },
      { COPILOT_CLI_BINARY_VERSION: '1.0.63' },
      { COPILOT_HOME: '/x' },
      { COPILOT_MODEL: 'gpt' },
    ]) {
      const result = copilotDetector.detect(env)
      expect(result, JSON.stringify(env)).not.toBeNull()
      expect(result!.source).toBe('copilot')
    }
  })

  it('does NOT detect on COPILOT_AGENT (it does not exist in Copilot CLI)', () => {
    expect(copilotDetector.detect({ COPILOT_AGENT: '1' })).toBeNull()
  })

  it('returns null when no Copilot marker is set', () => {
    const result = copilotDetector.detect({})
    expect(result).toBeNull()
  })
})

describe('detectActiveCLI', () => {
  const detectors: CliDetector[] = [opencodeDetector, codexDetector, claudeDetector, copilotDetector]

  it('returns null when no detector matches', () => {
    const result = detectActiveCLI(detectors, {})
    expect(result).toBeNull()
  })

  it('returns match when one env var is set', () => {
    const result = detectActiveCLI(detectors, { OPENCODE: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('opencode')
    expect(result!.confidence).toBe(1)
  })

  it('returns highest confidence match when multiple env vars set', () => {
    const result = detectActiveCLI(detectors, { OPENCODE: '1', COPILOT: '1' })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('opencode')
    expect(result!.confidence).toBe(1)
  })

  it('uses filesystem marker when env vars not set', () => {
    const result = detectActiveCLI(detectors, {}, (marker) => marker === '.opencode')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('opencode')
    expect(result!.confidence).toBe(0.7)
  })

  it('prefers env var over filesystem marker', () => {
    const result = detectActiveCLI(detectors, { CLAUDE_CODE: '1' }, (marker) => marker === '.opencode')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('claude')
    expect(result!.confidence).toBe(1)
  })

  it('uses custom detector with priority ordering', () => {
    const custom: CliDetector = {
      id: 'cursor',
      label: 'Cursor',
      priority: 20,
      detect: () => ({ source: 'cursor' as const, mode: 'direct' as const, label: 'Cursor', confidence: 0.9 }),
    }
    const result = detectActiveCLI([...detectors, custom], {})
    expect(result).not.toBeNull()
    expect(result!.source).toBe('cursor')
  })
})

describe('CliDetection type contract', () => {
  it('all detection results have required fields', () => {
    const results: CliDetection[] = [
      { source: 'opencode', mode: 'hook', label: 'OpenCode', confidence: 1 },
      { source: 'copilot', mode: 'direct', label: 'GitHub Copilot', confidence: 0.8 },
      { source: 'codex', mode: 'hook', label: 'Codex', confidence: 1 },
      { source: 'claude', mode: 'hook', label: 'Claude Code', confidence: 1 },
    ]
    for (const r of results) {
      expect(r.source).toBeDefined()
      expect(r.mode).toBeDefined()
      expect(r.label).toBeDefined()
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
    }
  })
})
