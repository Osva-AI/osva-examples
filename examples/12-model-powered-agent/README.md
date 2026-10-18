# 12 Model-powered agent

## What this demonstrates

Example 01 starts an existing AgentVersion and polls the result. This example shows the smallest **model-bound** REMOTE_HTTP agent: structured run input, `context.models.generateText()` through the OSVA runtime capability protocol, structured output derived from model text, and public **MODEL** run-step observability.

```text
Run input (question)
       ↓
REMOTE_HTTP agent runtime
       ↓
context.models.generateText("classifier_model")
       ↓
OSVA ModelGateway (live) / mocked capability transport (tests)
       ↓
Structured output { category, modelText, binding }
```

## Architecture

```text
external setup client (@osva-ai/sdk)
  → ModelProfileVersion bound in AgentVersion manifest
  → OSVA invokes REMOTE_HTTP /execute
  → agent calls context.models.generateText(binding)
  → OSVA routes to configured provider credentials
  → MODEL run steps recorded on the RunAttempt
```

## OSVA primitives used

| Primitive                                                | Role                                   |
| -------------------------------------------------------- | -------------------------------------- |
| Agent manifest `capabilities.model: true`                | Declares model capability              |
| Manifest `models.classifier_model.modelProfileVersionId` | Binds a ModelProfileVersion            |
| Runtime `context.models.generateText`                    | Supported 1.0 model invocation surface |
| Runtime Protocol V1 generateText capability              | Worker ↔ ModelGateway transport        |
| `/v1/runs/.../steps` with `kind: "MODEL"`                | Observability for model calls          |

## Offline vs live behavior

| Mode                      | What runs                                             | Model API key required?                                                                   |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Offline (`pnpm test`)** | Contract tests, mocked `fetch`, deterministic parsing | No                                                                                        |
| **Live (`pnpm start`)**   | Local runtime + real OSVA Run against ModelGateway    | No in this repo; provider credentials belong in the OSVA deployment / ModelProfileVersion |

Offline tests **do not** call OpenAI, Anthropic, or Google. Live runs **do** require a working OSVA 1.0 stack with provider credentials configured for the chosen ModelProfileVersion.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web and worker services for live runs
- API key with permission to create agents/runs and (optionally) model profiles
- Worker reachability to `OSVA_AGENT_RUNTIME_URL`
- A ModelProfileVersion with working provider credentials, **or** permission to create one through `/v1/model-profiles` (see limitations)

For loopback development, enable the documented private-network opt-in on the OSVA deployment when the worker must call `127.0.0.1`:

```text
OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true
```

## Environment variables

Copy `.env.example` and export values in your shell (tests do not auto-load `.env`).

| Variable                        | Required                    | Purpose                                                |
| ------------------------------- | --------------------------- | ------------------------------------------------------ |
| `OSVA_BASE_URL`                 | Live                        | OSVA API base URL                                      |
| `OSVA_API_KEY`                  | Live                        | Bearer API key                                         |
| `OSVA_AGENT_RUNTIME_URL`        | Live                        | REMOTE_HTTP `/execute` URL as seen by the worker       |
| `OSVA_MODEL_PROFILE_VERSION_ID` | Live (recommended)          | Existing ModelProfileVersion to bind                   |
| `OSVA_EXAMPLE_MODEL_PROVIDER`   | Live (optional create path) | `OPENAI`, `ANTHROPIC`, or `GOOGLE_GEMINI`              |
| `OSVA_EXAMPLE_MODEL_ID`         | Live (optional create path) | Provider model id when auto-creating a profile version |
| `OSVA_EXAMPLE_INPUT_QUESTION`   | Optional                    | Demo question text                                     |
| `OSVA_EXAMPLE_RUNTIME_PORT`     | Optional                    | Local runtime listen port (default `8789`)             |
| `OSVA_RUN_TIMEOUT_MS`           | Optional                    | Poll deadline (default `120000`)                       |

Never commit provider secrets or API keys. Do not pass credentials in run input or prompts.

## How to run

From the repository root:

```bash
pnpm install
pnpm --filter @osva-examples/12-model-powered-agent build
pnpm example:12
```

Or from this directory:

```bash
pnpm build
pnpm start
```

## Expected output

Terminal JSON includes workspace id, model profile version id, agent/run ids, attempt status, structured agent output, and filtered `modelActivity` (`kind: "MODEL"` steps).

```json
{
  "attemptStatus": "SUCCEEDED",
  "output": {
    "question": "How do I cancel my subscription and get a refund?",
    "category": "billing",
    "modelText": "{\"category\":\"billing\"}",
    "binding": "classifier_model"
  },
  "modelActivity": [
    {
      "kind": "MODEL",
      "bindingName": "classifier_model",
      "status": "SUCCEEDED",
      "modelProfileVersionId": "<id>"
    }
  ]
}
```

Exact category text depends on the live model.

## Expected observability

In the OSVA product or via `/v1/runs/{runId}/attempts/{attemptId}/steps`, expect at least one **MODEL** step named `classifier_model`, linked to the bound `modelProfileVersionId`, transitioning `RUNNING → SUCCEEDED` (or `FAILED` with a model error code).

## Limitations

- `@osva-ai/sdk@1.0.0` does **not** include a typed `modelProfiles` client. This example uses `OsvaHttpClient` with `/v1/model-profiles` for optional demo provisioning. Confirm that route against your deployment; prefer `OSVA_MODEL_PROFILE_VERSION_ID` from the Product Console when unsure.
- Stage 1 ModelGateway supports **generateText** only (no tool-use or structured-output API on the runtime surface).
- The agent expects the model to return JSON `{ "category": "..." }`. Malformed model text fails the run deterministically.
- Auto-created ModelProfileVersions still rely on **deployment-level** provider credentials; this example never embeds provider API keys.

## Production extensions

- Tighten output with provider-native structured output once exposed through OSVA.
- Add evaluation suites (`@osva-ai/sdk` evaluation resources) for classification quality.
- Split bindings (fast vs reasoning models) across workflow nodes.
- Centralize model profile governance instead of per-run registry creation.

## Security notes

- Capability tokens are injected by OSVA at execute time; the agent code never sees provider keys.
- Use `@osva-examples/utils` redaction helpers when logging errors in wrappers around this example.
- Keep write scopes minimal on API keys used for demos.
