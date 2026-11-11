package com.potatomusic.superapp;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Persistent, account-scoped membership sync. All jobs and config edits share one lane. */
public final class PlaylistSync {
    public static class Binding {
        public String id, accountId, cloudId, cloudName, kind, target, libraryRoot;
        public String direction = "both", strategy = "add";
        public List<String> baseline = new ArrayList<>();
        public Checkpoint pending;
        public List<SkippedTrack> skipped = new ArrayList<>();
        public boolean initialized;
        public long lastSyncedAt;
        public String status = "idle", message = "";
    }
    public record Checkpoint(List<String> local, List<String> cloud, List<String> merged) {}
    public record SkippedTrack(String id, String title, String artist) {}
    public record Local(String name, String root, List<String> trackIds, List<String> onlineIds,
                        Map<String, String> available, List<SkippedTrack> unmapped) {}
    public record Cloud(String name, String owner, List<String> ids) {}
    public record Plan(List<String> local, List<String> cloud) {}
    public interface Host {
        Local snapshot(String kind, String target);
        void apply(Binding binding, Local expected, List<String> ids, boolean replace);
        void changed(Object bindings);
    }
    public interface Remote {
        String account();
        Cloud read(String id);
        void write(String account, String id, List<String> before, List<String> after, boolean order);
        String download(String id);
    }

