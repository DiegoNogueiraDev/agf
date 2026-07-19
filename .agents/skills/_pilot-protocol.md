# Pilot Protocol — Task Execution Loop

1. `agf start` to pull + context + mark in_progress
2. Implement with TDD (Red → Green → Refactor)
3. `agf check <id>` for DoD validation (12 checks)
4. `agf done <id>` to complete + store memory + suggest next

**Delegated mode:** `agf brief <id>` → execute → `agf submit <id> --result '...'`
