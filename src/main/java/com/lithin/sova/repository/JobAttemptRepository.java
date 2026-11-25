package com.lithin.sova.repository;

import com.lithin.sova.domain.JobAttempt;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobAttemptRepository extends JpaRepository<JobAttempt, Long> {
    List<JobAttempt> findByJobIdOrderByIdAsc(UUID jobId);
}
