ALTER TABLE jobs ADD COLUMN idempotency_key varchar(128);

-- Partial unique index: only enforces uniqueness when a client sends Idempotency-Key.
CREATE UNIQUE INDEX idx_jobs_idempotency_key
    ON jobs (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
