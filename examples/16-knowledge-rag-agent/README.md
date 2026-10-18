# 16 Knowledge / RAG agent

Demonstrates `context.knowledge.search()` through an OSVA knowledge binding declared on the Agent manifest.

## OSVA primitives

- Manifest `knowledge.product_docs.knowledgeIndexIds`
- Runtime Protocol knowledge search capability
- KNOWLEDGE run steps (live observability)

## Offline vs live

Tests mock the knowledge capability transport and validate answer/source shaping. Live runs require a populated `OSVA_KNOWLEDGE_INDEX_ID` (create/index knowledge in OSVA separately).

## Limitations

This example does not implement a standalone vector database — retrieval is OSVA-managed. Answer text is deterministic concatenation of retrieved passages (no separate model call).

## Run

```bash
pnpm example:16
```
