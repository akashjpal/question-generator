# RCA: MiniStack S3 Buckets and Lambda Function Disappeared

**Date:** 2026-08-08
**Severity:** Medium — local dev environment only, no production data affected
**Affected Component:** `ministackorg/ministack` container (LocalStack-compatible AWS emulator, referred to as "ministack"), used for the S3 upload + ClamAV Lambda scan pipeline (`MINISTACK_SHELL_RUN.md`)

---

## Root Cause Summary

**MiniStack runs with persistence explicitly disabled, and its container was restarted between Aug 2 and Aug 8 — wiping every in-memory resource (S3 buckets/objects, the Lambda function, IAM role, and the S3→Lambda notification wiring) with no way to recover it.**

This is not data corruption or an accidental deletion — it's expected behavior for how the container is currently configured. Nothing was misconfigured *by you*; the container's defaults simply don't persist anything, and no one wired up storage that would survive a restart.

---


## Deep Dive

### Evidence — container's own logs tell the whole story

`docker logs cranky_antonelli` (the running ministack container) shows:

```
2026-08-02 07:16:03  S3 bucket created: infected-file
2026-08-02 07:16:15  S3 bucket created: correct-files
2026-08-02 07:16:21  S3 bucket created: all-files
2026-08-02 08:34:29  Lambda function created: my-first-lambda (nodejs22.x)
...
2026-08-02 20:11:23  Ready — 69 services available on port 4566.   <- last log line before the gap
2026-08-08 16:30:07  MiniStack starting up again (fresh banner, fresh SFTP host key)
2026-08-08 16:30:08  Ready — 69 services available on port 4566.
2026-08-08 16:40:13  S3 bucket created: all-files                   <- a brand-new bucket, not the old one
```

Between `2026-08-02 20:11:23` and `2026-08-08 16:30:07` the container process stopped and restarted (`docker inspect` confirms `State.StartedAt = 2026-08-08T16:30:05Z`, six days after the buckets/Lambda were created — matching your "about 6 days ago" timeline exactly). The restart re-ran MiniStack's own startup sequence from a blank slate, which is why it re-generated a fresh SFTP host key and started counting services from zero again.

`RestartCount` on the container is `0`, and its restart policy is `"no"` — so this wasn't Docker automatically restarting it after a crash. Something stopped and started it (most likely Docker Desktop / WSL restarting, or a manual `docker stop` + `docker start`), which is a completely normal thing to happen over 6 days, but MiniStack doesn't tolerate it.

### Why the restart wiped everything

`docker inspect cranky_antonelli` shows these environment variables:

```
S3_PERSIST=0
S3_DATA_DIR=/tmp/ministack-data/s3
RDS_PERSIST=0
```

- **`S3_PERSIST=0`** explicitly tells MiniStack to keep S3 state in memory only — it never writes buckets/objects to `S3_DATA_DIR` at all. The directory path being under `/tmp` would be a problem on its own (many base images clear `/tmp` on start), but it's moot here since persistence is off entirely.
- There is **no equivalent persistence flag set for Lambda, IAM, or the S3 notification config** — these emulated services don't have a documented persist toggle in this MiniStack build, and behave the same way: purely in-process state, gone on restart.
- The container's only two volume mounts are `/docker-entrypoint-initaws.d` and `/etc/localstack/init` — these are **init-script** directories (for auto-provisioning on startup), not data directories. Nothing about the running state is backed by a Docker volume.

So every resource you created — `all-files`, `correct-files`, `infected-file` (note: originally created as `infected-file`, singular, not `infected-files` per the setup doc — a separate small inconsistency), the `my-first-lambda` function, its IAM role, and the S3→Lambda trigger wiring — lived only in the container's RAM. The moment the container process restarted, it started a brand-new empty MiniStack instance that happens to share the same container name and volumes (which only ever held init scripts, not data).

### Secondary finding — this container isn't even in `docker-compose.yml`

`ministackorg/ministack` (`cranky_antonelli`) and `davireis/stackport` (`beautiful_morse`, the resource browser UI) were both started with standalone `docker run` commands, not through `docker-compose.yml`. `MINISTACK_SHELL_RUN.md` documents the manual `aws s3 mb`, `iam create-role`, and `lambda create-function` steps but never captures the actual `docker run` invocation used to start MiniStack itself. That means:

- There's no single source of truth for how MiniStack should be started (env vars, ports, volumes).
- `docker compose up` does not bring MiniStack back — it's entirely dependent on someone remembering to `docker start`/`docker run` it separately.
- Every time it needs to be recreated (not just restarted), all the setup steps in `MINISTACK_SHELL_RUN.md` (buckets → IAM role → Lambda → permissions → notification config) have to be redone by hand, in order, with no automation.

---

## Fix Checklist

- [ ] Decide on a persistence strategy for local dev (see options below) — needs your input before implementing
- [ ] Mount a real host-backed Docker volume for MiniStack's data directory (not `/tmp`)
- [ ] Set `S3_PERSIST=1` (and any equivalent flag for Lambda/IAM if the MiniStack build exposes one) so state survives a container restart
- [ ] Add a `ministack` service to `docker-compose.yml` (with the persistent volume) so `docker compose up` is the single way to bring the whole stack up, including MiniStack
- [ ] Turn the manual steps in `MINISTACK_SHELL_RUN.md` (buckets, IAM role, Lambda, permissions, notification config) into a `docker-entrypoint-initaws.d` init script so a fresh/rebuilt container self-provisions instead of requiring manual re-entry of every `aws` command
- [ ] Fix the bucket name typo in `MINISTACK_SHELL_RUN.md` step 2 (`infected-file` created vs. `infected-files` referenced later in the doc)
- [ ] Re-run the setup steps in `MINISTACK_SHELL_RUN.md` once to recreate `all-files`, `correct-files`, `infected-files`, the IAM role, and `my-first-lambda`

## Note

There is also an unrelated Lambda runtime error repeated many times in the Aug 2 logs (`Worker init failed: require() cannot be used on an ESM graph with top-level await`), from before the restart. That's a separate Lambda packaging/runtime issue (CommonJS `require()` hitting an ESM module with top-level `await`), not related to the data-loss bug — flagging it here only because it was visible in the same log capture.
