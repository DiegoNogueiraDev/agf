# Parity Report — projscan

Deterministic scan (Go, stdlib). Compares source repos against `self` to surface capability gaps.

## Inventory

| Repo             | Files |     LOC | Exported symbols |
| ---------------- | ----: | ------: | ---------------: |
| agent-graph-flow |   924 |  173251 |             3668 |
| opencode-dev     |  5572 | 1336168 |             8787 |
| codex            |  4785 | 1215756 |            15608 |

## Top modules by exported-symbol count

**agent-graph-flow**: src (3668)

**opencode-dev**: packages (8759), infra (25), sdks (2), sst-env.d.ts (1)

**codex**: codex-rs (14059), sdk (1195), scripts (123), .codex (119), .github (77), tools (22), codex-cli (9), .devcontainer (4)

## Capability matrix (keyword hits per repo)

| Capability       | agent-graph-flow | opencode-dev | codex | gap? |
| ---------------- | ---------------: | -----------: | ----: | :--: |
| sandbox          |              259 |          230 | 11667 |      |
| approval         |              321 |          198 | 10647 |      |
| exec_policy      |              262 |           13 |  1405 |      |
| compaction       |              520 |         1728 |  4514 |      |
| prompt_cache     |               17 |          148 |   380 |      |
| retry            |              684 |         1553 |  1896 |      |
| diff             |              313 |         3930 |  2662 |      |
| apply_patch      |              608 |         1276 |  3424 |      |
| hooks            |              571 |          253 |  3409 |      |
| profile          |              236 |          689 |  6245 |      |
| reasoning_effort |               13 |          306 |  2399 |      |
| provider         |              948 |        16727 |  5385 |      |
| mcp              |             2769 |         4839 | 14236 |      |
| fuzzy            |              276 |           57 |   393 |      |
| history          |              377 |          823 |  5458 |      |
| streaming        |               52 |          127 |   561 |      |
| token_cost       |              594 |         4987 |  3498 |      |
| permission       |              855 |         8494 | 13659 |      |
| skill            |             1023 |         1824 |  6050 |      |
| interrupt        |              125 |         2180 |  7274 |      |
| subagent         |               42 |         1202 |  1840 |      |
| parallel_tools   |                1 |           18 |    16 |      |
| flow_lambda      |               33 |            0 |     0 |      |

## Opportunities (peers invest more — ranked by ratio)

| Capability       | self | leader       | leader hits |  ratio | example files (leader)                                                                      |
| ---------------- | ---: | ------------ | ----------: | -----: | ------------------------------------------------------------------------------------------- |
| reasoning_effort |   13 | codex        |        2399 | 184.5x | codex-rs/analytics/src/analytics_client_tests.rs; codex-rs/analytics/src/client_tests.rs; … |
| interrupt        |  125 | codex        |        7274 |  58.2x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/babysit-pr/agents/openai.yaml; .codex/ski… |
| sandbox          |  259 | codex        |       11667 |  45.0x | .bazelrc; .codex/skills/update-v8-version/SKILL.md; .devcontainer/Dockerfile.secure; .devc… |
| subagent         |   42 | codex        |        1840 |  43.8x | .codex/skills/code-review/SKILL.md; .devcontainer/devcontainer.secure.json; .github/action… |
| approval         |  321 | codex        |       10647 |  33.2x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/codex-bug/SKILL.md; .codex/skills/pushing… |
| profile          |  236 | codex        |        6245 |  26.5x | .bazelrc; .devcontainer/Dockerfile; .devcontainer/Dockerfile.secure; .devcontainer/README.… |
| prompt_cache     |   17 | codex        |         380 |  22.4x | codex-rs/analytics/src/analytics_client_tests.rs; codex-rs/analytics/src/client_tests.rs; … |
| parallel_tools   |    1 | opencode-dev |          18 |  18.0x | packages/app/AGENTS.md; packages/core/src/session/run-coordinator.ts; packages/core/src/se… |
| provider         |  948 | opencode-dev |       16727 |  17.6x | .opencode/agent/triage.md; .opencode/command/ai-deps.md; .opencode/glossary/zh-cn.md; .ope… |
| permission       |  855 | codex        |       13659 |  16.0x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/babysit-pr/references/heuristics.md; .cod… |
| history          |  377 | codex        |        5458 |  14.5x | .codex/skills/code-review-context/SKILL.md; .codex/skills/codex-issue-digest/SKILL.md; .co… |
| diff             |  313 | opencode-dev |        3930 |  12.6x | .github/workflows/docs-locale-sync.yml; .github/workflows/review.yml; .github/workflows/st… |
| streaming        |   52 | codex        |         561 |  10.8x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/update-v8-version/SKILL.md; MODULE.bazel.… |
| compaction       |  520 | codex        |        4514 |   8.7x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/babysit-pr/scripts/gh_pr_watch.py; .codex… |
| token_cost       |  594 | opencode-dev |        4987 |   8.4x | .github/workflows/review.yml; .opencode/command/rmslop.md; infra/monitoring.ts; install; p… |
| hooks            |  571 | codex        |        3409 |   6.0x | .gitattributes; .github/workflows/issue-labeler.yml; MODULE.bazel.lock; codex-rs/Cargo.loc… |
| skill            | 1023 | codex        |        6050 |   5.9x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/code-review/SKILL.md; .codex/skills/codex… |
| apply_patch      |  608 | codex        |        3424 |   5.6x | .codex/skills/update-v8-version/SKILL.md; .github/scripts/rusty_v8_bazel.py; .gitignore; M… |
| exec_policy      |  262 | codex        |        1405 |   5.4x | .devcontainer/README.md; .devcontainer/init-firewall.sh; .github/workflows/blob-size-polic… |
| mcp              | 2769 | codex        |       14236 |   5.1x | .bazelrc; .codex/environments/environment.toml; .codex/skills/codex-issue-digest/scripts/t… |
| retry            |  684 | codex        |        1896 |   2.8x | .codex/skills/babysit-pr/SKILL.md; .codex/skills/babysit-pr/references/github-api-notes.md… |
| fuzzy            |  276 | codex        |         393 |   1.4x | MODULE.bazel.lock; codex-rs/Cargo.lock; codex-rs/Cargo.toml; codex-rs/app-server/README.md… |

## Gaps (present elsewhere, absent in self)

None — `self` has at least one hit for every scanned capability.
