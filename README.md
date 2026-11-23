# Sova — Distributed Job Scheduler

A reliable distributed job scheduler built with **Java 21, Spring Boot 3.4, PostgreSQL 16, Redis 7.2, Flyway, and Docker**. Multiple worker instances coordinate safely through PostgreSQL row locking (`FOR UPDATE SKIP LOCKED`) and recover crashed jobs automatically via Redis TTL heartbeats and a background reaper.

## Guarantees & Core Design
- **Race-free job claiming:** Single atomic CTE `SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE ... RETURNING` inside a transaction (backed by partial index `idx_jobs_claimable`), with job execution running outside DB locks.
- **Crash recovery (at-least-once):** Workers maintain short-lived Redis TTL keys (`sova:hb:<jobId>`) refreshed on a background thread. If a worker dies, the TTL expires and `JobReaper` automatically requeues the job (or moves it to `DEAD` if retries are exhausted).
- **Exponential backoff + jitter + DLQ:** Failed jobs reschedule with capped exponential backoff plus random jitter; exhausted jobs move to `DEAD` and can be manually replayed via `POST /jobs/{id}/replay`.
- **Guarded state machine:** All status transitions (`PENDING -> CLAIMED -> RUNNING -> SUCCEEDED | PENDING | DEAD`) are enforced in the `Job` domain entity.
- **Observability:** Spring Boot Actuator (`/actuator/health`, `/actuator/prometheus`), Micrometer counters (`sova.jobs.completed`, `sova.jobs.retried`, `sova.jobs.reclaimed`), and MDC structured logging (`workerId`, `jobId`).

## Run 2 Workers Locally
```bash
docker compose up --build
```
- Worker 1 API: `http://localhost:8080`
- Worker 2 API: `http://localhost:8081`

### Quick Demo
```bash
# Submit an echo job
curl -X POST http://localhost:8080/jobs -H "Content-Type: application/json" \
  -d '{"type":"echo","payload":"hello sova","priority":5}'

# Submit a flaky job (fails once, retries with backoff, succeeds on attempt 2)
curl -X POST http://localhost:8080/jobs -H "Content-Type: application/json" \
  -d '{"type":"flaky","payload":"1","maxAttempts":3}'

# Crash-recovery demo: submit a 15s sleep job, then kill whichever worker claimed it
curl -X POST http://localhost:8080/jobs -H "Content-Type: application/json" \
  -d '{"type":"sleep","payload":"15000"}'
# docker kill <worker-container> -> watch the surviving worker reclaim & finish it
```

## Tests
```bash
./mvnw verify
```
- `JobStateMachineTest` — guarded transitions, exponential backoff, crash requeue, replay rules
- `JobServiceTest` — submission defaults and replay conflict handling
- `JobClaimingAndReaperIT` — Testcontainers PostgreSQL 16 integration tests proving 8-thread concurrent claiming has zero double-claims/zero lost jobs, priority order, and reaper crash recovery
