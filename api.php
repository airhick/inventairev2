<?php
// Disable HTML error reporting to prevent breaking JSON
ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Custom error handler to return JSON
function jsonErrorHandler($errno, $errstr, $errfile, $errline)
{
    http_response_code(500);
    echo json_encode(['error' => "PHP Error: [$errno] $errstr in $errfile:$errline"]);
    exit();
}
set_error_handler("jsonErrorHandler");

// Handle Fatal Errors (shutdown)
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error !== NULL && $error['type'] === E_ERROR) {
        http_response_code(500);
        echo json_encode(['error' => "Fatal Error: {$error['message']} in {$error['file']}:{$error['line']}"]);
    }
});

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = 'owia.myd.infomaniak.com';
$port = 3306;
$db = 'owia_inventaire';
$user = 'owia_ext';
$pass = 'Lynx@t0r'; // Confirmed working password
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;port=$port;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
}
catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'fetch_items':
            $stmt = $pdo->query("SELECT * FROM items ORDER BY id DESC");
            $items = $stmt->fetchAll();

            // Handle UTF-8 issues if any
            $json = json_encode($items, JSON_INVALID_UTF8_IGNORE);
            if ($json === false) {
                throw new Exception("JSON Encode Error: " . json_last_error_msg());
            }
            echo $json;
            break;

        case 'fetch_item':
            $id = $input['id'] ?? $_GET['id'] ?? null;
            if (!$id)
                throw new Exception("Missing ID");
            $stmt = $pdo->prepare("SELECT * FROM items WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode($stmt->fetch() ?: null);
            break;

        case 'create_item':
            $data = $input['data'] ?? [];
            if (empty($data))
                throw new Exception("No data provided");

            // Build simple dynamic insert
            $columns = array_keys($data);
            $placeholders = array_fill(0, count($columns), '?');
            $sql = "INSERT INTO items (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";

            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($data));
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
            break;

        case 'update_item':
            $id = $input['id'] ?? null;
            $data = $input['data'] ?? [];
            if (!$id || empty($data))
                throw new Exception("Missing ID or Data");

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
            echo json_encode(['success' => true]);
            break;

        case 'delete_item':
            $id = $input['id'] ?? null;
            if (!$id)
                throw new Exception("Missing ID");
            $stmt = $pdo->prepare("DELETE FROM items WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
            break;

        case 'clear_all_items':
            $stmt = $pdo->prepare("TRUNCATE TABLE items");
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'All items deleted']);
            break;

        case 'fetch_custom_fields':
            $stmt = $pdo->query("SELECT * FROM custom_fields ORDER BY display_order ASC");
            echo json_encode(['success' => true, 'fields' => $stmt->fetchAll()]);
            break;

        case 'get_last_item_id':
            $stmt = $pdo->query("SELECT item_id FROM items WHERE item_id IS NOT NULL ORDER BY item_id DESC LIMIT 1");
            echo json_encode($stmt->fetch());
            break;

        case 'get_last_hex_id':
            $stmt = $pdo->query("SELECT hex_id FROM items WHERE hex_id IS NOT NULL AND CHAR_LENGTH(hex_id) = 3 AND hex_id REGEXP '^[A-Z][0-9][0-9]$' ORDER BY hex_id DESC LIMIT 1");
            echo json_encode($stmt->fetch());
            break;

        case 'fetch_categories':
            // Get used categories from items
            $stmt = $pdo->query("SELECT DISTINCT category FROM items WHERE category IS NOT NULL AND category != ''");
            $itemCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);

            // Get custom categories
            try {
                $stmt = $pdo->query("SELECT name FROM custom_categories");
                $customCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
            catch (Exception $e) {
                $customCategories = [];
            }

            // Get deleted categories
            try {
                $stmt = $pdo->query("SELECT name FROM deleted_categories");
                $deletedCategories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
            catch (Exception $e) {
                $deletedCategories = [];
            }

            echo json_encode([
                'categories' => $itemCategories,
                'customCategories' => $customCategories,
                'deletedCategories' => $deletedCategories
            ]);
            break;

        case 'fetch_notifications':
            try {
                $stmt = $pdo->query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50");
                echo json_encode(['notifications' => $stmt->fetchAll()]);
            }
            catch (Exception $e) {
                echo json_encode(['notifications' => []]);
            }
            break;

        default:
            throw new Exception("Invalid Action: " . $action);
    }
}
catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
