package com.potatomusic.superapp;

/**
 * Sentinel values for the "download to block / genre" selects on the Discover page.
 *
 * <p>{@code ""} means "not specified": a download updates info but leaves the
 * existing tags alone. {@link #CLEAR} means "none": an existing song has the
 * tag cleared, while a brand-new download simply starts with an empty tag. The
 * value travels to the download jobs unchanged; both online services interpret
 * it in one place, so the AI tools and the UI send the same string.</p>
 */
public final class DownloadTargets {
    /** Explicitly clear the tag; distinct from an empty value, which means "keep". */
    public static final String CLEAR = "__none__";

    private DownloadTargets() {
    }

    public static boolean clears(String value) {
        return value != null && CLEAR.equals(value.trim());
    }

    public static boolean specifies(String value) {
        return value != null && !value.isBlank() && !clears(value);
    }
}
