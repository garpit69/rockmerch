<?php
declare(strict_types=1);

const DB_FILE = __DIR__ . '/storage/rockmerch.sqlite';
const UPLOAD_DIR = __DIR__ . '/uploads';

if (!is_dir(dirname(DB_FILE))) {
    mkdir(dirname(DB_FILE), 0755, true);
}
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'lifetime' => 0,
]);
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', '3600');
if (PHP_SAPI !== 'cli') session_start();

$db = new PDO('sqlite:' . DB_FILE, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA foreign_keys = ON');
$db->exec('PRAGMA busy_timeout = 5000');
$db->exec('PRAGMA journal_mode = WAL');
$db->exec("
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin');
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, artist TEXT NOT NULL, formats TEXT NOT NULL DEFAULT '[]',
  genre TEXT DEFAULT '', year TEXT DEFAULT '', label TEXT DEFAULT '', condition_name TEXT DEFAULT 'Mint',
  energy TEXT DEFAULT 'Sedang', mood TEXT DEFAULT 'Sedang', nostalgia TEXT DEFAULT 'Sedang', keywords TEXT DEFAULT '',
  badge TEXT DEFAULT '', description TEXT DEFAULT '', tracklist TEXT DEFAULT '', audio_url TEXT DEFAULT '',
  images TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', featured INTEGER NOT NULL DEFAULT 0,
  merchandise INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, category TEXT DEFAULT '',
  excerpt TEXT DEFAULT '', content TEXT DEFAULT '', image TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
  publish_at TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, original_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL, notes TEXT DEFAULT '',
  subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL, payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment', payment_reference TEXT DEFAULT '', shipping_carrier TEXT DEFAULT '',
  tracking_number TEXT DEFAULT '', tracking_url TEXT DEFAULT '', payment_url TEXT DEFAULT '',
  payment_transaction_id TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, title TEXT NOT NULL, format TEXT NOT NULL, unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE, product_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_item_id)
);
CREATE TABLE IF NOT EXISTS admin_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, identity_hash TEXT NOT NULL, attempted_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identity ON login_attempts(identity_hash,attempted_at);
CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS product_views (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, viewed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS search_terms (id INTEGER PRIMARY KEY AUTOINCREMENT, term TEXT NOT NULL, searched_at INTEGER NOT NULL);
");

$orderColumns = array_column($db->query('PRAGMA table_info(orders)')->fetchAll(), 'name');
foreach ([
    'shipping_carrier' => "TEXT NOT NULL DEFAULT ''",
    'tracking_number' => "TEXT NOT NULL DEFAULT ''",
    'tracking_url' => "TEXT NOT NULL DEFAULT ''",
    'payment_url' => "TEXT NOT NULL DEFAULT ''",
    'payment_transaction_id' => "TEXT NOT NULL DEFAULT ''",
    'updated_at' => "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
] as $column => $definition) {
    if (!in_array($column, $orderColumns, true)) {
        $db->exec('ALTER TABLE orders ADD COLUMN ' . $column . ' ' . $definition);
    }
}

require_once __DIR__ . '/lib/migrations.php';
require_once __DIR__ . '/lib/order_notifications.php';
apply_migrations($db, __DIR__ . '/migrations');

$defaults = [
    'company_name' => 'Rock Merch',
    'logo_light' => '',
    'logo_dark' => '',
    'tagline' => 'Putar keras, santai saja.',
    'mission' => 'Kami selalu berburu *rilisan terbaik*, merawat *suara analog*, dan membagikannya untuk *komunitas* di Bekasi dan sekitarnya.',
    'hero_video' => '',
    'free_shipping' => '250000',
    'address' => 'Ruko Musik No. 8, Bekasi, Jawa Barat',
    'email' => 'halo@rockmerch.id',
    'instagram' => 'https://instagram.com/',
    'tiktok' => 'https://tiktok.com/',
    'playlist' => 'https://open.spotify.com/',
    'whatsapp_phone' => '',
    'shipping_fee' => '15000',
    'bank_name' => 'BCA',
    'bank_account' => '',
    'bank_account_name' => '',
    'manual_bank_accounts' => '',
    'midtrans_mode' => 'sandbox',
    'midtrans_server_key' => '',
    'opening_hours' => 'Selasa–Minggu · 11.00–20.00',
    'company_story' => 'Rock Merch hadir sebagai ruang untuk menemukan dan menikmati rilisan fisik—vinyl, kaset, dan CD. Kami percaya musik juga punya sisi untuk dikoleksi: sampul, format, dan cerita yang membuat sebuah album ingin diputar lagi.',
    'company_selection' => 'Kami memilih rilisan yang layak masuk rak dalam format yang beragam. Setiap listing kami lengkapi dengan artis, judul, tahun, format, kondisi, harga, dan stok agar kamu bisa menilai sebelum membeli. Kami menjaga informasi kondisi dan ketersediaan tetap terbuka; bila ada detail yang ingin dipastikan, silakan hubungi toko sebelum memesan.',
    'company_commitments' => "Informasi artis, album, format, harga, kondisi, dan stok ditampilkan pada katalog.\nPerubahan status pesanan dapat dipantau melalui halaman pesanan.\nPertanyaan tentang rilisan dapat disampaikan melalui kanal kontak toko yang tersedia.",
];
$insertSetting = $db->prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
foreach ($defaults as $key => $value) {
    $insertSetting->execute([$key, $value]);
}
$shippingDefaults = [
    'shipping_fee' => $defaults['shipping_fee'],
    'bank_name' => $defaults['bank_name'],
    'bank_account' => $defaults['bank_account'],
    'bank_account_name' => $defaults['bank_account_name'],
];
foreach ($shippingDefaults as $key => $value) {
    $insertSetting->execute([$key, $value]);
}
$db->prepare("UPDATE settings SET value=? WHERE key='mission' AND value=?")->execute([
    $defaults['mission'],
    'Kami selalu berburu rilisan terbaik, merawat suara analog, dan membagikannya untuk komunitas di Bekasi dan sekitarnya.',
]);

if ((int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn() === 0) {
    $seedProducts = [
        ['Madvillainy', 'Madvillain', 'Alternative Hip-Hop', '2004', 'Stones Throw', 'Limited', 'hangat, berdebu, nyeleneh', 'Tinggi', 'Santai', 'Tinggi', 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=700&q=85', 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=700&q=85'],
        ['Blue Train', 'John Coltrane', 'Jazz', '1957', 'Blue Note', 'New', 'larut malam, hangat, brass', 'Sedang', 'Tenang', 'Tinggi', 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=85', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=85'],
        ['Rumours', 'Fleetwood Mac', 'Rock', '1977', 'Warner Records', '', 'roadtrip, mellow, abadi', 'Sedang', 'Melankolis', 'Tinggi', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=700&q=85', 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=700&q=85'],
        ['Head Hunters', 'Herbie Hancock', 'Jazz-Funk', '1973', 'Columbia', 'Limited', 'groovy, funky, licin', 'Tinggi', 'Ceria', 'Sedang', 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=85', 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=700&q=85'],
        ['Kala', 'M.I.A.', 'Electronic', '2007', 'XL Recordings', 'New', 'warna-warni, liar, global', 'Tinggi', 'Ceria', 'Sedang', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=700&q=85', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=85'],
    ];
    $insert = $db->prepare('INSERT INTO products (title,artist,formats,genre,year,label,badge,keywords,energy,mood,nostalgia,images,status,featured,description,tracklist) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,\'published\',1,?,?)');
    foreach ($seedProducts as $p) {
        $formats = [
            ['format' => 'Vinyl', 'price' => random_int(265000, 395000), 'stock' => random_int(2, 8)],
            ['format' => 'Kaset', 'price' => random_int(90000, 145000), 'stock' => random_int(1, 6)],
            ['format' => 'CD', 'price' => random_int(125000, 195000), 'stock' => random_int(2, 10)],
        ];
        $insert->execute([$p[0],$p[1],json_encode($formats),$p[2],$p[3],$p[4],$p[5],$p[6],$p[7],$p[8],$p[9],json_encode([$p[10],$p[11]]),'Satu rilisan yang enak diputar dari awal sampai akhir.','1. Side A — Track One' . "\n" . '2. Side A — Track Two' . "\n" . '3. Side B — Deep Cut']);
    }
}
if ((int)$db->query('SELECT COUNT(*) FROM products WHERE merchandise=1')->fetchColumn() === 0) {
    $merchInsert = $db->prepare('INSERT INTO products (title,artist,formats,genre,description,images,status,merchandise) VALUES (?,?,?,?,?,?,\'published\',1)');
    $merchInsert->execute(['Tote Bag Teman Rak','Rock Merch','[{"format":"Merchandise","price":85000,"stock":12}]','Merchandise','Tote kuat buat bawa pulang rilisan dan cerita.','["https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=700&q=85","https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85"]']);
    $merchInsert->execute(['Slipmat Sisi A','Rock Merch','[{"format":"Merchandise","price":65000,"stock":8}]','Merchandise','Biar piringan berputar dengan gaya yang pas.','["https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=700&q=85","https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=85"]']);
}
if ((int)$db->query('SELECT COUNT(*) FROM articles')->fetchColumn() === 0) {
    $articles = [
        ['Cara Mulai Koleksi Vinyl Tanpa Bikin Dompet Menjerit','Panduan Digger','Mulai dari musik yang kamu suka, bukan dari alat paling mahal.','Koleksi yang seru selalu dimulai dari rasa penasaran. Mulai pelan-pelan dengan album favoritmu, lalu kenali kondisi piringan dan cara menyimpannya.'],
        ['Di Balik Suara Hangat Piringan Hitam','Ruang Dengar','Bukan sekadar nostalgia—ada cerita menarik di setiap putaran.','Suara analog punya tekstur yang mengundang kita untuk duduk lebih lama. Yuk, ngobrol soal mastering, groove, dan kenapa ritual mendengar tetap berarti.'],
        ['5 Album Lokal Buat Teman Sore di Bekasi','Dengar Lokal','Pilihan rilisan lokal yang pas diputar sambil menikmati sore.','Ada banyak cerita dari musisi sekitar yang pantas mendapat tempat di rak. Ini beberapa rilisan favorit kami untuk menemani perjalanan pulang.'],
        ['Baca Kondisi Vinyl: VG+ Itu Maksudnya Apa?','Catatan Kolektor','Biar belanja rilisan preloved makin pede dan nggak pakai tebak-tebakan.','Grading membantu kita memahami kondisi piringan sebelum memutuskan untuk membawa pulang. Kami rangkum istilah yang paling sering kamu temui.'],
        ['Mixtape: Seni Mengirim Pesan Lewat Kaset','Budaya Kaset','Satu kaset, dua sisi, banyak cerita yang bisa dibagi.','Sebelum playlist tinggal share link, mixtape adalah surat yang disusun pelan-pelan. Setiap lagu dipilih untuk seseorang, dengan urutan yang punya arti.'],
        ['Kenalan dengan Sudut Dengar Favorit Kami','Di Toko','Headphone nyaman, kopi hangat, dan album yang belum pernah kamu dengar.','Sudut kecil di toko ini jadi tempat kami berkenalan lagi dengan album-album lama. Duduk saja, pilih satu piringan, dan biarkan musik mengambil alih.'],
    ];
    $insert = $db->prepare('INSERT INTO articles (title,slug,category,excerpt,content,status,publish_at) VALUES (?,?,?,?,?,\'published\',CURRENT_TIMESTAMP)');
    foreach ($articles as $i => $a) {
        $slug = 'liner-notes-' . ($i + 1);
        $insert->execute([$a[0], $slug, $a[1], $a[2], '<p>' . htmlspecialchars($a[3], ENT_QUOTES, 'UTF-8') . '</p>']);
    }
}

function h(?string $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function setting(string $key): string {
    global $db;
    $stmt = $db->prepare('SELECT value FROM settings WHERE key=?');
    $stmt->execute([$key]);
    return (string)($stmt->fetchColumn() ?: '');
}
function manual_bank_catalog(): array {
    return [
        'bca' => ['name' => 'BCA', 'logo' => 'assets/banks/bca.svg'],
        'mandiri' => ['name' => 'Mandiri', 'logo' => 'assets/banks/mandiri.svg'],
        'bri' => ['name' => 'BRI', 'logo' => 'assets/banks/bri.svg'],
        'bni' => ['name' => 'BNI', 'logo' => 'assets/banks/bni.svg'],
    ];
}
function manual_bank_configuration(): array {
    $stored = setting('manual_bank_accounts');
    $configured = $stored === '' ? null : json_decode($stored, true);
    if ($stored !== '' && !is_array($configured)) {
        throw new RuntimeException('Pengaturan rekening bank tidak valid. Simpan ulang di halaman pembayaran admin.');
    }

    $legacyName = strtolower(preg_replace('/[^a-z0-9]+/i', '', setting('bank_name')) ?? '');
    $legacyCode = match ($legacyName) {
        'bca', 'bankcentralasia' => 'bca',
        'mandiri', 'bankmandiri' => 'mandiri',
        'bri', 'bankrakyatindonesia' => 'bri',
        'bni', 'banknegaraindonesia' => 'bni',
        default => '',
    };
    $accounts = [];
    foreach (manual_bank_catalog() as $code => $bank) {
        $entry = is_array($configured[$code] ?? null) ? $configured[$code] : [];
        $accounts[$code] = [
            'account' => $configured === null
                ? ($code === $legacyCode ? setting('bank_account') : '')
                : trim((string)($entry['account'] ?? '')),
            'holder' => $configured === null
                ? ($code === $legacyCode ? setting('bank_account_name') : '')
                : trim((string)($entry['holder'] ?? '')),
        ];
    }
    return $accounts;
}
function manual_bank_accounts(): array {
    $configured = manual_bank_configuration();
    $accounts = [];
    foreach (manual_bank_catalog() as $code => $bank) {
        $account = $configured[$code]['account'];
        $holder = $configured[$code]['holder'];
        $digits = preg_replace('/\D+/', '', $account) ?? '';
        if ($account === '' || $holder === '' || !preg_match('/^[0-9][0-9 -]{3,30}$/', $account) || strlen($digits) < 5 || strlen($digits) > 30) {
            continue;
        }
        $accounts[$code] = $bank + ['code' => $code, 'account' => $account, 'holder' => $holder];
    }
    return $accounts;
}
function whatsapp_url(string $message = ''): string {
    $phone=preg_replace('/\D+/', '', setting('whatsapp_phone')) ?? '';
    if(str_starts_with($phone,'0')) $phone='62'.substr($phone,1);
    if(strlen($phone)<8||strlen($phone)>15) return '';
    return 'https://wa.me/'.$phone.($message!==''?'?text='.rawurlencode($message):'');
}
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function verify_csrf(): void {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(419);
        exit('Sesi formulir kedaluwarsa. Muat ulang halaman dan coba lagi.');
    }
}
function record_admin_activity(string $action, string $details = ''): void {
    global $db;
    $stmt=$db->prepare('INSERT INTO admin_activity(actor,action,details) VALUES(?,?,?)');
    $stmt->execute([(string)($_SESSION['email']??'admin'),$action,$details]);
}
function require_login(bool $adminOnly = false): void {
    if (empty($_SESSION['user_id']) || (int)($_SESSION['expires'] ?? 0) < time()) {
        session_unset();
        header('Location: admin.php');
        exit;
    }
    global $db;
    $stmt=$db->prepare('SELECT role FROM users WHERE id=?');
    $stmt->execute([(int)$_SESSION['user_id']]);
    $currentRole=$stmt->fetchColumn();
    if (!$currentRole || $currentRole !== ($_SESSION['role'] ?? '')) {
        session_unset();
        header('Location: admin.php');
        exit;
    }
    if ($adminOnly && ($_SESSION['role'] ?? '') !== 'admin') {
        http_response_code(403);
        exit('Akses khusus admin.');
    }
    $_SESSION['expires'] = time() + 3600;
}
function cart_item_count(): int {
    $cart = $_SESSION['cart'] ?? [];
    $count = 0;
    foreach ($cart as $item) $count += max(0, (int)($item['quantity'] ?? 0));
    return $count;
}
function cart_lines(): array {
    global $db;
    $lines = [];
    $query = $db->prepare("SELECT id,title,artist,formats,images,status FROM products WHERE id=?");
    foreach ($_SESSION['cart'] ?? [] as $key => $item) {
        $query->execute([(int)($item['product_id'] ?? 0)]);
        $product = $query->fetch();
        if (!$product || $product['status'] !== 'published') continue;
        $formats = json_decode($product['formats'] ?: '[]', true) ?: [];
        foreach ($formats as $format) {
            if (($format['format'] ?? '') !== ($item['format'] ?? '')) continue;
            $quantity = max(1, (int)($item['quantity'] ?? 1));
            $lines[$key] = [
                'key' => $key, 'product_id' => (int)$product['id'], 'title' => $product['title'],
                'artist' => $product['artist'], 'format' => $format['format'], 'price' => (int)$format['price'],
                'stock' => (int)$format['stock'], 'quantity' => $quantity,
                'image' => (json_decode($product['images'] ?: '[]', true) ?: [])[0] ?? '',
            ];
            break;
        }
    }
    return $lines;
}
function safe_redirect_path(string $path): string {
    return preg_match('/^[a-zA-Z0-9_\/.?=&%-]+$/', $path) && !str_starts_with($path, '//') ? $path : 'admin.php';
}
function order_status(string $status): string {
    return [
        'awaiting_payment'=>'Menunggu pembayaran', 'awaiting_confirmation'=>'Menunggu konfirmasi',
        'confirmed'=>'Terkonfirmasi', 'packing'=>'Sedang disiapkan', 'shipped'=>'Dikirim',
        'completed'=>'Selesai', 'cancelled'=>'Dibatalkan',
    ][$status] ?? 'Status tidak dikenal';
}
function safe_tracking_url(?string $url): string {
    $url=trim((string)$url);
    return filter_var($url,FILTER_VALIDATE_URL)&&strtolower((string)parse_url($url,PHP_URL_SCHEME))==='https'?$url:'';
}
function restore_order_stock(PDO $db, int $orderId): void {
    $items=$db->prepare('SELECT product_id,format,quantity FROM order_items WHERE order_id=?');
    $items->execute([$orderId]);
    $productQuery=$db->prepare('SELECT formats FROM products WHERE id=?');
    $update=$db->prepare('UPDATE products SET formats=? WHERE id=?');
    foreach($items->fetchAll() as $item) {
        if(!$item['product_id']) continue;
        $productQuery->execute([(int)$item['product_id']]);
        $formatsJson=$productQuery->fetchColumn();
        if($formatsJson===false) throw new RuntimeException('Produk pesanan tidak ditemukan; stok belum dapat dikembalikan.');
        $formats=json_decode($formatsJson ?: '[]',true,512,JSON_THROW_ON_ERROR);
        $found=false;
        foreach($formats as &$format) {
            if(($format['format']??'')!==$item['format']) continue;
            $format['stock']=max(0,(int)($format['stock']??0))+(int)$item['quantity'];
            $found=true;
            break;
        }
        unset($format);
        if(!$found) throw new RuntimeException('Format '.$item['format'].' sudah dihapus dari produk; stok belum dapat dikembalikan.');
        $update->execute([json_encode($formats,JSON_THROW_ON_ERROR),(int)$item['product_id']]);
    }
}
function redact_backup_secrets(array &$tables): void {
    if(!isset($tables['settings'])) return;
    foreach($tables['settings'] as &$settingRow) {
        if(($settingRow['key']??'')==='midtrans_server_key') $settingRow['value']='';
    }
    unset($settingRow);
}
function restore_payment_secrets(PDO $db, string $midtransServerKey): void {
    $save=$db->prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    $save->execute(['midtrans_server_key',$midtransServerKey]);
    $modeQuery=$db->prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    $modeQuery->execute(['midtrans_mode','sandbox']);
}
function midtrans_snap_transaction(array $order, array $items): array {
    if(!extension_loaded('curl')) throw new RuntimeException('Ekstensi PHP cURL belum aktif.');
    $serverKey=setting('midtrans_server_key');
    if($serverKey==='') throw new RuntimeException('Kunci server Midtrans belum diatur di halaman admin.');
    $mode=setting('midtrans_mode');
    if(!in_array($mode,['sandbox','production'],true)) throw new RuntimeException('Mode Midtrans tidak valid.');
    $itemDetails=[];
    foreach($items as $item) {
        $itemName=(string)$item['title'].' · '.(string)$item['format'];
        if(function_exists('mb_substr')) $itemName=mb_substr($itemName,0,50,'UTF-8');
        else $itemName=substr($itemName,0,50);
        $itemDetails[]=[
            'id'=>(string)($item['product_id']??'album'),
            'price'=>(int)$item['unit_price'],
            'quantity'=>(int)$item['quantity'],
            'name'=>$itemName,
        ];
    }
    if((int)$order['shipping']>0) {
        $itemDetails[]=['id'=>'shipping','price'=>(int)$order['shipping'],'quantity'=>1,'name'=>'Biaya pengiriman'];
    }
    $payload=[
        'transaction_details'=>['order_id'=>$order['order_number'],'gross_amount'=>(int)$order['total']],
        'customer_details'=>[
            'first_name'=>(string)$order['customer_name'],
            'email'=>(string)$order['email'],
            'phone'=>(string)$order['phone'],
            'shipping_address'=>[
                'first_name'=>(string)$order['customer_name'],
                'phone'=>(string)$order['phone'],
                'address'=>(string)$order['address'],
                'city'=>(string)$order['city'],
                'postal_code'=>(string)$order['postal_code'],
                'country_code'=>'IDN',
            ],
        ],
        'item_details'=>$itemDetails,
    ];
    $host=(string)($_SERVER['SERVER_NAME']??'');
    $validHost=filter_var($host,FILTER_VALIDATE_IP)!==false||filter_var($host,FILTER_VALIDATE_DOMAIN,FILTER_FLAG_HOSTNAME)!==false;
    if($validHost) {
        $scheme=!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'?'https':'http';
        $port=(int)($_SERVER['SERVER_PORT']??($scheme==='https'?443:80));
        $hostWithPort=$host.($port!==($scheme==='https'?443:80)?':'.$port:'');
        $directory=trim(str_replace('\\','/',dirname((string)($_SERVER['SCRIPT_NAME']??'/checkout.php'))),'/');
        $finishUrl=$scheme.'://'.$hostWithPort.($directory!==''?'/'.$directory:'').'/order.php?number='.rawurlencode((string)$order['order_number']);
        $payload['callbacks']=['finish'=>$finishUrl];
    }
    $baseUrl=$mode==='production'?'https://app.midtrans.com':'https://app.sandbox.midtrans.com';
    $request=curl_init($baseUrl.'/snap/v1/transactions');
    if($request===false) throw new RuntimeException('Koneksi ke Midtrans tidak dapat dimulai.');
    curl_setopt_array($request,[
        CURLOPT_POST=>true,
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_CONNECTTIMEOUT=>5,
        CURLOPT_TIMEOUT=>20,
        CURLOPT_SSL_VERIFYPEER=>true,
        CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_HTTPHEADER=>[
            'Accept: application/json',
            'Content-Type: application/json',
            'Authorization: Basic '.base64_encode($serverKey.':'),
        ],
        CURLOPT_POSTFIELDS=>json_encode($payload,JSON_THROW_ON_ERROR),
    ]);
    $response=curl_exec($request);
    $httpStatus=(int)curl_getinfo($request,CURLINFO_HTTP_CODE);
    $curlError=curl_error($request);
    unset($request);
    if($response===false) throw new RuntimeException('Koneksi ke Midtrans gagal: '.$curlError);
    $decoded=json_decode($response,true,512,JSON_THROW_ON_ERROR);
    if($httpStatus<200||$httpStatus>=300) {
        $apiError=implode('; ',array_map('strval',$decoded['error_messages']??[]));
        throw new RuntimeException('Midtrans menolak pembuatan pembayaran (HTTP '.$httpStatus.')'.($apiError!==''?': '.$apiError:'.'));
    }
    $redirectUrl=(string)($decoded['redirect_url']??'');
    $urlParts=parse_url($redirectUrl);
    $expectedHost=$mode==='production'?'app.midtrans.com':'app.sandbox.midtrans.com';
    if(($urlParts['scheme']??'')!=='https'||($urlParts['host']??'')!==$expectedHost) {
        throw new RuntimeException('Midtrans mengembalikan tautan pembayaran yang tidak valid.');
    }
    return ['redirect_url'=>$redirectUrl,'transaction_id'=>(string)($decoded['token']??'')];
}
function save_upload(array $file, bool $imageOnly = true): ?string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) throw new RuntimeException('Unggahan gagal. Coba pilih file lagi.');
    if (!is_uploaded_file($file['tmp_name'] ?? '')) throw new RuntimeException('File unggahan tidak valid.');
    if (($file['size'] ?? 0) > 2 * 1024 * 1024) throw new RuntimeException('Ukuran file maksimal 2 MB.');
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowed = ['image/jpeg'=>'jpg', 'image/png'=>'png', 'image/webp'=>'webp', 'image/svg+xml'=>'svg'];
    if (!isset($allowed[$mime])) throw new RuntimeException('Format file harus JPG, PNG, atau WebP.');
    $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    $target = UPLOAD_DIR . DIRECTORY_SEPARATOR . $filename;
    if ($mime === 'image/svg+xml') {
        $source = file_get_contents($file['tmp_name']);
        if ($source === false || stripos($source, '<!DOCTYPE') !== false) throw new RuntimeException('File SVG tidak valid.');
        $dangerousPatterns = ['/<\s*script\b/i', '/<\s*foreignObject\b/i', '/<\s*iframe\b/i', '/on\w+\s*=\s*(?:"|\')?/i', '/javascript:/i', '/data\s*:/i'];
        foreach ($dangerousPatterns as $pattern) {
            if (preg_match($pattern, $source)) throw new RuntimeException('File SVG mengandung elemen atau atribut yang tidak aman.');
        }
        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadXML($source, LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded || strtolower($document->documentElement?->localName ?? '') !== 'svg') throw new RuntimeException('File SVG tidak valid.');
        $allowedTags = ['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','lineargradient','radialgradient','stop','clippath','mask','title','desc'];
        $allowedAttributes = ['viewbox','width','height','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','points','transform','opacity','offset','stop-color','stop-opacity','gradientunits','gradienttransform','id','xmlns','version','preserveaspectratio','fill-rule','clip-path','mask'];
        $clean = static function (DOMElement $element) use (&$clean, $allowedTags, $allowedAttributes): void {
            for ($i = $element->attributes->length - 1; $i >= 0; $i--) {
                $attribute = $element->attributes->item($i);
                $name = strtolower($attribute->name);
                $value = trim($attribute->value);
                $isSvgNamespace = $name === 'xmlns' && $value === 'http://www.w3.org/2000/svg';
                if (!in_array($name, $allowedAttributes, true) || (!$isSvgNamespace && preg_match('/(?:javascript:|https?:|data:|url\s*\()/i', $value))) {
                    $element->removeAttributeNode($attribute);
                }
            }
            for ($child = $element->firstChild; $child;) {
                $next = $child->nextSibling;
                if ($child instanceof DOMElement) {
                    if (!in_array(strtolower($child->localName), $allowedTags, true)) {
                        $element->removeChild($child);
                    } else {
                        $clean($child);
                    }
                } elseif (!$child instanceof DOMText) {
                    $element->removeChild($child);
                }
                $child = $next;
            }
        };
        $clean($document->documentElement);
        if (file_put_contents($target, $document->saveXML($document->documentElement)) === false) throw new RuntimeException('Tidak dapat menyimpan logo SVG.');
    } elseif ($imageOnly && extension_loaded('gd') && ($mime !== 'image/webp' || function_exists('imagecreatefromwebp'))) {
        $source = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
            'image/png' => @imagecreatefrompng($file['tmp_name']),
            'image/webp' => @imagecreatefromwebp($file['tmp_name']),
        };
        if ($source) {
            $width = imagesx($source); $height = imagesy($source);
            $scale = min(1, 1800 / max($width, $height));
            $canvas = imagecreatetruecolor(max(1, (int)($width * $scale)), max(1, (int)($height * $scale)));
            imagealphablending($canvas, false); imagesavealpha($canvas, true);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, imagesx($canvas), imagesy($canvas), $width, $height);
            match ($mime) {
                'image/jpeg' => imagejpeg($canvas, $target, 84),
                'image/png' => imagepng($canvas, $target, 7),
                'image/webp' => imagewebp($canvas, $target, 82),
            };
        } elseif (!move_uploaded_file($file['tmp_name'], $target)) throw new RuntimeException('Tidak dapat menyimpan gambar.');
    } elseif (!move_uploaded_file($file['tmp_name'], $target)) throw new RuntimeException('Tidak dapat menyimpan gambar.');
    $stmt = $GLOBALS['db']->prepare('INSERT INTO media (filename,original_name) VALUES (?,?)');
    $stmt->execute([$filename, basename((string)$file['name'])]);
    return 'uploads/' . $filename;
}
function money(int|float $amount): string {
    return 'Rp' . number_format((float)$amount, 0, ',', '.');
}
function logo_mark(string $mode = 'light'): string {
    $light = setting('logo_light');
    $dark = setting('logo_dark');
    $defaultLogo = 'assets/brand/rockmerch-wordmark.png';
    $logo = $mode === 'dark' ? ($dark ?: ($light ?: $defaultLogo)) : ($light ?: ($dark ?: $defaultLogo));
    $defaultClass = $light === '' && $dark === '' ? ' brand-logo-default' : '';
    return '<img class="brand-logo' . $defaultClass . '" src="' . h($logo) . '" data-logo-light="' . h($light ?: $logo) . '" data-logo-dark="' . h($dark ?: $logo) . '" data-logo-fixed="' . h($mode === 'dark' ? 'dark' : '') . '" alt="' . h(setting('company_name')) . '">';
}
