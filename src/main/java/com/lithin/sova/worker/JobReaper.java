package com.lithin.sova.worker;

import com.lithin.sova.config.SovaProperties;
import com.lithin.sova.domain.Job;
import com.lithin.sova.repository.JobRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class JobReaper {

    private final SovaProperties properties;
    private final JobRepository repository;
    private final HeartbeatService heartbeatService;
    private final JobExecutionService executionService;

    public JobReaper(
            SovaProperties properties,
            JobRepository repository,
            HeartbeatService heartbeatService,
            JobExecutionService executionService) {
        this.properties = properties;
        this.repository = repository;
        this.heartbeatService = heartbeatService;
        this.executionService = executionService;
    }

    @Scheduled(fixedDelayString = "${sova.reaper-delay-ms:15000}")
    public int reapStaleJobs() {
        if (!properties.reaperEnabled()) {
            return 0;
        }
        return scanAndRequeue(Instant.now().minusSeconds(properties.claimGraceSeconds()));
    }

    public int scanAndRequeue(Instant claimedBefore) {
        List<Job> staleCandidates = repository.findStaleInFlightJobs(claimedBefore);
        int reclaimed = 0;
        for (Job job : staleCandidates) {
            if (!heartbeatService.isAlive(job.getId())) {
                if (executionService.requeueStaleJob(job.getId())) {
                    reclaimed++;
                }
            }
        }
        return reclaimed;
    }
}
