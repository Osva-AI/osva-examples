# 15 Scheduled reporting agent

Demonstrates OSVA **`/v1/schedules`** recurring automation targeting an AgentVersion, plus fixture-backed operational metrics and Markdown artifact creation.

## OSVA primitives

- `client.schedules.create` with `cronExpression`, `timezone`, `enabled`, and agent target
- REMOTE_HTTP agent run (manual demo run in this example)
- `context.artifacts.create` for the report

## Offline vs live

Tests validate schedule schema and report logic without OSVA. Live runs register a schedule (default **`OSVA_SCHEDULE_ENABLED=false`**) and execute one demo run.

## Avoid accidental rapid schedules

Default cron is weekly (`0 9 * * 1`). The example rejects `* * * * *`. Keep `OSVA_SCHEDULE_ENABLED=false` until you intentionally enable the schedule in a non-production workspace.

## Run

```bash
pnpm example:15
```
