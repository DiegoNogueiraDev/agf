# Attach Guide — new-agent quick-start

How to become productive on an `agf` project as a freshly-attached agent.

## 1. Orient

```bash
agf welcome          # stats + next task + lifecycle skill names (zero-token)
agf doctor           # check providers, env vars, db health
```

## 2. Set your identity (multi-agent mode)

```bash
export AGF_AGENT_ID=<your-agent-name>   # e.g. agent-a, copilot-1, claude-code
```

With `AGF_AGENT_ID` set, `agf next` atomically claims a task and skips tasks
held by other agents. Unset = single-agent mode (WIP=1 enforced globally).

## 3. Pull → implement → done loop

```bash
agf next                          # pull next unblocked task (WIP=1)
agf context <id>                  # read the context pack
agf node status <id> in_progress  # claim it
# … TDD: write failing test → minimal code → green → refactor …
npm run test:blast                 # blast gate (mandatory)
agf check <id>                    # DoD gate
agf done <id>                     # mark done + get next
```

## 4. Delegated mode (no LLM provider wired)

```bash
agf next                          # get the task
agf brief <id>                    # generate spec for YOUR LLM to implement
# … implement with your own LLM …
agf submit <id> --result '{"arquivos":["x.ts"],"testes":{"passed":N,"failed":0},"desvios":[]}'
```

## 5. Reference

- `agf help` — full command index
- `agf retrieve-command "<intent>"` — RAG-IN: find the exact command for any intent
- `.claude/rules/tests.md` — test gate hierarchy (blast / node / PR)
- `.agents/skills/graph-builder-leafcutter/SKILL.md` — builder loop skill
