<?php
declare(strict_types=1);

function queue_order_notification(PDO $db, int $orderId, string $event): bool {
    $events = [
        'received' => 'Pesanan kami terima',
        'confirmed' => 'Pembayaran pesanan dikonfirmasi',
        'shipped' => 'Pesanan Anda telah dikirim',
        'completed' => 'Pesanan Anda selesai',
        'cancelled' => 'Pesanan Anda dibatalkan',
    ];
    if (!isset($events[$event])) {
        throw new InvalidArgumentException('Unknown order notification event.');
    }

    $orderQuery = $db->prepare('SELECT order_number,customer_name,email,status,subtotal,shipping,total,shipping_carrier,tracking_number,tracking_url FROM orders WHERE id=?');
    $orderQuery->execute([$orderId]);
    $order = $orderQuery->fetch();
    if (!$order || !filter_var($order['email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Order notification recipient is missing or invalid.');
    }

    $itemQuery = $db->prepare('SELECT title,format,quantity,unit_price FROM order_items WHERE order_id=? ORDER BY id');
    $itemQuery->execute([$orderId]);
    $lines = [
        'Halo ' . $order['customer_name'] . ',',
        '',
        $events[$event] . '.',
        'Nomor pesanan: ' . $order['order_number'],
        'Status: ' . order_status((string)$order['status']),
        '',
        'Rincian pesanan:',
    ];
    foreach ($itemQuery->fetchAll() as $item) {
        $lines[] = '- ' . $item['title'] . ' (' . $item['format'] . ') x' . (int)$item['quantity'] . ' — ' . money((int)$item['unit_price'] * (int)$item['quantity']);
    }
    $lines[] = '';
    $lines[] = 'Subtotal: ' . money((int)$order['subtotal']);
    $lines[] = 'Pengiriman: ' . money((int)$order['shipping']);
    $lines[] = 'Total: ' . money((int)$order['total']);
    if ($event === 'shipped') {
        $lines[] = '';
        $lines[] = 'Kurir: ' . (string)$order['shipping_carrier'];
        $lines[] = 'Nomor resi: ' . (string)$order['tracking_number'];
        if (safe_tracking_url($order['tracking_url']) !== '') {
            $lines[] = 'Pelacakan: ' . $order['tracking_url'];
        }
    }
    $lines[] = '';
    $lines[] = 'Terima kasih,';
    $lines[] = setting('company_name');

    $insert = $db->prepare('INSERT OR IGNORE INTO email_outbox(event_key,recipient,subject,body,available_at) VALUES(?,?,?,?,?)');
    $insert->execute([
        $order['order_number'] . ':' . $event,
        $order['email'],
        setting('company_name') . ' — ' . $events[$event],
        implode("\r\n", $lines),
        time(),
    ]);
    return $insert->rowCount() === 1;
}
