package com.lithin.sova.worker;

import com.lithin.sova.domain.Job;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class EchoJobHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(EchoJobHandler.class);

    @Override
    public String type() {
        return "echo";
    }

    @Override
    public void handle(Job job) {
        log.info("Executed echo job id={} payload={}", job.getId(), job.getPayload());
    }
}
