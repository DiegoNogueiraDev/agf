export class FiberSet {
  private fibers: Array<{
    work: () => Promise<unknown>
    resolve: (v: unknown) => void
    reject: (e: Error) => void
    started: boolean
  }> = []

  run<T>(work: () => Promise<T>): void {
    this.fibers.push({
      work: work as () => Promise<unknown>,
      resolve: () => {},
      reject: () => {},
      started: false,
    })
  }

  async join(): Promise<unknown[]> {
    const promises = this.fibers.map((fiber) => {
      fiber.started = true
      return fiber.work().catch((err) => err)
    })
    this.fibers = []
    if (promises.length === 0) return []
    return Promise.all(promises)
  }

  clear(): void {
    this.fibers = []
  }
}
