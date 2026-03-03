<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode(['error' => "PHP Error [$errno] $errstr in $errfile:$errline"], JSON_UNESCAPED_UNICODE);
    exit();
});

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error !== null && ($error['type'] === E_ERROR || $error['type'] === E_PARSE)) {
        http_response_code(500);
        echo json_encode(['error' => "Fatal Error: {$error['message']} in {$error['file']}:{$error['line']}"], JSON_UNESCAPED_UNICODE);
    }
});

function jsonResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
    exit();
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function normalizePath(string $uriPath): string
{
    $path = rtrim($uriPath, '/');
    return $path === '' ? '/' : $path;
}

function slugifyFieldKey(string $name): string
{
    $k = strtolower(trim($name));
    $k = preg_replace('/[^a-z0-9]+/', '_', $k);
    $k = trim((string)$k, '_');
    return $k !== '' ? $k : 'field';
}

$host = 'owia.myd.infomaniak.com';
$port = 3306;
$db = 'owia_inventaire';
$user = 'owia_ext';
$pass = 'Lynx@t0r';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;port=$port;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    jsonResponse(['error' => 'Database connection failed: ' . $e->getMessage()], 500);
}

$uriPath = normalizePath(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
$method = $_SERVER['REQUEST_METHOD'];
$routeHint = '';

// Fallback routing when rewrite is not active:
// - /api/api.php/upload
// - /api/api.php/events
// - /api/api.php/voice/transcribe
// - /api/api.php/voice/analyze
if (preg_match('#/api\.php/(upload|events|voice/transcribe|voice/analyze)$#', $uriPath, $m)) {
    $routeHint = $m[1];
}
if ($routeHint === '' && isset($_GET['route'])) {
    $routeHint = trim((string)$_GET['route'], '/');
}

if ((preg_match('#/events$#', $uriPath) || $routeHint === 'events') && $method === 'GET') {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    echo "data: {\"type\":\"connected\"}\n\n";
    @ob_flush();
    @flush();
    for ($i = 0; $i < 20; $i++) {
        echo ": heartbeat\n\n";
        @ob_flush();
        @flush();
        sleep(15);
    }
    exit();
}

if ((preg_match('#/upload$#', $uriPath) || $routeHint === 'upload') && $method === 'POST') {
    if (!isset($_FILES['file'])) {
        jsonResponse(['success' => false, 'error' => 'No file uploaded'], 400);
    }

    $serial = $_POST['serialNumber'] ?? $_POST['serial_number'] ?? 'img';
    $serial = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$serial);
    if ($serial === '') $serial = 'img';

    $uploadDir = __DIR__ . '/uploads';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true)) {
        jsonResponse(['success' => false, 'error' => 'Cannot create upload directory'], 500);
    }

    $original = $_FILES['file']['name'] ?? 'file.bin';
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if ($ext === '') $ext = 'bin';

    $filename = $serial . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $target = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
        jsonResponse(['success' => false, 'error' => 'Failed to save uploaded file'], 500);
    }

    $publicPath = '/api/uploads/' . $filename;
    jsonResponse(['success' => true, 'path' => $publicPath, 'url' => $publicPath]);
}

if (preg_match('#/voice/transcribe$#', $uriPath) || $routeHint === 'voice/transcribe') {
    jsonResponse(['success' => false, 'error' => 'voice/transcribe not implemented on PHP API'], 501);
}
if (preg_match('#/voice/analyze$#', $uriPath) || $routeHint === 'voice/analyze') {
    jsonResponse(['success' => false, 'error' => 'voice/analyze not implemented on PHP API'], 501);
}

