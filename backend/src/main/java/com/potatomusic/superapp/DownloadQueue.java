package com.potatomusic.superapp;

import java.io.Closeable;
import java.io.IOException;
import java.util.concurrent.*;

/** One FIFO transfer lane shared by online providers; cancellation owns the live response body. */
final class DownloadQueue {
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "online-downloads"); t.setDaemon(true); return t;
    });
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final ThreadLocal<Job> current = new ThreadLocal<>();
    private static final class Job {
        volatile boolean cancelled;
        boolean committing;
        Closeable stream;
        FutureTask<Void> task;
        Runnable cancelledEvent;
    }
    void submit(String id, Runnable queued, Runnable work, Runnable cancelled) {
        Job job = new Job(); job.cancelledEvent = cancelled;
        job.task = new FutureTask<>(() -> {
            current.set(job);
            try { check(); work.run(); } finally { current.remove(); jobs.remove(id, job); }
            return null;
        });
        jobs.put(id, job);
        queued.run();
        WORKER.execute(job.task);
    }
    boolean cancel(String id) {
        Job job = jobs.get(id);
        if (job == null) return false;
        Closeable stream;
        synchronized (job) {
            if (job.cancelled || job.committing) return false;
            job.cancelled = true;
            stream = job.stream;
            job.task.cancel(true);
            job.cancelledEvent.run();
        }
        if (stream != null) try { stream.close(); } catch (IOException ignored) { }
        jobs.remove(id, job);
        return true;
    }
    void check() {
        Job job = current.get();
        if (Thread.currentThread().isInterrupted() || (job != null && job.cancelled))
            throw new CancellationException("Download cancelled");
    }
    void attach(Closeable stream) throws IOException {
        Job job = current.get();
        if (job == null) return;
        synchronized (job) {
            if (job.cancelled) { stream.close(); throw new CancellationException(); }
            job.stream = stream;
        }
    }
    void commit() {
        Job job = current.get();
        if (job == null) return;
        synchronized (job) { check(); job.committing = true; }
    }
    void emit(Runnable event) {
        Job job = current.get();
        if (job == null) { event.run(); return; }
        synchronized (job) { if (!job.cancelled) event.run(); }
    }
    static java.nio.file.Path lyricPath(java.nio.file.Path audio, String suffix) {
        String name = audio.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return audio.resolveSibling((dot > 0 ? name.substring(0, dot) : name) + suffix);
    }
    static void publishLyrics(java.nio.file.Path staged, java.nio.file.Path target) throws IOException {
        for (String suffix : new String[]{".lrc", ".trans.lrc"}) {
            java.nio.file.Path source = lyricPath(staged, suffix);
            if (java.nio.file.Files.exists(source)) java.nio.file.Files.move(source, lyricPath(target, suffix), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }
    static void cleanLyrics(java.nio.file.Path staged) {
        if (staged == null) return;
        for (String suffix : new String[]{".lrc", ".trans.lrc"})
            try { java.nio.file.Files.deleteIfExists(lyricPath(staged, suffix)); } catch (IOException ignored) { }
    }
    void shutdownNow() { for (String id : jobs.keySet()) cancel(id); }
}
