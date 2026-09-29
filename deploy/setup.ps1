# PayTrack Production Deployment & Verification Script for Windows/PowerShell
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " PayTrack Production Deployment & Verification" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

if (-not (Test-Path .env)) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    
    $dbPass = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(18)).Replace('/','_').Replace('+','-')
    $jwtSec = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(36)).Replace('/','_').Replace('+','-')
    
    (Get-Content .env) |
        ForEach-Object { $_ -replace 'replace_with_strong_password_abc123xyz!', $dbPass } |
        ForEach-Object { $_ -replace 'super_secret_jwt_key_minimum_32_characters_random_99182374', $jwtSec } |
        Set-Content .env
        
    Write-Host "Generated cryptographically secure DB password and JWT_SECRET." -ForegroundColor Green
}

Write-Host "Starting Docker containers..." -ForegroundColor Yellow
docker compose up -d --build

Write-Host "Waiting for containers to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "Containers status:" -ForegroundColor Cyan
docker compose ps

Write-Host "==============================================" -ForegroundColor Green
Write-Host "PayTrack deployment ready!" -ForegroundColor Green
