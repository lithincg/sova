package com.lithin.sova.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/health")
    public String health() {
        return "Sova is active. System Status: GREEN.";
    }

    @GetMapping("/api/info")
    public Map<String, Object> index() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("name", "Sova Distributed Job Scheduler");
        response.put("endpoints", Map.of(
                "POST /jobs", "Submit a job (echo | sleep | flaky)",
                "GET /jobs/{id}", "Inspect a job",
                "GET /jobs?status=PENDING", "List jobs by status",
                "POST /jobs/{id}/replay", "Replay a DEAD job",
                "GET /health", "Health check",
                "GET /actuator/health", "Detailed health status"
        ));
        return response;
    }
}
