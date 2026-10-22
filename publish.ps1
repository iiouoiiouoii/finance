# 빌드 → 커밋 → GitHub 푸시를 한 번에 : 웹(GitHub Pages)이 1~2분 안에 새 버전으로 바뀐다.
#   사용법 : powershell -ExecutionPolicy Bypass -File publish.ps1 -Message "무엇을 바꿨는지"
param([Parameter(Mandatory = $true)][string]$Message)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'build.ps1')
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Output 'nothing to commit'; exit 0 }
git commit -q -m $Message
if ($LASTEXITCODE -ne 0) { throw 'commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'push failed (GitHub 로그인 필요할 수 있음)' }
Write-Output ('published: ' + (git log -1 --format='%h %s'))
