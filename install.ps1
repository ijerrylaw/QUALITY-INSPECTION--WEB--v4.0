#Requires -Version 5.1
<#
.SYNOPSIS
    Installs Quality Inspection (Web) v4.0 as a Windows service on this server.

.DESCRIPTION
    Run this from an ELEVATED PowerShell prompt, in the folder this script sits
    in. It is safe to run again: every step checks the current state first, and
    nothing here overwrites live inspection data.

    What it does, in order:
      1. Checks prerequisites (Administrator, Node.js, npm, NSSM).
      2. Creates backend\.env from the template on first run, then STOPS so you
         can fill in this site's real values.
      3. Ensures a TLS certificate and key are in place where .env points -
         generating a self-signed pair for this server if none is supplied.
      4. Copies the seed database into place - FIRST INSTALL ONLY.
      5. Installs dependencies (npm ci).
      6. Generates the database client.
      7. Builds the web interface.
      8. Registers and starts the Windows service (auto-start, restart on crash).
      9. Confirms the running service answers a health check.

    PREREQUISITES that must already be on this machine - this script does not
    download anything:
      * Node.js 20.19 or newer (22 LTS recommended). https://nodejs.org
      * NSSM, the service wrapper. https://nssm.cc - unzip it and either put
        nssm.exe on PATH or pass -NssmPath "C:\path\to\nssm.exe".
      * Outbound internet access, for `npm ci` to fetch dependencies.

    OPTIONAL:
      * A TLS certificate and private key, in PEM format. If you do NOT supply
        one, the installer generates a self-signed certificate for this server,
        issued to its own hostname/IP and valid for several years. Self-signed
        means each browser shows a one-time "not secure" warning; the
        connection is still encrypted. To supply your own instead, place the
        PEM cert + key at the TLS_CERT_PATH / TLS_KEY_PATH locations before
        running - existing files are used untouched, never overwritten.
        HTTPS itself is not optional: Microsoft Entra ID refuses non-HTTPS
        sign-in redirects for anything other than localhost.

.PARAMETER AppRoot
    Application folder. Defaults to the folder containing this script.

.PARAMETER ServiceName
    Windows service name. Default "QualityInspection".

.PARAMETER NssmPath
    Full path to nssm.exe, if it is not on PATH.

.PARAMETER SkipServiceInstall
    Do everything except register/start the service. Useful for a dry run.

.EXAMPLE
    .\install.ps1

.EXAMPLE
    .\install.ps1 -NssmPath "C:\Tools\nssm\win64\nssm.exe"
#>
[CmdletBinding()]
param(
    [string] $AppRoot = '',
    [string] $ServiceName = 'QualityInspection',
    [string] $NssmPath = '',
    [switch] $SkipServiceInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AppRoot)) {
    $AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$AppRoot = [System.IO.Path]::GetFullPath($AppRoot)

$EnvFile      = Join-Path $AppRoot 'backend\.env'
$EnvTemplate  = Join-Path $AppRoot 'backend\.env.example'
$SeedDb       = Join-Path $AppRoot 'install\seed.db'
$BackendDir   = Join-Path $AppRoot 'backend'
$ServerEntry  = Join-Path $AppRoot 'backend\server.ts'
$LogDir       = Join-Path $AppRoot 'logs'

# Keys the service cannot start without. Each is checked for presence AND for
# still holding the CHANGE_ME placeholder, because a half-edited .env is the
# likeliest failure and the least obvious from a service that just won't start.
$RequiredKeys = @('NODE_ENV', 'HOST', 'DATABASE_URL', 'TLS_KEY_PATH', 'TLS_CERT_PATH', 'WIPE_ENDPOINT_PASSWORD')

$MinNodeMajor = 20
$MinNodeMinor = 19

# Validity window for an installer-generated self-signed certificate. Long
# enough that renewal is not a routine chore; to force a fresh pair, delete
# both PEM files and re-run.
$CertValidityYears = 5

# Set true if this run generates the certificate, so the closing summary can
# mention the expected first-visit browser warning.
$SelfSignedGenerated = $false

# ── Console helpers ──────────────────────────────────────────────────────────
$script:StepNo = 0
function Write-Step {
    param([string] $Message)
    $script:StepNo++
    Write-Host ''
    Write-Host ("  STEP {0}  {1}" -f $script:StepNo, $Message) -ForegroundColor Cyan
    Write-Host ('  ' + ('-' * 58)) -ForegroundColor DarkGray
}
function Write-Pass { param([string] $m) Write-Host "    [ OK ]  $m" -ForegroundColor Green }
function Write-Info { param([string] $m) Write-Host "            $m" -ForegroundColor Gray }
function Write-Warn { param([string] $m) Write-Host "    [WARN]  $m" -ForegroundColor Yellow }

function Fail {
    param([string] $Message, [string[]] $Detail = @(), [string[]] $Fix = @())
    Write-Host ''
    Write-Host "    [FAIL]  $Message" -ForegroundColor Red
    if ($Detail.Count -gt 0) {
        Write-Host ''
        foreach ($d in $Detail) { Write-Host "            $d" -ForegroundColor Red }
    }
    if ($Fix.Count -gt 0) {
        Write-Host ''
        Write-Host '    WHAT TO DO:' -ForegroundColor Yellow
        foreach ($f in $Fix) { Write-Host "            $f" -ForegroundColor Yellow }
    }
    Write-Host ''
    Write-Host '    Installation stopped. Nothing was started.' -ForegroundColor Red
    Write-Host ''
    exit 1
}

function Invoke-Checked {
    param([string] $Exe, [string[]] $Arguments, [string] $WorkingDir, [string] $What)
    Push-Location $WorkingDir
    try {
        & $Exe @Arguments
        if ($LASTEXITCODE -ne 0) {
            Fail "$What failed (exit code $LASTEXITCODE)." `
                 @("Command: $Exe $($Arguments -join ' ')", "Folder:  $WorkingDir") `
                 @('Scroll up for the command output - it names the underlying error.')
        }
    } finally {
        Pop-Location
    }
}

# Minimal .env reader: KEY=VALUE, ignoring blanks, # comments, and optional
# surrounding quotes. Matches what dotenv does for the shapes this file uses.
function Read-EnvFile {
    param([string] $Path)
    $result = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $result }
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $val = $trimmed.Substring($idx + 1).Trim()
        if ($val.Length -ge 2) {
            if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
                $val = $val.Substring(1, $val.Length - 2)
            }
        }
        $result[$key] = $val
    }
    return $result
}

