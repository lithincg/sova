package com.lithin.sova.worker;

import com.lithin.sova.domain.Job;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class SleepJobHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(SleepJobHandler.class);
    private static final long DEFAULT_SLEEP_MS = 2000L;

    @Override
    public String type() {
        return "sleep";
    }

    @Override
    public void handle(Job job) throws InterruptedException {
        long millis = DEFAULT_SLEEP_MS;
        if (job.getPayload() != null && !job.getPayload().isBlank()) {
            try {
                millis = Math.min(60_000L, Math.max(50L, Long.parseLong(job.getPayload().trim())));
            } catch (NumberFormatException ignored) {
                millis = DEFAULT_SLEEP_MS;
            }
        }
        log.info("Sleeping {}ms for job id={}", millis, job.getId());
        Thread.sleep(millis);
    }
}
