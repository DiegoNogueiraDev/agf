import { describe, it, expect } from 'vitest'
import { showBanner } from '../cli/banner.js'

describe('showBanner', () => {
  it('is a function', () => {
    expect(typeof showBanner).toBe('function')
  })

  it('returns a Promise', () => {
    const result = showBanner()
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('resolves without error in non-TTY environment', async () => {
    await expect(showBanner()).resolves.toBeUndefined()
  })
})
