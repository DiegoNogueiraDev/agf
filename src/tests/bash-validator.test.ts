import { describe, it, expect } from 'vitest'
import { validateCommand } from '../core/security/bash-validator.js'

describe('bash-validator', () => {
  describe('validateCommand', () => {
    it('should return safe for empty command', () => {
      const result = validateCommand('')
      expect(result.risk).toBe('safe')
    })

    it('should detect inline exec with $()', () => {
      const result = validateCommand('echo $(whoami)')
      expect(result.risk).toBe('forbidden')
    })

    it('should detect eval command', () => {
      const result = validateCommand('eval "rm -rf /"')
      expect(result.risk).toBe('forbidden')
    })

    it('should detect sh -c invocation', () => {
      const result = validateCommand('sh -c "some command"')
      expect(result.risk).toBe('forbidden')
    })

    it('should detect bash -c invocation', () => {
      const result = validateCommand('bash -c "ls"')
      expect(result.risk).toBe('forbidden')
    })

    it('should detect path escape with ../', () => {
      const result = validateCommand('cat ../../etc/passwd')
      expect(result.risk).toBe('forbidden')
    })

    it('should detect rm as destructive', () => {
      const result = validateCommand('rm -rf /tmp/foo')
      expect(result.risk).toBe('destructive')
    })

    it('should detect dd as destructive', () => {
      const result = validateCommand('dd if=/dev/zero of=/dev/sda')
      expect(result.risk).toBe('destructive')
    })

    it('should detect chmod as destructive', () => {
      const result = validateCommand('chmod 777 /etc/shadow')
      expect(result.risk).toBe('destructive')
    })

    it('should detect mv to /dev/null as destructive', () => {
      const result = validateCommand('mv important.log /dev/null')
      expect(result.risk).toBe('destructive')
    })

    it('should detect npm publish as warn', () => {
      const result = validateCommand('npm publish')
      expect(result.risk).toBe('warn')
    })

    it('should detect git push --force as warn', () => {
      const result = validateCommand('git push origin main --force')
      expect(result.risk).toBe('warn')
    })

    it('should detect git reset --hard as warn', () => {
      const result = validateCommand('git reset --hard HEAD~1')
      expect(result.risk).toBe('warn')
    })

    it('should classify ls as safe', () => {
      const result = validateCommand('ls -la /tmp')
      expect(result.risk).toBe('safe')
    })

    it('should classify git status as safe', () => {
      const result = validateCommand('git status')
      expect(result.risk).toBe('safe')
    })

    it('should classify echo as safe', () => {
      const result = validateCommand('echo hello')
      expect(result.risk).toBe('safe')
    })

    it('should classify unknown commands as safe', () => {
      const result = validateCommand('foobar --help')
      expect(result.risk).toBe('safe')
    })

    it('should include reasons for forbidden risk', () => {
      const result = validateCommand('$(danger)')
      expect(result.reasons.length).toBeGreaterThan(0)
    })
  })
})
