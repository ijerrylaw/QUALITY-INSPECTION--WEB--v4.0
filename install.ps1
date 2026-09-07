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
      3. Verifies the TLS certificate and key exist where .env points.
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
      * A TLS certificate and private key, in PEM format, issued by the company
        certificate authority. THIS SCRIPT DOES NOT CREATE A CERTIFICATE. IT is
        responsible for supplying the .pem files and for making sure the issuing
        CA is trusted on every machine that will open the app. HTTPS is not
        optional here: Microsoft Entra ID refuses non-HTTPS sign-in redirects
        for anything other than localhost.
      * Outbound internet access, for `npm ci` to fetch dependencies.

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
        '# Network interface to listen on. 0.0.0.0 means all interfaces.',
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
        '# TLS certificate and private key, PEM format, supplied by IT from the',
        '# company certificate authority. This installer does NOT create these.',
        '# The certificate must cover every hostname and IP address staff will use',
        '# to reach this server, and the issuing CA must be trusted on their PCs.',
        '# Example:',
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
    Write-Host '     TLS_KEY_PATH            the private key file, from IT' -ForegroundColor White
    Write-Host '     TLS_CERT_PATH           the certificate file, from IT' -ForegroundColor White
    Write-Host '     WIPE_ENDPOINT_PASSWORD  a password you choose' -ForegroundColor White
    Write-Host ''
    Write-Host '     HOST / PORT / NODE_ENV  already set to sensible defaults' -ForegroundColor Gray
    Write-Host ''
    Write-Host '   The certificate and key are NOT created by this installer.' -ForegroundColor Yellow
    Write-Host '   Ask IT for a certificate from the company CA that covers the' -ForegroundColor Yellow
    Write-Host '   names staff will use to reach this server.' -ForegroundColor Yellow
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

$tlsMissing = @()
if (-not (Test-Path -LiteralPath $keyPath))  { $tlsMissing += "private key  : $keyPath" }
if (-not (Test-Path -LiteralPath $certPath)) { $tlsMissing += "certificate  : $certPath" }

if ($tlsMissing.Count -gt 0) {
    Fail 'The TLS certificate files were not found.' `
         ($tlsMissing + @('', 'This installer does not create a certificate, by design.',
                          'A self-signed certificate would make every browser show a',
                          'security warning, and Entra ID sign-in would not work.')) `
         @('Ask IT for a certificate and private key in PEM format, issued by the',
           'company certificate authority, covering every hostname and IP address',
           'staff will use to reach this server.',
           'Copy both files onto this machine.',
           "Set TLS_KEY_PATH and TLS_CERT_PATH in $EnvFile to point at them.",
           'Run .\install.ps1 again.')
}
Write-Pass "Private key : $keyPath"
Write-Pass "Certificate : $certPath"
Write-Info 'Not validated further here - the service start below is the real test.'

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

# The certificate is issued by the internal CA, which this PowerShell session has
# no reason to trust yet. Certificate validation is bypassed FOR THIS HEALTH
# CHECK ONLY - the point here is "is the service answering", not "is the chain
# trusted". Browsers still validate normally, which is why the CA has to be
# trusted on the client machines.
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
