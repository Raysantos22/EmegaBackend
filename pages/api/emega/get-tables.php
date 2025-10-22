<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$conn = new mysqli('localhost', 'emegasql', 'sCutlrhG:J=202', 'emega');

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(['error' => 'Connection failed']));
}

$result = $conn->query("SHOW TABLES");
$tables = [];

while ($row = $result->fetch_array()) {
    $tables[] = $row[0];
}

echo json_encode(['tables' => $tables, 'success' => true]);
$conn->close();
?>