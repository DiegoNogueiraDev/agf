/*!
 * TDD: /config interactive editor view (node_6043c3fb1a0b).
 *
 * AC1: Renders each field with effective value + source layer.
 * AC2: Source layer is clearly labelled per field.
 */

import { describe, it, expect } from 'vitest'
import { formatConfigView } from '../tui/config-view.js'
import { resolveLayeredConfig } from '../core/config/layered-config.js'

describe('AC1: renders effective value + source for each field', () => {
  it('shows all config fields with their values', () => {
    const cfg = resolveLayeredConfig({})
    const out = formatConfigView(cfg)
    expect(out).toContain('port')
    expect(out).toContain('dbPath')
    expect(out).toContain('contextMode')
  })

  it('shows the effective value', () => {
    const cfg = resolveLayeredConfig({ projectConfig: { port: 9999 } })
    const out = formatConfigView(cfg)
    expect(out).toContain('9999')
  })
})

describe('AC2: source layer labelled per field', () => {
  it('shows "default" source for unset fields', () => {
    const cfg = resolveLayeredConfig({})
    const out = formatConfigView(cfg)
    expect(out).toContain('default')
  })

  it('shows "project" source when project layer sets the value', () => {
    const cfg = resolveLayeredConfig({ projectConfig: { dbPath: 'custom-db' } })
    const out = formatConfigView(cfg)
    expect(out).toContain('project')
    expect(out).toContain('custom-db')
  })

  it('shows "env" source when env overrides', () => {
    const cfg = resolveLayeredConfig({ envOverrides: { contextMode: 'verbose' } })
    const out = formatConfigView(cfg)
    expect(out).toContain('env')
    expect(out).toContain('verbose')
  })
})
