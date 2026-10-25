package com.potatomusic.superapp;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Entry point for the headless Potatoplayer Super backend. */
public final class Main {
    public static void main(String[] args) {
        System.setProperty("java.awt.headless", "true");
        PrintStream protocol = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
        // Libraries and JVM diagnostics must never write into the JSON protocol stream.
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.err), true, StandardCharsets.UTF_8));

        RpcServer server = new RpcServer(protocol);
        try {
            Backend backend = new Backend(server::emit);
            server.attach(backend);
            Runtime.getRuntime().addShutdownHook(new Thread(backend::shutdown, "backend-shutdown"));
            server.emit("ready", Map.of(
                    "version", Backend.VERSION,
                    "pid", ProcessHandle.current().pid()
            ));
            server.run();
        } catch (Throwable e) {
            e.printStackTrace(System.err);
            server.emit("backend.fatal", Map.of("message", e.getMessage() == null ? "Backend failed to start" : e.getMessage()));
            System.exit(1);
        }
    }
}
