package com.lithin.sova.worker;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import com.lithin.sova.BaseIntegrationTest;
import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.repository.JobRepository;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class JobClaimingAndReaperIT extends BaseIntegrationTest {

    @Autowired
    private JobRepository repository;

    @Autowired
    private JobClaimService claimService;

    @Autowired
    private JobExecutionService executionService;

    @Autowired
    private JobReaper reaper;

    @MockitoBean
    private HeartbeatService heartbeatService;

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    @Test
    void concurrentWorkers_claimEveryJobExactlyOnceWithoutDuplicates() throws Exception {
        int totalJobs = 40;
        for (int i = 0; i < totalJobs; i++) {
            repository.save(new Job("echo", "job-" + i, i % 5, 3, null));
        }

        int workerThreads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(workerThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        List<Future<List<UUID>>> futures = new ArrayList<>();

        for (int w = 0; w < workerThreads; w++) {
            String workerId = "worker-" + w;
            futures.add(pool.submit(() -> {
                startLatch.await();
                List<UUID> claimedIds = new ArrayList<>();
                while (true) {
                    List<Job> batch = claimService.claimBatch(workerId, 3);
                    if (batch.isEmpty()) {
                        break;
                    }
                    batch.forEach(j -> claimedIds.add(j.getId()));
                }
                return claimedIds;
            }));
        }

        startLatch.countDown();

        List<UUID> allClaimed = new ArrayList<>();
        for (Future<List<UUID>> f : futures) {
            allClaimed.addAll(f.get(30, TimeUnit.SECONDS));
        }
        pool.shutdownNow();

        assertEquals(totalJobs, allClaimed.size(), "Every job must be claimed");
        assertEquals(totalJobs, new HashSet<>(allClaimed).size(), "No job may ever be double-claimed");
    }

    @Test
    void reaper_requeuesCrashedJobWhenHeartbeatMissing() {
        Job saved = repository.save(new Job("sleep", "10000", 1, 3, null));
        List<Job> claimed = claimService.claimBatch("crashed-worker", 1);
        assertEquals(1, claimed.size());
        executionService.markRunning(saved.getId());

        when(heartbeatService.isAlive(saved.getId())).thenReturn(false);

        int reclaimed = reaper.scanAndRequeue(Instant.now().plusSeconds(60));
        assertEquals(1, reclaimed);

        Job after = repository.findById(saved.getId()).orElseThrow();
        assertEquals(JobStatus.PENDING, after.getStatus());
        assertEquals(1, after.getAttempts());
        assertNull(after.getClaimedBy());
    }
}
