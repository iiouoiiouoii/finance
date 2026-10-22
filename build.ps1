# 가계부 빌드 : src 의 템플릿·스타일·스크립트를 합쳐 dist/index.html 한 파일로 만든다.
#   사용법 : powershell -ExecutionPolicy Bypass -File build.ps1
#   결과물 : dist/index.html  (웹에 올리는 파일은 이것 하나)
param([string]$Out = "")

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
$js = ($parts -join "`n")

$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$html = $html.Replace('/*__CSS__*/', $css).Replace('/*__JS__*/', $js).Replace('__BUILD__', $stamp)

if (-not $Out) { $Out = Join-Path $root 'dist\index.html' }
[IO.File]::WriteAllText($Out, $html, $utf8)
Write-Output ("built " + $Out + " (" + [Math]::Round((Get-Item $Out).Length / 1KB) + " KB, " + $stamp + ")")
