<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$table = $_GET['table'] ?? '';
if (empty($table)) {
    http_response_code(400);
    die(json_encode(['error' => 'Table required']));
}

$conn = new mysqli('localhost', 'emegasql', 'sCutlrhG:J=202', 'emega');

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(['error' => 'Connection failed']));
}

$result = $conn->query("DESCRIBE `$table`");
$structure = [];

while ($row = $result->fetch_assoc()) {
    $structure[] = $row;
}

echo json_encode(['structure' => $structure]);
$conn->close();
?>