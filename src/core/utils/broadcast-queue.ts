type Subscriber<T> = (item: T) => void

export class BroadcastQueue<T> {
  private readonly subscribers = new Set<Subscriber<T>>()

  subscribe(sub: Subscriber<T>): void {
    this.subscribers.add(sub)
  }

  unsubscribe(sub: Subscriber<T>): void {
    this.subscribers.delete(sub)
  }

  publish(item: T): void {
    for (const sub of this.subscribers) {
      sub(item)
    }
  }
}
