-- One row per execution attempt: powers the attempt history and waterfall timeline in the console.
CREATE TABLE job_attempts (
    id             bigserial    PRIMARY KEY,
    job_id         uuid         NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    attempt_number int          NOT NULL,
    worker_id      varchar(100),
    outcome        varchar(20)  NOT NULL,
    error          text,
    started_at     timestamptz  NOT NULL,
    finished_at    timestamptz  NOT NULL,
    duration_ms    bigint       NOT NULL,
    CONSTRAINT chk_job_attempts_outcome CHECK (outcome IN ('SUCCEEDED', 'FAILED', 'REAPED'))
);

CREATE INDEX idx_job_attempts_job ON job_attempts (job_id, id);
