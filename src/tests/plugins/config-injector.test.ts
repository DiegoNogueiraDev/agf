import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('PluginConfigInjector', () => {
  it('collectHostValues() returns api_key and base_url from config-like object', async () => {
    const { collectHostValues } = await import('../../core/plugins/config-injector.js')
    const config = { api_key: 'sk-test', base_url: 'https://api.test.com' }
    const values = collectHostValues(config)
    expect(values.api_key).toBe('sk-test')
    expect(values.base_url).toBe('https://api.test.com')
  })

  it('collectHostValues() returns empty object for empty config', async () => {
    const { collectHostValues } = await import('../../core/plugins/config-injector.js')
    expect(collectHostValues({})).toEqual({})
  })

  it('injectConfig() templates {{host.api_key}} into plugin config', async () => {
    const { injectConfig } = await import('../../core/plugins/config-injector.js')
    const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-test-'))
    const pluginSpec = {
      name: 'test-plugin',
      config_file: 'config.json',
      inject: { api_key: '{{host.api_key}}', base_url: '{{host.base_url}}' },
    }

    await injectConfig(tmpDir, pluginSpec, { api_key: 'sk-123', base_url: 'https://api.test.com' })

    const configPath = join(tmpDir, 'config.json')
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.api_key).toBe('sk-123')
    expect(config.base_url).toBe('https://api.test.com')
  })

  it('injectConfig() handles missing optional values gracefully', async () => {
    const { injectConfig } = await import('../../core/plugins/config-injector.js')
    const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-test-'))
    const pluginSpec = { name: 'test', inject: { key: '{{host.api_key}}' } }

    await injectConfig(tmpDir, pluginSpec, {})

    const configPath = join(tmpDir, 'config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.key).toBe('')
  })
})
