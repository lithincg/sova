package com.lithin.sova.repository;

import com.lithin.sova.domain.Job;
import com.lithin.sova.domain.JobStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobRepository extends JpaRepository<Job, UUID> {
    List<Job> findByStatusOrderByCreatedAtDesc(JobStatus status);

    List<Job> findAllByOrderByCreatedAtDesc();

    // Atomic single-statement claim using partial index idx_jobs_claimable.
    // SKIP LOCKED prevents concurrent workers from blocking or double-claiming the same rows.
    @Query(value = """
            WITH next_jobs AS (
                SELECT id
                FROM jobs
                WHERE status = 'PENDING'
                  AND (scheduled_at IS NULL OR scheduled_at <= now())
                  AND (next_retry_at IS NULL OR next_retry_at <= now())
                ORDER BY priority DESC, created_at
                FOR UPDATE SKIP LOCKED
                LIMIT :batchSize
            )
            UPDATE jobs j
            SET status = 'CLAIMED',
                claimed_by = :workerId,
                claimed_at = now(),
                updated_at = now()
            FROM next_jobs
            WHERE j.id = next_jobs.id
            RETURNING j.*
            """, nativeQuery = true)
    List<Job> claimBatch(@Param("workerId") String workerId, @Param("batchSize") int batchSize);

    @Query("""
            SELECT j FROM Job j
            WHERE j.status IN (com.lithin.sova.domain.JobStatus.CLAIMED, com.lithin.sova.domain.JobStatus.RUNNING)
              AND j.claimedAt < :claimedBefore
            """)
    List<Job> findStaleInFlightJobs(@Param("claimedBefore") Instant claimedBefore);
}