# A relative TLS path resolves against the application root - the same rule
# backend\server.ts and frontend\vite.config.ts both apply.
function Resolve-AppPath {
    param([string] $Value)
    if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
    return [System.IO.Path]::GetFullPath((Join-Path $AppRoot $Value))
}

# ── Minimal DER/PEM writer ───────────────────────────────────────────────────
# Windows PowerShell 5.1 runs on .NET Framework, whose RSA class has no
# ExportPkcs8PrivateKey / ExportRSAPrivateKey (those are .NET Core 3+). So the
# private key is hand-encoded from its RSAParameters into a PKCS#1 RSAPrivateKey
# structure, which Node's OpenSSL reads as "-----BEGIN RSA PRIVATE KEY-----".
# No external tools (openssl, mkcert) are required.
#
# Each function returns its byte[] via the unary comma so PowerShell does not
# unroll it on output; callers still wrap in [byte[]](...) defensively.
function Get-DerLength {
    param([int] $Length)
    $out = New-Object System.Collections.Generic.List[byte]
    if ($Length -lt 128) {
        $out.Add([byte] $Length)
    } else {
        $tmp = New-Object System.Collections.Generic.List[byte]
        $n = $Length
        while ($n -gt 0) { $tmp.Insert(0, [byte]($n -band 0xFF)); $n = [int]($n -shr 8) }
        $out.Add([byte](0x80 -bor $tmp.Count))
        $out.AddRange($tmp)
    }
    return , $out.ToArray()
}
function New-DerInteger {
    param([byte[]] $Value)
    $b = New-Object System.Collections.Generic.List[byte]
    if ($null -eq $Value -or $Value.Length -eq 0) { $b.Add([byte] 0) } else { $b.AddRange($Value) }
    while ($b.Count -gt 1 -and $b[0] -eq 0) { $b.RemoveAt(0) }   # strip leading zeros
    if (($b[0] -band 0x80) -ne 0) { $b.Insert(0, [byte] 0) }     # keep it positive
    $out = New-Object System.Collections.Generic.List[byte]
    $out.Add([byte] 0x02)
    $out.AddRange([byte[]](Get-DerLength $b.Count))
    $out.AddRange($b)
    return , $out.ToArray()
}
function New-DerSequence {
    param([byte[]] $Content)
    $out = New-Object System.Collections.Generic.List[byte]
    $out.Add([byte] 0x30)
    $out.AddRange([byte[]](Get-DerLength $Content.Length))
    $out.AddRange($Content)
    return , $out.ToArray()
}
function Format-Pem {
    param([string] $Label, [byte[]] $Der)
    $b64 = [System.Convert]::ToBase64String($Der)
    $sb = New-Object System.Text.StringBuilder
    [void] $sb.Append("-----BEGIN $Label-----`n")
    for ($i = 0; $i -lt $b64.Length; $i += 64) {
        $take = [Math]::Min(64, $b64.Length - $i)
        [void] $sb.Append($b64.Substring($i, $take))
        [void] $sb.Append("`n")
    }
    [void] $sb.Append("-----END $Label-----`n")
    return $sb.ToString()
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor White
Write-Host '   QUALITY INSPECTION (WEB) v4.0 - SERVER INSTALLATION' -ForegroundColor White
Write-Host '  ============================================================' -ForegroundColor White
Write-Host "   Application folder : $AppRoot"
Write-Host "   Service name       : $ServiceName"

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Checking prerequisites'
# ─────────────────────────────────────────────────────────────────────────────

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $SkipServiceInstall) {
    Fail 'This window is not running as Administrator.' `
         @('Registering a Windows service requires elevation.') `
         @('Close this window.',
           'Right-click Windows PowerShell and choose "Run as administrator".',
           "Change to $AppRoot and run .\install.ps1 again.")
}
if ($isAdmin) { Write-Pass 'Running as Administrator' }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Fail 'Node.js is not installed, or not on PATH.' `
         @("This application runs on Node.js $MinNodeMajor.$MinNodeMinor or newer.") `
         @('Install the 22 LTS build from https://nodejs.org',
           'Choose the option that adds Node.js to PATH.',
           'Open a NEW administrator PowerShell window, then re-run this script.')
}
$NodeExe = $nodeCmd.Source

