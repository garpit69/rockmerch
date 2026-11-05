<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $columns = array_column($db->query('PRAGMA table_info(password_resets)')->fetchAll(), 'name');
    foreach ([
        'code_hash' => 'TEXT',
        'attempts' => 'INTEGER NOT NULL DEFAULT 0',
        'requested_at' => 'INTEGER NOT NULL DEFAULT 0',
    ] as $column => $definition) {
        if (!in_array($column, $columns, true)) {
            $db->exec('ALTER TABLE password_resets ADD COLUMN ' . $column . ' ' . $definition);
        }
    }
    $db->exec('CREATE INDEX IF NOT EXISTS idx_password_resets_user_requested ON password_resets(user_id, requested_at)');
};
