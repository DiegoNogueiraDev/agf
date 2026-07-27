# Security

## IMPORTANT

We do not accept AI generated security reports. We receive a large number of
these and we absolutely do not have the resources to review them all. If you
submit one that will be an automatic ban from the project.

## Threat Model

### Overview

agent-graph-flow is an autonomous AI SWE agent that runs locally on your machine.
It executes code, runs tests, creates files, and interacts with LLM providers.

### No Sandbox

agent-graph-flow does **not** sandbox the agent. The permission system exists
as a UX feature to help users stay aware of what actions the agent is taking.
It is not designed to provide security isolation. If you need true isolation,
run agent-graph-flow inside a Docker container or VM.

### Out of Scope

| Category                       | Rationale                                                               |
| ------------------------------ | ----------------------------------------------------------------------- |
| **LLM provider data handling** | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**        | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**     | Users control their own config; modifying it is not an attack vector    |
| **Local file access**          | The tool has explicit file permissions; bypassing them is by design     |

---

# Reporting Security Issues

We appreciate your efforts to responsibly disclose your findings, and will make
every effort to acknowledge your contributions.

To report a security issue, please use the GitHub Security Advisory
["Report a Vulnerability"](https://github.com/DiegoNogueiraDev/agf/security/advisories/new) tab.

The team will send a response indicating the next steps in handling your report.
After the initial reply to your report, the security team will keep you informed
of the progress towards a fix and full announcement, and may ask for additional
information or guidance.
