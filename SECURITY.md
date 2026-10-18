# Security Policy

## Reporting vulnerabilities

Do not disclose vulnerabilities through public issues or discussions. Use GitHub Private Vulnerability Reporting for `Osva-AI/osva` or `Osva-AI/osva-examples` when it is enabled.

Include the affected component and version, reproduction steps, potential impact, and a suggested mitigation when known.

## Example security rules

- Keep `OSVA_API_KEY` and provider credentials in the environment or an appropriate secret store.
- Never place credentials in prompts, workflow input, agent manifests, connector metadata, or committed `.env` files.
- Do not log authorization headers or raw secrets.
- Local private-network access for REMOTE_HTTP or MCP connectors must be an explicit OSVA operator opt-in and should not be enabled in production without a threat-model review.
- Keep connector and runtime listeners on loopback unless the local topology requires otherwise.
- Treat agent input, model output, MCP output, workflow events, and downloaded artifacts as untrusted data.

These examples demonstrate application boundaries. They do not replace deployment hardening guidance in the primary OSVA repository.
