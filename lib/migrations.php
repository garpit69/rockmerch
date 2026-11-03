<?php
declare(strict_types=1);

function apply_migrations(PDO $db, string $directory): array {
    $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $files = glob(rtrim($directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.php') ?: [];
    sort($files, SORT_STRING);
    $applied = [];

    foreach ($files as $file) {
        $version = basename($file, '.php');
        $migration = require $file;
        if (!is_callable($migration)) {
            throw new RuntimeException('Invalid migration file: ' . basename($file));
        }
        $check = $db->prepare('SELECT 1 FROM schema_migrations WHERE version=?');
        $check->execute([$version]);
        if ($check->fetchColumn()) continue;

        $db->beginTransaction();
        try {
            $migration($db);
            $record = $db->prepare('INSERT INTO schema_migrations(version) VALUES (?)');
            $record->execute([$version]);
            $db->commit();
            $applied[] = $version;
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw new RuntimeException('Migration ' . $version . ' failed: ' . $exception->getMessage(), 0, $exception);
        }
    }

    return $applied;
}
