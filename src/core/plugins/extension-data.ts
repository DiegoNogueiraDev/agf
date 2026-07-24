export type TypeKey<T> = string & { __type: T }

let idCounter = 0
function nextId(): string {
  return String(++idCounter)
}

export class ExtensionData {
  private readonly store = new Map<string, unknown>()
  readonly scopeId: string

  constructor(scopeId: string) {
    this.scopeId = scopeId
  }

  get<T>(key: TypeKey<T>): T | undefined {
    return this.store.get(key) as T | undefined
  }

  getOrInit<T>(key: TypeKey<T>, factory: () => T): T {
    if (this.store.has(key)) {
      return this.store.get(key) as T
    }
    const value = factory()
    this.store.set(key, value)
    return value
  }

  insert<T>(key: TypeKey<T>, value: T): void {
    this.store.set(key, value)
  }

  remove<T>(key: TypeKey<T>): void {
    this.store.delete(key)
  }
}

export function createSessionStore(): ExtensionData {
  return new ExtensionData('session-' + nextId())
}

export function createThreadStore(threadId: string): ExtensionData {
  return new ExtensionData('thread-' + threadId)
}

export function createTurnStore(turnId: string): ExtensionData {
  return new ExtensionData('turn-' + turnId)
}
