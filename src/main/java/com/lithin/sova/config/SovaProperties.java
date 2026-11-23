package com.lithin.sova.config;

import java.util.UUID;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "sova")
public record SovaProperties(
        String workerId,
        boolean workerEnabled,
        boolean reaperEnabled,
        long pollDelayMs,
        int batchSize,
        long heartbeatTtlSeconds,
        long heartbeatRefreshMs,
        long reaperDelayMs,
        long claimGraceSeconds,
        long retryBaseSeconds,
        long retryMaxSeconds) {

    public SovaProperties {
        if (workerId == null || workerId.isBlank()) {
            workerId = "worker-" + UUID.randomUUID().toString().substring(0, 8);
        }
        if (batchSize <= 0) {
            batchSize = 5;
        }
        if (heartbeatTtlSeconds <= 0) {
            heartbeatTtlSeconds = 30;
        }
        if (claimGraceSeconds <= 0) {
            claimGraceSeconds = 15;
        }
        if (retryBaseSeconds <= 0) {
            retryBaseSeconds = 5;
        }
        if (retryMaxSeconds <= 0) {
            retryMaxSeconds = 300;
        }
    }
}