$nodeVersionRaw = (& node --version).Trim()      # e.g. v22.11.0
$versionText = $nodeVersionRaw.TrimStart('v')
$parts = $versionText.Split('.')
$nodeMajor = [int]$parts[0]
$nodeMinor = 0
if ($parts.Count -gt 1) { $nodeMinor = [int]$parts[1] }

$nodeTooOld = $false
if ($nodeMajor -lt $MinNodeMajor) { $nodeTooOld = $true }
if ($nodeMajor -eq $MinNodeMajor -and $nodeMinor -lt $MinNodeMinor) { $nodeTooOld = $true }

if ($nodeTooOld) {
    Fail "Node.js $nodeVersionRaw is too old." `
         @("Minimum supported: v$MinNodeMajor.$MinNodeMinor. Recommended: 22 LTS.") `
         @('Install the 22 LTS build from https://nodejs.org, then re-run this script.')
}
Write-Pass "Node.js $nodeVersionRaw at $NodeExe"

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Fail 'npm is not on PATH.' `
         @('npm normally installs alongside Node.js.') `
         @('Reinstall Node.js from https://nodejs.org and re-run this script.')
}
Write-Pass "npm $((& npm --version).Trim())"

if (-not $SkipServiceInstall) {
    if ([string]::IsNullOrWhiteSpace($NssmPath)) {
        $nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
        if ($nssmCmd) { $NssmPath = $nssmCmd.Source }
    }
    if ([string]::IsNullOrWhiteSpace($NssmPath) -or -not (Test-Path -LiteralPath $NssmPath)) {
        Fail 'NSSM was not found.' `
             @('NSSM is the wrapper that runs this application as a Windows service,',
               'so that it starts on boot and restarts automatically if it stops.',
               'It is a prerequisite and this script does not download it.') `
             @('Download NSSM from https://nssm.cc/download',
               'Unzip it, and take nssm.exe from the win64 folder.',
               'Either copy it somewhere on PATH (for example C:\Windows\System32),',
               '  or re-run this script pointing at it directly:',
               "  .\install.ps1 -NssmPath `"C:\Tools\nssm\win64\nssm.exe`"")
    }
    Write-Pass "NSSM at $NssmPath"
}

foreach ($req in @($EnvTemplate, $ServerEntry, (Join-Path $AppRoot 'package.json'))) {
    if (-not (Test-Path -LiteralPath $req)) {
        Fail "The installation package looks incomplete - missing: $req" `
             @() `
             @('Re-copy the full package folder to this server and try again.')
    }
}
Write-Pass 'Package contents look complete'

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Checking configuration file (backend\.env)'
# ─────────────────────────────────────────────────────────────────────────────

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath $EnvTemplate -Destination $EnvFile -Force

    # The template ships with every value commented out, which is correct for it
    # (they are all optional in development). For a server they are mandatory, so
    # append an explicit block. These are PLACEHOLDERS, not generated values -
    # nothing here invents a password, a path, or a certificate.
    $block = @(
        '',
        '# ===========================================================================',
        '# REQUIRED - SITE ADMINISTRATOR MUST COMPLETE THIS SECTION',
        '#',
        '# Replace every CHANGE_ME below with this site''s real value. The installer',
        '# refuses to continue while any CHANGE_ME remains.',
        '# ===========================================================================',
        '',
        '# Leave as production on a real server. This also keeps the destructive',
        '# dev-only maintenance endpoints unmounted.',
        'NODE_ENV=production',
        '',
        '# Network interface to listen on. 0.0.0.0 means all interfaces, which is',
        '# usually fine. If this server has a fixed IP address that staff will type',
        '# into their browsers, set HOST to that exact IP: the auto-generated',
        '# self-signed certificate is then issued to it, so the address matches and',
        '# there is no name-mismatch error on top of the one-time trust warning.',
        'HOST=0.0.0.0',
        '',
        '# Port the application listens on. Users reach it at https://<server>:4009',
        '# This same address must be registered as a Redirect URI in the Entra ID',
        '# App Registration, or Microsoft sign-in will fail.',
        'PORT=4009',
        '',
        '# Where the live inspection database file lives. Must be an ABSOLUTE path,',
        '# prefixed with file: - a service has no reliable working directory.',
        '# Put it OUTSIDE this application folder so an application update cannot',
        '# touch it, and include that location in the server backup job.',
        '# Suggested value:',
        '#   DATABASE_URL=file:C:\ProgramData\QualityInspection\prod.db',
        'DATABASE_URL=CHANGE_ME',
        '',
        '# TLS certificate and private key, in PEM format.',
        '#',
        '# You do NOT need to obtain a certificate. If no files exist at these two',
        '# paths when the installer runs, it generates a self-signed certificate',
        '# for this server automatically, issued to its hostname/IP. That causes a',
        '# one-time "not secure" warning in each browser - expected, and it does',
        '# not stop the app working; the connection is still encrypted.',
        '#',
        '# If your organisation issues its own certificates and you would rather',
        '# use one, place the PEM cert + key at these paths BEFORE running the',
        '# installer. Existing files are used as-is and never overwritten.',
        '#',
        '# Either way these must be ABSOLUTE paths in a folder the service account',
        '# can read. Suggested location:',
        '#   TLS_KEY_PATH=C:\ProgramData\QualityInspection\certs\server-key.pem',
        '#   TLS_CERT_PATH=C:\ProgramData\QualityInspection\certs\server.pem',
        'TLS_KEY_PATH=CHANGE_ME',
        'TLS_CERT_PATH=CHANGE_ME',
        '',
        '# Password protecting the maintenance endpoints that erase inspection data.',
        '# Choose a strong value and store it with the site''s other credentials.',
        'WIPE_ENDPOINT_PASSWORD=CHANGE_ME'
    )
    Add-Content -LiteralPath $EnvFile -Value $block -Encoding utf8

    Write-Host ''
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host '   ACTION REQUIRED - CONFIGURATION FILE CREATED' -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '   A configuration file has been created at:' -ForegroundColor White
    Write-Host "     $EnvFile" -ForegroundColor White
    Write-Host ''
    Write-Host '   It contains placeholder values that must be replaced before' -ForegroundColor White
    Write-Host '   the application can run. Open it in Notepad and complete the' -ForegroundColor White
    Write-Host '   section marked REQUIRED at the bottom:' -ForegroundColor White
    Write-Host ''
    Write-Host '     DATABASE_URL            where the inspection database is stored' -ForegroundColor White
    Write-Host '     TLS_KEY_PATH            where to write the TLS private key' -ForegroundColor White
    Write-Host '     TLS_CERT_PATH           where to write the TLS certificate' -ForegroundColor White
    Write-Host '     WIPE_ENDPOINT_PASSWORD  a password you choose' -ForegroundColor White
    Write-Host ''
    Write-Host '     HOST / PORT / NODE_ENV  already set to sensible defaults' -ForegroundColor Gray
    Write-Host ''
    Write-Host '   You do NOT need to obtain a TLS certificate. If none exists at' -ForegroundColor Gray
    Write-Host '   those two paths, the installer generates a self-signed one for' -ForegroundColor Gray
    Write-Host '   this server. If the server has a fixed IP that staff will type' -ForegroundColor Gray
    Write-Host '   into the browser, set HOST to that IP so the certificate matches.' -ForegroundColor Gray
    Write-Host ''
    Write-Host '   Then run this script again:' -ForegroundColor White
    Write-Host '     .\install.ps1' -ForegroundColor Cyan
    Write-Host ''
    exit 2
}

Write-Pass 'backend\.env exists'

$envValues = Read-EnvFile -Path $EnvFile

$missingKeys     = @()
$placeholderKeys = @()
foreach ($key in $RequiredKeys) {
    if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
        $missingKeys += $key
    } elseif ($envValues[$key] -match 'CHANGE_ME|change-me') {
        $placeholderKeys += $key
    }
}

if ($missingKeys.Count -gt 0 -or $placeholderKeys.Count -gt 0) {
    $detail = @()
    foreach ($k in $missingKeys)     { $detail += "$k  - not set" }
    foreach ($k in $placeholderKeys) { $detail += "$k  - still set to the CHANGE_ME placeholder" }
    Fail 'The configuration file is incomplete.' $detail `
         @("Open $EnvFile in Notepad.",
           'Give every setting listed above this site''s real value.',
           'Save the file and run .\install.ps1 again.')
}
Write-Pass "All $($RequiredKeys.Count) required settings have values"

if ($envValues['NODE_ENV'] -ne 'production') {
    Write-Warn "NODE_ENV is '$($envValues['NODE_ENV'])', not 'production'."
    Write-Info 'On a live server this should be production - it keeps the destructive'
    Write-Info 'maintenance endpoints unmounted. Continuing anyway.'
}

$dbUrl = $envValues['DATABASE_URL']
if (-not $dbUrl.StartsWith('file:')) {
    Fail "DATABASE_URL must start with 'file:' - found: $dbUrl" `
         @() `
         @('Example: DATABASE_URL=file:C:\ProgramData\QualityInspection\prod.db')
}
$DbPath = $dbUrl.Substring(5)
if (-not [System.IO.Path]::IsPathRooted($DbPath)) {
    Fail 'DATABASE_URL must be an absolute path.' `
         @("Found: $dbUrl",
           'A Windows service has no dependable working directory, so a relative',
           'path can silently create an empty database somewhere unexpected.') `
         @('Example: DATABASE_URL=file:C:\ProgramData\QualityInspection\prod.db')
}
if ($DbPath -match 'dev\.db$') {
    Fail 'DATABASE_URL points at dev.db, the bundled development database.' `
         @('That file is replaced by application updates, which would destroy live data.') `
         @('Point DATABASE_URL at a file OUTSIDE this folder, for example',
           'file:C:\ProgramData\QualityInspection\prod.db')
}
Write-Pass "Database location: $DbPath"

$Port = 4009
if ($envValues.ContainsKey('PORT') -and -not [string]::IsNullOrWhiteSpace($envValues['PORT'])) {
    $Port = [int]$envValues['PORT']
}
Write-Pass "Listen address: $($envValues['HOST']):$Port"

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Checking TLS certificate'
# ─────────────────────────────────────────────────────────────────────────────

$keyPath  = Resolve-AppPath $envValues['TLS_KEY_PATH']
$certPath = Resolve-AppPath $envValues['TLS_CERT_PATH']

$existingKeyPem  = ''
$existingCertPem = ''
try { $existingKeyPem  = Get-Content -LiteralPath $keyPath  -Raw -ErrorAction Stop } catch { }
try { $existingCertPem = Get-Content -LiteralPath $certPath -Raw -ErrorAction Stop } catch { }

$keyLooksPem  = $existingKeyPem  -match '-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----'
$certLooksPem = $existingCertPem -match '-----BEGIN CERTIFICATE-----'

if ($keyLooksPem -and $certLooksPem) {
    # Requirement: never regenerate over a certificate already in place. This
    # covers both a re-run of this installer and an operator-supplied cert.
    Write-Pass "Certificate present: $certPath"
    Write-Pass "Private key present: $keyPath"
    Write-Info 'Left exactly as-is - the installer never overwrites TLS files it finds.'
    try {
        $inspect = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $certPath
        Write-Info ("Subject {0}  |  expires {1}" -f $inspect.Subject, $inspect.NotAfter.ToString('yyyy-MM-dd'))
        if ($inspect.NotAfter -lt (Get-Date)) {
            Write-Warn 'This certificate has EXPIRED. Delete both files and re-run to have'
            Write-Warn 'the installer generate a fresh self-signed pair, or install a new one.'
        }
        $inspect.Dispose()
    } catch { }
}
else {
    if (($existingKeyPem -ne '' -and -not $keyLooksPem) -or ($existingCertPem -ne '' -and -not $certLooksPem)) {
        Write-Warn 'A file exists at a configured TLS path but is not readable PEM.'
        Write-Info 'Both cert and key will be regenerated together so the pair matches.'
    }

    # ── Build the Subject Alternative Name list ─────────────────────────────
    # The address staff type in the browser must appear in the certificate or
    # the browser refuses the connection outright - a name mismatch is a hard
    # error, unlike the click-through "not trusted" warning a self-signed cert
    # already carries.
    $sanCandidates = New-Object System.Collections.Generic.List[string]
    $hostEnv = $envValues['HOST']
    $hostSpecific = ($hostEnv) -and (@('0.0.0.0', '::', '') -notcontains $hostEnv) -and ($hostEnv -ne 'localhost')

    if ($hostSpecific) {
        $sanCandidates.Add($hostEnv)
        $primarySubject = $hostEnv
    } else {
        Write-Warn "HOST is '$hostEnv' (all interfaces) - not usable as a certificate name on its own."
        Write-Info 'Using this machine''s computer name and detected IPv4 addresses instead.'
        Write-Info 'For an exact match, set HOST to the fixed IP staff will use and re-run.'
        $primarySubject = $env:COMPUTERNAME
    }
    $sanCandidates.Add($env:COMPUTERNAME)

    $detectedIps = @()
    try {
        $detectedIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
            Select-Object -ExpandProperty IPAddress)
    } catch {
        try {
            $detectedIps = @([System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) |
                Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
                ForEach-Object { $_.IPAddressToString })
        } catch { $detectedIps = @() }
    }
    foreach ($ip in $detectedIps) { $sanCandidates.Add($ip) }
    if (-not $hostSpecific -and $detectedIps.Count -gt 0) { $primarySubject = $detectedIps[0] }

    $sanCandidates.Add('localhost')
    $sanCandidates.Add('127.0.0.1')

    $sanNames = @($sanCandidates | Where-Object { $_ -and ("$_".Trim() -ne '') } | Select-Object -Unique)

    Write-Host ''
    Write-Host '  ------------------------------------------------------------' -ForegroundColor Yellow
    Write-Host '   GENERATING A SELF-SIGNED TLS CERTIFICATE' -ForegroundColor Yellow
    Write-Host '  ------------------------------------------------------------' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '   No certificate was found at the configured paths, and this' -ForegroundColor White
    Write-Host '   deployment has no internal certificate authority to issue one,' -ForegroundColor White
    Write-Host '   so the installer is creating a self-signed certificate for this' -ForegroundColor White
    Write-Host '   server. THIS IS EXPECTED - it is not an error.' -ForegroundColor White
    Write-Host ''
    Write-Host '   What staff will see:' -ForegroundColor White
    Write-Host '     - The first time each browser opens the app it shows a' -ForegroundColor White
    Write-Host '       "Your connection is not private" / "Not secure" page.' -ForegroundColor White
    Write-Host '     - They click Advanced, then Continue / Proceed to the site.' -ForegroundColor White
    Write-Host '       The browser remembers the choice for that machine.' -ForegroundColor White
    Write-Host '     - The connection is still fully encrypted. The warning only' -ForegroundColor White
    Write-Host '       means the certificate is not signed by a public authority.' -ForegroundColor White
    Write-Host ''
    Write-Host '   To remove the warning for everyone (optional), IT can push the' -ForegroundColor White
    Write-Host '   generated certificate file to staff machines'' Trusted Root' -ForegroundColor White
    Write-Host "   store via Group Policy:  $certPath" -ForegroundColor White
    Write-Host ''

    foreach ($d in @((Split-Path -Parent $certPath), (Split-Path -Parent $keyPath))) {
        if ($d -and -not (Test-Path -LiteralPath $d)) {
            New-Item -ItemType Directory -Path $d -Force | Out-Null
            Write-Info "Created folder $d"
        }
    }

    if (-not ([System.Management.Automation.PSTypeName]'System.Security.Cryptography.X509Certificates.CertificateRequest').Type) {
        Fail 'This machine cannot generate a certificate - .NET is too old.' `
             @('CertificateRequest requires .NET Framework 4.7.2 or newer',
               '(Windows Server 2019+, or Windows 10 1809+ / Windows 11).') `
             @('Install a newer .NET Framework, OR create a PEM certificate and',
               'private key by hand, place them at:',
               "  $certPath",
               "  $keyPath",
               'and re-run this script - existing files are used as-is.')
    }

    $notAfter = (Get-Date).AddYears($CertValidityYears)

    try {
        # RSACryptoServiceProvider is a legacy CSP key: unlike a CNG key from
        # New-SelfSignedCertificate, its parameters are always plainly exportable
        # on .NET Framework, which is what lets the PKCS#1 PEM below be written
        # without openssl. The cert is built around this key with
        # CertificateRequest, so no certificate store is touched at all.
        $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048

        $req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest(
            "CN=$primarySubject",
            $rsa,
            [System.Security.Cryptography.HashAlgorithmName]::SHA256,
            [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)

        $sanBuilder = New-Object System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
        foreach ($n in $sanNames) {
            $asIp = $false
            try { [void][System.Net.IPAddress]::Parse($n); $asIp = $true } catch { $asIp = $false }
            if ($asIp) { $sanBuilder.AddIpAddress([System.Net.IPAddress]::Parse($n)) }
            else       { $sanBuilder.AddDnsName($n) }
        }
        $req.CertificateExtensions.Add($sanBuilder.Build())

        $ekuOids = New-Object System.Security.Cryptography.OidCollection
        [void] $ekuOids.Add((New-Object System.Security.Cryptography.Oid('1.3.6.1.5.5.7.3.1')))   # serverAuth
        $req.CertificateExtensions.Add(
            (New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension($ekuOids, $false)))
        $req.CertificateExtensions.Add(
            (New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension($false, $false, 0, $true)))
        $req.CertificateExtensions.Add(
            (New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension(
                ([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
                 [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment), $true)))

        $genCert = $req.CreateSelfSigned([System.DateTimeOffset]::Now.AddDays(-1), [System.DateTimeOffset]$notAfter)

        # PKCS#1 RSAPrivateKey ::= SEQUENCE { version, n, e, d, p, q, dp, dq, qInv }
        $kp = $rsa.ExportParameters($true)
        $seqBody = New-Object System.Collections.Generic.List[byte]
        $seqBody.AddRange([byte[]](New-DerInteger @([byte] 0)))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.Modulus))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.Exponent))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.D))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.P))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.Q))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.DP))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.DQ))
        $seqBody.AddRange([byte[]](New-DerInteger $kp.InverseQ))
        $keyDer  = [byte[]](New-DerSequence ($seqBody.ToArray()))
        $certDer = $genCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)

        [System.IO.File]::WriteAllText($keyPath,  (Format-Pem 'RSA PRIVATE KEY' $keyDer),  [System.Text.Encoding]::ASCII)
        [System.IO.File]::WriteAllText($certPath, (Format-Pem 'CERTIFICATE'     $certDer), [System.Text.Encoding]::ASCII)

        $rsa.Dispose(); $genCert.Dispose()
    } catch {
        Fail 'Could not generate a self-signed certificate.' `
             @("Error: $($_.Exception.Message)") `
             @('As a fallback, create a PEM certificate + private key by hand,',
               "place them at $certPath and $keyPath, and re-run this script.")
    }

    # Restrict the private key file to the accounts the service runs as.
    try {
        & icacls "$keyPath" /inheritance:r /grant:r 'NT AUTHORITY\SYSTEM:(R)' 'BUILTIN\Administrators:(R)' | Out-Null
    } catch {
        Write-Warn "Could not tighten permissions on $keyPath - review it by hand."
    }

    $SelfSignedGenerated = $true
    Write-Pass 'Self-signed certificate generated'
    Write-Info ("Subject : CN={0}" -f $primarySubject)
    Write-Info ("Names   : {0}" -f ($sanNames -join ', '))
    Write-Info ("Valid   : until {0}  ({1} years)" -f $notAfter.ToString('yyyy-MM-dd'), $CertValidityYears)
    Write-Info ("Cert    : {0}" -f $certPath)
    Write-Info ("Key     : {0}" -f $keyPath)
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Preparing the database'
# ─────────────────────────────────────────────────────────────────────────────

