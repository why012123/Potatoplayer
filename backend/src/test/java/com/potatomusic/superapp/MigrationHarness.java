package com.potatomusic.superapp;
import java.nio.file.*;
public final class MigrationHarness {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("source-directory destination-directory");
        System.setProperty("potatomusic.importHome", Path.of(args[0]).toAbsolutePath().toString());
        System.setProperty("potatomusic.home", Path.of(args[1]).toAbsolutePath().toString());
        DataStore store = new DataStore(); store.ensure(); SuperMigration.run(store);
        Path report = store.dataDir().resolve("migration-super-v1/report.json");
        if (Files.exists(report)) System.out.println(Files.readString(report));
    }
}