$input = readJsonBody();
$action = $input['action'] ?? $_POST['action'] ?? $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'fetch_items':
            $stmt = $pdo->query("SELECT * FROM items ORDER BY id DESC");
            echo json_encode($stmt->fetchAll(), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_IGNORE);
            break;

        case 'fetch_item':
            $id = $input['id'] ?? $_GET['id'] ?? null;
            $serial = $input['serial_number'] ?? $_GET['serial_number'] ?? null;
            if ($id) {
                $stmt = $pdo->prepare("SELECT * FROM items WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode($stmt->fetch() ?: null, JSON_UNESCAPED_UNICODE);
                break;
            }
            if ($serial) {
                $stmt = $pdo->prepare("SELECT * FROM items WHERE serial_number = ? LIMIT 1");
                $stmt->execute([$serial]);
                echo json_encode($stmt->fetch() ?: null, JSON_UNESCAPED_UNICODE);
                break;
            }
            throw new Exception('Missing id or serial_number');

        case 'create_item':
            $data = $input['data'] ?? [];
            if (!is_array($data) || empty($data)) throw new Exception('No data provided');
            $columns = array_keys($data);
            $placeholders = array_fill(0, count($columns), '?');
            $sql = "INSERT INTO items (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($data));
            jsonResponse(['success' => true, 'id' => (int)$pdo->lastInsertId()]);

        case 'update_item':
            $id = $input['id'] ?? null;
            $data = $input['data'] ?? [];
            if (!$id || !is_array($data) || empty($data)) throw new Exception('Missing id or data');
            $sets = [];
            $values = [];
            foreach ($data as $key => $value) {
                $sets[] = "$key = ?";
                $values[] = $value;
            }
            $values[] = $id;
            $sql = "UPDATE items SET " . implode(', ', $sets) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);
            jsonResponse(['success' => true]);

        case 'delete_item':
            $id = $input['id'] ?? null;
            if (!$id) throw new Exception('Missing id');
            $stmt = $pdo->prepare("DELETE FROM items WHERE id = ?");
            $stmt->execute([$id]);
            jsonResponse(['success' => true]);

        case 'clear_all_items':
            $pdo->exec("TRUNCATE TABLE items");
            jsonResponse(['success' => true]);

        case 'fetch_custom_fields':
            $stmt = $pdo->query("SELECT * FROM custom_fields ORDER BY display_order ASC, id ASC");
            jsonResponse(['success' => true, 'fields' => $stmt->fetchAll()]);

        case 'create_custom_field':
            $data = $input['data'] ?? $input;
            $name = trim((string)($data['name'] ?? ''));
            if ($name === '') throw new Exception('name is required');
            $fieldType = trim((string)($data['fieldType'] ?? $data['field_type'] ?? 'text'));
            $required = !empty($data['required']) ? 1 : 0;
            $displayOrder = (int)($data['displayOrder'] ?? $data['display_order'] ?? 0);
            $fieldKeyBase = slugifyFieldKey($name);
            $fieldKey = $fieldKeyBase;
            $i = 1;
            while (true) {
                $chk = $pdo->prepare("SELECT id FROM custom_fields WHERE field_key = ? LIMIT 1");
                $chk->execute([$fieldKey]);
                if (!$chk->fetch()) break;
                $i++;
                $fieldKey = $fieldKeyBase . '_' . $i;
            }
            $optionsValue = $data['options'] ?? null;
            if (is_array($optionsValue)) $optionsValue = json_encode(array_values($optionsValue), JSON_UNESCAPED_UNICODE);
            $stmt = $pdo->prepare("INSERT INTO custom_fields (name, field_key, field_type, options, required, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$name, $fieldKey, $fieldType ?: 'text', $optionsValue, $required, $displayOrder, date('Y-m-d H:i:s')]);
            jsonResponse(['success' => true, 'id' => (int)$pdo->lastInsertId(), 'fieldKey' => $fieldKey]);

        case 'update_custom_field':
            $id = (int)($input['id'] ?? 0);
            $data = $input['data'] ?? [];
            if ($id <= 0 || !is_array($data) || empty($data)) throw new Exception('Missing id or data');
            $sets = [];
            $values = [];
            if (array_key_exists('name', $data)) {
                $sets[] = "name = ?";
                $values[] = (string)$data['name'];
            }
            if (array_key_exists('fieldType', $data) || array_key_exists('field_type', $data)) {
                $sets[] = "field_type = ?";
                $values[] = (string)($data['fieldType'] ?? $data['field_type']);
            }
            if (array_key_exists('options', $data)) {
                $opt = $data['options'];
                if (is_array($opt)) $opt = json_encode(array_values($opt), JSON_UNESCAPED_UNICODE);
                $sets[] = "options = ?";
                $values[] = $opt;
            }
            if (array_key_exists('required', $data)) {
                $sets[] = "required = ?";
                $values[] = !empty($data['required']) ? 1 : 0;
            }
            if (array_key_exists('displayOrder', $data) || array_key_exists('display_order', $data)) {
                $sets[] = "display_order = ?";
                $values[] = (int)($data['displayOrder'] ?? $data['display_order']);
            }
            if (empty($sets)) throw new Exception('No valid fields to update');
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE custom_fields SET " . implode(', ', $sets) . " WHERE id = ?");
            $stmt->execute($values);
            jsonResponse(['success' => true]);

        case 'delete_custom_field':
            $id = (int)($input['id'] ?? 0);
            if ($id <= 0) throw new Exception('Missing id');
            $stmt = $pdo->prepare("DELETE FROM custom_fields WHERE id = ?");
            $stmt->execute([$id]);
            jsonResponse(['success' => true]);

        case 'fetch_categories':
            $stmt = $pdo->query("SELECT DISTINCT category FROM items WHERE category IS NOT NULL AND category != ''");
            $itemCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            try {
                $stmt = $pdo->query("SELECT name FROM custom_categories ORDER BY name ASC");
                $customCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            } catch (Exception $e) {
                $customCategories = [];
            }
            try {
                $stmt = $pdo->query("SELECT name FROM deleted_categories ORDER BY name ASC");
                $deletedCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            } catch (Exception $e) {
                $deletedCategories = [];
            }
            jsonResponse([
                'categories' => $itemCategories,
                'customCategories' => $customCategories,
                'deletedCategories' => $deletedCategories
            ]);

        case 'create_category':
            $name = trim((string)($input['name'] ?? ''));
            if ($name === '') throw new Exception('name is required');
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("INSERT INTO custom_categories (name, created_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)");
                $stmt->execute([$name, date('Y-m-d H:i:s')]);
                $stmt = $pdo->prepare("DELETE FROM deleted_categories WHERE name = ?");
                $stmt->execute([$name]);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            jsonResponse(['success' => true]);

        case 'delete_category':
            $name = trim((string)($input['name'] ?? ''));
            if ($name === '') throw new Exception('name is required');
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("DELETE FROM custom_categories WHERE name = ?");
                $stmt->execute([$name]);
                $stmt = $pdo->prepare("INSERT INTO deleted_categories (name, deleted_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at)");
                $stmt->execute([$name, date('Y-m-d H:i:s')]);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            jsonResponse(['success' => true]);

        case 'fetch_notifications':
            try {
                $stmt = $pdo->query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100");
                jsonResponse(['notifications' => $stmt->fetchAll()]);
            } catch (Exception $e) {
                jsonResponse(['notifications' => []]);
            }

        case 'create_notification':
            $message = (string)($input['message'] ?? '');
            $type = (string)($input['type'] ?? 'info');
            $itemSerial = $input['item_serial_number'] ?? null;
            $itemHex = $input['item_hex_id'] ?? null;
            $stmt = $pdo->prepare("INSERT INTO notifications (message, type, item_serial_number, item_hex_id, created_at) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$message, $type, $itemSerial, $itemHex, date('Y-m-d H:i:s')]);
            jsonResponse(['success' => true, 'id' => (int)$pdo->lastInsertId()]);

        case 'delete_notification':
            $id = (int)($input['id'] ?? 0);
            if ($id <= 0) throw new Exception('Missing id');
            $stmt = $pdo->prepare("DELETE FROM notifications WHERE id = ?");
            $stmt->execute([$id]);
            jsonResponse(['success' => true]);

        case 'clear_notifications':
            $pdo->exec("DELETE FROM notifications");
            jsonResponse(['success' => true]);

        case 'get_last_item_id':
            $stmt = $pdo->query("SELECT item_id FROM items WHERE item_id IS NOT NULL ORDER BY item_id DESC LIMIT 1");
            echo json_encode($stmt->fetch() ?: null, JSON_UNESCAPED_UNICODE);
            break;

        case 'get_last_hex_id':
            $stmt = $pdo->query("SELECT hex_id FROM items WHERE hex_id IS NOT NULL AND CHAR_LENGTH(hex_id) = 3 AND hex_id REGEXP '^[A-Z][0-9][0-9]$' ORDER BY hex_id DESC LIMIT 1");
            echo json_encode($stmt->fetch() ?: null, JSON_UNESCAPED_UNICODE);
            break;

        default:
            throw new Exception('Invalid action: ' . $action);
    }
} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage()], 500);
}
?>
