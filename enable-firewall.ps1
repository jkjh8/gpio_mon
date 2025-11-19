# GPIO Monitor 방화벽 규칙 추가 스크립트
# 관리자 권한으로 실행하세요

Write-Host "GPIO Monitor 방화벽 규칙 추가 중..." -ForegroundColor Green

# 인바운드 UDP 5555 허용
New-NetFirewallRule -DisplayName "GPIO Monitor - UDP 5555 Inbound" `
    -Direction Inbound `
    -Protocol UDP `
    -LocalPort 5555 `
    -Action Allow `
    -Profile Any `
    -Enabled True

# 아웃바운드 UDP 5555 허용
New-NetFirewallRule -DisplayName "GPIO Monitor - UDP 5555 Outbound" `
    -Direction Outbound `
    -Protocol UDP `
    -LocalPort 5555 `
    -Action Allow `
    -Profile Any `
    -Enabled True

Write-Host "방화벽 규칙이 추가되었습니다!" -ForegroundColor Green
Write-Host "이제 npm start로 애플리케이션을 실행하세요." -ForegroundColor Yellow
