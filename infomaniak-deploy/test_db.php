<?php
header("Content-Type: text/plain; charset=utf-8");

$host = "owia.myd.infomaniak.com";
$port = 3306;
$db = "owia_inventaire";
$user = "owia_ext";
$pass = "Lynx@t0r";

echo "Testing connection to $host ($db) with user $user...\n";

try {
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5
    ];

    $pdo = new PDO($dsn, $user, $pass, $options);
    echo "SUCCESS: Connected to database successfully!\n\n";

    // List columns from items table
    echo "--- COLUMNS IN 'items' TABLE ---\n";
    $stmt = $pdo->query("SHOW COLUMNS FROM items");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($columns as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }


}
catch (PDOException $e) {
    echo "ERROR: Connection failed: " . $e->getMessage() . "\n";
}
?>
