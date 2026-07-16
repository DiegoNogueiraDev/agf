/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager, type LockResult } from '../core/store/lock-manager.js'
import { LockConflictError, OperationError } from '../core/utils/errors.js'

function createMemoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_id   TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      agent_id      TEXT NOT NULL,
      lease_token   TEXT NOT NULL UNIQUE,
      acquired_at   TEXT NOT NULL,
      expires_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resource_locks_agent ON resource_locks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_resource_locks_expires ON resource_locks(expires_at);
  `)
  return db
}

describe('LockManager', () => {
  let db: Database.Database
  let manager: LockManager

  beforeEach(() => {
    db = createMemoryDb()
    manager = new LockManager(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('acquire', () => {
    it('acquires a lock on a resource', () => {
      const result = manager.acquire('resource:1', 'agent-a')

      expect(result.resourceId).toBe('resource:1')
      expect(result.agentId).toBe('agent-a')
      expect(result.leaseToken).toBeTruthy()
      expect(typeof result.leaseToken).toBe('string')
      expect(new Date(result.acquiredAt).getTime()).toBeLessThanOrEqual(Date.now())
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('extracts resource_type from resourceId with colon separator', () => {
      manager.acquire('task:abc-123', 'agent-a')

      const row = db.prepare('SELECT resource_type FROM resource_locks WHERE resource_id = ?').get('task:abc-123') as {
        resource_type: string
      }
      expect(row.resource_type).toBe('task')
    })

    it('uses unknown resource_type when no colon in resourceId', () => {
      manager.acquire('plain-resource', 'agent-a')

      const row = db
        .prepare('SELECT resource_type FROM resource_locks WHERE resource_id = ?')
        .get('plain-resource') as { resource_type: string }
      expect(row.resource_type).toBe('unknown')
    })

    it('re-acquires lock for same agent (upgrades TTL)', () => {
      const first = manager.acquire('resource:1', 'agent-a', 300)
      const second = manager.acquire('resource:1', 'agent-a', 600)

      expect(second.leaseToken).not.toBe(first.leaseToken)
      expect(new Date(second.expiresAt).getTime()).toBeGreaterThan(new Date(first.expiresAt).getTime())

      const rows = db.prepare('SELECT COUNT(*) AS count FROM resource_locks').get() as { count: number }
      expect(rows.count).toBe(1)
    })

    it('throws LockConflictError when locked by another agent', () => {
      manager.acquire('resource:1', 'agent-a')

      expect(() => manager.acquire('resource:1', 'agent-b')).toThrow(LockConflictError)
    })

    it('includes lock details in LockConflictError', () => {
      manager.acquire('resource:1', 'agent-a')

      try {
        manager.acquire('resource:1', 'agent-b')
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LockConflictError)
        const lockErr = err as LockConflictError
        expect(lockErr.details.resourceId).toBe('resource:1')
        expect(lockErr.details.owner).toBe('agent-a')
      }
    })

    it('allows acquire after expired lock is cleaned', async () => {
      const past = new Date(Date.now() - 10_000).toISOString()
      db.prepare(
        `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('resource:1', 'test', 'agent-a', 'stale-token', past, past)

      const result = manager.acquire('resource:1', 'agent-b')
      expect(result.agentId).toBe('agent-b')
    })
  })

  describe('release', () => {
    it('releases a lock by lease token', () => {
      const result = manager.acquire('resource:1', 'agent-a')
      manager.release(result.leaseToken)

      const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('resource:1')
      expect(row).toBeUndefined()
    })

    it('throws OperationError for unknown lease token', () => {
      expect(() => manager.release('non-existent-token')).toThrow(OperationError)
    })
  })

  describe('renew', () => {
    it('renews a lock with new TTL', () => {
      const result = manager.acquire('resource:1', 'agent-a', 60)
      const originalExpiry = result.expiresAt

      manager.renew(result.leaseToken, 600)

      const row = db.prepare('SELECT expires_at FROM resource_locks WHERE resource_id = ?').get('resource:1') as {
        expires_at: string
      }
      expect(new Date(row.expires_at).getTime()).toBeGreaterThan(new Date(originalExpiry).getTime())
    })

    it('throws OperationError for unknown lease token', () => {
      expect(() => manager.renew('non-existent-token')).toThrow(OperationError)
    })
  })

  describe('isHeldByOther', () => {
    it('returns null when resource has no lock', () => {
      expect(manager.isHeldByOther('resource:1', 'agent-a')).toBeNull()
    })

    it('returns null when same agent holds the lock', () => {
      manager.acquire('resource:1', 'agent-a')
      expect(manager.isHeldByOther('resource:1', 'agent-a')).toBeNull()
    })

    it('returns lock info when another agent holds the lock', () => {
      manager.acquire('resource:1', 'agent-a')
      const info = manager.isHeldByOther('resource:1', 'agent-b')

      expect(info).not.toBeNull()
      expect(info!.resourceId).toBe('resource:1')
      expect(info!.agentId).toBe('agent-a')
      expect(info!.resourceType).toBe('resource')
    })

    it('returns null when lock has expired', () => {
      const past = new Date(Date.now() - 10_000).toISOString()
      db.prepare(
        `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('resource:1', 'test', 'agent-a', 'stale-token', past, past)

      expect(manager.isHeldByOther('resource:1', 'agent-b')).toBeNull()
    })
  })

  describe('listActive', () => {
    it('returns empty array when no locks exist', () => {
      expect(manager.listActive()).toEqual([])
    })

    it('lists all active locks', () => {
      manager.acquire('resource:1', 'agent-a')
      manager.acquire('resource:2', 'agent-b')

      const active = manager.listActive()
      expect(active).toHaveLength(2)
      expect(active.map((l) => l.resourceId)).toEqual(expect.arrayContaining(['resource:1', 'resource:2']))
    })

    it('excludes expired locks', () => {
      manager.acquire('resource:1', 'agent-a', 1)

      const past = new Date(Date.now() - 10_000).toISOString()
      db.prepare(
        `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('resource:2', 'test', 'agent-b', 'stale-token', past, past)

      const active = manager.listActive()
      expect(active).toHaveLength(1)
      expect(active[0].resourceId).toBe('resource:1')
    })
  })

  describe('cleanExpired', () => {
    it('returns 0 when no expired locks exist', () => {
      manager.acquire('resource:1', 'agent-a', 300)
      expect(manager.cleanExpired()).toBe(0)
    })

    it('removes expired locks', () => {
      const past = new Date(Date.now() - 10_000).toISOString()
      db.prepare(
        `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('resource:1', 'test', 'agent-a', 'stale-token', past, past)

      expect(manager.cleanExpired()).toBe(1)

      const row = db.prepare('SELECT * FROM resource_locks').get()
      expect(row).toBeUndefined()
    })
  })

  describe('concurrent scenarios', () => {
    it('supports multiple independent locks', () => {
      const r1 = manager.acquire('resource:1', 'agent-a')
      const r2 = manager.acquire('resource:2', 'agent-b')
      const r3 = manager.acquire('resource:3', 'agent-a')

      expect(r1.resourceId).toBe('resource:1')
      expect(r2.resourceId).toBe('resource:2')
      expect(r3.resourceId).toBe('resource:3')

      expect(manager.listActive()).toHaveLength(3)
    })

    it('handles acquire-release-reacquire cycle', () => {
      const result = manager.acquire('resource:1', 'agent-a')
      manager.release(result.leaseToken)

      const reacquired = manager.acquire('resource:1', 'agent-b')
      expect(reacquired.agentId).toBe('agent-b')
    })

    it('throws on release of already-released lock', () => {
      const result = manager.acquire('resource:1', 'agent-a')
      manager.release(result.leaseToken)

      expect(() => manager.release(result.leaseToken)).toThrow(OperationError)
    })

    it('acquire with custom TTL', () => {
      const result = manager.acquire('resource:1', 'agent-a', 10)
      const diff = new Date(result.expiresAt).getTime() - new Date(result.acquiredAt).getTime()
      expect(diff).toBe(10_000)
    })
  })
})
