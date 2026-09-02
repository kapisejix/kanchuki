<#
  set-gst-profile.ps1  -  one-shot: write Kanchuki's platform GST profile to production.

  Writes the single platform_gst_profile row via PUT https://api.kanchuki.app/v1/admin/gst-profile
  (this row is the SELLER block printed on every subscription GST invoice).

  HOW TO RUN (Windows PowerShell):
    1. Open PowerShell.
    2. cd E:\Kanchuki
    3. Either leave $AdminKey blank (script auto-pulls it from Railway via the railway CLI),
       or paste it below between the quotes.
    4. Run:  powershell -ExecutionPolicy Bypass -File .\scripts\set-gst-profile.ps1
    5. Read the "VERIFY" block it prints at the end.

  Safe to delete this file after a successful run. It contains no secret unless you paste one in.
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- 1. Admin API key -------------------------------------------------
# Leave blank to auto-pull from Railway (service: supportive-love). Or paste the value.
$AdminKey = ''

if (-not $AdminKey) {
  Write-Host 'No $AdminKey set - pulling ADMIN_API_KEY from Railway (service supportive-love)...'
  try {
    $kv = railway variables list --service supportive-love --kv 2>$null
    $line = $kv | Select-String -Pattern '^ADMIN_API_KEY=' | Select-Object -First 1
    if ($line) { $AdminKey = ($line.ToString() -replace '^ADMIN_API_KEY=', '').Trim() }
  } catch { }
  if (-not $AdminKey) {
    throw 'Could not read ADMIN_API_KEY from Railway. Open the script, paste it into $AdminKey, re-run. (Railway dashboard - supportive-love - Variables - ADMIN_API_KEY)'
  }
  Write-Host ('Got key from Railway (length {0}).' -f $AdminKey.Length)
}

# --- 2. GST profile values (from Form GST REG-06, GSTIN 04ATYPK4915F1ZG) ---
# NOTE: company_name is the TRADE name. Legal name is "Sandeep Kumar" (proprietorship).
#       Change company_name if your CA wants the legal name on invoices instead.
$body = @{
  company_name   = 'Sejix Technologies'
  gstin          = '04ATYPK4915F1ZG'
  address_line1  = 'SCO 144-145, 4th Floor, Brij Business Centre, Sector 34A'
  address_line2  = 'Chandigarh - 160022'
  city           = 'Chandigarh'
  state          = 'Chandigarh'
  state_code     = '04'
  pan            = 'ATYPK4915F'
  invoice_prefix = 'KAN'
}

$Api = 'https://api.kanchuki.app'

# --- 3. Get CSRF token + cookie ------------------------------------
Write-Host 'Fetching CSRF token...'
$csrfResp = Invoke-RestMethod -Uri "$Api/v1/admin/csrf-token" `
  -Headers @{ 'x-admin-key' = $AdminKey } `
  -SessionVariable sess
$csrf = $csrfResp.data.csrf_token
if (-not $csrf) { throw 'No csrf_token in response - admin key rejected?' }

# --- 4. PUT the profile ------------------------------------------
Write-Host 'Writing GST profile...'
try {
  $put = Invoke-RestMethod -Uri "$Api/v1/admin/gst-profile" -Method Put `
    -Headers @{ 'x-admin-key' = $AdminKey; 'x-csrf-token' = $csrf } `
    -ContentType 'application/json' `
    -Body ($body | ConvertTo-Json -Compress) `
    -WebSession $sess
} catch {
  $r = $_.Exception.Response
  if ($r) {
    $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    Write-Host ('HTTP {0}' -f [int]$r.StatusCode) -ForegroundColor Red
    Write-Host $sr.ReadToEnd() -ForegroundColor Red
  }
  throw
}

# --- 5. Verify ------------------------------------------------
$check = Invoke-RestMethod -Uri "$Api/v1/admin/gst-profile" `
  -Headers @{ 'x-admin-key' = $AdminKey } -WebSession $sess

Write-Host ''
Write-Host '======== VERIFY (this is what is now stored in production) ========' -ForegroundColor Green
$check.data | Format-List
Write-Host '================================================================='  -ForegroundColor Green
