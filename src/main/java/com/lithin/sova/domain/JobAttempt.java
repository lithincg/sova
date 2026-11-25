package com.lithin.sova.domain;

import jakarta.persistence.*;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "job_attempts")
public class JobAttempt {

    public enum Outcome { SUCCEEDED, FAILED, REAPED }

    private static final int MAX_ERROR_LENGTH = 2000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Column(name = "worker_id")
    private String workerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Outcome outcome;

    @Column(columnDefinition = "text")
    private String error;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at", nullable = false)
    private Instant finishedAt;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    protected JobAttempt() {} // required by JPA

    public JobAttempt(UUID jobId, int attemptNumber, String workerId, Outcome outcome, String error,
                      Instant startedAt, Instant finishedAt) {
        this.jobId = jobId;
        this.attemptNumber = attemptNumber;
        this.workerId = workerId;
        this.outcome = outcome;
        this.error = truncate(error);
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.durationMs = Math.max(0L, Duration.between(startedAt, finishedAt).toMillis());
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() <= MAX_ERROR_LENGTH ? s : s.substring(0, MAX_ERROR_LENGTH);
    }

    public Long getId() { return id; }
    public UUID getJobId() { return jobId; }
    public int getAttemptNumber() { return attemptNumber; }
    public String getWorkerId() { return workerId; }
    public Outcome getOutcome() { return outcome; }
    public String getError() { return error; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public long getDurationMs() { return durationMs; }
}
