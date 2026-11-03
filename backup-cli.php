<?php
if(PHP_SAPI!=='cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/bootstrap.php';
if(!class_exists(ZipArchive::class)) {
    fwrite(STDERR,"PHP ZipArchive extension is required.\n");
    exit(1);
}
$backupDirectory=__DIR__.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'backups';
if(!is_dir($backupDirectory)&&!mkdir($backupDirectory,0750,true)) {
    fwrite(STDERR,"Backup directory could not be created.\n");
    exit(1);
}
$tables=['settings','users','products','articles','media','orders','order_items','product_reviews','admin_activity','product_views','search_terms'];
$data=[];
foreach($tables as $table) $data[$table]=$db->query('SELECT * FROM '.$table)->fetchAll();
redact_backup_secrets($data);
$destination=$backupDirectory.DIRECTORY_SEPARATOR.'rockmerch-'.date('Ymd-His').'.zip';
$zip=new ZipArchive();
if($zip->open($destination,ZipArchive::CREATE|ZipArchive::EXCL)!==true) {
    fwrite(STDERR,"Backup archive could not be created.\n");
    exit(1);
}
try {
    $zip->addFromString('backup.json',json_encode(['version'=>1,'created_at'=>date(DATE_ATOM),'tables'=>$data],JSON_THROW_ON_ERROR));
    foreach($data['media'] as $media) {
        $filename=basename($media['filename']);
        $path=UPLOAD_DIR.DIRECTORY_SEPARATOR.$filename;
        if(is_file($path)&&!$zip->addFile($path,'uploads/'.$filename)) throw new RuntimeException('Unable to add media: '.$filename);
    }
    if(!$zip->close()) throw new RuntimeException('Backup archive could not be finalized.');
} catch(Throwable $exception) {
    $zip->close();
    @unlink($destination);
    fwrite(STDERR,$exception->getMessage()."\n");
    exit(1);
}
foreach(glob($backupDirectory.DIRECTORY_SEPARATOR.'rockmerch-*.zip')?:[] as $oldBackup) {
    if($oldBackup!==$destination&&filemtime($oldBackup)<time()-30*86400) unlink($oldBackup);
}
fwrite(STDOUT,$destination.PHP_EOL);
