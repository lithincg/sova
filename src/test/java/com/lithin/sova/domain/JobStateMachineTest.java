package com.lithin.sova.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class JobStateMachineTest {

    private static void forceStatus(Job job, JobStatus status) throws Exception {
        Field f = Job.class.getDeclaredField("status");
        f.setAccessible(true);
        f.set(job, status);
    }

    @Test
    void happyPathTransitions_succeed() throws Exception {
        Job job = new Job("echo", "hi", 1, 3, null);
        assertEquals(JobStatus.PENDING, job.getStatus());

        forceStatus(job, JobStatus.CLAIMED);
        job.markRunning();
        assertEquals(JobStatus.RUNNING, job.getStatus());

        job.markSucceeded();
        assertEquals(JobStatus.SUCCEEDED, job.getStatus());
        assertNull(job.getClaimedBy());
    }

    @Test
    void illegalTransitions_throwIllegalStateException() {
        Job pending = new Job("echo", "hi", 0, 3, null);
        assertThrows(IllegalStateException.class, pending::markRunning);
        assertThrows(IllegalStateException.class, pending::markSucceeded);
        assertThrows(IllegalStateException.class, pending::replay);
    }

    @Test
    void recordFailure_appliesExponentialBackoffAndDeadLettersAtCap() throws Exception {
        Job job = new Job("flaky", "2", 0, 3, null);
        Instant t0 = Instant.parse("2026-11-23T10:00:00Z");

        forceStatus(job, JobStatus.RUNNING);
        job.recordFailure(t0, 5, 300, 2);
        assertEquals(JobStatus.PENDING, job.getStatus());
        assertEquals(1, job.getAttempts());
        assertEquals(t0.plusSeconds(7), job.getNextRetryAt()); // 5 * 2^0 + 2

        forceStatus(job, JobStatus.RUNNING);
        job.recordFailure(t0, 5, 300, 1);
        assertEquals(JobStatus.PENDING, job.getStatus());
        assertEquals(2, job.getAttempts());
        assertEquals(t0.plusSeconds(11), job.getNextRetryAt()); // 5 * 2^1 + 1

        forceStatus(job, JobStatus.RUNNING);
        job.recordFailure(t0, 5, 300, 0);
        assertEquals(JobStatus.DEAD, job.getStatus());
        assertEquals(3, job.getAttempts());
        assertNull(job.getNextRetryAt());
    }

    @Test
    void requeueFromCrash_andReplayFromDead() throws Exception {
        Job job = new Job("sleep", "5000", 0, 2, null);
        forceStatus(job, JobStatus.RUNNING);

        job.requeueFromCrash();
        assertEquals(JobStatus.PENDING, job.getStatus());
        assertEquals(1, job.getAttempts());

        forceStatus(job, JobStatus.RUNNING);
        job.requeueFromCrash();
        assertEquals(JobStatus.DEAD, job.getStatus());
        assertEquals(2, job.getAttempts());

        job.replay();
        assertEquals(JobStatus.PENDING, job.getStatus());
        assertEquals(0, job.getAttempts());
    }
}
