<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap.php';
$batchSize = 25;
$now = time();
$db->exec('BEGIN IMMEDIATE');
try {
    $recover = $db->prepare("UPDATE email_outbox SET status='pending' WHERE status='sending' AND available_at<=?");
    $recover->execute([$now]);
    $query = $db->prepare("SELECT id FROM email_outbox WHERE status='pending' AND available_at<=? AND attempts<5 ORDER BY id LIMIT ?");
    $query->bindValue(1, $now, PDO::PARAM_INT);
    $query->bindValue(2, $batchSize, PDO::PARAM_INT);
    $query->execute();
    $ids = $query->fetchAll(PDO::FETCH_COLUMN);
    $claim = $db->prepare("UPDATE email_outbox SET status='sending',available_at=? WHERE id=? AND status='pending'");
    foreach ($ids as $id) $claim->execute([$now + 300, $id]);
    $messages = [];
    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $claimed = $db->prepare("SELECT * FROM email_outbox WHERE status='sending' AND id IN ($placeholders) ORDER BY id");
        $claimed->execute($ids);
        $messages = $claimed->fetchAll();
    }
    $db->exec('COMMIT');
} catch (Throwable $exception) {
    if ($db->inTransaction()) $db->rollBack();
    throw $exception;
}
$sent = 0;
$failed = 0;
$sender = setting('email');
$senderName = str_replace(["\r", "\n", '"'], '', setting('company_name'));

foreach ($messages as $message) {
    $attempts = (int)$message['attempts'] + 1;
    $subject = preg_replace('/[\r\n]+/', ' ', (string)$message['subject']) ?? '';
    $headers = "From: \"" . $senderName . "\" <" . $sender . ">\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "MIME-Version: 1.0";
    $accepted = filter_var($sender, FILTER_VALIDATE_EMAIL)
        && mail($message['recipient'], $subject, $message['body'], $headers);

    if ($accepted) {
        $update = $db->prepare("UPDATE email_outbox SET status='sent',attempts=?,last_error='',sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'");
        $update->execute([$attempts, $message['id']]);
        $sent += $update->rowCount();
        continue;
    }

    $terminal = $attempts >= 5;
    $delay = min(3600, 60 * (2 ** ($attempts - 1)));
    $error = filter_var($sender, FILTER_VALIDATE_EMAIL) ? 'PHP mail transport rejected the message.' : 'Store sender email setting is invalid.';
    $update = $db->prepare("UPDATE email_outbox SET status=?,attempts=?,available_at=?,last_error=? WHERE id=? AND status='sending'");
    $update->execute([$terminal ? 'failed' : 'pending', $attempts, time() + $delay, $error, $message['id']]);
    error_log('Order email delivery failed for outbox ID ' . (int)$message['id'] . ' on attempt ' . $attempts . '.');
    $failed++;
}

fwrite(STDOUT, json_encode(['processed'=>count($messages),'sent'=>$sent,'failed'=>$failed], JSON_THROW_ON_ERROR) . PHP_EOL);
