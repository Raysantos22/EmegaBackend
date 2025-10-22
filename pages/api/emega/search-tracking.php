<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$query = $_GET['query'] ?? '';

if (empty($query)) {
    die(json_encode(['error' => 'Search query is required', 'success' => false]));
}

$conn = new mysqli('localhost', 'emegasql', 'sCutlrhG:J=202', 'emega');

if ($conn->connect_error) {
    die(json_encode(['error' => 'Database connection failed', 'success' => false]));
}

// Prepare the search query - using LIKE for partial matches
$searchTerm = '%' . $conn->real_escape_string($query) . '%';

$sql = "SELECT et.*, ts.tracking_status 
        FROM `emega_tracking` et
        LEFT JOIN `tracking_status` ts ON et.original_tracking_num = ts.tracking_number
        WHERE et.orderID LIKE ? 
        OR et.emega_tracking_num LIKE ? 
        OR et.original_tracking_num LIKE ?
        ORDER BY et.date_created DESC
        LIMIT 100";

$stmt = $conn->prepare($sql);
$stmt->bind_param('sss', $searchTerm, $searchTerm, $searchTerm);
$stmt->execute();
$result = $stmt->get_result();

$rows = [];
while ($row = $result->fetch_assoc()) {
    // Parse tracking_status JSON if it exists
    if (!empty($row['tracking_status'])) {
        $row['tracking_events'] = json_decode($row['tracking_status'], true);
    } else {
        $row['tracking_events'] = null;
    }
    $rows[] = $row;
}

$count = count($rows);

echo json_encode([
    'success' => true,
    'results' => $rows,
    'count' => $count,
    'query' => $query,
    'message' => $count === 0 ? 'No results found' : null
]);

$stmt->close();
$conn->close();
?>