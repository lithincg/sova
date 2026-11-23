package com.lithin.sova.worker;

import com.lithin.sova.domain.Job;
import com.lithin.sova.repository.JobRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobClaimService {

    private final JobRepository repository;

    public JobClaimService(JobRepository repository) {
        this.repository = repository;
    }

    // Separate bean so @Transactional commits the claim BEFORE workers execute jobs outside the DB lock.
    @Transactional
    public List<Job> claimBatch(String workerId, int batchSize) {
        return repository.claimBatch(workerId, batchSize);
    }
}