if (Test-Path -LiteralPath $DbPath) {
    $sizeMb = [Math]::Round((Get-Item -LiteralPath $DbPath).Length / 1MB, 2)
    Write-Pass "Existing database found ($sizeMb MB) - left untouched"
    Write-Info 'This is an update, not a first install. Live data is never overwritten.'
} else {
    if (-not (Test-Path -LiteralPath $SeedDb)) {
        Fail "The starter database install\seed.db is missing from the package." `
             @("Expected at: $SeedDb") `
             @('Re-copy the full package folder to this server and try again.')
    }
    $dbDir = Split-Path -Parent $DbPath
    if (-not (Test-Path -LiteralPath $dbDir)) {
        New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
        Write-Info "Created folder $dbDir"
    }
    Copy-Item -LiteralPath $SeedDb -Destination $DbPath -Force
    Write-Pass "Starter database installed at $DbPath"
    Write-Info 'It contains the reviewed factory, product and quality-rule setup,'
    Write-Info 'and no inspection records. Include this file in the backup job.'
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Installing dependencies (this takes several minutes)'
# ─────────────────────────────────────────────────────────────────────────────

# Build tools are required here, not just runtime libraries: the web interface is
# compiled on this machine a few steps below, so `npm ci --omit=dev` would remove
# the very packages the build needs. One consequence is that the test runner's
# dependencies come along too — including Playwright, which by default downloads
# several hundred MB of browsers on install. This server never runs tests, so
# that download is suppressed.
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'

Write-Info 'Running npm ci - downloading exact dependency versions...'
Invoke-Checked -Exe 'npm' -Arguments @('ci') -WorkingDir $AppRoot -What 'npm ci'
Write-Pass 'Dependencies installed'

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Generating the database client'
# ─────────────────────────────────────────────────────────────────────────────

# Run from backend\ so the Prisma CLI picks up prisma.config.ts and backend\.env.
# Only the client is generated: the schema already matches the shipped starter
# database, so no migration is applied and no schema change is attempted.
Invoke-Checked -Exe 'npx' -Arguments @('prisma', 'generate') -WorkingDir $BackendDir -What 'prisma generate'
Write-Pass 'Database client generated'

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Building the web interface'
# ─────────────────────────────────────────────────────────────────────────────

Invoke-Checked -Exe 'npm' -Arguments @('run', 'build', '--workspace=frontend') -WorkingDir $AppRoot -What 'frontend build'

$distIndex = Join-Path $AppRoot 'frontend\dist\index.html'
if (-not (Test-Path -LiteralPath $distIndex)) {
    Fail 'The build reported success but produced no output.' `
         @("Expected: $distIndex") `
         @('Scroll up for the build output and re-run the script.')
}
Write-Pass 'Web interface built'

if ($SkipServiceInstall) {
    Write-Host ''
    Write-Host '  Stopping here: -SkipServiceInstall was given.' -ForegroundColor Yellow
    Write-Host '  The application is fully prepared but no service was registered.' -ForegroundColor Yellow
    Write-Host ''
    exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Registering the Windows service'
# ─────────────────────────────────────────────────────────────────────────────

if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# `node --import tsx server.ts` runs the server as ONE process that the service
# manager can supervise directly. Going through npm would put a shell wrapper in
# between, so a stop or a crash-restart would act on the wrapper and could leave
# the real server orphaned and still holding the port.
$appParameters = '--import tsx "{0}"' -f $ServerEntry

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Info "Service '$ServiceName' already exists - stopping it to reconfigure."
    & $NssmPath stop $ServiceName confirm | Out-Null
    Start-Sleep -Seconds 2
    Write-Pass 'Existing service stopped'
} else {
    & $NssmPath install $ServiceName $NodeExe | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "NSSM could not create the service '$ServiceName' (exit $LASTEXITCODE)." }
    Write-Pass "Service '$ServiceName' created"
}

