<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$table = $_GET['table'] ?? '';
$page = (int)($_GET['page'] ?? 1);
$limit = (int)($_GET['limit'] ?? 10);

if (empty($table)) {
    http_response_code(400);
    die(json_encode(['error' => 'Table required']));
}

$conn = new mysqli('localhost', 'emegasql', 'sCutlrhG:J=202', 'emega');

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(['error' => 'Connection failed']));
}

$offset = ($page - 1) * $limit;

$countResult = $conn->query("SELECT COUNT(*) as total FROM `$table`");
$totalRecords = $countResult->fetch_assoc()['total'];

$result = $conn->query("SELECT * FROM `$table` LIMIT $limit OFFSET $offset");
$rows = [];

while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode([
    'rows' => $rows,
    'totalRecords' => $totalRecords,
    'currentPage' => $page,
    'totalPages' => ceil($totalRecords / $limit)
]);

$conn->close();
?>
```

## Then Test in Browser:

Open this URL in your browser:
```
https://track.emega.com.au/api/emega/get-tables.php