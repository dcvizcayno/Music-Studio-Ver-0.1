#!/usr/bin/env bash
# Run the full QA suite and enforce the >= 8.00 release gate.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p qa/reports
PYTHON="$ROOT_DIR/.venv/bin/python"

"$PYTHON" qa/qa_runner.py "$@"
RUNNER_STATUS=$?
"$PYTHON" qa/gate.py
GATE_STATUS=$?

if [[ $RUNNER_STATUS -ne 0 && $GATE_STATUS -eq 0 ]]; then
  echo "QA runner reported a failure but the gate passed; treating as failure."
  exit 1
fi
exit $GATE_STATUS
