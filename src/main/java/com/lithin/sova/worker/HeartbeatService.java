package com.lithin.sova.worker;

import com.lithin.sova.config.SovaProperties;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class HeartbeatService {

    private static final Logger log = LoggerFactory.getLogger(HeartbeatService.class);
    private static final String KEY_PREFIX = "sova:hb:";

    private final StringRedisTemplate redisTemplate;
    private final SovaProperties properties;
    private final ScheduledExecutorService scheduler;
    private final Map<UUID, ScheduledFuture<?>> activeHeartbeats = new ConcurrentHashMap<>();

    public HeartbeatService(StringRedisTemplate redisTemplate, SovaProperties properties) {
        this.redisTemplate = redisTemplate;
        this.properties = properties;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sova-heartbeat");
            t.setDaemon(true);
            return t;
        });
    }

    public void startHeartbeat(UUID jobId, String workerId) {
        refreshOnce(jobId, workerId);
        long refreshMs = Math.max(1000L, properties.heartbeatRefreshMs());
        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> refreshOnce(jobId, workerId),
                refreshMs,
                refreshMs,
                TimeUnit.MILLISECONDS);
        ScheduledFuture<?> previous = activeHeartbeats.put(jobId, future);
        if (previous != null) {
            previous.cancel(false);
        }
    }

    public void stopHeartbeat(UUID jobId) {
        ScheduledFuture<?> future = activeHeartbeats.remove(jobId);
        if (future != null) {
            future.cancel(false);
        }
        try {
            redisTemplate.delete(keyFor(jobId));
        } catch (Exception e) {
            log.warn("Failed to delete heartbeat key for job {}: {}", jobId, e.getMessage());
        }
    }

    public boolean isAlive(UUID jobId) {
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(keyFor(jobId)));
        } catch (Exception e) {
            // Fail safe: if Redis is temporarily unreachable, assume alive rather than mass-requeuing healthy jobs.
            log.warn("Redis unavailable during heartbeat check for job {}; assuming alive: {}", jobId, e.getMessage());
            return true;
        }
    }

    private void refreshOnce(UUID jobId, String workerId) {
        try {
            redisTemplate.opsForValue().set(
                    keyFor(jobId),
                    workerId,
                    Duration.ofSeconds(properties.heartbeatTtlSeconds()));
        } catch (Exception e) {
            log.warn("Failed to refresh heartbeat for job {}: {}", jobId, e.getMessage());
        }
    }

    static String keyFor(UUID jobId) {
        return KEY_PREFIX + jobId;
    }

    @PreDestroy
    void shutdown() {
        activeHeartbeats.values().forEach(f -> f.cancel(false));
        activeHeartbeats.clear();
        scheduler.shutdownNow();
    }
}
