package com.potato.player.ui;

import javafx.beans.property.DoubleProperty;
import javafx.beans.property.ObjectProperty;
import javafx.beans.property.SimpleDoubleProperty;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;

/**
 * 系统任务中心（非下载类的长任务：全库扫描、批量处理…）。
 *
 * <p>「任务」面板把这里的任务和 {@link DownloadManager} 的下载队列一起显示，
 * 每项都是一条标题 + 详情 + 进度条。任务本身只负责把状态写进属性，
 * 具体的刷新由 JavaFX 属性绑定自动完成。</p>
 */
public final class JobCenter {

    public enum State { RUNNING, DONE, FAILED, CANCELLED }

    /** 一个任务。{@code progress < 0} 表示进度未知（显示为滚动条）。 */
    public static final class Job {
        public final StringProperty title = new SimpleStringProperty("");
        public final StringProperty detail = new SimpleStringProperty("");
        public final ObjectProperty<State> state = new SimpleObjectProperty<>(State.RUNNING);
        public final DoubleProperty progress = new SimpleDoubleProperty(-1);
        /** 「停止」按钮的动作（null 表示不可中断）。 */
        public Runnable onCancel;

        public Job(String title) {
            this.title.set(title);
        }
    }

    private final ObservableList<Job> jobs = FXCollections.observableArrayList();

    public ObservableList<Job> jobs() {
        return jobs;
    }

    /** 新建并登记一个正在运行的任务。 */
    public Job start(String title) {
        Job j = new Job(title);
        j.state.set(State.RUNNING);
        jobs.add(j);
        return j;
    }

    public boolean hasRunning() {
        return jobs.stream().anyMatch(j -> j.state.get() == State.RUNNING);
    }

    /** 清除已结束（完成/失败/取消）的任务。 */
    public void clearFinished() {
        jobs.removeIf(j -> j.state.get() != State.RUNNING);
    }
}
