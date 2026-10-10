# Sets GitHub Actions secrets for VPS deploy (repo: s4businessthinking-cmyk/s4-business-thinking-app).
$ErrorActionPreference = "Stop"
$Repo = "s4businessthinking-cmyk/s4-business-thinking-app"
$KeyPath = if ($env:S4_DEPLOY_KEY) { $env:S4_DEPLOY_KEY } else {
  Join-Path (Split-Path $PSScriptRoot -Parent) "..\S4-SERVER-BACKUP\keys\github_deploy"
}
$KeyPath = (Resolve-Path $KeyPath -ErrorAction Stop).Path

gh auth switch -u s4businessthinking-cmyk | Out-Null

gh secret set VPS_HOST --body "104.223.14.202" --repo $Repo
gh secret set VPS_SSH_USER --body "root" --repo $Repo
Get-Content -Raw $KeyPath | gh secret set VPS_SSH_PRIVATE_KEY --repo $Repo

Write-Host "GitHub secrets VPS_HOST, VPS_SSH_USER, VPS_SSH_PRIVATE_KEY set for $Repo" -ForegroundColor Green
Write-Host "Next: add github_deploy.pub to VPS /root/.ssh/authorized_keys (see erp-server/DEPLOY-VPS.md)" -ForegroundColor Yellow
