CREATE TABLE jobs (
    id            uuid         PRIMARY KEY,
    type          varchar(100) NOT NULL,
    payload       text,
    status        varchar(20)  NOT NULL DEFAULT 'PENDING',
    attempts      int          NOT NULL DEFAULT 0,
    max_attempts  int          NOT NULL DEFAULT 3,
    priority      int          NOT NULL DEFAULT 0,
    scheduled_at  timestamptz,
    next_retry_at timestamptz,
    claimed_by    varchar(100),
    claimed_at    timestamptz,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT chk_jobs_status CHECK (status IN
        ('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD'))
);

-- One row per edge: job_id depends on depends_on_job_id.
CREATE TABLE job_dependencies (
    job_id            uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    depends_on_job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, depends_on_job_id),
    CONSTRAINT chk_no_self_dependency CHECK (job_id <> depends_on_job_id)
);

-- P1 claim query: WHERE status='PENDING' ... ORDER BY priority DESC, created_at LIMIT n.
-- Partial index: only PENDING rows, already in claim order, so no sort step.
CREATE INDEX idx_jobs_claimable ON jobs (priority DESC, created_at) WHERE status = 'PENDING';

-- P2 reaper scan: only in-flight rows.
CREATE INDEX idx_jobs_in_flight ON jobs (claimed_at) WHERE status IN ('CLAIMED', 'RUNNING');

-- PK covers lookups by job_id; Postgres does NOT auto-index FK columns, so index the other side
-- (P4: "who depends on this job?").
CREATE INDEX idx_job_dependencies_depends_on ON job_dependencies (depends_on_job_id);
