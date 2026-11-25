package com.lithin.sova.worker;

import com.lithin.sova.config.SovaProperties;
import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobAttempt;
import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.repository.JobAttemptRepository;
import com.lithin.sova.repository.JobRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobExecutionService {

    private static final Logger log = LoggerFactory.getLogger(JobExecutionService.class);

    private final JobRepository repository;
    private final JobAttemptRepository attemptRepository;
    private final SovaProperties properties;
    private final MeterRegistry meterRegistry;

    public JobExecutionService(
            JobRepository repository,
            JobAttemptRepository attemptRepository,
            SovaProperties properties,
            MeterRegistry meterRegistry) {
        this.repository = repository;
        this.attemptRepository = attemptRepository;
        this.properties = properties;
        this.meterRegistry = meterRegistry;
    }

    @Transactional
    public void markRunning(UUID jobId) {
        Job job = repository.findById(jobId).orElseThrow();
        job.markRunning();
        repository.save(job);
    }

    @Transactional
    public void markSucceeded(UUID jobId, String workerId, Instant startedAt) {
        Job job = repository.findById(jobId).orElseThrow();
        int attemptNumber = job.getAttempts() + 1;
        job.markSucceeded();
        repository.save(job);
        attemptRepository.save(new JobAttempt(jobId, attemptNumber, workerId,
                JobAttempt.Outcome.SUCCEEDED, null, startedAt, Instant.now()));
        meterRegistry.counter("sova.jobs.completed", "status", "succeeded").increment();
    }

    @Transactional
    public void handleFailure(UUID jobId, Throwable error, String workerId, Instant startedAt) {
        Job job = repository.findById(jobId).orElseThrow();
        long base = properties.retryBaseSeconds();
        long max = properties.retryMaxSeconds();
        // Add random jitter to prevent synchronized retry storms across failed jobs.
        long jitterBound = Math.max(1L, base / 2);
        long jitter = ThreadLocalRandom.current().nextLong(0, jitterBound + 1);

        int attemptNumber = job.getAttempts() + 1;
        Instant now = Instant.now();
        job.recordFailure(now, base, max, jitter);
        repository.save(job);
        attemptRepository.save(new JobAttempt(jobId, attemptNumber, workerId,
                JobAttempt.Outcome.FAILED, describe(error), startedAt != null ? startedAt : now, now));

        if (job.getStatus() == JobStatus.DEAD) {
            meterRegistry.counter("sova.jobs.completed", "status", "dead").increment();
            log.warn("Job {} moved to DEAD after {} attempts: {}", jobId, job.getAttempts(), error.getMessage());
        } else {
            meterRegistry.counter("sova.jobs.retried").increment();
            log.info("Job {} scheduled for retry #{} at {}: {}",
                    jobId, job.getAttempts(), job.getNextRetryAt(), error.getMessage());
        }
    }

    @Transactional
    public boolean requeueStaleJob(UUID jobId) {
        Job job = repository.findById(jobId).orElse(null);
        if (job == null || (job.getStatus() != JobStatus.CLAIMED && job.getStatus() != JobStatus.RUNNING)) {
            return false;
        }
        int attemptNumber = job.getAttempts() + 1;
        String deadWorker = job.getClaimedBy();
        Instant startedAt = job.getClaimedAt() != null ? job.getClaimedAt() : job.getUpdatedAt();
        job.requeueFromCrash();
        repository.save(job);
        attemptRepository.save(new JobAttempt(jobId, attemptNumber, deadWorker, JobAttempt.Outcome.REAPED,
                "Heartbeat expired; job reclaimed by reaper", startedAt, Instant.now()));
        meterRegistry.counter("sova.jobs.reclaimed").increment();
        log.warn("Reaper reclaimed stale job {} -> status={} attempts={}",
                jobId, job.getStatus(), job.getAttempts());
        return true;
    }

    private static String describe(Throwable error) {
        String msg = error.getMessage();
        return error.getClass().getSimpleName() + (msg != null ? ": " + msg : "");
    }
}
