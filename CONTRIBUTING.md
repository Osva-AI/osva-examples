# Contributing to OSVA Examples

Thank you for improving the OSVA examples.

## Principles

Keep examples small, runnable, and focused on public OSVA interfaces. Do not import source files from the `Osva-AI/osva` repository or unpublished workspace packages. Prefer one clear interaction over helper layers that hide how OSVA is used.

Behavior changes should include tests and documentation updates. Large examples or changes to the intended public contract should be discussed in an issue before implementation.

## Local checks

Use Node.js 24+ and pnpm 12.4.1, then run:

```bash
pnpm install
pnpm format
pnpm verify
```

Live integration runs are optional and require a compatible OSVA deployment plus a deliberately supplied test API key. Offline CI must never require real credentials.

## Security

Do not include API keys, provider credentials, private data, or production endpoints in examples or test fixtures. Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under Apache License 2.0.
