# Running the Stack on MiniStack ECS — Learning TODO

Goal: run the question-generator services as ECS tasks/services on MiniStack,
learning ECS by doing. Images come from MiniStack ECR (already working).

## Findings so far (verified live)

- [x] MiniStack ECR works end to end — `create-repository` → `docker push` → `docker pull`
- [x] `question-generator-api:dev` + `:v2` pushed; `reports-api` repo created
- [x] MiniStack ECS **really launches containers** via docker-py
      (`docker_client.containers.run(cdef["image"], ...)`, labelled `ministack=ecs`)
- [x] ECS containers join **MiniStack's own Docker network** (auto-detected from
      its container), so they can reach `redis`, `clamav`, `ministack` by name
- [x] 18 ECS actions supported incl. CreateService / UpdateService / ExecuteCommand
- [x] **BLOCKER**: `/var/run/docker.sock` is NOT mounted into the `ministack`
      container → `docker.from_env()` fails → `RunTask` silently launches nothing
- [x] No `awslogs` log-driver support → task logs come from `docker logs`, not
      CloudWatch
- [x] AWS CLI **is** installed on the host (`aws-cli/2.36.24`, at
      `C:\Users\palga\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe`). It is not on
      Git Bash's PATH, only PowerShell's — which is why the first check missed it.
      No `docker exec` needed, and no `./ecs:/ecs:ro` mount needed either, since
      `file://` paths now resolve on the host.
- [x] **ECR state does NOT survive in practice.** `/var/lib/ministack/state/`
      holds only `cognito-rsa-key.pem` and `transfer-host-key` — no `ecr.json`,
      no `sqs.json`. `save_all` only runs on graceful lifespan shutdown, so an
      ungraceful stop saves nothing. Same class of problem as
      RCA_Bug_MinistackDataLoss.md. Only S3 persists, via its separate
      `S3_PERSIST=1` mechanism writing to `/var/lib/ministack/s3`.
      → ECR repos must be re-provisioned by `ministack/init/init-lambda.sh`,
        and images re-pushed, after any ministack restart.

## Phase 0 — Unblock ECS

Run everything from PowerShell with the host AWS CLI. One-time per terminal:

```powershell
$env:AWS_ACCESS_KEY_ID="test"; $env:AWS_SECRET_ACCESS_KEY="test"; $env:AWS_DEFAULT_REGION="us-east-1"
function maws { aws --endpoint-url=http://localhost:4566 @args }
```

- [ ] Add `/var/run/docker.sock:/var/run/docker.sock` to the `ministack` service volumes
- [ ] `docker compose up -d ministack`
- [ ] Verify: `docker exec question-generator-ministack-1 python3 -c "import docker; print(docker.from_env().version()['Version'])"`
- [ ] Re-create the ECR repo and re-push (state is wiped on every restart — see findings)
- [ ] Add idempotent `ecr create-repository` calls to `ministack/init/init-lambda.sh`

## Phase 1 — One task, end to end

- [ ] `create-cluster`
- [ ] Write task definition JSON for question-generator-api
- [ ] `register-task-definition`
- [ ] `run-task`
- [ ] `describe-tasks` → confirm RUNNING
- [ ] `docker ps --filter label=ministack=ecs` → see the real container
- [ ] `docker logs` the task container
- [ ] `curl` the published port to prove it serves traffic
- [ ] `stop-task` → confirm the container dies

## Phase 2 — Task vs Service

- [ ] `create-service` with desiredCount=1
- [ ] Kill the container by hand; see whether the service replaces it
- [ ] `update-service --desired-count 2`; observe port conflicts
- [ ] Learn why real ECS needs a load balancer for >1 replica

## Phase 3 — Second service + discovery

- [ ] Push reports-api image to ECR
- [ ] Run it as a second ECS task
- [ ] Hit the service-discovery problem (ECS container names are
      `ministack-ecs-<taskid>-<name>`, not stable service names)
- [ ] Understand how real ECS solves it (Service Connect / Cloud Map / ALB)

## Phase 4 — Config and secrets

- [ ] Move SUPABASE_SERVICE_ROLE_KEY etc. out of plaintext task defs
- [ ] Store them in Secrets Manager on MiniStack
- [ ] Reference them via `secrets[].valueFrom` in the task definition
- [ ] Verify a bad reference fails the task with ResourceInitializationError

## Phase 5 — The rest of the stack

- [ ] Decide the boundary: redis / clamav / ministack stay as compose services
- [ ] Task definitions for question-worker, ai-agent-chatbot, attempt-api, reports-api
- [ ] Frontend last (it proxies by service name — discovery matters most here)

## Phase 6 — Teardown

- [ ] Stop services, deregister task definitions, delete cluster
- [ ] Document the whole flow in a walkthrough
