# RCA: `fastapi dev` fails with "Could not find FastAPI app in module, try using --app"

## Symptom
Running `fastapi dev` from `ai-agent-chatbot/` starts the CLI, loads env/config, logs CORS
resolution — then fails before binding a port:

```
Could not find FastAPI app in module, try using --app
```

## To-Do
- [x] Reproduce locally / confirm which module and object the CLI resolves
- [x] Read `fastapi_cli`'s app-discovery logic to see what it actually requires
- [x] Inspect `ai-agent-chatbot/main.py` for what `app` resolves to at module scope
- [x] Determine whether this is a code defect or a dev-command mismatch
- [x] Recommend a fix / correct command

## Root Cause
`fastapi dev` (unlike plain `uvicorn`) auto-discovers the app object by importing the target
module and requiring a module-level attribute that `isinstance(obj, FastAPI)`
(`fastapi_cli/discover.py::get_app_name`, .venv `fastapi-cli` package). It checks `app`, then
`api`, then falls back to scanning every module attribute for a `FastAPI` instance; if none
match, it raises exactly the error seen.

In `ai-agent-chatbot/main.py`:

```python
app = FastAPI(title="AI Question Generator — Agentic Chatbot", lifespan=lifespan)
...
app = CORSMiddleware(app=app, allow_origins=_cors_origins, ...)   # line 59-65
```

`app` is deliberately **reassigned** to a `CORSMiddleware`-wrapped ASGI callable. The comment
above it explains why: Starlette's `ServerErrorMiddleware` sits *outside* any middleware added
via `add_middleware()`, so an unhandled 500 raised deep in a route bypasses that CORS layer and
the browser sees a bare failed-CORS-preflight instead of the real error. Wrapping the whole app
manually (`app = CORSMiddleware(app=app, ...)`) puts CORS outside `ServerErrorMiddleware`, fixing
that gap.

The side effect: after that reassignment, no object left in `main`'s module namespace is a
`FastAPI` instance — `app` is now a `CORSMiddleware`. `fastapi dev`'s isinstance check fails on
every candidate, hence the error. Passing `--app app` doesn't help either, since `app` still
isn't a `FastAPI` instance.

This is not a regression in `main.py` — it's the intended shape of the CORS fix, and it doesn't
affect the deployed path: `ai-agent-chatbot/Dockerfile` (and this repo's convention for the
sibling `question-generator-worker` service) starts the app with plain `uvicorn`, which only
needs an ASGI-callable — it doesn't care what type `app` is. Only the `fastapi dev` convenience
CLI's stricter discovery breaks.

## Fix
Don't use `fastapi dev` for this service. Use `uvicorn` directly, matching how
`question-generator-worker` is already run locally (see root `CLAUDE.md`) and how the Dockerfile
starts it in production:

```bash
cd ai-agent-chatbot
uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

No code change is needed — renaming/exposing a second "pure" `FastAPI` object just to satisfy
`fastapi dev`'s auto-discovery would let the CLI pick that unwrapped object by default and
silently drop the CORS-on-500 fix for local dev, reintroducing the bug the wrapping exists to
prevent.

---

## Follow-on Bug: `GET/POST /sessions` → 500 after the server starts

Once the server actually starts (via `uvicorn`, per the fix above), `/sessions` still 500s.
Confirmed via the startup log: `"Postgres checkpointer unavailable, falling back to in-memory"`.

### To-Do
- [x] Trace `/sessions` → `chat_store.list_sessions` → `get_supabase_admin()` (PostgREST client)
- [x] Confirm `agent_chat_sessions`/`agent_chat_messages` schema bootstrap is tied to checkpointer
      startup (`checkpointer.py:74-79`, same try block as `get_checkpointer()`)
- [x] Check `ai-agent-chatbot/.env`'s `DATABASE_CONNECTION_STRING`
- [x] Check whether copying the real value would even work, given the parser it goes through

### Root Cause (two stacked bugs)
1. **`ai-agent-chatbot/.env` had the literal placeholder** from `.env.example`:
   `Host=your-supabase-db-host;Port=5432;...;Password=your-db-password`. Not a real host, so the
   Postgres connection in `get_checkpointer()` fails immediately.
2. **`_dotnet_conn_string_to_psycopg` only recognized `Host=`/`Username=` keys** — but this
   repo's actual `DATABASE_CONNECTION_STRING` convention (see root `.env`, and what's passed to
   `AttemptAPI`/`ReportsAPI` as `ConnectionStrings__DefaultConnection` via `docker-compose.yml`)
   is Npgsql's other alias: `User Id=..;Password=..;Server=..;Port=..;Database=..`. Npgsql itself
   accepts both aliases interchangeably, but this hand-rolled parser only checked one, so
   `pairs.get("Host", "localhost")` and `pairs.get("Username", "postgres")` silently fell through
   to their defaults — `host=localhost user=postgres` — instead of raising. **This means even
   after fixing bug #1, the checkpointer would still fail** (or silently point at the wrong
   Postgres). Because `docker-compose.yml` feeds the container the exact same root-`.env`-format
   string, **this also affects the Docker/production path**, not just local dev — the checkpointer
   has likely never actually connected to Postgres, only ever run in the in-memory fallback.

Both bugs compound: because the schema bootstrap (`CHAT_SCHEMA_SQL`) lives inside the same
try block as the checkpointer connection, any failure there — for either reason above — skips
table creation entirely, so `public.agent_chat_sessions` never exists and every `/sessions`
request 500s via an unhandled PostgREST "relation does not exist" error.

### Fix Applied
- `ai-agent-chatbot/.env`: replaced the placeholder with the real value (copied from root `.env`,
  which is already gitignored — this file is too).
- `ai-agent-chatbot/persistence/checkpointer.py::_dotnet_conn_string_to_psycopg`: now checks all
  of Npgsql's key aliases (`Host`/`Server`, `Username`/`User Id`/`User ID`/`UID`,
  `Password`/`PWD`, `Database`/`DB`) instead of only one each, so it resolves correctly regardless
  of which alias the connection string uses. Verified against the real connection string: now
  resolves to the correct `aws-1-ap-southeast-1.pooler.supabase.com` host and
  `postgres.itjchqbvvnpsitsgxvnu` user instead of silently falling back to `localhost`/`postgres`.

### Verification still needed
- [ ] Restart the `ai-agent-chatbot` server and confirm the log now reads
      `"LangGraph Postgres checkpointer ready (schema: langgraph)."`
- [ ] Re-run `GET /sessions` and confirm 200 (empty list is fine — table just needs to exist)
- [ ] Re-run `POST /sessions` and confirm the returned `id` is a well-formed UUID
