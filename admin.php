<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');

$userCount = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
$flash = $_SESSION['flash'] ?? '';
unset($_SESSION['flash']);
$error = '';
$tab = $_GET['tab'] ?? 'overview';
$allowedTabs = ['overview','settings','products','articles','media','orders','users','analytics','backups'];
if (!in_array($tab, $allowedTabs, true)) $tab = 'overview';
$newOrderCount=0;$todayRevenue=0;$monthRevenue=0;$productCount=0;$articleCount=0;
$lowStockProducts=[];$bestSellers=[];$orders=[];$users=[];$analyticsViews=[];$topSearches=[];
$query='';$formatFilter='';$products=[];$mediaQuery='';$media=[];$articles=[];
if ($tab === 'orders') {
    header('Location: manage.php?view=orders', true, 303);
    exit;
}

function admin_redirect(string $tab): never {
    header('Location: admin.php?tab=' . urlencode($tab));
    exit;
}
function safe_slug(string $text): string {
    $text = strtolower(trim($text));
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    return trim($text, '-') ?: 'catatan-' . time();
}
function html_content(string $html): string {
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $loaded = $document->loadHTML('<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded || !$document->documentElement) throw new RuntimeException('Isi artikel tidak dapat dibaca.');
    $allowedTags = ['div','p','br','h2','h3','strong','b','em','i','ul','ol','li','a','blockquote','img'];
    $clean = static function (DOMNode $node) use (&$clean, $allowedTags): void {
        for ($child = $node->firstChild; $child;) {
            $next = $child->nextSibling;
            if ($child instanceof DOMElement) {
                if (!in_array(strtolower($child->tagName), $allowedTags, true)) {
                    $node->removeChild($child);
                } else {
                    for ($i = $child->attributes->length - 1; $i >= 0; $i--) {
                        $attribute = $child->attributes->item($i);
                        $name = strtolower($attribute->name);
                        if (!in_array($name, ['href','src','alt','title'], true)) {
                            $child->removeAttributeNode($attribute);
                            continue;
                        }
                        if (in_array($name, ['href','src'], true)) {
                            $url = trim($attribute->value);
                            if (preg_match('/^(?:javascript|data|vbscript):/i', $url) || str_starts_with($url, '//')) $child->removeAttributeNode($attribute);
                        }
                    }
                    $clean($child);
                }
            } elseif (!$child instanceof DOMText) {
                $node->removeChild($child);
            }
            $child = $next;
        }
    };
    $clean($document->documentElement);
    $output = '';
    foreach ($document->documentElement->childNodes as $child) $output .= $document->saveHTML($child);
    return $output;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        verify_csrf();
        $action = $_POST['action'] ?? '';
        if ($action === 'setup') {
            throw new RuntimeException('Pembuatan admin melalui halaman web dinonaktifkan. Gunakan php setup-admin.php dari terminal server.');
        } elseif ($action === 'login') {
            if ($userCount === 0) throw new RuntimeException('Belum ada admin. Buat akun pertama dari terminal server.');
            $email = strtolower(trim((string)($_POST['email'] ?? '')));
            $identityHash = hash('sha256', 'ip|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
            $limit = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE identity_hash=? AND attempted_at>?');
            $limit->execute([$identityHash,time()-900]);
            if ((int)$limit->fetchColumn() >= 5) throw new RuntimeException('Terlalu banyak percobaan masuk. Coba lagi 15 menit kemudian.');
            $stmt = $db->prepare('SELECT * FROM users WHERE email=?');
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if (!$user || !password_verify((string)($_POST['password'] ?? ''), $user['password'])) {
                $attempt=$db->prepare('INSERT INTO login_attempts (identity_hash,attempted_at) VALUES (?,?)');
                $attempt->execute([$identityHash,time()]);
                throw new RuntimeException('Email atau kata sandi tidak cocok.');
            }
            $clear=$db->prepare('DELETE FROM login_attempts WHERE identity_hash=?');$clear->execute([$identityHash]);
            session_regenerate_id(true);
            $_SESSION['user_id']=(int)$user['id']; $_SESSION['email']=$user['email']; $_SESSION['role']=$user['role']; $_SESSION['expires']=time()+3600;
            $_SESSION['flash'] = 'Berhasil masuk. Hai, ' . $user['email'] . '!';
            admin_redirect('overview');
        } elseif ($action === 'logout') {
            $_SESSION = [];
            session_destroy();
            header('Location: admin.php');
            exit;
        } else {
            require_login();
            if (in_array($action, ['save_settings','delete_media','user_save','user_delete','order_status','create_backup','restore_backup'], true)) require_login(true);
            if ($action === 'save_settings') {
                $required = ['company_name','tagline','mission','hero_video','free_shipping','shipping_fee','bank_name','bank_account','bank_account_name','address','email','instagram','tiktok','playlist','whatsapp_phone','opening_hours','company_story','company_selection','company_commitments'];
                $settingsValues = [];
                foreach ($required as $key) {
                    $value = trim((string)($_POST[$key] ?? setting($key)));
                    if ($key === 'company_name' && $value === '') throw new RuntimeException('Nama perusahaan wajib diisi.');
                    if ($key === 'email' && !filter_var($value, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Format email tidak valid.');
                    if ($key === 'whatsapp_phone' && $value !== '' && !preg_match('/^\+?[0-9 ()-]{8,24}$/', $value)) throw new RuntimeException('Nomor WhatsApp harus berisi 8–24 digit dan karakter +, spasi, tanda kurung, atau tanda hubung.');
                    if (in_array($key,['opening_hours','company_story','company_selection','company_commitments'],true)&&strlen($value)>4000) throw new RuntimeException('Konten profil perusahaan maksimal 4.000 karakter per kolom.');
                    if ($key === 'free_shipping' && (!ctype_digit($value) || (int)$value < 0)) throw new RuntimeException('Nominal gratis ongkir harus berupa angka 0 atau lebih.');
                    if ($key === 'shipping_fee' && (!ctype_digit($value) || (int)$value < 0)) throw new RuntimeException('Ongkir dasar harus berupa angka 0 atau lebih.');
                    if ($key === 'hero_video' && $value!=='' && (!filter_var($value,FILTER_VALIDATE_URL) || strtolower((string)parse_url($value,PHP_URL_SCHEME))!=='https')) throw new RuntimeException('Video hero harus menggunakan tautan HTTPS yang valid.');
                    if (in_array($key, ['instagram','tiktok','playlist'], true) && $value !== '' && (!filter_var($value, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($value, PHP_URL_SCHEME)), ['http','https'], true))) throw new RuntimeException('Tautan sosial dan playlist harus menggunakan alamat HTTP atau HTTPS yang valid.');
                    $settingsValues[$key] = $value;
                }
                foreach ($settingsValues as $key => $value) {
                    $stmt=$db->prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
                    $stmt->execute([$key, $value]);
                }
                record_admin_activity('settings_updated', 'Pengaturan toko diperbarui.');
                foreach (['logo_light','logo_dark'] as $logoKey) {
                    if (!empty($_FILES[$logoKey]['name'])) {
                        $path = save_upload($_FILES[$logoKey]);
                        $stmt=$db->prepare('UPDATE settings SET value=? WHERE key=?'); $stmt->execute([$path,$logoKey]);
                    }
                }
                $_SESSION['flash']='Pengaturan situs berhasil disimpan.';
                admin_redirect('settings');
            }
            if ($action === 'save_product') {
                $id=(int)($_POST['id'] ?? 0);
                $title=trim($_POST['title'] ?? ''); $artist=trim($_POST['artist'] ?? '');
                if ($title==='' || $artist==='') throw new RuntimeException('Judul album dan nama artis wajib diisi.');
                $formats=[];
                $formatNames=$_POST['format_name'] ?? [];
                foreach ($formatNames as $i=>$name) {
                    $name=trim($name);
                    $price=(int)($_POST['format_price'][$i] ?? 0); $stock=(int)($_POST['format_stock'][$i] ?? 0);
                    if ($name!=='' && !in_array($name,['Vinyl','Kaset','CD','Merchandise'],true)) throw new RuntimeException('Format produk tidak valid.');
                    if ($name!=='' && $price>0 && $stock>=0) $formats[]=['format'=>$name,'price'=>$price,'stock'=>$stock];
                }
                if (!$formats) throw new RuntimeException('Tambahkan minimal satu format dengan harga yang valid.');
                $existingProduct=null;
                if ($id) {
                    $q=$db->prepare('SELECT * FROM products WHERE id=?'); $q->execute([$id]); $existingProduct=$q->fetch();
                    if(!$existingProduct) throw new RuntimeException('Produk tidak ditemukan.');
                }
                $oldImages=json_decode((string)($existingProduct['images']??'[]'),true) ?: [];
                $images=$oldImages;
                foreach (($_FILES['images']['name'] ?? []) as $i=>$name) {
                    if ($name==='') continue;
                    $path=save_upload(['name'=>$name,'type'=>$_FILES['images']['type'][$i],'tmp_name'=>$_FILES['images']['tmp_name'][$i],'error'=>$_FILES['images']['error'][$i],'size'=>$_FILES['images']['size'][$i]]);
                    if ($path) $images[]=$path;
                }
                $audio=trim($_POST['audio_url'] ?? '');
                if ($audio!=='' && (!filter_var($audio,FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($audio,PHP_URL_SCHEME)),['http','https'],true))) throw new RuntimeException('Link preview audio harus menggunakan HTTP atau HTTPS.');
                $status=in_array($_POST['status'] ?? '',['draft','published'],true)?$_POST['status']:'draft';
                $condition=in_array($_POST['condition_name'] ?? '',['Baru','Mint','VG+','VG','Good'],true)?$_POST['condition_name']:'Mint';
                $vibes=[];
                foreach(['energy','mood','nostalgia'] as $vibe) $vibes[]=in_array($_POST[$vibe] ?? '',['Rendah','Sedang','Tinggi'],true)?$_POST[$vibe]:'Sedang';
                $values=[$title,$artist,json_encode($formats),trim($_POST['genre'] ?? ''),trim($_POST['year'] ?? ''),trim($_POST['label'] ?? ''),$condition,$vibes[0],$vibes[1],$vibes[2],trim($_POST['keywords'] ?? ''),in_array($_POST['badge'] ?? '',['New','Limited'],true)?$_POST['badge']:'',trim($_POST['description'] ?? ''),trim($_POST['tracklist'] ?? ''),$audio,json_encode($images),$status,isset($_POST['featured'])?1:0,isset($_POST['merchandise'])?1:0];
                if ($id) {
                    $values[]=$id;
                    $stmt=$db->prepare('UPDATE products SET title=?,artist=?,formats=?,genre=?,year=?,label=?,condition_name=?,energy=?,mood=?,nostalgia=?,keywords=?,badge=?,description=?,tracklist=?,audio_url=?,images=?,status=?,featured=?,merchandise=? WHERE id=?');
                } else {
                    $stmt=$db->prepare('INSERT INTO products (title,artist,formats,genre,year,label,condition_name,energy,mood,nostalgia,keywords,badge,description,tracklist,audio_url,images,status,featured,merchandise) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                }
                $stmt->execute($values);
                $savedId=$id ?: (int)$db->lastInsertId();
                $previousFormats=json_decode((string)($existingProduct['formats']??'[]'),true) ?: [];
                record_admin_activity($id?'product_updated':'product_created', json_encode([
                    'product_id'=>$savedId,'title'=>$title,
                    'previous_formats'=>$previousFormats,'formats'=>$formats,
                ],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
                $_SESSION['flash']='Produk berhasil disimpan.';
                admin_redirect('products');
            }
            if ($action === 'product_action') {
                $id=(int)($_POST['id'] ?? 0);
                if ($_POST['operation']==='delete') $stmt=$db->prepare('DELETE FROM products WHERE id=?');
                elseif ($_POST['operation']==='archive') $stmt=$db->prepare("UPDATE products SET status='archived' WHERE id=?");
                elseif ($_POST['operation']==='duplicate') {
                    $q=$db->prepare('SELECT * FROM products WHERE id=?');$q->execute([$id]);$p=$q->fetch();
                    if (!$p) throw new RuntimeException('Produk tidak ditemukan.');
                    $stmt=$db->prepare('INSERT INTO products (title,artist,formats,genre,year,label,condition_name,energy,mood,nostalgia,keywords,badge,description,tracklist,audio_url,images,status,featured,merchandise) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                    $stmt->execute([$p['title'].' (salinan)',$p['artist'],$p['formats'],$p['genre'],$p['year'],$p['label'],$p['condition_name'],$p['energy'],$p['mood'],$p['nostalgia'],$p['keywords'],$p['badge'],$p['description'],$p['tracklist'],$p['audio_url'],$p['images'],'draft',0,$p['merchandise']]);
                    $_SESSION['flash']='Salinan produk dibuat sebagai draft.';admin_redirect('products');
                } else throw new RuntimeException('Aksi produk tidak dikenal.');
                $stmt->execute([$id]); $_SESSION['flash']='Aksi produk berhasil.';admin_redirect('products');
            }
            if ($action === 'save_article') {
                $id=(int)($_POST['id'] ?? 0);$title=trim($_POST['title'] ?? '');
                if ($title==='') throw new RuntimeException('Judul artikel wajib diisi.');
                $slug=safe_slug($_POST['slug'] ?: $title);
                $q=$db->prepare('SELECT id FROM articles WHERE slug=? AND id<>?');$q->execute([$slug,$id]);
                if ($q->fetch()) $slug.='-'.time();
                $image=trim($_POST['existing_image'] ?? '');
                if (!empty($_FILES['image']['name'])) $image=save_upload($_FILES['image']) ?? $image;
                $status=in_array($_POST['status'] ?? '', ['draft','published','scheduled'],true)?$_POST['status']:'draft';
                $publishAt=trim($_POST['publish_at'] ?? '');
                if ($status==='scheduled' && $publishAt==='') throw new RuntimeException('Pilih tanggal dan waktu untuk artikel terjadwal.');
                if ($publishAt!=='') {
                    $localDate=DateTimeImmutable::createFromFormat('Y-m-d\TH:i',$publishAt,new DateTimeZone(date_default_timezone_get()));
                    if (!$localDate) throw new RuntimeException('Tanggal terbit tidak valid.');
                    $publishAt=$localDate->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
                }
                $content=html_content((string)($_POST['content'] ?? ''));
                $values=[$title,$slug,trim($_POST['category'] ?? ''),trim($_POST['excerpt'] ?? ''),$content,$image,$status,$publishAt];
                if ($id) {$values[]=$id;$stmt=$db->prepare('UPDATE articles SET title=?,slug=?,category=?,excerpt=?,content=?,image=?,status=?,publish_at=? WHERE id=?');}
                else {$stmt=$db->prepare('INSERT INTO articles (title,slug,category,excerpt,content,image,status,publish_at) VALUES (?,?,?,?,?,?,?,?)');}
                $stmt->execute($values);$_SESSION['flash']='Artikel berhasil disimpan.';admin_redirect('articles');
            }
            if ($action === 'article_delete') {
                $stmt=$db->prepare('DELETE FROM articles WHERE id=?');$stmt->execute([(int)$_POST['id']]);
                $_SESSION['flash']='Artikel berhasil dihapus.';admin_redirect('articles');
            }
            if ($action === 'user_save') {
                require_login(true);
                $id=(int)($_POST['id'] ?? 0);$email=filter_var(strtolower(trim($_POST['email'] ?? '')),FILTER_VALIDATE_EMAIL);
                $password=(string)($_POST['password'] ?? '');$role=$_POST['role'] ?? '';
                if (!$email || !in_array($role,['admin','editor'],true)) throw new RuntimeException('Email atau peran akun tidak valid.');
                if ($id && $id===(int)$_SESSION['user_id'] && $role!=='admin') throw new RuntimeException('Peran akun yang sedang digunakan tidak dapat diturunkan.');
                if (!$id && strlen($password)<10) throw new RuntimeException('Kata sandi akun baru minimal 10 karakter.');
                if ($password!=='' && strlen($password)<10) throw new RuntimeException('Kata sandi minimal 10 karakter.');
                if ($id) {
                    $stmt=$password!==''?$db->prepare('UPDATE users SET email=?,role=?,password=? WHERE id=?'):$db->prepare('UPDATE users SET email=?,role=? WHERE id=?');
                    $password!==''?$stmt->execute([$email,$role,password_hash($password,PASSWORD_DEFAULT),$id]):$stmt->execute([$email,$role,$id]);
                } else {
                    $stmt=$db->prepare('INSERT INTO users (email,password,role) VALUES (?,?,?)');
                    $stmt->execute([$email,password_hash($password,PASSWORD_DEFAULT),$role]);
                }
                $_SESSION['flash']='Akun berhasil disimpan.';admin_redirect('users');
            }
            if ($action === 'user_delete') {
                require_login(true);$id=(int)($_POST['id'] ?? 0);
                if ($id===(int)$_SESSION['user_id']) throw new RuntimeException('Akun yang sedang digunakan tidak dapat dihapus.');
                $target=$db->prepare('SELECT role FROM users WHERE id=?');$target->execute([$id]);$role=$target->fetchColumn();
                if ($role==='admin' && (int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()<=1) throw new RuntimeException('Toko harus memiliki setidaknya satu akun admin.');
                $delete=$db->prepare('DELETE FROM users WHERE id=?');$delete->execute([$id]);$_SESSION['flash']='Akun berhasil dihapus.';admin_redirect('users');
            }
            if ($action === 'create_backup') {
                if (!class_exists(ZipArchive::class)) throw new RuntimeException('Ekstensi PHP ZipArchive belum aktif.');
                $tables=['settings','users','products','articles','media','orders','order_items','product_reviews','admin_activity','product_views','search_terms'];
                $backup=[];
                foreach($tables as $table) $backup[$table]=$db->query('SELECT * FROM '.$table)->fetchAll();
                redact_backup_secrets($backup);
                $backupPath=__DIR__.'/storage/backup-'.date('Ymd-His').'-'.bin2hex(random_bytes(3)).'.zip';
                $zip=new ZipArchive();
                if($zip->open($backupPath,ZipArchive::CREATE)!==true) throw new RuntimeException('Arsip backup tidak dapat dibuat.');
                $zip->addFromString('backup.json',json_encode(['version'=>1,'created_at'=>date(DATE_ATOM),'tables'=>$backup],JSON_THROW_ON_ERROR));
                foreach($backup['media'] as $mediaItem) {
                    $file=UPLOAD_DIR.DIRECTORY_SEPARATOR.basename($mediaItem['filename']);
                    if(is_file($file)) $zip->addFile($file,'uploads/'.basename($file));
                }
                $zip->close();
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="'.basename($backupPath).'"');
                header('Content-Length: '.filesize($backupPath));
                readfile($backupPath);unlink($backupPath);exit;
            }
            if ($action === 'restore_backup') {
                if (!class_exists(ZipArchive::class)) throw new RuntimeException('Ekstensi PHP ZipArchive belum aktif.');
                if (($_POST['confirm_restore'] ?? '')!=='RESTORE') throw new RuntimeException('Ketik RESTORE untuk mengonfirmasi pemulihan.');
                if (($_FILES['backup_file']['error'] ?? UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) throw new RuntimeException('Pilih file backup terlebih dahulu.');
                if ($_FILES['backup_file']['size']>100*1024*1024) throw new RuntimeException('Ukuran file backup maksimal 100 MB.');
                $zip=new ZipArchive();
                if($zip->open($_FILES['backup_file']['tmp_name'])!==true) throw new RuntimeException('File bukan arsip backup yang valid.');
                $manifest=$zip->getFromName('backup.json');
                $decoded=$manifest===false?null:json_decode($manifest,true);
                $tables=['settings','users','products','articles','media','orders','order_items','product_reviews','admin_activity','product_views','search_terms'];
                if(is_array($decoded['tables']??null)) {
                    $decoded['tables']['product_reviews']??=[];
                    $decoded['tables']['admin_activity']??=[];
                }
                if(!is_array($decoded) || ($decoded['version']??null)!==1 || !is_array($decoded['tables']??null)) {$zip->close();throw new RuntimeException('Struktur backup tidak didukung.');}
                foreach($tables as $table) if(!isset($decoded['tables'][$table]) || !is_array($decoded['tables'][$table])) {$zip->close();throw new RuntimeException('Backup tidak lengkap.');}
                $restoreFiles=[];
                foreach($decoded['tables']['media'] as $mediaItem) {
                    $filename=basename((string)($mediaItem['filename']??''));
                    if($filename==='' || !preg_match('/^[a-f0-9]{32}\.(jpg|png|webp|svg)$/',$filename)) {$zip->close();throw new RuntimeException('Nama file dalam backup tidak valid.');}
                    $content=$zip->getFromName('uploads/'.$filename);
                    if($content===false) {$zip->close();throw new RuntimeException('File media hilang dari backup: '.$filename);}
                    $restoreFiles[$filename]=$content;
                }
                $zip->close();
                $db->exec('BEGIN IMMEDIATE');
                $preservedMidtransKey=setting('midtrans_server_key');
                try {
                    foreach(['email_outbox','product_reviews','order_items','orders','admin_activity','product_views','search_terms','articles','products','media','users','settings','login_attempts','password_resets'] as $table) $db->exec('DELETE FROM '.$table);
                    foreach($tables as $table) {
                        $columns=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
                        foreach($decoded['tables'][$table] as $row) {
                            if(!is_array($row)) throw new RuntimeException('Baris data backup tidak valid.');
                            $safe=array_intersect_key($row,array_flip($columns));
                            if(!$safe) continue;
                            $names=array_keys($safe);$quoted=array_map(static fn($name)=>'"'.$name.'"',$names);
                            $sql='INSERT INTO "'.$table.'" ('.implode(',',$quoted).') VALUES ('.implode(',',array_fill(0,count($names),'?')).')';
                            $db->prepare($sql)->execute(array_values($safe));
                        }
                    }
                    $db->exec('COMMIT');
                } catch(Throwable $restoreError) {
                    if($db->inTransaction()) $db->rollBack(); else {try{$db->exec('ROLLBACK');}catch(Throwable){}}
                    throw $restoreError;
                }
                restore_payment_secrets($db,$preservedMidtransKey);
                foreach($restoreFiles as $filename=>$content) if(file_put_contents(UPLOAD_DIR.DIRECTORY_SEPARATOR.$filename,$content)===false) throw new RuntimeException('Data dipulihkan, tetapi file media tidak dapat ditulis: '.$filename);
                $_SESSION['flash']='Backup berhasil dipulihkan. Silakan periksa produk dan pengaturan situs.';admin_redirect('backups');
            }
            if ($action === 'delete_media') {
                $stmt=$db->prepare('SELECT filename FROM media WHERE id=?');$stmt->execute([(int)$_POST['id']]);$file=$stmt->fetchColumn();
                if ($file) {
                    $path=UPLOAD_DIR.DIRECTORY_SEPARATOR.basename((string)$file);
                    if (is_file($path) && !unlink($path)) throw new RuntimeException('File tidak dapat dihapus dari penyimpanan.');
                    $publicPath='uploads/'.$file;
                    foreach ($db->query('SELECT id,images FROM products')->fetchAll() as $product) {
                        $images=array_values(array_filter(json_decode($product['images'] ?: '[]',true) ?: [],fn($image)=>$image!==$publicPath));
                        $update=$db->prepare('UPDATE products SET images=? WHERE id=?');$update->execute([json_encode($images),(int)$product['id']]);
                    }
                    $update=$db->prepare('UPDATE articles SET image=\'\' WHERE image=?');$update->execute([$publicPath]);
                    $update=$db->prepare('UPDATE settings SET value=\'\' WHERE value=?');$update->execute([$publicPath]);
                    $stmt=$db->prepare('DELETE FROM media WHERE id=?');$stmt->execute([(int)$_POST['id']]);
                }
                $_SESSION['flash']='Media berhasil dihapus.';admin_redirect('media');
            }
            throw new RuntimeException('Aksi tidak dikenal.');
        }
    } catch (Throwable $e) {
        $error=$e->getMessage();
    }
}
$isLoggedIn=!empty($_SESSION['user_id']) && (int)($_SESSION['expires'] ?? 0)>=time();
if ($isLoggedIn) {
    require_login();
    if (in_array($tab,['settings','media','orders','users','analytics','backups'],true)) require_login(true);
    $userCount=(int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $productCount=(int)$db->query("SELECT COUNT(*) FROM products WHERE status!='archived'")->fetchColumn();
    $articleCount=(int)$db->query("SELECT COUNT(*) FROM articles WHERE status!='archived'")->fetchColumn();
    $query=trim($_GET['q'] ?? '');
    $formatFilter=trim($_GET['format'] ?? '');
    $products=$db->query('SELECT * FROM products ORDER BY id DESC')->fetchAll();
    if ($query!=='') $products=array_values(array_filter($products,fn($p)=>stripos($p['title'].' '.$p['artist'],$query)!==false));
    if ($formatFilter!=='') $products=array_values(array_filter($products,fn($p)=>in_array($formatFilter,array_column(json_decode($p['formats'],true) ?: [],'format'),true)));
    $articles=$db->query('SELECT * FROM articles ORDER BY created_at DESC')->fetchAll();
    $mediaQuery=trim($_GET['media_q'] ?? '');
    $media=$db->query('SELECT * FROM media ORDER BY created_at DESC')->fetchAll();
    if($mediaQuery!=='') $media=array_values(array_filter($media,fn($item)=>stripos($item['original_name'],$mediaQuery)!==false));
    $editProduct=null;if(isset($_GET['edit_product'])){$q=$db->prepare('SELECT * FROM products WHERE id=?');$q->execute([(int)$_GET['edit_product']]);$editProduct=$q->fetch();}
    $editArticle=null;if(isset($_GET['edit_article'])){$q=$db->prepare('SELECT * FROM articles WHERE id=?');$q->execute([(int)$_GET['edit_article']]);$editArticle=$q->fetch();}
    $orders=$db->query('SELECT * FROM orders ORDER BY id DESC LIMIT 200')->fetchAll();
    $todayRevenue=(int)$db->query("SELECT COALESCE(SUM(total),0) FROM orders WHERE status='completed' AND date(updated_at)=date('now','localtime')")->fetchColumn();
    $monthRevenue=(int)$db->query("SELECT COALESCE(SUM(total),0) FROM orders WHERE status='completed' AND strftime('%Y-%m',updated_at,'localtime')=strftime('%Y-%m','now','localtime')")->fetchColumn();
    $newOrderCount=(int)$db->query("SELECT COUNT(*) FROM orders WHERE status IN ('awaiting_payment','awaiting_confirmation')")->fetchColumn();
    $lowStockProducts=[];
    foreach($db->query("SELECT id,title,artist,formats FROM products WHERE status='published'")->fetchAll() as $stockProduct) {
        foreach(json_decode($stockProduct['formats']?:'[]',true)?:[] as $stockFormat) {
            $quantity=max(0,(int)($stockFormat['stock']??0));
            if($quantity<=3) $lowStockProducts[]=['title'=>$stockProduct['title'],'artist'=>$stockProduct['artist'],'format'=>(string)($stockFormat['format']??''),'stock'=>$quantity,'id'=>(int)$stockProduct['id']];
        }
    }
    $bestSellers=$db->query("SELECT oi.title,SUM(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='completed' GROUP BY oi.title ORDER BY units DESC LIMIT 5")->fetchAll();
    $users=$db->query('SELECT id,email,role FROM users ORDER BY role,email')->fetchAll();
    $viewQuery=$db->prepare("SELECT p.title,COUNT(v.id) AS views FROM products p LEFT JOIN product_views v ON v.product_id=p.id AND v.viewed_at>? WHERE p.status<>'archived' GROUP BY p.id ORDER BY views DESC LIMIT 10");
    $viewQuery->execute([time()-30*86400]);$analyticsViews=$viewQuery->fetchAll();
    $searchQuery=$db->prepare('SELECT term,COUNT(*) AS searches FROM search_terms WHERE searched_at>? GROUP BY term ORDER BY searches DESC LIMIT 10');
    $searchQuery->execute([time()-30*86400]);$topSearches=$searchQuery->fetchAll();
}
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — <?= h(setting('company_name')) ?></title><link rel="stylesheet" href="assets/style.css"><link rel="stylesheet" href="assets/brand.css"><script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script></head><body class="admin-body">
<?php if (!$isLoggedIn): ?>
<main class="login-wrap"><a class="brand login-brand" href="index.php"><?= logo_mark() ?></a><section class="login-card"><span class="eyebrow"><?= $userCount===0?'SETUP ADMIN':'HALO LAGI' ?></span><h1><?= $userCount===0?'Siapkan akses admin.':'Masuk ke ruang kerja.' ?></h1><p><?= $userCount===0?'Untuk keamanan, akun admin pertama hanya dapat dibuat dari terminal server.':'Rak dan cerita menunggu sentuhanmu.' ?></p>
<?php if($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?>
<?php if($userCount===0): ?><div class="checkout-note">Jalankan <code>php setup-admin.php email-admin@example.com</code> dari folder proyek. Perintah ini hanya dapat dijalankan di terminal server dan hanya sekali.</div><?php else: ?><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="login"><label>Email<input type="email" name="email" required autocomplete="email"></label><label>Kata sandi<input type="password" name="password" required minlength="1" autocomplete="current-password"></label><button class="button button-dark full-width">Masuk</button></form><a class="back-link" href="password-reset.php">Lupa kata sandi?</a><?php endif ?><a class="back-link" href="index.php">Kembali ke toko</a></section></main>
<?php else: ?>
<div class="admin-shell"><aside class="admin-sidebar"><a class="brand" href="index.php"><?= logo_mark() ?></a><nav><span class="eyebrow">MENU</span><a class="<?= $tab==='overview'?'active':'' ?>" href="?tab=overview">Ringkasan</a><a class="<?= $tab==='products'?'active':'' ?>" href="?tab=products">Produk</a><a class="<?= $tab==='articles'?'active':'' ?>" href="?tab=articles">Artikel</a><?php if(($_SESSION['role']??'')==='admin'): ?><a href="manage.php?view=orders">Pesanan</a><a href="manage.php?view=users">Akun staf</a><a href="manage.php?view=analytics">Analitik</a><a href="manage.php?view=backups">Backup</a><a href="?tab=settings">Pengaturan</a><a href="?tab=media">Media</a><?php endif ?></nav><div class="sidebar-bottom"><a href="index.php">Lihat toko</a><span><?= h($_SESSION['email'] ?? '') ?> · <?= h($_SESSION['role'] ?? '') ?></span><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="logout"><button>Keluar</button></form></div></aside>
<main class="admin-main"><header class="admin-top"><div><span class="eyebrow">RUANG KERJA / <?= h(strtoupper($tab)) ?></span><h1><?= ['overview'=>'Ringkasan toko','settings'=>'Pengaturan situs','products'=>'Produk','articles'=>'Artikel','media'=>'Pustaka media','orders'=>'Pesanan','users'=>'Akun staf','analytics'=>'Analitik','backups'=>'Backup dan pemulihan'][$tab] ?></h1></div><button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button></header>
<?php if($flash): ?><div class="notice success"><?= h($flash) ?></div><?php endif ?><?php if($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?>
<?php if($tab==='overview'): ?><section class="admin-stats"><article><span>PESANAN BARU / MENUNGGU</span><strong><?= $newOrderCount ?></strong><a href="manage.php?view=orders">Kelola pesanan ↗</a></article><article><span>OMZET HARI INI · SELESAI</span><strong><?= money($todayRevenue) ?></strong><small>Pesanan berstatus selesai</small></article><article><span>OMZET BULAN INI · SELESAI</span><strong><?= money($monthRevenue) ?></strong><small>Pesanan berstatus selesai</small></article><article><span>PRODUK AKTIF</span><strong><?= $productCount ?></strong><a href="?tab=products">Kelola produk ↗</a></article><article><span>ARTIKEL</span><strong><?= $articleCount ?></strong><a href="?tab=articles">Kelola artikel ↗</a></article></section><section class="admin-shortcuts"><a href="manage.php?view=orders"><span>↗</span><h2>Pesanan</h2><p><?= $newOrderCount ?> menunggu tindakan · pantau status dan pengiriman.</p></a><a href="?tab=products&new=1"><span>＋</span><h2>Tambah Produk</h2><p>Catat rilisan baru yang baru mendarat.</p></a><a href="?tab=articles&new=1"><span>✎</span><h2>Tulis Artikel</h2><p>Ceritakan hal seru di antara track.</p></a><a href="index.php" target="_blank"><span>↗</span><h2>Lihat toko</h2><p>Cek tampilan terbaru dari sisi pengunjung.</p></a></section><section class="dashboard-panels"><div><h2>Stok rendah <span>≤ 3 unit per format</span></h2><?php if(!$lowStockProducts): ?><p>Tidak ada stok rendah.</p><?php else: ?><ul><?php foreach($lowStockProducts as $lowStock): ?><li><a href="?tab=products&edit_product=<?= $lowStock['id'] ?>"><?= h($lowStock['title']) ?> — <?= h($lowStock['format']) ?></a><strong><?= $lowStock['stock'] ?> tersisa</strong></li><?php endforeach ?></ul><?php endif ?></div><div><h2>Terlaris <span>pesanan selesai</span></h2><?php if(!$bestSellers): ?><p>Belum ada pesanan selesai.</p><?php else: ?><ul><?php foreach($bestSellers as $bestSeller): ?><li><?= h($bestSeller['title']) ?><strong><?= (int)$bestSeller['units'] ?> unit</strong></li><?php endforeach ?></ul><?php endif ?></div></section>
<?php elseif($tab==='orders'): ?><div class="table-wrap"><table><thead><tr><th>Nomor / waktu</th><th>Pelanggan</th><th>Item</th><th>Total</th><th>Pembayaran</th><th>Status pesanan</th></tr></thead><tbody><?php foreach($orders as $order): $itemQuery=$db->prepare('SELECT title,format,quantity FROM order_items WHERE order_id=?');$itemQuery->execute([$order['id']]);$orderItems=$itemQuery->fetchAll(); ?><tr><td><strong><?= h($order['order_number']) ?></strong><small><?= h($order['created_at']) ?></small></td><td><strong><?= h($order['customer_name']) ?></strong><small><?= h($order['email']) ?> · <?= h($order['phone']) ?></small><small><?= h($order['address']) ?>, <?= h($order['city']) ?> <?= h($order['postal_code']) ?></small></td><td><?php foreach($orderItems as $item): ?><small><?= h($item['title']) ?> · <?= h($item['format']) ?> × <?= (int)$item['quantity'] ?></small><?php endforeach ?></td><td><?= money((int)$order['total']) ?></td><td><?= $order['payment_method']==='cod'?'COD':'Transfer manual' ?></td><td><form method="post" class="status-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="order_status"><input type="hidden" name="id" value="<?= (int)$order['id'] ?>"><select name="status"><?php foreach(['awaiting_payment','awaiting_confirmation','confirmed','packing','shipped','completed','cancelled'] as $status): ?><option value="<?= h($status) ?>" <?= $order['status']===$status?'selected':'' ?>><?= h(order_status($status)) ?></option><?php endforeach ?></select><button class="small-action">Simpan</button></form></td></tr><?php endforeach ?></tbody></table></div>
<?php elseif($tab==='users'): ?><section class="user-management"><form class="admin-form user-form" method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="user_save"><div class="form-grid"><label>Email akun<input type="email" name="email" required></label><label>Peran<select name="role"><option value="editor">Editor</option><option value="admin">Admin</option></select></label><label class="span-2">Kata sandi awal<input type="password" name="password" minlength="10" required><small>Minimal 10 karakter.</small></label></div><button class="button button-dark">Tambah akun</button></form><div class="table-wrap"><table><thead><tr><th>Email</th><th>Peran</th><th>Aksi</th></tr></thead><tbody><?php foreach($users as $user): ?><tr><td><strong><?= h($user['email']) ?></strong><?= (int)$user['id']===(int)$_SESSION['user_id']?'<small>Akun yang sedang digunakan</small>':'' ?></td><td><?= h($user['role']==='admin'?'Admin':'Editor') ?></td><td><?php if((int)$user['id']!==(int)$_SESSION['user_id']): ?><form method="post" class="inline-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="user_delete"><input type="hidden" name="id" value="<?= (int)$user['id'] ?>"><button data-confirm="Hapus akses akun ini?">Hapus akun</button></form><?php endif ?></td></tr><?php endforeach ?></tbody></table></div></section>
<?php elseif($tab==='analytics'): ?><section class="analytics-grid"><div class="table-wrap"><h2>Produk paling banyak dilihat · 30 hari</h2><table><thead><tr><th>Produk</th><th>Dilihat</th></tr></thead><tbody><?php foreach($analyticsViews as $view): ?><tr><td><?= h($view['title']) ?></td><td><?= (int)$view['views'] ?></td></tr><?php endforeach ?></tbody></table></div><div class="table-wrap"><h2>Pencarian populer · 30 hari</h2><table><thead><tr><th>Kata pencarian</th><th>Jumlah</th></tr></thead><tbody><?php foreach($topSearches as $search): ?><tr><td><?= h($search['term']) ?></td><td><?= (int)$search['searches'] ?></td></tr><?php endforeach ?></tbody></table></div></section>
<?php elseif($tab==='backups'): ?><section class="backup-panel"><h2>Backup situs</h2><p>Arsip mencakup pengaturan, akun, produk, artikel, pesanan, analitik, dan file media.</p><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="create_backup"><button class="button button-dark">Unduh backup</button></form></section><section class="backup-panel"><h2>Pulihkan backup</h2><p>Pemulihan akan mengganti data yang sedang tersimpan. Buat backup kondisi saat ini terlebih dahulu.</p><form method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="restore_backup"><label>Arsip backup ZIP<input type="file" name="backup_file" accept=".zip,application/zip" required></label><label>Ketik RESTORE untuk mengonfirmasi<input name="confirm_restore" required autocomplete="off"></label><button class="button button-dark" data-confirm="Pemulihan akan mengganti seluruh isi situs. Lanjutkan?">Pulihkan data</button></form></section>
<?php elseif($tab==='settings'): require_login(true); ?><form class="admin-form settings-form" method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="save_settings"><div class="form-section"><span class="eyebrow">IDENTITAS TOKO</span><div class="form-grid"><label>Nama company *<input name="company_name" required value="<?= h(setting('company_name')) ?>"></label><label>Tagline<input name="tagline" value="<?= h(setting('tagline')) ?>"></label><label class="span-2">Kalimat misi hero<textarea name="mission" rows="3" maxlength="240"><?= h(setting('mission')) ?></textarea><small>Maksimal 30 kata disarankan.</small></label><label>Gratis ongkir di atas (Rp)<input type="number" name="free_shipping" min="0" required value="<?= h(setting('free_shipping')) ?>"></label></div><div class="form-grid logo-grid"><?php foreach(['logo_light'=>'Logo versi terang','logo_dark'=>'Logo versi gelap'] as $key=>$label): ?><label><?= $label ?> <small>PNG, SVG, WebP (maks. 2 MB)</small><input type="file" name="<?= $key ?>" accept="image/png,image/svg+xml,image/webp,image/jpeg"><?php if(setting($key)): ?><img class="logo-preview" src="<?= h(setting($key)) ?>" alt="Pratinjau logo"><?php else: ?><img class="logo-preview" src="assets/brand/rockmerch-wordmark.png" alt="Logo bawaan RockMerch"><?php endif ?></label><?php endforeach ?></div></div><div class="form-section"><span class="eyebrow">PROFIL PERUSAHAAN</span><div class="form-grid"><label class="span-2">Cerita dan alasan berdiri<textarea name="company_story" rows="4" maxlength="4000"><?= h(setting('company_story')) ?></textarea></label><label class="span-2">Cara memilih dan informasi rilisan<textarea name="company_selection" rows="4" maxlength="4000"><?= h(setting('company_selection')) ?></textarea><small>Jelaskan proses yang benar-benar dijalankan; jangan menambahkan klaim yang belum sesuai.</small></label><label class="span-2">Nilai dan komitmen (satu poin per baris)<textarea name="company_commitments" rows="4" maxlength="4000"><?= h(setting('company_commitments')) ?></textarea></label></div></div><div class="form-section"><span class="eyebrow">KONTAK & SOSIAL</span><div class="form-grid"><label>Alamat toko<input name="address" value="<?= h(setting('address')) ?>"></label><label>Jam operasional<input name="opening_hours" value="<?= h(setting('opening_hours')) ?>" maxlength="255"></label><label>Email<input type="email" name="email" required value="<?= h(setting('email')) ?>"></label><label>WhatsApp toko<input name="whatsapp_phone" value="<?= h(setting('whatsapp_phone')) ?>" placeholder="62812..."></label><label>Instagram URL<input type="url" name="instagram" value="<?= h(setting('instagram')) ?>"></label><label>TikTok URL<input type="url" name="tiktok" value="<?= h(setting('tiktok')) ?>"></label><label class="span-2">Playlist URL<input type="url" name="playlist" value="<?= h(setting('playlist')) ?>"></label></div></div><p class="checkout-note">Pastikan alamat, jam buka, dan kanal kontak sudah benar sebelum halaman profil dipublikasikan.</p><button class="button button-dark">Simpan Pengaturan ↗</button></form>
<?php elseif($tab==='products'): ?>
<?php if($editProduct || isset($_GET['new'])): $p=$editProduct ?: ['id'=>0,'title'=>'','artist'=>'','formats'=>'[]','genre'=>'','year'=>'','label'=>'','condition_name'=>'Mint','energy'=>'Sedang','mood'=>'Sedang','nostalgia'=>'Sedang','keywords'=>'','badge'=>'','description'=>'','tracklist'=>'','audio_url'=>'','images'=>'[]','status'=>'draft','featured'=>0,'merchandise'=>0];$formats=json_decode($p['formats'] ?: '[]',true) ?: []; ?>
<form class="admin-form" method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="save_product"><input type="hidden" name="id" value="<?= (int)$p['id'] ?>"><div class="form-section"><span class="eyebrow">INFO RILISAN</span><div class="form-grid"><label>Judul album *<input name="title" required value="<?= h($p['title']) ?>"></label><label>Artis *<input name="artist" required value="<?= h($p['artist']) ?>"></label><label>Genre<input name="genre" value="<?= h($p['genre']) ?>"></label><label>Tahun rilis<input name="year" value="<?= h($p['year']) ?>"></label><label>Label<input name="label" value="<?= h($p['label']) ?>"></label><label>Kondisi<select name="condition_name"><?php foreach(['Baru','Mint','VG+','VG','Good'] as $v): ?><option <?= $p['condition_name']===$v?'selected':'' ?>><?= $v ?></option><?php endforeach ?></select></label></div></div><div class="form-section"><span class="eyebrow">FORMAT, HARGA & STOK</span><div class="format-editor"><?php foreach(array_merge($formats,[['format'=>'','price'=>'','stock'=>'']]) as $f): ?><div class="format-row"><select name="format_name[]"><option value="">Pilih format</option><?php foreach(['Vinyl','Kaset','CD','Merchandise'] as $v): ?><option <?= ($f['format']??'')===$v?'selected':'' ?>><?= $v ?></option><?php endforeach ?></select><input type="number" name="format_price[]" min="0" placeholder="Harga (Rp)" value="<?= h((string)($f['price']??'')) ?>"><input type="number" name="format_stock[]" min="0" placeholder="Stok" value="<?= h((string)($f['stock']??'')) ?>"></div><?php endforeach ?></div><button type="button" class="small-action add-format">＋ Tambah format</button></div><div class="form-section"><span class="eyebrow">VIBE-NYA APA?</span><div class="form-grid"><?php foreach(['energy'=>'Energi','mood'=>'Mood','nostalgia'=>'Nostalgia'] as $key=>$label): ?><label><?= $label ?><select name="<?= $key ?>"><?php foreach(['Rendah','Sedang','Tinggi'] as $v): ?><option <?= $p[$key]===$v?'selected':'' ?>><?= $v ?></option><?php endforeach ?></select></label><?php endforeach ?><label>Keywords (pisahkan koma)<input name="keywords" value="<?= h($p['keywords']) ?>" placeholder="hangat, berdebu, groovy"></label><label>Badge<select name="badge"><option value="">Tanpa badge</option><option value="New" <?= $p['badge']==='New'?'selected':'' ?>>New Arrival</option><option value="Limited" <?= $p['badge']==='Limited'?'selected':'' ?>>Limited</option></select></label></div></div><div class="form-section"><span class="eyebrow">CERITA & FOTO</span><div class="form-grid"><label class="span-2">Deskripsi<textarea name="description" rows="3"><?= h($p['description']) ?></textarea></label><label class="span-2">Tracklist (satu lagu per baris)<textarea name="tracklist" rows="4"><?= h($p['tracklist']) ?></textarea></label><label class="span-2">Link preview audio (opsional)<input type="url" name="audio_url" value="<?= h($p['audio_url']) ?>"></label><label class="span-2">Unggah foto sampul depan/belakang & kondisi <small>JPG, PNG, WebP · maks. 2 MB per foto</small><input type="file" name="images[]" accept="image/png,image/webp,image/jpeg" multiple><small><?= count(json_decode($p['images'] ?: '[]',true) ?: []) ?> foto tersimpan. Unggahan baru akan ditambahkan ke galeri.</small></label></div></div><div class="form-section"><span class="eyebrow">PUBLIKASI</span><div class="form-grid"><label>Status<select name="status"><option value="draft" <?= $p['status']==='draft'?'selected':'' ?>>Draft</option><option value="published" <?= $p['status']==='published'?'selected':'' ?>>Terbit</option></select></label><label class="check-label"><input type="checkbox" name="featured" <?= $p['featured']?'checked':'' ?>> Tampilkan di rilisan unggulan</label><label class="check-label"><input type="checkbox" name="merchandise" <?= $p['merchandise']?'checked':'' ?>> Tampilkan di bagian merchandise</label></div></div><button class="button button-dark">Simpan Produk ↗</button> <a class="button button-outline" href="?tab=products">Batal</a></form>
<?php else: ?><div class="table-tools"><form method="get"><input type="hidden" name="tab" value="products"><input name="q" placeholder="Cari judul atau artis..." value="<?= h($query) ?>"><select name="format"><option value="">Semua format</option><?php foreach(['Vinyl','Kaset','CD','Merchandise'] as $f): ?><option <?= $formatFilter===$f?'selected':'' ?>><?= $f ?></option><?php endforeach ?></select><button class="button button-outline">Cari</button></form><a class="button button-dark" href="?tab=products&new=1">Tambah produk</a></div><div class="table-wrap"><table><thead><tr><th>Foto</th><th>Album / Artis</th><th>Format & Harga</th><th>Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody><?php foreach($products as $p): $fs=json_decode($p['formats'] ?: '[]',true) ?: []; $ims=json_decode($p['images'] ?: '[]',true) ?: []; $inventory=array_sum(array_map(fn($x)=>(int)$x['stock'],$fs)); $productLabel=$p['status']==='archived'?'Diarsipkan':($p['status']==='draft'?'Draft':($inventory>0?'Terbit':'Stok habis')); ?><tr><td><?php if($ims): ?><img class="table-thumb" src="<?= h($ims[0]) ?>" alt=""><?php else: ?>-<?php endif ?></td><td><strong><?= h($p['title']) ?></strong><small><?= h($p['artist']) ?></small></td><td><?= h(implode(', ',array_column($fs,'format'))) ?><small><?= $fs?money(min(array_column($fs,'price'))):'—' ?></small></td><td><?= $inventory ?></td><td><span class="status-pill"><?= h($productLabel) ?></span></td><td><a href="?tab=products&edit_product=<?= (int)$p['id'] ?>">Edit</a><form method="post" class="inline-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="product_action"><input type="hidden" name="id" value="<?= (int)$p['id'] ?>"><button name="operation" value="duplicate">Duplikat</button><button name="operation" value="archive">Arsip</button><button name="operation" value="delete" data-confirm="Yakin hapus produk ini?">Hapus</button></form></td></tr><?php endforeach ?></tbody></table></div><?php endif ?>
<?php elseif($tab==='articles'): ?>
<?php if($editArticle || isset($_GET['new'])): $a=$editArticle ?: ['id'=>0,'title'=>'','slug'=>'','category'=>'','excerpt'=>'','content'=>'','image'=>'','status'=>'draft','publish_at'=>'']; ?>
<form class="admin-form" method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="save_article"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="existing_image" value="<?= h($a['image']) ?>"><div class="form-grid"><label>Judul artikel *<input name="title" required value="<?= h($a['title']) ?>"></label><label>Slug URL<input name="slug" value="<?= h($a['slug']) ?>" placeholder="otomatis-dari-judul"></label><label>Kategori / tag<input name="category" value="<?= h($a['category']) ?>"></label><label>Jadwalkan terbit<input type="datetime-local" name="publish_at" value="<?= $a['publish_at']?h(date('Y-m-d\TH:i',strtotime($a['publish_at']))):'' ?>"></label><label class="span-2">Cuplikan singkat<input name="excerpt" required maxlength="220" value="<?= h($a['excerpt']) ?>"><small>Disarankan dua kalimat pendek.</small></label><label class="span-2">Gambar sampul<input type="file" name="image" accept="image/png,image/svg+xml,image/webp,image/jpeg"><?php if($a['image']): ?><img class="logo-preview" src="<?= h($a['image']) ?>" alt="Sampul artikel"><?php endif ?></label><label class="span-2 editor-label">Isi artikel<div class="editor-toolbar"><button type="button" data-command="formatBlock" data-value="h2">H2</button><button type="button" data-command="bold"><b>B</b></button><button type="button" data-command="italic"><i>I</i></button><button type="button" data-command="insertUnorderedList">• Daftar</button><button type="button" data-command="insertOrderedList">1. Daftar</button><button type="button" data-command="createLink">↗ Tautan</button><button type="button" data-command="insertImage">▧ Gambar</button></div><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-editor><?= $a['content'] ?></div><textarea name="content" hidden data-editor-source><?= h($a['content']) ?></textarea><small>Pilih teks, lalu gunakan tombol format di atas. Pratinjau membaca isi tulisan ini.</small></label><label>Status<select name="status"><option value="draft" <?= $a['status']==='draft'?'selected':'' ?>>Draft</option><option value="published" <?= $a['status']==='published'?'selected':'' ?>>Terbit</option><option value="scheduled" <?= $a['status']==='scheduled'?'selected':'' ?>>Jadwalkan</option></select></label></div><button class="button button-dark">Simpan Artikel ↗</button> <button type="button" class="button button-outline" data-preview-article>Pratinjau</button> <a href="?tab=articles" class="button button-outline">Batal</a></form>
<?php else: ?><div class="table-tools"><span><?= count($articles) ?> artikel tersimpan</span><a class="button button-dark" href="?tab=articles&new=1">Tulis artikel</a></div><div class="table-wrap"><table><thead><tr><th>Judul</th><th>Kategori</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody><?php foreach($articles as $a): ?><tr><td><strong><?= h($a['title']) ?></strong><small>/<?= h($a['slug']) ?></small></td><td><?= h($a['category']) ?></td><td><?= date('d M Y',strtotime($a['publish_at'] ?: $a['created_at'])) ?></td><td><span class="status-pill"><?= h(match($a['status']){'published'=>'Terbit','scheduled'=>'Terjadwal',default=>'Draft'}) ?></span></td><td><a href="?tab=articles&edit_article=<?= (int)$a['id'] ?>">Edit</a> <a href="index.php?story=<?= urlencode($a['slug']) ?>" target="_blank">Pratinjau</a><form method="post" class="inline-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="article_delete"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><button data-confirm="Yakin hapus artikel ini?">Hapus</button></form></td></tr><?php endforeach ?></tbody></table></div><?php endif ?>
<?php elseif($tab==='media'): require_login(true); ?><form class="media-search" method="get"><input type="hidden" name="tab" value="media"><input name="media_q" placeholder="Cari nama file..." value="<?= h($mediaQuery) ?>"><button class="button button-outline">Cari media</button><span><?= count($media) ?> file</span></form><div class="media-grid"><?php foreach($media as $m): ?><article><img src="uploads/<?= h(rawurlencode($m['filename'])) ?>" alt="<?= h($m['original_name']) ?>"><p><?= h($m['original_name']) ?></p><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="delete_media"><input type="hidden" name="id" value="<?= (int)$m['id'] ?>"><button data-confirm="Hapus media ini?">Hapus</button></form></article><?php endforeach ?></div><?php endif ?>
</main></div><?php endif ?>
<script src="assets/app.js" defer></script></body></html>
