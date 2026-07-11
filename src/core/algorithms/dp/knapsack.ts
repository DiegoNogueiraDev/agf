export function knapsack01(values: number[], weights: number[], capacity: number): number {
  const n = values.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let w = 1; w <= capacity; w++) {
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weights[i - 1]] + values[i - 1])
      } else {
        dp[i][w] = dp[i - 1][w]
      }
    }
  }
  return dp[n][capacity]
}

export interface KnapsackResult {
  totalValue: number
  selected: number[]
}

export function knapsack01Items(values: number[], weights: number[], capacity: number): KnapsackResult {
  const n = values.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let w = 1; w <= capacity; w++) {
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weights[i - 1]] + values[i - 1])
      } else {
        dp[i][w] = dp[i - 1][w]
      }
    }
  }
  const selected: number[] = []
  let w = capacity
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(i - 1)
      w -= weights[i - 1]
    }
  }
  selected.reverse()
  return { totalValue: dp[n][capacity], selected }
}
