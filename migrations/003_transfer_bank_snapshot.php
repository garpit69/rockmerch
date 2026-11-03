<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $columns = array_column($db->query('PRAGMA table_info(orders)')->fetchAll(), 'name');
    foreach ([
        'transfer_bank_code' => "TEXT NOT NULL DEFAULT ''",
        'transfer_bank_account' => "TEXT NOT NULL DEFAULT ''",
        'transfer_account_name' => "TEXT NOT NULL DEFAULT ''",
    ] as $column => $definition) {
        if (!in_array($column, $columns, true)) {
            $db->exec('ALTER TABLE orders ADD COLUMN ' . $column . ' ' . $definition);
        }
    }
};
