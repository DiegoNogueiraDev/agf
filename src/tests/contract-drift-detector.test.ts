import { describe, it, expect } from 'vitest'
import { DriftBlockedError, detectContractDrift, assertNoDrift } from '../core/scaffolder/contract-drift-detector.js'
import type { ContractSignature } from '../core/scaffolder/contract-drift-detector.js'

describe('detectContractDrift', () => {
  it('returns no drift when signatures match', () => {
    const sig: ContractSignature = { methods: { doThing: '(id: string) => void' } }
    const report = detectContractDrift('MyContract', sig, sig)
    expect(report.hasDrift).toBe(false)
    expect(report.changes).toHaveLength(0)
    expect(report.contractName).toBe('MyContract')
  })

  it('detects added_in_code when method appears in code but not graph', () => {
    const graphSig: ContractSignature = { methods: {} }
    const codeSig: ContractSignature = { methods: { newMethod: '() => void' } }
    const report = detectContractDrift('C', graphSig, codeSig)
    expect(report.hasDrift).toBe(true)
    expect(report.changes.some((c) => c.type === 'added_in_code')).toBe(true)
  })

  it('detects removed_from_code when method in graph is missing from code', () => {
    const graphSig: ContractSignature = { methods: { oldMethod: '() => void' } }
    const codeSig: ContractSignature = { methods: {} }
    const report = detectContractDrift('C', graphSig, codeSig)
    expect(report.hasDrift).toBe(true)
    expect(report.critical).toBe(true)
    expect(report.changes.some((c) => c.type === 'removed_from_code')).toBe(true)
  })

  it('detects signature_changed when method signature differs', () => {
    const graphSig: ContractSignature = { methods: { doThing: '(id: string) => void' } }
    const codeSig: ContractSignature = { methods: { doThing: '(id: number) => void' } }
    const report = detectContractDrift('C', graphSig, codeSig)
    expect(report.hasDrift).toBe(true)
    expect(report.changes.some((c) => c.type === 'signature_changed')).toBe(true)
  })
})

describe('assertNoDrift', () => {
  it('does not throw when no drift', () => {
    const sig: ContractSignature = { methods: { go: '() => void' } }
    const report = detectContractDrift('C', sig, sig)
    expect(() => assertNoDrift(report, { mode: 'strict', phase: 'IMPLEMENT' })).not.toThrow()
  })

  it('throws DriftBlockedError in strict mode with critical drift', () => {
    const graphSig: ContractSignature = { methods: { missing: '() => void' } }
    const codeSig: ContractSignature = { methods: {} }
    const report = detectContractDrift('C', graphSig, codeSig)
    expect(() => assertNoDrift(report, { mode: 'strict', phase: 'IMPLEMENT' })).toThrow(DriftBlockedError)
  })

  it('does not throw in advisory mode even with critical drift', () => {
    const graphSig: ContractSignature = { methods: { missing: '() => void' } }
    const codeSig: ContractSignature = { methods: {} }
    const report = detectContractDrift('C', graphSig, codeSig)
    expect(() => assertNoDrift(report, { mode: 'advisory', phase: 'IMPLEMENT' })).not.toThrow()
  })
})