    private final Host host;
    private final Remote remote;
    private final Path file;
    private final List<Binding> bindings = new ArrayList<>();
    private final Map<String, String> downloads = new HashMap<>(); // song -> job
    private final Map<String, String> downloadErrors = new HashMap<>();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "playlist-sync"); t.setDaemon(true); return t;
    });
    private volatile List<Map<String, Object>> published = List.of();
    private volatile String loadError = "";
    private ScheduledFuture<?> pending;
    private final Set<String> startupPending = new HashSet<>();
    private final Map<String, Local> observed = new HashMap<>();

    public PlaylistSync(Path file, Host host, Remote remote) {
        this.file = file; this.host = host; this.remote = remote;
        try {
            if (Files.exists(file)) bindings.addAll(Arrays.asList(Json.read(Files.readString(file), Binding[].class)));
            for (Binding b : bindings) { b.status = "idle"; b.message = ""; startupPending.add(b.id); }
        } catch (Exception e) { loadError = "无法读取同步配置，原文件已保留：" + e.getMessage(); }
        publish();
        worker.schedule(this::runLocalChanges, 2, TimeUnit.SECONDS);
    }

    public Map<String, Object> list() { return Map.of("bindings", published, "error", loadError); }

    public Object save(JsonNode p) { return call(() -> {
        if (!loadError.isEmpty()) throw new IllegalStateException(loadError);
        String id = p.path("id").asText("");
        Binding old = id.isEmpty() ? null : find(id);
        Binding b = new Binding();
        b.id = old == null ? UUID.randomUUID().toString() : old.id;
        b.kind = p.path("kind").asText(); b.target = p.path("target").asText();
        b.direction = p.path("direction").asText(); b.strategy = p.path("strategy").asText();
        b.cloudId = p.path("cloudId").asText();
        validate(b);
        Local local = host.snapshot(b.kind, b.target);
        b.libraryRoot = local.root(); b.accountId = remote.account();
        Cloud cloud = remote.read(b.cloudId); b.cloudName = cloud.name();
        if (!b.direction.equals("pull") && !cloud.owner().equals(b.accountId))
            throw new IllegalArgumentException("本地到云端或双向同步需要选择自己创建的网易云歌单。");
        for (Binding other : bindings) {
            if (other == old) continue;
            if ((other.kind.equals(b.kind) && other.target.equals(b.target) && other.libraryRoot.equals(b.libraryRoot))
                    || (other.accountId.equals(b.accountId) && other.cloudId.equals(b.cloudId)))
                throw new IllegalArgumentException("该本地分类或云端歌单已有绑定，请先解绑。");
        }
        if (old != null && old.accountId.equals(b.accountId) && old.cloudId.equals(b.cloudId)
                && old.kind.equals(b.kind) && old.target.equals(b.target) && old.libraryRoot.equals(b.libraryRoot)
                && old.direction.equals(b.direction) && old.strategy.equals(b.strategy)) {
            b.baseline = old.baseline; b.pending = old.pending; b.initialized = old.initialized; b.lastSyncedAt = old.lastSyncedAt;
        }
        List<Binding> next = new ArrayList<>(bindings);
        if (old != null) next.remove(old);
        next.add(b);
        Json.writeAtomic(file, next); // Commit configuration before starting any sync.
        bindings.clear(); bindings.addAll(next); publish();
        worker.execute(() -> run(b));
        return list();
    }); }

    public Object unbind(String id) { return call(() -> {
        Binding b = find(id);
        List<Binding> next = new ArrayList<>(bindings); next.remove(b);
        Json.writeAtomic(file, next);
        bindings.clear(); bindings.addAll(next); startupPending.remove(id); observed.remove(id); publish();
        return list();
    }); }

    public Object sync(String id) {
        worker.execute(() -> {
            downloadErrors.clear();
            for (Binding b : List.copyOf(bindings)) if (id.isEmpty() || id.equals(b.id)) run(b);
        });
        return Map.of("started", true);
    }

    public synchronized void localChanged() {
        if (worker.isShutdown()) return;
        if (pending != null) pending.cancel(false);
        pending = worker.schedule(this::runLocalChanges, 2, TimeUnit.SECONDS);
    }

    public void rename(String kind, String from, String to, String root) {
        if (worker.isShutdown()) return;
        worker.execute(() -> {
            if (!loadError.isEmpty()) return;
            List<Binding> affected = bindings.stream().filter(b -> b.kind.equals(kind)
                    && b.target.equals(from) && b.libraryRoot.equals(root)).toList();
            if (affected.isEmpty()) return;
            for (Binding b : affected) b.target = to;
            try { Json.writeAtomic(file, bindings); }
            catch (Exception e) {
                for (Binding b : affected) b.target = from;
                loadError = "同步配置保存失败：" + e.getMessage();
            }
            publish();
        });
    }

    public void downloadEvent(String event, Map<?, ?> data) {
        if (worker.isShutdown() || !event.matches("download\\.(done|error|cancelled)")) return;
        worker.execute(() -> {
            String job = String.valueOf(data.get("jobId"));
            for (var entry : new ArrayList<>(downloads.entrySet())) {
                if (!entry.getValue().equals(job)) continue;
                downloads.remove(entry.getKey());
                if (!event.equals("download.done")) downloadErrors.put(entry.getKey(),
                        data.get("message") == null ? "下载已取消，请点击立即同步重试。" : String.valueOf(data.get("message")));
            }
            localChanged();
        });
    }

    private void runLocalChanges() {
        for (Binding b : List.copyOf(bindings)) {
            try {
                Local current = host.snapshot(b.kind, b.target);
                boolean startup = startupPending.remove(b.id);
                boolean continuation = b.status.equals("waiting");
                Local previous = observed.get(b.id);
                if (startup || continuation || (!b.direction.equals("pull") && (previous == null || !same(previous, current)))) run(b);
            } catch (Exception e) {
                // Startup waits for the scanner's completion event, without polling the API.
                b.status = "error"; b.message = e.getMessage(); publish();
            }
        }
    }

    private void run(Binding b) {
        b.status = "syncing"; b.message = "正在检查两端歌单…"; publish();
        try {
            validate(b);
            Local local = host.snapshot(b.kind, b.target);
            startupPending.remove(b.id);
            observed.put(b.id, local);
            b.skipped = new ArrayList<>(local.unmapped());
            if (!b.libraryRoot.equals(local.root())) throw new IllegalStateException("资料库目录已切换，请切回绑定时的资料库。");
            String account = remote.account();
            if (!b.accountId.equals(account)) throw new IllegalStateException("网易云账号与绑定账号不同，请登录原账号或重新绑定。");
            Cloud cloud = remote.read(b.cloudId);
            if (!b.direction.equals("pull") && !cloud.owner().equals(account))
                throw new IllegalStateException("当前账号没有此云端歌单的写入权限。");
            boolean ordered = b.kind.equals("playlist");
            List<String> localIds = ordered ? local.onlineIds() : local.onlineIds().stream().sorted().toList();
            List<String> cloudIds = ordered ? cloud.ids() : cloud.ids().stream().sorted().toList();
            Plan plan = b.pending != null && b.direction.equals("both") && b.strategy.equals("replace")
                    ? resume(b.pending, localIds, cloudIds)
                    : plan(b.direction, b.strategy, b.initialized, b.baseline, localIds, cloudIds);
            int missing = 0;
            if (!b.direction.equals("push")) {
                for (String song : plan.local()) {
                    if (local.available().containsKey(song)) continue;
                    String error = downloadErrors.get(song);
                    if (error != null) throw new IllegalStateException("歌曲 " + song + " 下载失败：" + error);
                    missing++;
                    if (!downloads.containsKey(song)) downloads.put(song, remote.download(song));
                }
            }
            if (missing > 0) {
                b.status = "waiting"; b.message = "等待 " + missing + " 首歌曲下载并入库，完成后自动继续。"; publish(); return;
            }
            // Re-read before mutating: a stale scan or a user edit must not be overwritten.
            if (!same(local, host.snapshot(b.kind, b.target))) throw new IllegalStateException("本地内容已变化，稍后自动重试。");
            if (b.direction.equals("both") && b.strategy.equals("replace")) {
                // Write-ahead checkpoint: a partial cloud write or concurrent local edit must not
                // resurrect a just-deleted song when retrying, including the very first sync.
                Checkpoint prior = b.pending;
                b.pending = new Checkpoint(localIds, cloudIds, plan.cloud());
                try { Json.writeAtomic(file, bindings); }
                catch (Exception e) { b.pending = prior; throw e; }
            }
            boolean cloudChanged = ordered && b.strategy.equals("replace") ? !plan.cloud().equals(cloud.ids())
                    : !new LinkedHashSet<>(plan.cloud()).equals(new LinkedHashSet<>(cloud.ids()));
            if (!b.direction.equals("pull") && cloudChanged) {
                if (!remote.read(b.cloudId).ids().equals(cloud.ids())) throw new IllegalStateException("云端内容已变化，请再次点击同步。");
                remote.write(b.accountId, b.cloudId, cloud.ids(), plan.cloud(), ordered && b.strategy.equals("replace"));
                Cloud verified = remote.read(b.cloudId);
                if (ordered && b.strategy.equals("replace") ? !verified.ids().equals(plan.cloud())
                        : !new LinkedHashSet<>(verified.ids()).equals(new LinkedHashSet<>(plan.cloud())))
                    throw new IllegalStateException("云端尚未确认全部修改，已保留上次同步记录，请再次点击同步。");
            }
            if (!b.direction.equals("push")) host.apply(b, local, plan.local(), b.strategy.equals("replace"));
            else if (!same(local, host.snapshot(b.kind, b.target))) throw new IllegalStateException("本地内容已变化，稍后自动重试。");
            observed.put(b.id, host.snapshot(b.kind, b.target));
            Checkpoint previousPending = b.pending;
            List<String> previousBaseline = b.baseline;
            boolean previousInitialized = b.initialized;
            long previousTime = b.lastSyncedAt;
            b.cloudName = cloud.name(); b.baseline = new ArrayList<>(plan.cloud()); b.pending = null; b.initialized = true;
            b.lastSyncedAt = System.currentTimeMillis(); b.status = "success"; b.message = "同步完成 · " + plan.cloud().size() + " 首歌曲"
                    + (b.skipped.isEmpty() ? "" : " · 已跳过 " + b.skipped.size() + " 首未绑定歌曲");
            try { Json.writeAtomic(file, bindings); }
            catch (Exception e) {
                b.baseline = previousBaseline; b.pending = previousPending; b.initialized = previousInitialized; b.lastSyncedAt = previousTime;
                throw e;
            }
        } catch (Exception e) {
            b.status = "error"; b.message = e.getMessage() == null ? "同步失败，请重试。" : e.getMessage();
        }
        publish();
    }

    static boolean same(Local a, Local b) {
        return a.root().equals(b.root()) && a.trackIds().equals(b.trackIds()) && a.onlineIds().equals(b.onlineIds()) && a.unmapped().equals(b.unmapped());
    }

    /** Three-way membership merge: either side's deletion of a baseline member wins. */
    public static Plan plan(String direction, String strategy, boolean initialized, List<String> baseline,
                            List<String> local, List<String> cloud) {
        boolean replace = strategy.equals("replace");
        if (direction.equals("push")) return new Plan(local, replace ? unique(local) : union(cloud, local));
        if (direction.equals("pull")) return new Plan(replace ? unique(cloud) : union(local, cloud), cloud);
        if (!replace) return new Plan(union(local, cloud), union(cloud, local));
        List<String> merged = initialized && local.equals(baseline) ? union(cloud, local) : union(local, cloud);
        if (initialized) merged.removeIf(id -> baseline.contains(id) && (!local.contains(id) || !cloud.contains(id)));
        return new Plan(merged, merged);
    }
    /** Resume a partially applied merge while preserving edits made after its checkpoint. */
    public static Plan resume(Checkpoint pending, List<String> local, List<String> cloud) {
        Set<String> desired = new LinkedHashSet<>(pending.merged());
        for (String id : local) if (!pending.local().contains(id)) desired.add(id);
        for (String id : cloud) if (!pending.cloud().contains(id)) desired.add(id);
        for (String id : pending.local()) if (!local.contains(id)) desired.remove(id);
        for (String id : pending.cloud()) if (!cloud.contains(id)) desired.remove(id);
        List<String> order = !local.equals(pending.local()) ? union(local, cloud)
                : !cloud.equals(pending.cloud()) ? union(cloud, local) : new ArrayList<>(pending.merged());
        order = union(order, new ArrayList<>(desired));
        order.removeIf(id -> !desired.contains(id));
        return new Plan(order, order);
    }
    private static List<String> unique(List<String> a) { return new ArrayList<>(new LinkedHashSet<>(a)); }
    private static List<String> union(List<String> a, List<String> b) { List<String> out = new ArrayList<>(a); out.addAll(b); return unique(out); }
    private static void validate(Binding b) {
        if (!List.of("playlist", "block", "genre").contains(b.kind) || b.target == null || b.target.isBlank()
                || b.cloudId == null || !b.cloudId.matches("[1-9][0-9]{0,19}")
                || !List.of("push", "pull", "both").contains(b.direction) || !List.of("replace", "add").contains(b.strategy))
            throw new IllegalArgumentException("请选择有效的歌单、同步方向和策略。");
    }
    private Binding find(String id) { return bindings.stream().filter(b -> b.id.equals(id)).findFirst().orElseThrow(() -> new IllegalArgumentException("绑定不存在。")); }
    private Object call(Callable<Object> fn) {
        try { return worker.submit(fn).get(); }
        catch (ExecutionException e) { throw new IllegalStateException(e.getCause().getMessage(), e.getCause()); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("同步操作已中断。", e); }
    }
    @SuppressWarnings("unchecked")
    private void publish() {
        published = bindings.stream().map(b -> (Map<String, Object>) Json.MAPPER.convertValue(b, Map.class)).toList();
        host.changed(list());
    }
    public void shutdown() { worker.shutdownNow(); }
}
