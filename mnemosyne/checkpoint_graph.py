"""LangGraph workflow with a hard approval breakpoint before writing code.

The graph retrieves user/architecture memory, drafts a plan, and stops at
`interrupt_before=["write_code"]`. Nothing is written to the repository until a
human resumes the checkpoint with approval. The demonstration writer only writes
to `mnemosyne/proposals/`, never to application source.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path
from typing import TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

import httpx

from .memory_engine import memory_engine

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "mnemosyne" / "checkpoints.sqlite"
PROPOSALS = ROOT / "mnemosyne" / "proposals"


class CodeState(TypedDict, total=False):
    objective: str
    memory: str
    plan: str
    approved: bool
    proposal_path: str


def retrieve_memory(state: CodeState) -> CodeState:
    memory = memory_engine.context(state["objective"], agent="deepseek")
    return {"memory": memory}


def _deepseek_plan(objective: str, memory: str) -> str:
    model = os.environ.get("MNEMOSYNE_PLANNER_MODEL", "deepseek-r1:14b")
    prompt = (
        "You are a local architecture planner. Use the user memory only when relevant.\n"
        "Return a concise implementation plan. Do not write code.\n\n"
        f"Memory:\n{memory}\n\nObjective:\n{objective}"
    )
    response = httpx.post(
        "http://127.0.0.1:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": 2048},
        },
        timeout=180,
    )
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "").strip()


def plan_change(state: CodeState) -> CodeState:
    memory = state.get("memory") or "No saved preferences found."
    if os.environ.get("MNEMOSYNE_PLANNER", "deterministic").lower() == "deepseek":
        try:
            plan = _deepseek_plan(state["objective"], memory)
        except Exception:
            plan = ""
    else:
        plan = ""
    if not plan:
        plan = (
            f"Objective: {state['objective']}\n\n"
            f"Memory context:\n{memory}\n\n"
            "Plan:\n"
            "1. Inspect the relevant modules and tests.\n"
            "2. Make the smallest change that satisfies the objective.\n"
            "3. Run backend tests and frontend build.\n"
            "4. Stop here for explicit approval before writing code."
        )
    return {"plan": plan, "approved": False}


def write_code(state: CodeState) -> CodeState:
    if not state.get("approved"):
        raise RuntimeError("Refusing to write without explicit approval")
    PROPOSALS.mkdir(parents=True, exist_ok=True)
    path = PROPOSALS / "approved_plan.md"
    path.write_text(state.get("plan", "") + "\n\nApproved by user checkpoint.\n", encoding="utf-8")
    return {"proposal_path": str(path)}


def build_graph(db_path: Path = DB):
    builder = StateGraph(CodeState)
    builder.add_node("retrieve_memory", retrieve_memory)
    builder.add_node("plan_change", plan_change)
    builder.add_node("write_code", write_code)
    builder.add_edge(START, "retrieve_memory")
    builder.add_edge("retrieve_memory", "plan_change")
    builder.add_edge("plan_change", "write_code")
    builder.add_edge("write_code", END)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    saver = SqliteSaver(conn)
    return builder.compile(checkpointer=saver, interrupt_before=["write_code"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("objective", help="Coding/architecture task to plan")
    parser.add_argument("--thread", default="default")
    parser.add_argument("--approve", action="store_true", help="Resume and write the approved proposal")
    args = parser.parse_args()

    graph = build_graph()
    config = {"configurable": {"thread_id": args.thread}}

    if args.approve:
        graph.update_state(config, {"approved": True})
        result = graph.invoke(None, config)
    else:
        result = graph.invoke({"objective": args.objective}, config)

    print(json.dumps(result, indent=2, default=str))
    state = graph.get_state(config)
    print("next:", state.next)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
