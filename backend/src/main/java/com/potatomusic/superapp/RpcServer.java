package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Newline-delimited JSON-RPC over stdin/stdout.
 *
 * <p>Every message is a single JSON object. Requests carry an {@code id} and
 * {@code method}; server events carry an {@code event} name. Stdout is reserved
 * exclusively for protocol messages.</p>
 */
public final class RpcServer {
    private final PrintStream out;
    private final ExecutorService workers = Executors.newFixedThreadPool(6, r -> {
        Thread t = new Thread(r, "rpc-worker");
        t.setDaemon(true);
        return t;
    });
    private Backend backend;
    private volatile boolean stopped;

    public RpcServer(OutputStream output) {
        this.out = new PrintStream(output, true, StandardCharsets.UTF_8);
    }

    public void attach(Backend backend) {
        this.backend = backend;
    }

    public void emit(String event, Object data) {
        if (stopped) {
            return;
        }
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("event", event);
        message.put("data", data);
        send(message);
    }

    public void run() {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                handleLine(line);
            }
        } catch (Exception e) {
            System.err.println("[rpc] " + e.getMessage());
        } finally {
            stopped = true;
            if (backend != null) {
                backend.shutdown();
            }
            workers.shutdownNow();
        }
    }

    private void handleLine(String line) {
        JsonNode request;
        try {
            request = Json.MAPPER.readTree(line);
        } catch (Exception e) {
            emit("backend.error", Map.of("message", "Malformed JSON request"));
            return;
        }
        JsonNode id = request.get("id");
        String method = request.path("method").asText("");
        JsonNode params = request.get("params");
        if (method.isBlank()) {
            respondError(id, "InvalidRequest", "Missing method");
            return;
        }
        workers.submit(() -> {
            try {
                Object result = backend.handle(method, params);
                Map<String, Object> response = new LinkedHashMap<>();
                response.put("id", id == null ? null : Json.MAPPER.treeToValue(id, Object.class));
                response.put("result", result);
                send(response);
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                respondError(id, "BackendError", message);
            }
        });
    }

    private void respondError(JsonNode id, String code, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message);
        Map<String, Object> response = new LinkedHashMap<>();
        try {
            response.put("id", id == null ? null : Json.MAPPER.treeToValue(id, Object.class));
        } catch (Exception e) {
            response.put("id", null);
        }
        response.put("error", error);
        send(response);
    }

    private synchronized void send(Object message) {
        if (stopped) {
            return;
        }
        out.println(Json.stringify(message));
        out.flush();
    }

    public void stop() {
        stopped = true;
        out.flush();
    }
}
