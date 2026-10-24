"""Release gate: exit 0 only for a score >= 8.00 with no hard blockers."""

import json
import sys
from pathlib import Path

report_path = Path(__file__).resolve().parent / "reports/latest.json"
if not report_path.exists():
    print("GATE FAIL: no QA report. Run qa/run_qa.sh first.")
    raise SystemExit(1)

report = json.loads(report_path.read_text(encoding="utf-8"))
score = float(report.get("score", 0.0))
blockers = report.get("blockers", [])
print(f"QA score: {score:.2f}/10 (threshold 8.00)")
for name, category in report.get("categories", {}).items():
    print(f"  {name:12s} {category['score']:.2f}  {category['passed']}")
if blockers:
    print("HARD BLOCKERS:")
    for blocker in blockers:
        print(f"  - {blocker}")
if score < 8.00 or blockers:
    print("GATE FAIL")
    raise SystemExit(1)
print("GATE PASS")
