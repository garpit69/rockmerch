<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $db->exec("
        CREATE TABLE email_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL UNIQUE,
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            available_at INTEGER NOT NULL,
            last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at TEXT
        );
        CREATE INDEX idx_email_outbox_pending ON email_outbox(status, available_at, id);
    ");
};
