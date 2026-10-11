package com.potato.player.ui;

import com.potato.player.core.ColorUtil;
import com.potato.player.core.LibrarySort;
import com.potato.player.core.Theme;
import javafx.application.Platform;
import javafx.beans.binding.Bindings;
import javafx.collections.FXCollections;
import javafx.collections.ListChangeListener;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Alert;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.Tooltip;
import javafx.scene.control.ListCell;
import javafx.scene.control.ListView;
import javafx.scene.control.Button;
import javafx.scene.control.SelectionMode;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.scene.input.MouseEvent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 左侧歌曲库面板（对应 SongLibraryPanel）。
 */
public class SongLibraryPanel extends VBox {

    private final MainWindow main;
    private final Label countBadge = new Label("");
    private final ComboBox<String> sortCombo = new ComboBox<>();
    private final ListView<Object> songList = new ListView<>();
    /**
     * 叠加排序栈：<b>内部键，旧的在前</b>（最后一个是主键）。
     *
     * <p>点过的排序会攒起来：先点 A 再点 B → [A, B] → 先按 B、B 相同再看 A；
     * 再点 C → [A, B, C] → C ＞ B ＞ A。这就是「每点一次稳定排序一遍」的效果，
     * 只是写成了显式、可复现、可持久化的栈。</p>
     */
    private final List<String> sortStack = new ArrayList<>();
    /** 显示当前排序链（后点的在前）。 */
    private Label sortChainLabel;

    private static final Map<String, String> SORT_DISPLAY = Map.of(
            "title", "标题", "artist", "歌手", "rating", "评分",
            "block", "块", "genre", "流派", "play_count", "播放次数");
    private static final Map<String, String> SORT_INTERNAL = Map.of(
            "标题", "title", "歌手", "artist", "评分", "rating",
            "块", "block", "流派", "genre", "播放次数", "play_count");

    public SongLibraryPanel(MainWindow main) {
        super(6);
        this.main = main;
        getStyleClass().add("panel");
        setPadding(new Insets(10));
        build();
    }

    private void build() {
        loadSortStack();
        // 标题栏
        HBox header = new HBox(8);
        header.getStyleClass().add("accent-header");
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("🎵 音乐库");
        header.getChildren().addAll(title, spacer(), countBadge);
        getChildren().add(header);

        // 排序行 + 排序链提示：这两行归成一组（组内只留 2pt，组与组之间才是面板的 6pt）
        HBox control = new HBox(6);
        control.setAlignment(Pos.CENTER_LEFT);
        Label sortLbl = new Label("排序：");
        sortLbl.getStyleClass().add("small");
        sortCombo.getItems().addAll("标题", "歌手", "评分", "块", "流派", "播放次数");
        sortCombo.setValue(SORT_DISPLAY.getOrDefault(main.sortMode, "标题"));
        sortCombo.setOnAction(e -> onSortChanged(sortCombo.getValue()));
        HBox.setHgrow(sortCombo, Priority.ALWAYS);
        control.getChildren().addAll(sortLbl, sortCombo);

        // 排序链：只有真的叠加了才显示（单级时 managed=false，不占那一行、也不留间距）
        sortChainLabel = new Label();
        sortChainLabel.getStyleClass().add("small");
        sortChainLabel.setWrapText(true);
        sortChainLabel.setVisible(false);
        sortChainLabel.setManaged(false);
        Tooltip.install(sortChainLabel, new Tooltip("叠加排序：后点的模式是主键，之前点的依次降为次级键。"
                + "\n同一个模式再点一次会把它提到最前。"));

        VBox sortGroup = new VBox(2, control, sortChainLabel);
        getChildren().add(sortGroup);

        // 选择行：全选 / 加入歌单
        // （用户明确不要「批量操作」那套折叠面板，批量改块/流派请用右侧面板，单曲用「歌曲编辑」。）
        HBox selRow = new HBox(6);
        Button btnSelectAll = new Button("全选");
        btnSelectAll.setOnAction(e -> selectAllVisible());
        Button btnAddPl = new Button("加入歌单");
        btnAddPl.setOnAction(e -> bulkAddToPlaylist());
        for (Button b : new Button[]{btnSelectAll, btnAddPl}) {
            b.setMaxWidth(Double.MAX_VALUE);          // 等宽铺满整行，别挤成两个小碎片
            HBox.setHgrow(b, Priority.ALWAYS);
        }
        selRow.getChildren().addAll(btnSelectAll, btnAddPl);
        getChildren().add(selRow);

        // 歌曲列表
        songList.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        songList.setCellFactory(lv -> new SongCell());
        songList.setOnMouseClicked(this::onListClicked);
        // 选择同步：ListView 选中项 → main.selectedPaths
        songList.getSelectionModel().getSelectedItems().addListener((ListChangeListener<Object>) c -> {
            String lastAdded = null;
            int addedCount = 0;
            while (c.next()) {
                if (c.wasAdded()) {
                    for (Object o : c.getAddedSubList()) {
                        if (o instanceof String p) {
                            lastAdded = p;
                            addedCount++;
                        }
                    }
                }
            }
            main.selectedPaths.clear();
            for (Object o : songList.getSelectionModel().getSelectedItems()) {
                if (o instanceof String p) {
                    main.selectedPaths.add(p);
                }
            }
            // 仅「单击/加选单曲」且正在「歌曲编辑」面板时联动；全选、区间多选、批量操作一律不打扰
            if (addedCount == 1 && lastAdded != null) {
                main.functionPanels.onLibrarySelection(lastAdded);
            }
        });
        VBox.setVgrow(songList, Priority.ALWAYS);
        getChildren().add(songList);
    }

