package com.lithin.sova.dto;

import com.lithin.sova.domain.JobAttempt;
import java.time.Instant;

public record JobAttemptResponse(
        int attemptNumber,
        String workerId,
        JobAttempt.Outcome outcome,
        String error,
        Instant startedAt,
        Instant finishedAt,
        long durationMs) {

    public static JobAttemptResponse from(JobAttempt a) {
        return new JobAttemptResponse(a.getAttemptNumber(), a.getWorkerId(), a.getOutcome(), a.getError(),
                a.getStartedAt(), a.getFinishedAt(), a.getDurationMs());
    }
}
