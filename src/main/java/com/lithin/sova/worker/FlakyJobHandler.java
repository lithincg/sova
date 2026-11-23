package com.lithin.sova.worker;

import com.lithin.sova.domain.Job;
import org.springframework.stereotype.Component;

@Component
public class FlakyJobHandler implements JobHandler {

    @Override
    public String type() {
        return "flaky";
    }

    @Override
    public void handle(Job job) {
        int failCount = 1;
        if (job.getPayload() != null && !job.getPayload().isBlank()) {
            try {
                failCount = Integer.parseInt(job.getPayload().trim());
            } catch (NumberFormatException ignored) {
                failCount = 1;
            }
        }
        if (job.getAttempts() < failCount) {
            throw new IllegalStateException("Simulated transient failure on attempt " + (job.getAttempts() + 1));
        }
    }
}
