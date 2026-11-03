<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap.php';
$versions = $db->query('SELECT version,applied_at FROM schema_migrations ORDER BY version')->fetchAll();
foreach ($versions as $migration) {
    fwrite(STDOUT, $migration['version'] . ' ' . $migration['applied_at'] . PHP_EOL);
}
