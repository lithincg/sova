package com.lithin.sova.worker;

import com.lithin.sova.config.SovaProperties;
import com.lithin.sova.domain.Job;
import java.util.List;
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
        if (!properties.workerEnabled()) {
            return;
        }
        String workerId = properties.workerId();
        List<Job> claimed = claimService.claimBatch(workerId, properties.batchSize());
        for (Job job : claimed) {
            executeSingle(job, workerId);
        }
    }

    void executeSingle(Job job, String workerId) {
        MDC.put("workerId", workerId);
        MDC.put("jobId", job.getId().toString());
        try {
            // Start Redis TTL heartbeat before moving to RUNNING so the reaper sees this worker is alive.
            heartbeatService.startHeartbeat(job.getId(), workerId);
            executionService.markRunning(job.getId());

            JobHandler handler = handlerRegistry.get(job.getType());
            handler.handle(job);

            executionService.markSucceeded(job.getId());
            log.info("Job completed successfully type={}", job.getType());
        } catch (Exception e) {
            executionService.handleFailure(job.getId(), e);
        } finally {
            heartbeatService.stopHeartbeat(job.getId());
            MDC.clear();
        }
    }
}
