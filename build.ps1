# 가계부 빌드 : src 의 템플릿·스타일·스크립트를 합쳐 index.html 한 파일로 만든다.
#   사용법 : powershell -ExecutionPolicy Bypass -File build.ps1
#   결과물 : index.html (이 저장소 맨 위 = GitHub Pages 로 웹에 나가는 파일)
#            + 바탕화면 가계부 폴더(이 폴더의 상위)의 index.html 도 같은 내용으로 갱신
param([switch]$NoLocalCopy)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'src'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$html = [IO.File]::ReadAllText((Join-Path $src 'index.html'), $utf8)
$css = [IO.File]::ReadAllText((Join-Path $src 'styles.css'), $utf8)
$parts = @()
Get-ChildItem (Join-Path $src 'js') -Filter '*.js' | Sort-Object Name | ForEach-Object {
  $parts += "/* ===== " + $_.Name + " ===== */"
  $parts += [IO.File]::ReadAllText($_.FullName, $utf8)
}
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$html = $html.Replace('/*__CSS__*/', $css).Replace('/*__JS__*/', ($parts -join "`n")).Replace('__BUILD__', $stamp)

$out = Join-Path $root 'index.html'
[IO.File]::WriteAllText($out, $html, $utf8)
Write-Output ("built index.html (" + [Math]::Round((Get-Item $out).Length / 1KB) + " KB, " + $stamp + ")")

if (-not $NoLocalCopy) {
  $local = Join-Path (Split-Path -Parent $root) 'index.html'
  [IO.File]::WriteAllText($local, $html, $utf8)
  Write-Output ("copied to " + $local)
}
