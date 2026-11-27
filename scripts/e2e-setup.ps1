# Chuẩn bị công cụ cho E2E: tải msedgedriver đúng phiên bản WebView2 về thư mục .e2e/.
# tauri-driver cài riêng bằng: cargo install tauri-driver --locked
# Nguồn tải: msedgedriver.microsoft.com (chính thức của Microsoft).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root '.e2e'
New-Item -ItemType Directory -Force $out | Out-Null

# Phiên bản WebView2 Runtime (GUID cố định của Microsoft).
$guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$keys = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid",
  "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$guid"
)
$version = $null
foreach ($k in $keys) {
  $pv = (Get-ItemProperty $k -ErrorAction SilentlyContinue).pv
  if ($pv) { $version = $pv; break }
}
if (-not $version) { throw 'Không tìm thấy WebView2 Runtime. Cài từ https://developer.microsoft.com/microsoft-edge/webview2/' }
Write-Host "WebView2: $version"

$exe = Join-Path $out 'msedgedriver.exe'
$stamp = Join-Path $out 'msedgedriver.version'
if ((Test-Path $exe) -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $version)) {
  Write-Host "msedgedriver $version đã có sẵn trong .e2e/"
  exit 0
}

$zip = Join-Path $out 'edgedriver.zip'
$url = "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip"
Write-Host "Tải $url"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $out -Force
Remove-Item $zip
Set-Content -Path $stamp -Value $version -NoNewline
Write-Host "Xong: $exe"
