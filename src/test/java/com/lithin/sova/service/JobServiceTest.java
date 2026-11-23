package com.lithin.sova.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.dto.JobResponse;
import com.lithin.sova.dto.SubmitJobRequest;
import com.lithin.sova.repository.JobRepository;
import java.lang.reflect.Field;
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

    @InjectMocks
    private JobService service;

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
}
