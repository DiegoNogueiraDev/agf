export type RunnerState = 'idle' | 'running'

export class Runner<T> {
  private state: RunnerState = 'idle'
  private queue: Array<{ work: () => Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void }> = []

  getState(): RunnerState {
    return this.state
  }

  async run(work: () => Promise<T>): Promise<T> {
    if (this.state === 'running') {
      return new Promise<T>((resolve, reject) => {
        this.queue.push({ work, resolve, reject })
      })
    }
    return this.execute(work)
  }

  cancel(): void {
    this.state = 'idle'
    const pending = this.queue.splice(0)
    for (const item of pending) {
      item.reject(new Error('cancelled'))
    }
  }

  private async execute(work: () => Promise<T>): Promise<T> {
    this.state = 'running'
    try {
      const result = await work()
      this.state = 'idle'
      this.processQueue()
      return result
    } catch (err) {
      this.state = 'idle'
      this.processQueue()
      throw err
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      this.execute(next.work).then(next.resolve).catch(next.reject)
    }
  }
}

export class RecursiveCanceller {
  private nodes = new Map<string, { cb: () => void; parentId?: string }>()

  register(id: string, onCancel: () => void, parentId?: string): void {
    this.nodes.set(id, { cb: onCancel, parentId })
  }

  cancel(id: string): void {
    const node = this.nodes.get(id)
    if (!node) return
    try {
      node.cb()
    } catch {
      /* error isolation */
    }
  }

  cancelTree(rootId: string): void {
    const toCancel = [rootId, ...this.findChildren(rootId)]
    for (const id of toCancel) this.cancel(id)
  }

  private findChildren(parentId: string): string[] {
    const children: string[] = []
    for (const [id, node] of this.nodes) {
      if (node.parentId === parentId) {
        children.push(id, ...this.findChildren(id))
      }
    }
    return children
  }
}
