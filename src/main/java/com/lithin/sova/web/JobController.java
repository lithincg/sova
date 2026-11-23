package com.lithin.sova.web;

import com.lithin.sova.domain.JobStatus;
import com.lithin.sova.dto.JobResponse;
import com.lithin.sova.dto.SubmitJobRequest;
import com.lithin.sova.service.JobService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/jobs")
public class JobController {

    private final JobService service;

    public JobController(JobService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobResponse submit(@Valid @RequestBody SubmitJobRequest req) {
        return service.submit(req);
    }

    @GetMapping("/{id}")
    public JobResponse get(@PathVariable UUID id) {
        return service.get(id);
    }

    @GetMapping
    public List<JobResponse> list(@RequestParam(required = false) JobStatus status) {
        return service.list(status);
    }

    @PostMapping("/{id}/replay")
    public JobResponse replay(@PathVariable UUID id) {
        return service.replay(id);
    }
}
