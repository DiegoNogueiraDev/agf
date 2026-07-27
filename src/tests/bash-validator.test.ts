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

    // Regression (node_7c555adcc61a): command chaining must not mask a dangerous segment.
    // The classifier used ^-anchored rules that only inspected the FIRST command in a chain,
    // so a destructive command hidden after a safe one was reported `safe` — a validator
    // called BEFORE shell exec letting `rm -rf /` through. Each segment must be classified;
    // the aggregate risk is the most severe segment.
    describe('command chaining / separators (bypass regression)', () => {
      it('flags destructive command chained after a safe one with ;', () => {
        expect(validateCommand('ls; rm -rf /').risk).toBe('destructive')
      })

      it('flags destructive command chained with &&', () => {
        expect(validateCommand('git status && rm -rf ~').risk).toBe('destructive')
      })

      it('flags destructive command chained with ||', () => {
        expect(validateCommand('cat foo || chmod -R 777 /').risk).toBe('destructive')
      })

      it('flags destructive command piped after a safe one', () => {
        expect(validateCommand('echo x | dd if=/dev/zero of=/dev/sda').risk).toBe('destructive')
      })

      it('flags a forbidden segment (eval) hidden after a safe command', () => {
        expect(validateCommand('ls && eval "rm -rf /"').risk).toBe('forbidden')
      })

      it('returns the MOST severe risk across segments (forbidden > destructive)', () => {
        // destructive rm + forbidden path-escape → forbidden wins
        expect(validateCommand('rm foo; cat ../../etc/passwd').risk).toBe('forbidden')
      })

      it('keeps a fully-safe chain safe (no false positive)', () => {
        expect(validateCommand('ls && git status && cat README.md').risk).toBe('safe')
      })
    })
  })
})
