package com.lithin.sova.worker;

import com.lithin.sova.domain.Job;

public interface JobHandler {
    String type();

    void handle(Job job) throws Exception;
}