# Applied on both paths so a re-run repairs a hand-edited or partial config.
$settings = @(
    @('Application',      $NodeExe),
    @('AppParameters',    $appParameters),
    @('AppDirectory',     $AppRoot),
    @('DisplayName',      'Quality Inspection (Web) v4.0'),
    @('Description',      'Quality inspection recording and AQL evaluation service.'),
    @('Start',            'SERVICE_AUTO_START'),                 # start on boot
    @('AppStdout',        (Join-Path $LogDir 'service.out.log')),
    @('AppStderr',        (Join-Path $LogDir 'service.err.log')),
    @('AppRotateFiles',   '1'),
    @('AppRotateBytes',   '10485760'),                           # rotate at 10 MB
    @('AppStopMethodSkip','0'),
    @('AppRestartDelay',  '5000'),                               # wait 5s before restart
    @('AppThrottle',      '10000')                               # crash-loop throttle
)
foreach ($s in $settings) {
    & $NssmPath set $ServiceName $s[0] $s[1] | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "NSSM could not set '$($s[0])' on service '$ServiceName'." }
}

# Restart the process whenever it exits for any reason.
& $NssmPath set $ServiceName AppExit Default Restart | Out-Null

Write-Pass 'Service configured: starts on boot, restarts automatically if it stops'
Write-Info "Logs: $LogDir"

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Starting the service'
# ─────────────────────────────────────────────────────────────────────────────

