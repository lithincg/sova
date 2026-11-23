package com.lithin.sova.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record SubmitJobRequest(
        @NotBlank @Size(max = 100) String type,
        String payload,
        Integer priority,
        Instant scheduledAt,
        @Min(1) Integer maxAttempts) {
}
