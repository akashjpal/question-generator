"""
Terminal harness for driving the agent without any UI — validates the
upload -> generate -> publish -> update tool chain against the REAL
question-generator-api-ts service, and doubles as a live smoke test of the
state-rebuild-from-rows algorithm (agent/state.py) since there's no
checkpointer: this script accumulates its own local `rows`-shaped list
across turns, exactly like persistence/chat_store.py would, and calls
build_state_from_rows() before every ainvoke() — the same thing
agent/runner.py does per HTTP request.

Usage:
    cd ai-agent-chatbot
    python scripts/chat_cli.py --token <supabase-jwt> --user-id <uuid> [--pdf path/to/file.pdf]

Requires a real .env (SUPABASE_URL/KEY, OPENROUTER_API_KEY, QUESTION_GENERATOR_API_URL)
and a live question-generator-api to talk to. Not exercised automatically in
CI/this session — no credentials available here.
"""
import argparse
import asyncio
import itertools
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.graph import get_graph  # noqa: E402
from agent.request_context import set_current_token  # noqa: E402
from agent.state import build_state_from_rows  # noqa: E402
from agent.tools.qgen_api_client import QGenApiClient  # noqa: E402

_seq = itertools.count()


def _row(role: str, content: str, tool_name: str | None = None, tool_payload: dict | None = None) -> dict:
    return {
        "id": str(uuid.uuid4()), "role": role, "content": content,
        "tool_name": tool_name, "tool_payload": tool_payload, "sequence": next(_seq),
    }


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="Supabase JWT for a real teacher account")
    parser.add_argument("--user-id", required=True, help="Supabase user id matching --token")
    parser.add_argument("--pdf", help="Optional path to a PDF to attach before chatting")
    parser.add_argument("--session-id", default="cli-session")
    args = parser.parse_args()

    set_current_token(args.token)
    session_row = {"id": args.session_id, "pending_file_id": None, "pending_file_name": None, "last_assessment_id": None}
    rows: list[dict] = []

    if args.pdf:
        data = Path(args.pdf).read_bytes()
        client = QGenApiClient(args.token)
        result = await client.upload_file(data, Path(args.pdf).name)
        session_row["pending_file_id"] = result["fileId"]
        session_row["pending_file_name"] = result.get("filename", Path(args.pdf).name)
        print(f"[uploaded] {session_row['pending_file_id']} / {session_row['pending_file_name']}")

    graph = get_graph()

    print("Chat CLI ready. Type a message (Ctrl+C to exit).")
    while True:
        try:
            message = input("> ")
        except (EOFError, KeyboardInterrupt):
            break

        rows.append(_row("user", message))
        state = build_state_from_rows(session_row, args.user_id, rows)

        result = await graph.ainvoke(state)
        for entry in result.get("chat_log", []):
            rows.append(_row(entry["role"], entry["content"], entry.get("tool_name"), entry.get("tool_payload")))

        last = result["messages"][-1]
        print(f"assistant> {last.content}")
        if result.get("published"):
            print(f"[published] {result['published']}")
            session_row["last_assessment_id"] = result["published"]["assessment_id"]


if __name__ == "__main__":
    asyncio.run(main())
