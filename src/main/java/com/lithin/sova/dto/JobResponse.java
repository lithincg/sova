package com.lithin.sova.dto;

import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobStatus;
import java.time.Instant;
import java.util.UUID;

public record JobResponse(
        UUID id,
        String type,
        String payload,
        JobStatus status,
        int attempts,
        int maxAttempts,
        int priority,
        Instant scheduledAt,
        Instant nextRetryAt,
        String claimedBy,
        Instant claimedAt,
        Instant createdAt,
        Instant updatedAt) {

    public static JobResponse from(Job j) {
        return new JobResponse(j.getId(), j.getType(), j.getPayload(), j.getStatus(), j.getAttempts(),
                j.getMaxAttempts(), j.getPriority(), j.getScheduledAt(), j.getNextRetryAt(),
                j.getClaimedBy(), j.getClaimedAt(), j.getCreatedAt(), j.getUpdatedAt());
    }
}