    private javafx.scene.Node spacer() {
        javafx.scene.layout.Region r = new javafx.scene.layout.Region();
        HBox.setHgrow(r, Priority.ALWAYS);
        return r;
    }

    private void onSortChanged(String text) {
        main.sortMode = SORT_INTERNAL.getOrDefault(text, "title");
        // 新点的模式进栈当主键，之前的整体降一级（A→B→C 就是 C ＞ B ＞ A）
        sortStack.remove(main.sortMode);
        sortStack.add(main.sortMode);
        while (sortStack.size() > SORT_INTERNAL.size()) {
            sortStack.remove(0);
        }
        saveSortStack();
        main.lib().config().put("sort_mode", main.sortMode);
        main.lib().saveConfig();
        updateSortChain();
        refresh();
    }

    // ── 叠加排序栈 ──

    /** 从配置恢复排序栈；没有或非法就用当前模式当唯一一级。 */
    private void loadSortStack() {
        sortStack.clear();
        Object raw = main.lib().config().get("sort_stack");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) {
                    continue;
                }
                String key = String.valueOf(o);
                if (SORT_DISPLAY.containsKey(key) && !sortStack.contains(key)) {
                    sortStack.add(key);
                }
            }
        }
        if (!sortStack.contains(main.sortMode)) {
            sortStack.remove(main.sortMode);
            sortStack.add(main.sortMode);
        }
        updateSortChain();
    }

    /** 栈里内部键 → 排序模式（旧的在前，最后一个是主键）。 */
    private List<LibrarySort.Mode> sortModes() {
        List<LibrarySort.Mode> modes = new ArrayList<>(sortStack.size());
        for (String key : sortStack) {
            modes.add(LibrarySort.Mode.of(key));
        }
        if (modes.isEmpty()) {
            modes.add(LibrarySort.Mode.of(main.sortMode));
        }
        return modes;
    }

    private void saveSortStack() {
        main.lib().config().put("sort_stack", new ArrayList<>(sortStack));
        main.lib().saveConfig();
    }

    /** 把排序链写出来：后点的排前面。 */
    private void updateSortChain() {
        if (sortChainLabel == null) {
            return;
        }
        if (sortStack.size() <= 1) {
            // 单级排序不用提示，省掉一行的高度
            sortChainLabel.setText("");
            sortChainLabel.setVisible(false);
            sortChainLabel.setManaged(false);
            return;
        }
        StringBuilder sb = new StringBuilder("叠加排序：");
        for (int i = sortStack.size() - 1; i >= 0; i--) {
            sb.append(SORT_DISPLAY.getOrDefault(sortStack.get(i), sortStack.get(i)));
            if (i > 0) {
                sb.append(" ＞ ");
            }
        }
        sortChainLabel.setText(sb.toString());
        sortChainLabel.setVisible(true);
        sortChainLabel.setManaged(true);
    }

    private void onListClicked(MouseEvent e) {
        if (e.getClickCount() == 2) {
            Object item = songList.getSelectionModel().getSelectedItem();
            if (item instanceof String path) {
                main.playFile(path, false);
            }
        }
    }

    /** 折叠/展开分组。 */
    private void toggleGroup(String name) {
        if (main.collapsedGroups.contains(name)) {
            main.collapsedGroups.remove(name);
        } else {
            main.collapsedGroups.add(name);
        }
        refresh();
    }

    /** 选中/取消选中组内全部歌曲。 */
    private void selectGroup(String name) {
        List<Integer> indices = new ArrayList<>();
        for (int i = 0; i < songList.getItems().size(); i++) {
            Object o = songList.getItems().get(i);
            if (o instanceof String p && name.equals(groupName(p))) {
                indices.add(i);
            }
        }
        if (indices.isEmpty()) {
            return;
        }
        boolean allSelected = true;
        for (int i : indices) {
            if (!songList.getSelectionModel().isSelected(i)) {
                allSelected = false;
                break;
            }
        }
        if (allSelected) {
            for (int i : indices) {
                songList.getSelectionModel().clearSelection(i);
            }
        } else {
            for (int i : indices) {
                songList.getSelectionModel().select(i);
            }
        }
    }

    private void bulkAddToPlaylist() {
        List<String> paths = new ArrayList<>(main.selectedPaths);
        if (paths.isEmpty()) {
            warn("未选择", "请先选择要加入歌单的曲目");
            return;
        }
        for (String p : paths) {
            if (!main.playlist.contains(p)) {
                main.playlist.add(p);
            }
        }
        refreshPlaylist();
        clearSelection();
    }

    public void selectAllVisible() {
        int count = songList.getItems().size();
        if (count == 0) {
            return;
        }
        if (songList.getSelectionModel().getSelectedItems().size() == count) {
            songList.getSelectionModel().clearSelection();
        } else {
            songList.getSelectionModel().selectAll();
        }
    }

    public void clearSelection() {
        songList.getSelectionModel().clearSelection();
        main.selectedPaths.clear();
    }

    private void warn(String title, String msg) {
        Alert a = new Alert(Alert.AlertType.WARNING, msg);
        a.setTitle(title);
        a.setHeaderText(null);
        a.showAndWait();
    }

    /** 重建歌曲库列表。 */
    public void refresh() {
        songList.getItems().clear();

        List<String> paths = sortedPaths();
        paths = applyFilter(paths);
        countBadge.setText(paths.size() + " 首");

        // 索引条上要写"这一组有几首歌"：先按当前可见列表数一遍（筛选之后的数量才对得上）
        Map<String, Integer> groupCounts = new HashMap<>();
        if (headersOn()) {
            for (String path : paths) {
                groupCounts.merge(groupName(path), 1, Integer::sum);
            }
        }

        ObservableList<Object> items = songList.getItems();
        String lastGroup = null;
        int idx = 0;
        for (String path : paths) {
            if (headersOn()) {
                String group = groupName(path);
                if (!group.equals(lastGroup)) {
                    lastGroup = group;
                    items.add(new Header(group, groupColor(group),
                            groupCounts.getOrDefault(group, 0)));
                }
                // 折叠的分组跳过其歌曲
                if (main.collapsedGroups.contains(group)) {
                    continue;
                }
            }
            items.add(path);
            idx++;
        }
    }

    /** 当前排序方式下要不要显示分组索引条（块 / 流派 / 评分三选一 + 总开关）。 */
    private boolean headersOn() {
        return main.showIndexHeaders
                && ("block".equals(main.sortMode) || "genre".equals(main.sortMode)
                || "rating".equals(main.sortMode));
    }

    /**
     * 排序：交给 {@link LibrarySort}（每个模式都带固定的次级键 = 路径）。
     *
     * <p>按<b>叠加排序栈</b>来：后点的是主键，之前点的依次降为次级键
     * （依次点过 A → B → C = C ＞ B ＞ A），最后用路径兜底。
     * 这样"每点一次再稳定排序一遍"的效果被写成显式规则：结果可复现、可持久化，
     * 也不会因为「搜索与筛选」把 {@code audioPaths} 写成了别的顺序而变味。</p>
     */
    private List<String> sortedPaths() {
        List<String> paths = new ArrayList<>(main.audioPaths);
        LibrarySort.sort(paths, sortModes(), sortAccessors());
        return paths;
    }

    /** 排序取值函数（标题 / 歌手走缓存，不读标签）。 */
    private LibrarySort.Accessors sortAccessors() {
        return new LibrarySort.Accessors(
                main::getCachedTitle,
                main::getCachedArtist,
                this::score,
                p -> ratingStr(p, "block"),
                p -> ratingStr(p, "genre"),
                this::playCount);
    }

    private List<String> applyFilter(List<String> paths) {
        if (main.ratingFilterActive) {
            double lo = main.ratingFilterMin;
            double hi = main.ratingFilterMax;
            List<String> out = new ArrayList<>();
            for (String p : paths) {
                double s = score(p);
                if (s >= lo && s <= hi) {
                    out.add(p);
                }
            }
            return out;
        }
        return paths;
    }

    private String displayName(String path) {
        String name;
        if (main.artistHidden) {
            // 只取缓存标题：以前这里调 loadSongInfo，每行都会读一次音频标签
            // （含内嵌封面），整个音乐库 = 每启动一次就把所有文件读一遍。
            name = main.getCachedSongTitle(path);
        } else {
            name = main.getCachedTitle(path);
        }
        String note = ratingStr(path, "note");
        if (!note.isEmpty()) {
            if ("note_only".equals(main.noteDisplayMode)) {
                name = note.substring(0, Math.min(30, note.length()));
            } else if ("expanded".equals(main.noteDisplayMode)) {
                name = name + "  (" + note.substring(0, Math.min(27, note.length())) + ")";
            }
        }
        return name;
    }

    private String groupName(String path) {
        if ("block".equals(main.sortMode)) {
            String b = ratingStr(path, "block");
            return b.isEmpty() ? "未分组" : b;
        }
        if ("genre".equals(main.sortMode)) {
            String g = ratingStr(path, "genre");
            return g.isEmpty() ? "未分类" : g;
        }
        if ("rating".equals(main.sortMode)) {
            double s = score(path);
            int base = (int) s;
            return s >= base + 0.6 ? base + "+" : String.valueOf(base);
        }
        return "";
    }

    private String groupColor(String group) {
        if ("block".equals(main.sortMode)) {
            return main.getBlockColor(group);
        }
        return Theme.DEFAULT_BLOCK_COLOR;
    }

    private double score(String path) {
        Map<String, Object> r = main.lib().ratings().get(path);
        if (r == null) {
            return 0;
        }
        Object v = r.get("score");
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        return 0;
    }

    private int playCount(String path) {
        Map<String, Object> r = main.lib().ratings().get(path);
        if (r == null) {
            return 0;
        }
        Object v = r.get("play_count");
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }

    private String ratingStr(String path, String key) {
        Map<String, Object> r = main.lib().ratings().get(path);
        if (r == null) {
            return "";
        }
        Object v = r.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    public void refreshPlaylist() {
        main.functionPanels.refreshPlaylist();
    }

    /** 歌曲列表单元格：标题 + 左侧块颜色标识条（用左边框实现，避免滚动时整行着色）。 */
    private final class SongCell extends ListCell<Object> {
        // header 行复用同一套控件：宽度绑定到单元格，保证「组内全选」始终贴右
        private final HBox headerBox = new HBox(6);
        private final Label headerArrow = new Label();
        private final Label headerName = new Label();
        private final Label headerSelectAll = new Label("☑ 组内全选");
        private String headerGroup;

        SongCell() {
            headerBox.setAlignment(Pos.CENTER_LEFT);
            headerBox.setMaxWidth(Double.MAX_VALUE);
            headerArrow.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-cursor: hand;");
            headerName.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-cursor: hand;");
            headerSelectAll.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-cursor: hand;");
            Region sp = new Region();
            HBox.setHgrow(sp, Priority.ALWAYS);
            headerBox.getChildren().addAll(headerArrow, headerName, sp, headerSelectAll);
            // 单元格宽度 - 左右内边距(10+10)，使整条 header 撑满并让右侧按钮固定
            headerBox.prefWidthProperty().bind(Bindings.max(60d, widthProperty().subtract(20d)));
            // 点击整条 header（除右侧按钮）→ 折叠展开；点「组内全选」→ 选中/取消组内歌曲
            headerBox.setOnMousePressed(e -> {
                e.consume();
                String g = headerGroup;
                if (g != null) {
                    Platform.runLater(() -> toggleGroup(g));
                }
            });
            headerSelectAll.setOnMousePressed(e -> {
                e.consume();
                String g = headerGroup;
                if (g != null) {
                    Platform.runLater(() -> selectGroup(g));
                }
            });
        }

        @Override
        protected void updateItem(Object item, boolean empty) {
            super.updateItem(item, empty);
            if (empty || item == null) {
                setText(null);
                setGraphic(null);
                setStyle("");
                setBorder(null);
                setDisable(false);
                return;
            }
            if (item instanceof Header h) {
                // 分组行没有标识带，内边距也要回到主题值（否则会被歌名那行的 6 带偏 4pt）
                setBorder(null);
                setStyle("");
                headerGroup = h.text;
                headerArrow.setText(main.collapsedGroups.contains(h.text) ? "▶" : "▼");
                headerName.setText(h.count >= 0 ? h.text + "  ·  " + h.count + " 首" : h.text);
                headerBox.setStyle("-fx-background-color: " + h.color
                        + "; -fx-padding: 4 8; -fx-background-radius: 6;");
                setGraphic(headerBox);
                setText(null);
                setStyle("");
                setBorder(null);
                setDisable(false);
                return;
            }
            headerGroup = null;
            String path = (String) item;
            String display = displayName(path);
            double sc = score(path);
            StringBuilder text = new StringBuilder(display);
            // 「听歌次数」排序时，把每首的次数写出来（其它排序方式下不写，免得列表太花）
            if ("play_count".equals(main.sortMode)) {
                text.append("    ♪ ").append(playCount(path)).append(" 次");
            }
            if (sc != 0.0) {
                text.append("    ★").append(String.format("%.1f", sc));
            }
            setText(text.toString());
            setGraphic(null);

            String block = ratingStr(path, "block");
            String genre = ratingStr(path, "genre");
            String color = block.isEmpty() ? Theme.DEFAULT_BLOCK_COLOR : main.getBlockColor(block);
            // 标识带：左 4pt 块色、右 4pt 流派色（没有流派就留空）。
            // 内边距从主题的 10 减到 6 抵掉带子多出来的 4pt（8 + 6 = 原来的 4 + 10），
            // 所以歌名的左边缘一格没动，和索引条的分组行照旧对齐。
            setBorder(ThemeCss.idStrip(color, genre.isEmpty() ? null : main.getGenreColor(genre)));
            String fill = isSelected() ? "white" : (sc != 0.0 ? ColorUtil.scoreToColor(sc) : main.c("TEXT"));
            setStyle("-fx-padding: 7 10 7 6; -fx-text-fill: " + fill + ";");
            setDisable(false);
        }
    }
}
