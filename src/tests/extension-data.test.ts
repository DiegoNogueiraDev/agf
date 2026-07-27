import { describe, it, expect } from 'vitest'
import {
  ExtensionData,
  createSessionStore,
  createThreadStore,
  createTurnStore,
  type TypeKey,
} from '../core/plugins/extension-data.js'

interface UserConfig {
  name: string
  model: string
}

interface SessionState {
  turnCount: number
  startTime: number
}

const UserConfigKey: TypeKey<UserConfig> = 'UserConfig'
const SessionStateKey: TypeKey<SessionState> = 'SessionState'

describe('ExtensionData', () => {
  it('should store and retrieve values by key', () => {
    const store = new ExtensionData('test-scope')
    store.insert(UserConfigKey, { name: 'test', model: 'gpt-4' })
    const result = store.get(UserConfigKey)
    expect(result).toBeDefined()
    expect(result!.name).toBe('test')
    expect(result!.model).toBe('gpt-4')
  })

  it('should isolate values of different keys', () => {
    const store = new ExtensionData('test-scope')
    store.insert(UserConfigKey, { name: 'test', model: 'gpt-4' })
    store.insert(SessionStateKey, { turnCount: 5, startTime: Date.now() })
    const config = store.get(UserConfigKey)
    const state = store.get(SessionStateKey)
    expect(config!.name).toBe('test')
    expect(state!.turnCount).toBe(5)
  })

  it('should return undefined for non-existent key', () => {
    const store = new ExtensionData('test-scope')
    expect(store.get(UserConfigKey)).toBeUndefined()
  })

  it('should getOrInit only call factory once', () => {
    const store = new ExtensionData('test-scope')
    let callCount = 0
    const factory = () => {
      callCount++
      return { name: 'test', model: 'gpt-4' }
    }

    const first = store.getOrInit(UserConfigKey, factory)
    const second = store.getOrInit(UserConfigKey, factory)
    expect(first.name).toBe('test')
    expect(second.name).toBe('test')
    expect(callCount).toBe(1)
  })

  it('should remove values', () => {
    const store = new ExtensionData('test-scope')
    store.insert(UserConfigKey, { name: 'test', model: 'gpt-4' })
    expect(store.get(UserConfigKey)).toBeDefined()
    store.remove(UserConfigKey)
    expect(store.get(UserConfigKey)).toBeUndefined()
  })

  it('should overwrite existing value on insert', () => {
    const store = new ExtensionData('test-scope')
    store.insert(UserConfigKey, { name: 'v1', model: 'a' })
    store.insert(UserConfigKey, { name: 'v2', model: 'b' })
    const result = store.get(UserConfigKey)
    expect(result!.name).toBe('v2')
  })
})

describe('ExtensionData scopes', () => {
  it('should create independent session store', () => {
    const session = createSessionStore()
    session.insert(UserConfigKey, { name: 'session-user', model: 'gpt-4' })
    expect(session.scopeId).toContain('session')
  })

  it('should create independent thread store', () => {
    const thread = createThreadStore('thread-1')
    thread.insert(UserConfigKey, { name: 'thread-user', model: 'gpt-5' })
    expect(thread.scopeId).toContain('thread-1')
  })

  it('should create independent turn store', () => {
    const turn = createTurnStore('turn-1')
    turn.insert(UserConfigKey, { name: 'turn-user', model: 'gpt-6' })
    expect(turn.scopeId).toContain('turn-1')
  })

  it('should not share data between scopes', () => {
    const session = createSessionStore()
    const thread = createThreadStore('thread-1')
    const turn = createTurnStore('turn-1')

    session.insert(UserConfigKey, { name: 'session', model: 'a' })
    thread.insert(UserConfigKey, { name: 'thread', model: 'b' })
    turn.insert(UserConfigKey, { name: 'turn', model: 'c' })

    expect(session.get(UserConfigKey)!.name).toBe('session')
    expect(thread.get(UserConfigKey)!.name).toBe('thread')
    expect(turn.get(UserConfigKey)!.name).toBe('turn')
  })
})
