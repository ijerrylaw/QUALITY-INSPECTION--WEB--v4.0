$body = Get-Content 'test_pass.json' -Raw
$resp = Invoke-WebRequest -Method POST -Uri 'http://localhost:4009/api/submissions/evaluate' -ContentType 'application/json' -Body $body
Write-Host "=== PASS TEST ==="
Write-Host $resp.Content

$body2 = Get-Content 'test_fail.json' -Raw
$resp2 = Invoke-WebRequest -Method POST -Uri 'http://localhost:4009/api/submissions/evaluate' -ContentType 'application/json' -Body $body2
Write-Host "=== FAIL TEST ==="
Write-Host $resp2.Content

Write-Host "=== GET /api/submissions ==="
$resp3 = Invoke-WebRequest -Uri 'http://localhost:4009/api/submissions'
Write-Host $resp3.Content
