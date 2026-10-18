#!/usr/bin/env python3
"""Minimal OSVA Runtime Protocol V1 HTTP server (stdlib only)."""

from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

PROTOCOL_VERSION = "1"
MAX_BODY_BYTES = 1_048_576
EXECUTE_PATH = "/execute"


def execute_agent(input_value: Any) -> dict[str, Any]:
    if not isinstance(input_value, dict):
        raise ValueError("Run input must be an object with a string 'text' property.")
    text = input_value.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Run input must include a non-empty string 'text' property.")
    normalized = " ".join(text.strip().split()).upper()
    return {
        "input": text,
        "normalized": normalized,
        "runtimeLanguage": "python",
    }


def build_success(execution_id: str, output: dict[str, Any]) -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "executionId": execution_id,
        "outcome": "SUCCEEDED",
        "output": output,
    }


def build_failure(execution_id: str, message: str, code: str = "AGENT_EXECUTION_FAILED") -> dict[str, Any]:
    trimmed = message.strip()[:500] or "Agent execution failed."
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "executionId": execution_id,
        "outcome": "FAILED",
        "error": {"code": code, "message": trimmed},
    }


class RuntimeHandler(BaseHTTPRequestHandler):
    server_version = "osva-examples-python-runtime/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def do_POST(self) -> None:  # noqa: N802
        if self.path != EXECUTE_PATH:
            self._send_json(404, build_failure("unknown", "Not found.", "PROTOCOL_FAILURE"))
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > MAX_BODY_BYTES:
            self._send_json(413, build_failure("unknown", "Request body exceeds maximum size.", "PROTOCOL_FAILURE"))
            return

        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, build_failure("unknown", "Request body must be valid JSON.", "PROTOCOL_FAILURE"))
            return

        if body.get("protocolVersion") != PROTOCOL_VERSION:
            self._send_json(
                400,
                build_failure(
                    str(body.get("executionId", "unknown")),
                    "Unsupported protocol version.",
                    "PROTOCOL_FAILURE",
                ),
            )
            return

        execution_id = body.get("executionId")
        if not isinstance(execution_id, str) or not execution_id:
            self._send_json(400, build_failure("unknown", "Missing executionId.", "PROTOCOL_FAILURE"))
            return

        input_value = body.get("input")
        try:
            output = execute_agent(input_value)
        except ValueError as error:
            self._send_json(200, build_failure(execution_id, str(error)))
            return

        self._send_json(200, build_success(execution_id, output))

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> int:
    parser = argparse.ArgumentParser(description="OSVA REMOTE_HTTP Python runtime example")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), RuntimeHandler)
    print(json.dumps({"event": "python_runtime_listening", "host": args.host, "port": args.port}), file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
