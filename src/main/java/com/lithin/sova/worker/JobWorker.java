package com.lithin.sova.worker;

import com.lithin.sova.config.SovaProperties;
import com.lithin.sova.domain.Job;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class JobWorker {

    private static final Logger log = LoggerFactory.getLogger(JobWorker.class);

    private final SovaProperties properties;
    private final JobClaimService claimService;
    private final JobExecutionService executionService;
    private final HeartbeatService heartbeatService;
    private final JobHandlerRegistry handlerRegistry;
    private final AtomicBoolean shuttingDown = new AtomicBoolean(false);

    public JobWorker(
            SovaProperties properties,
            JobClaimService claimService,
            JobExecutionService executionService,
            HeartbeatService heartbeatService,
            JobHandlerRegistry handlerRegistry) {
        this.properties = properties;
        this.claimService = claimService;
        this.executionService = executionService;
        this.heartbeatService = heartbeatService;
        this.handlerRegistry = handlerRegistry;
    }

    @Scheduled(fixedDelayString = "${sova.poll-delay-ms:1000}")
    public void pollAndExecute() {
        if (!properties.workerEnabled() || shuttingDown.get()) {
            return;
        }
        String workerId = properties.workerId();
        List<Job> claimed = claimService.claimBatch(workerId, properties.batchSize());
        for (Job job : claimed) {
            if (shuttingDown.get()) {
                break;
            }
            executeSingle(job, workerId);
        }
    }

    @PreDestroy
    void onShutdown() {
        shuttingDown.set(true);
        log.info("Worker {} entering graceful shutdown; stopping new job claims", properties.workerId());
    }

    void executeSingle(Job job, String workerId) {
        MDC.put("workerId", workerId);
        MDC.put("jobId", job.getId().toString());
        Instant startedAt = null;
        try {
            // Start Redis TTL heartbeat before moving to RUNNING so the reaper sees this worker is alive.
            heartbeatService.startHeartbeat(job.getId(), workerId);
            executionService.markRunning(job.getId());
            startedAt = Instant.now();

            JobHandler handler = handlerRegistry.get(job.getType());
            handler.handle(job);

            executionService.markSucceeded(job.getId(), workerId, startedAt);
            log.info("Job completed successfully type={}", job.getType());
        } catch (Exception e) {
            executionService.handleFailure(job.getId(), e, workerId, startedAt);
        } finally {
            heartbeatService.stopHeartbeat(job.getId());
            MDC.clear();
        }
    }
}
