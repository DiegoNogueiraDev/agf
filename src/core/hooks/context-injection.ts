const accumulatedFacts: string[] = []
const MAX_FACTS = 10

export function pushFact(fact: string): void {
  accumulatedFacts.push(fact)
  if (accumulatedFacts.length > MAX_FACTS) accumulatedFacts.shift()
}

export function getCompactFacts(): string {
  if (accumulatedFacts.length === 0) return ''
  return accumulatedFacts.map((f) => `  • ${f}`).join('\n')
}

export function resetFacts(): void {
  accumulatedFacts.length = 0
}
