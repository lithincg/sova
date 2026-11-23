package com.lithin.sova.worker;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class JobHandlerRegistry {

    private final Map<String, JobHandler> handlers;

    public JobHandlerRegistry(List<JobHandler> handlerBeans) {
        this.handlers = handlerBeans.stream()
                .collect(Collectors.toUnmodifiableMap(JobHandler::type, Function.identity()));
    }

    public JobHandler get(String type) {
        JobHandler handler = handlers.get(type);
        if (handler == null) {
            throw new IllegalArgumentException("No JobHandler registered for type: " + type);
        }
        return handler;
    }
}
