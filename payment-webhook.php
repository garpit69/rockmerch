<?php
require __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['error'=>'Method not allowed.']);
    exit;
}

try {
    $serverKey=setting('midtrans_server_key');
    if($serverKey==='') throw new RuntimeException('Midtrans webhook is not configured.',503);
    $body=file_get_contents('php://input');
    if($body===false||$body==='') throw new RuntimeException('Empty notification body.',400);
    try {
        $notification=json_decode($body,true,512,JSON_THROW_ON_ERROR);
    } catch(JsonException $exception) {
        throw new RuntimeException('Malformed notification body.',400,$exception);
    }
    foreach(['order_id','status_code','gross_amount','signature_key','transaction_status'] as $required) {
        if(!isset($notification[$required])||!is_scalar($notification[$required])) throw new RuntimeException('Incomplete notification.',400);
    }
    $orderNumber=(string)$notification['order_id'];
    if(!preg_match('/^RM-\d{6}-[A-F0-9]{32}$/',$orderNumber)) throw new RuntimeException('Invalid order identifier.',400);
    $signature=hash('sha512',$orderNumber.(string)$notification['status_code'].(string)$notification['gross_amount'].$serverKey);
    if(!hash_equals($signature,strtolower((string)$notification['signature_key']))) throw new RuntimeException('Invalid notification signature.',401);

    $db->exec('BEGIN IMMEDIATE');
    $lookup=$db->prepare('SELECT * FROM orders WHERE order_number=?');
    $lookup->execute([$orderNumber]);
    $order=$lookup->fetch();
    if(!$order) throw new RuntimeException('Order not found.',404);
    if($order['payment_method']!=='midtrans') throw new RuntimeException('Payment method does not match.',400);
    $grossAmount=(string)$notification['gross_amount'];
    if(!preg_match('/^\d+(?:\.\d{1,2})?$/',$grossAmount)) throw new RuntimeException('Transaction amount is invalid.',400);
    [$wholeAmount,$fractionalAmount]=array_pad(explode('.',$grossAmount,2),2,'');
    $receivedAmount=(ltrim($wholeAmount,'0')?:'0').'.'.str_pad($fractionalAmount,2,'0');
    $expectedAmount=number_format((int)$order['total'],2,'.','');
    if($receivedAmount!==$expectedAmount) throw new RuntimeException('Transaction amount does not match.',400);

    $transactionStatus=strtolower((string)$notification['transaction_status']);
    $fraudStatus=strtolower((string)($notification['fraud_status']??''));
    $transactionId=(string)($notification['transaction_id']??'');
    $newStatus=$order['status'];
    if(in_array($order['status'],['awaiting_payment','awaiting_confirmation'],true)) {
        if($transactionStatus==='settlement'&&(string)$notification['status_code']==='200') {
            $newStatus='confirmed';
        } elseif($transactionStatus==='capture'&&$fraudStatus==='accept'&&(string)$notification['status_code']==='200') {
            $newStatus='confirmed';
        } elseif($transactionStatus==='capture'&&$fraudStatus==='challenge') {
            $newStatus='awaiting_confirmation';
        } elseif(in_array($transactionStatus,['deny','expire','cancel'],true)) {
            restore_order_stock($db,(int)$order['id']);
            $newStatus='cancelled';
        }
    }
    $update=$db->prepare('UPDATE orders SET status=?,payment_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
    $update->execute([$newStatus,$transactionId,(int)$order['id']]);
    if($newStatus!==$order['status']) {
        $notificationEvent=['confirmed'=>'confirmed','cancelled'=>'cancelled'][$newStatus]??null;
        if($notificationEvent!==null) queue_order_notification($db,(int)$order['id'],$notificationEvent);
    }
    $db->exec('COMMIT');
    http_response_code(200);
    echo json_encode(['success'=>true]);
} catch(Throwable $exception) {
    if($db->inTransaction()) $db->rollBack();
    else {
        try { $db->exec('ROLLBACK'); } catch(Throwable) {}
    }
    $status=$exception instanceof RuntimeException&&$exception->getCode()>=400&&$exception->getCode()<=599?$exception->getCode():500;
    if($status>=500) error_log('Midtrans webhook processing failed: '.$exception->getMessage());
    http_response_code($status);
    echo json_encode(['error'=>$status>=500?'Webhook processing failed.':$exception->getMessage()]);
}
