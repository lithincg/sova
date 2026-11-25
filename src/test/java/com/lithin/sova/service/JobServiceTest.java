package com.lithin.sova.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobAttempt;
import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.dto.JobAttemptResponse;
import com.lithin.sova.dto.JobResponse;
import com.lithin.sova.dto.SubmitJobRequest;
import com.lithin.sova.repository.JobAttemptRepository;
import com.lithin.sova.repository.JobRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class JobServiceTest {

    @Mock
    private JobRepository repository;

    @Mock
    private JobAttemptRepository attemptRepository;

    @InjectMocks
    private JobService service;

    @Test
    void attempts_returnsHistoryInOrderForExistingJob() {
        UUID id = UUID.randomUUID();
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        when(repository.existsById(id)).thenReturn(true);
        when(attemptRepository.findByJobIdOrderByIdAsc(id)).thenReturn(List.of(
                new JobAttempt(id, 1, "w-1", JobAttempt.Outcome.FAILED, "boom", t0, t0.plusMillis(120)),
                new JobAttempt(id, 2, "w-2", JobAttempt.Outcome.SUCCEEDED, null, t0.plusSeconds(5), t0.plusSeconds(5).plusMillis(80))
        ));

        List<JobAttemptResponse> res = service.attempts(id);

        assertEquals(2, res.size());
        assertEquals(JobAttempt.Outcome.FAILED, res.get(0).outcome());
        assertEquals(120L, res.get(0).durationMs());
        assertEquals("w-2", res.get(1).workerId());
    }

    @Test
    void attempts_unknownJob_throwsNotFound() {
        UUID id = UUID.randomUUID();
        when(repository.existsById(id)).thenReturn(false);

        assertThrows(JobNotFoundException.class, () -> service.attempts(id));
        verifyNoInteractions(attemptRepository);
    }

    @Test
    void submit_appliesDefaultPriorityAndMaxAttempts() {
        when(repository.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));

        JobResponse res = service.submit(new SubmitJobRequest("echo", "hello", null, null, null));

        assertEquals("echo", res.type());
        assertEquals(JobStatus.PENDING, res.status());
        assertEquals(0, res.priority());
        assertEquals(3, res.maxAttempts());
    }

    @Test
    void replay_resetsDeadJobToPending() throws Exception {
        UUID id = UUID.randomUUID();
        Job deadJob = new Job("flaky", "3", 1, 3, null);
        Field statusField = Job.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(deadJob, JobStatus.DEAD);

        when(repository.findById(id)).thenReturn(Optional.of(deadJob));
        when(repository.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));

        JobResponse res = service.replay(id);

        assertEquals(JobStatus.PENDING, res.status());
        assertEquals(0, res.attempts());
    }

    @Test
    void replay_rejectsNonDeadJob() {
        UUID id = UUID.randomUUID();
        Job pendingJob = new Job("echo", "hi", 0, 3, null);
        when(repository.findById(id)).thenReturn(Optional.of(pendingJob));

        assertThrows(IllegalStateException.class, () -> service.replay(id));
        verify(repository, never()).save(any());
    }

    @Test
    void submit_withDuplicateIdempotencyKey_returnsExistingJobWithoutSaving() {
        Job existing = new Job("echo", "first", 1, 3, null, "req-123");
        when(repository.findByIdempotencyKey("req-123")).thenReturn(Optional.of(existing));

        JobResponse res = service.submit(new SubmitJobRequest("echo", "duplicate", 1, null, 3), "req-123");

        assertEquals("first", res.payload());
        verify(repository, never()).save(any());
    }

    @Test
    void stats_populatesAllStatusesIncludingZeros() {
        when(repository.countGroupedByStatus()).thenReturn(java.util.List.of(
                new Object[]{JobStatus.PENDING, 4L},
                new Object[]{JobStatus.SUCCEEDED, 10L}
        ));

        var stats = service.stats();

        assertEquals(4L, stats.get(JobStatus.PENDING));
        assertEquals(10L, stats.get(JobStatus.SUCCEEDED));
        assertEquals(0L, stats.get(JobStatus.DEAD));
    }
}
