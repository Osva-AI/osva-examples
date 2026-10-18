# 17 GitHub automation agent

Safe GitHub-style automation demo using a **fixture connector by default** (no network writes).

## Flow

Read issue → classify → propose label → approval gate → apply fixture write → verify idempotency.

## Modes

| `OSVA_GITHUB_MODE`  | Behavior                                                         |
| ------------------- | ---------------------------------------------------------------- |
| `fixture` (default) | In-memory issue + writes                                         |
| `live`              | **Not implemented** — throws to avoid accidental GitHub mutation |

Set `OSVA_GITHUB_APPROVAL` to `approve`, `reject`, or leave pending.

## Security

CI never calls GitHub. Do not point this example at production repositories.

## Run

```bash
pnpm example:17
```