& $NssmPath start $ServiceName | Out-Null
Start-Sleep -Seconds 5

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    $status = 'not installed'
    if ($svc) { $status = $svc.Status }
    $errLog = Join-Path $LogDir 'service.err.log'
    $detail = @("Service status: $status")
    if (Test-Path -LiteralPath $errLog) {
        $detail += ''
        $detail += 'Last lines of the error log:'
        foreach ($line in (Get-Content -LiteralPath $errLog -Tail 15 -ErrorAction SilentlyContinue)) {
            $detail += "  $line"
        }
    }
    Fail 'The service did not start.' $detail `
         @("Full log: $errLog",
           'The most common causes are an unreadable certificate or key file,',
           'and another program already using port ' + $Port + '.')
}
Write-Pass "Service is running"

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Verifying the application responds'
# ─────────────────────────────────────────────────────────────────────────────

# The service presents a self-signed certificate (or one the operator supplied),
# which this PowerShell session has no reason to trust. Certificate validation is
# bypassed FOR THIS HEALTH CHECK ONLY - the question here is "is the service
# answering", not "is the chain trusted". Browsers still validate normally, which
# is why staff see the one-time warning until the cert is trusted on their PCs.
Add-Type -TypeDefinition @'
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class QiInstallCertPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) {
        return true;
    }
}
'@ -ErrorAction SilentlyContinue

$originalPolicy = [System.Net.ServicePointManager]::CertificatePolicy
[System.Net.ServicePointManager]::CertificatePolicy = New-Object QiInstallCertPolicy
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$healthUrl = "https://localhost:$Port/api/health"
$healthy = $false
$lastError = ''

foreach ($attempt in 1..10) {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            Write-Pass "Health check passed: $healthUrl"
            Write-Info $response.Content
            break
        }
    } catch {
        $lastError = $_.Exception.Message
        Write-Info "Attempt $attempt of 10 - not answering yet, waiting..."
        Start-Sleep -Seconds 3
    }
}

[System.Net.ServicePointManager]::CertificatePolicy = $originalPolicy

if (-not $healthy) {
    $errLog = Join-Path $LogDir 'service.err.log'
    Fail 'The service is running but is not answering requests.' `
         @("Tried: $healthUrl", "Last error: $lastError") `
         @("Check $errLog for the reason.",
           'Confirm the certificate and key files are readable by the service account.',
           "Confirm nothing else is using port $Port.")
}

# ─────────────────────────────────────────────────────────────────────────────
$hostName = $env:COMPUTERNAME
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host '   INSTALLATION COMPLETE' -ForegroundColor Green
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host '   The application is running and will start automatically' -ForegroundColor White
Write-Host '   whenever this server reboots.' -ForegroundColor White
Write-Host ''
Write-Host '   Staff open the app at:' -ForegroundColor White
Write-Host "     https://$hostName`:$Port" -ForegroundColor Cyan
Write-Host ''
if ($SelfSignedGenerated) {
    Write-Host '   The certificate is self-signed, so the FIRST visit from each' -ForegroundColor White
    Write-Host '   browser shows a "Not secure" warning - staff click Advanced,' -ForegroundColor White
    Write-Host '   then Continue. This is expected. IT can suppress it by trusting' -ForegroundColor White
    Write-Host "     $certPath" -ForegroundColor Cyan
    Write-Host '   on staff machines (Trusted Root store, e.g. via Group Policy).' -ForegroundColor White
    Write-Host ''
}
Write-Host '   ONE STEP REMAINS, and Microsoft sign-in will fail without it:' -ForegroundColor Yellow
Write-Host '   that exact address must be registered as a Redirect URI in the' -ForegroundColor Yellow
Write-Host '   Entra ID App Registration. Ask IT to add it.' -ForegroundColor Yellow
Write-Host '   The app shows the precise value it will use under' -ForegroundColor Yellow
Write-Host '   System > Environment > Redirect URI.' -ForegroundColor Yellow
Write-Host ''
Write-Host '   Managing the service:' -ForegroundColor White
Write-Host "     Restart   :  nssm restart $ServiceName" -ForegroundColor Gray
Write-Host "     Stop      :  nssm stop $ServiceName" -ForegroundColor Gray
Write-Host "     Status    :  nssm status $ServiceName" -ForegroundColor Gray
Write-Host "     Logs      :  $LogDir" -ForegroundColor Gray
Write-Host ''
Write-Host '   Back up this file - it holds all inspection data:' -ForegroundColor White
Write-Host "     $DbPath" -ForegroundColor Cyan
Write-Host ''
