# 13 Remote Python agent

## What this demonstrates

OSVA agent runtimes are **language independent**. This example keeps orchestration in TypeScript (`@osva-ai/sdk`) while agent logic runs in a **stdlib Python** HTTP server that speaks Runtime Protocol V1 on `POST /execute`.

```text
TypeScript setup client
  → AgentVersion (REMOTE_HTTP)
  → OSVA worker calls Python /execute
  → Python agent logic
  → structured JSON output
```

## Architecture

```text
examples/13-remote-python-agent/
├── src/            # OSVA registration, run polling, process supervision
└── python/agent.py # REMOTE_HTTP runtime (no frameworks)
```

## OSVA primitives used

| Primitive                                    | Role                                                      |
| -------------------------------------------- | --------------------------------------------------------- |
| `REMOTE_HTTP` runtime in Agent manifest      | Points OSVA at the Python endpoint                        |
| Runtime Protocol V1 execute request/response | `protocolVersion`, `executionId`, `input`, `capabilities` |
| `@osva-ai/sdk` runs API                      | Create AgentVersion, start Run, poll RunAttempt           |

## Offline vs live behavior

| Mode                    | Behavior                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Offline tests**       | Manifest/input contracts always run; Python protocol tests run when `python3`/`python`/`py -3` is available |
| **Live (`pnpm start`)** | Spawns Python locally, registers AgentVersion, executes through your OSVA deployment                        |

CI does not require OSVA. Python protocol tests are **skipped** (with an explicit placeholder test message) when no interpreter is found.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- Python 3.11+ on `PATH` for local `pnpm start` and protocol tests
- OSVA OSS 1.0.0 for live runs
- Worker reachability to `OSVA_AGENT_RUNTIME_URL` (private-network opt-in for loopback)

## Environment variables

See `.env.example`. Key values:

- `OSVA_AGENT_RUNTIME_URL` — Python `/execute` URL as seen by the OSVA worker
- `OSVA_EXAMPLE_RUNTIME_PORT` — port used when spawning Python locally (default `8790`)
- `OSVA_EXAMPLE_PYTHON` — optional explicit interpreter path

## How to run

```bash
# Optional: run Python runtime alone
python examples/13-remote-python-agent/python/agent.py --host 127.0.0.1 --port 8790

# Full example (spawns Python, registers agent, runs)
pnpm install
pnpm --filter @osva-examples/13-remote-python-agent build
pnpm example:13
```

## Expected output

```json
{
  "attemptStatus": "SUCCEEDED",
  "output": {
    "input": "hello from the remote python example",
    "normalized": "HELLO FROM THE REMOTE PYTHON EXAMPLE",
    "runtimeLanguage": "python"
  }
}
```

## Expected observability

Standard Run / RunAttempt records without TOOL or MODEL steps (this agent does not invoke capabilities).

## Limitations

- Python runtime uses only stdlib; capability tokens are accepted on the wire but not exercised (no model/tool calls from Python in this minimal example).
- Process supervision is example-grade, not production hardened.
- Windows may require `OSVA_EXAMPLE_PYTHON` if neither `py -3` nor `python` resolves.

## Production extensions

- Package Python as a container `REMOTE_HTTP` or `CONTAINER` runtime.
- Add health checks, structured logging, and graceful shutdown hooks.
- Invoke OSVA capabilities from Python using the same Runtime Protocol capability paths as TypeScript.

## Security notes

- Do not log capability tokens from execute requests.
- Keep Python runtime off public interfaces; OSVA workers should be the primary callers.
