package com.lithin.sova.service;

import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.dto.JobResponse;
import com.lithin.sova.dto.SubmitJobRequest;
import com.lithin.sova.repository.JobRepository;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class JobService {

    static final int DEFAULT_PRIORITY = 0;
    static final int DEFAULT_MAX_ATTEMPTS = 3;

    private final JobRepository repository;

    public JobService(JobRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public JobResponse submit(SubmitJobRequest req) {
        return submit(req, null);
    }

    @Transactional
    public JobResponse submit(SubmitJobRequest req, String idempotencyKey) {
        String key = (idempotencyKey == null || idempotencyKey.isBlank()) ? null : idempotencyKey.trim();
        if (key != null) {
            var existing = repository.findByIdempotencyKey(key);
            if (existing.isPresent()) {
                return JobResponse.from(existing.get());
            }
        }
        Job job = new Job(
                req.type(),
                req.payload(),
                req.priority() != null ? req.priority() : DEFAULT_PRIORITY,
                req.maxAttempts() != null ? req.maxAttempts() : DEFAULT_MAX_ATTEMPTS,
                req.scheduledAt(),
                key);
        try {
            return JobResponse.from(repository.save(job));
        } catch (DataIntegrityViolationException e) {
            // Concurrent duplicate submit with the same Idempotency-Key: return the winner's row.
            if (key != null) {
                return repository.findByIdempotencyKey(key)
                        .map(JobResponse::from)
                        .orElseThrow(() -> e);
            }
            throw e;
        }
    }

    public JobResponse get(UUID id) {
        return repository.findById(id).map(JobResponse::from).orElseThrow(() -> new JobNotFoundException(id));
    }

    public List<JobResponse> list(JobStatus status) {
        List<Job> jobs = status == null
                ? repository.findAllByOrderByCreatedAtDesc()
                : repository.findByStatusOrderByCreatedAtDesc(status);
        return jobs.stream().map(JobResponse::from).toList();
    }

    public Map<JobStatus, Long> stats() {
        Map<JobStatus, Long> counts = new EnumMap<>(JobStatus.class);
        for (JobStatus status : JobStatus.values()) {
            counts.put(status, 0L);
        }
        for (Object[] row : repository.countGroupedByStatus()) {
            counts.put((JobStatus) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    @Transactional
    public JobResponse replay(UUID id) {
        Job job = repository.findById(id).orElseThrow(() -> new JobNotFoundException(id));
        job.replay();
        return JobResponse.from(repository.save(job));
    }
}
