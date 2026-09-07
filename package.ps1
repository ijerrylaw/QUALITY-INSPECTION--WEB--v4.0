#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the deployable on-prem package from this repository.

.DESCRIPTION
    Produces a self-contained folder (optionally zipped) that can be copied to a
    customer server and installed with install.ps1.

    THIS SCRIPT NEVER SHIPS. It is pruned from its own output on purpose: the
    exclusion list below names every internal document by filename, so shipping
    it would defeat the point of having one.

    Method: the package is built from `git archive HEAD`, not from the working
    tree. That is a structural guarantee rather than a hopeful filter — a
    working-tree copy (robocopy /MIR, Compress-Archive .\*, tar czf .) sweeps in
    .git/, node_modules/, docs/ and every untracked local file, and one forgotten
    exclude silently ships all of it. `git archive` emits only tracked files at
    HEAD and cannot emit .git/ or anything gitignored at all. The prune list then
    removes tracked files that exist for development but have no place on a
    customer server.

    The build fails loudly if the finished package still contains a forbidden
    path or a forbidden string. Those checks are the actual contract; the prune
    list is just how the package is expected to satisfy them.

.PARAMETER OutputDir
    Directory to build the package into. Defaults to a timestamped folder under
    the system temp directory. Created if missing; must be empty if it exists.

.PARAMETER Zip
    Also produce a .zip alongside the package folder, for transfer to the server.

.PARAMETER AllowDirtyTree
    Permit packaging while the working tree has uncommitted changes. The package
    is built from HEAD either way, so uncommitted edits are NOT included — this
    switch only suppresses the guard that stops you shipping a stale HEAD by
    mistake.

.EXAMPLE
    .\package.ps1 -Zip
#>
[CmdletBinding()]
param(
    [string] $OutputDir = '',
    [switch] $Zip,
    [switch] $AllowDirtyTree
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Console helpers ──────────────────────────────────────────────────────────
$script:StepNo = 0
function Write-Step {
    param([string] $Message)
    $script:StepNo++
    Write-Host ''
    Write-Host ("[{0}] {1}" -f $script:StepNo, $Message) -ForegroundColor Cyan
}
function Write-Pass { param([string] $m) Write-Host "    PASS  $m" -ForegroundColor Green }
function Write-Info { param([string] $m) Write-Host "    ..    $m" -ForegroundColor Gray }
function Write-Warn { param([string] $m) Write-Host "    WARN  $m" -ForegroundColor Yellow }
function Fail {
    param([string] $m)
    Write-Host ''
    Write-Host "    FAIL  $m" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Paths pruned from the archive after extraction.
#
# Everything here is git-TRACKED (untracked and gitignored files never enter a
# git archive in the first place). Grouped by why it is removed, because "why"
# is what tells a future maintainer whether a new file belongs on the list.
# ─────────────────────────────────────────────────────────────────────────────

# Internal documentation. Root *.md is removed wholesale rather than by name, so
# a newly added root document is excluded by default instead of shipping until
# someone remembers to list it. install/README.txt is .txt precisely so it
# survives this rule.
$PruneGlobsRoot = @('*.md')

$PruneDirs = @(
    'archived',                 # superseded predecessor documents
    'docs',                     # real customer production data (.xlsx exports)
    '.github',                  # CI workflow — development infrastructure
    'backend/scripts',          # one-off historical data-backfill scripts
    '.claude', '.cursor', '.windsurf', '.idea', '.vscode'  # editor/assistant state
)

$PruneFiles = @(
    'package.ps1',              # this script — see the header
    'frontend/README.md',       # not covered by the root-only *.md rule
    'backend/dev.db',           # tracked seed DB; the server gets install/seed.db
    'backend/test_api.mjs',     # ad-hoc API test scaffolding
    'backend/test_api.ps1',
    'backend/test_fail.json',
    'backend/test_pass.json'
)

# Test code. The frontend is BUILT ON THE SERVER (see install.ps1), so unlike the
# pre-built-bundle design originally sketched in the manifest, frontend/src must
# ship — which means its tests would too unless removed here.
$PruneTestDirs  = @('__tests__', '__screenshots__', '.vitest-attachments')
$PruneTestFiles = @('*.test.ts', '*.test.tsx', 'vitest.config.ts')

# Removed wherever they appear, at any depth. There is one of these at the repo
# root and one in each workspace; they are git plumbing with no runtime role, and
# the root copy additionally enumerates local editor/assistant state directories.
$PruneAnywhereFiles = @('.gitignore', '.gitattributes')

# Strings that must not appear anywhere in the finished package.
$ForbiddenStrings = @(
    'AI_RULES',
    'Antigravity',
    'Co-Authored-By'
)

# Paths that must not exist in the finished package.
$ForbiddenPaths = @(
    '.git', '.gitignore', 'node_modules',
    'backend/dev.db', 'backend/prod.db',
    'AI_RULES.md', 'CHANGELOG.md', 'AUDIT_REPORT.md',
    'docs', 'archived', 'package.ps1'
)

# Files that must be present, or the package is not installable.
$RequiredPaths = @(
    'install.ps1',
    'install/seed.db',
    'install/README.txt',
    'install/tools/nssm.exe',   # bundled service wrapper (see NssmSha256 below)
    'package.json',
    'package-lock.json',
    'backend/server.ts',
    'backend/package.json',
    'backend/.env.example',
    'backend/prisma/schema.prisma',
    'frontend/package.json',
    'frontend/vite.config.ts',
    'frontend/index.html',
    'frontend/src/main.tsx'
)

# SHA256 the bundled service wrapper must have. Pinned here so a corrupted or
# swapped install/tools/nssm.exe fails the package build, not just the customer
# install (install.ps1 re-checks the same value at install time). Provenance is
# in install/tools/README-nssm.txt.
$NssmExeSha256 = 'EEE9C44C29C2BE011F1F1E43BB8C3FCA888CB81053022EC5A0060035DE16D848'

# Binary extensions skipped by the string scan (Select-String on a SQLite file,
# a font or an .exe is slow and produces meaningless hits). The bundled
# nssm.exe is a public-domain third-party binary and is not scanned for
# forbidden strings; its integrity is covered by the SHA256 pin above instead.
$BinaryExtensions = @(
    '.db', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.zip', '.gz', '.pdf', '.xlsx', '.xls',
    '.exe'
)

Write-Host ''
Write-Host '=============================================================' -ForegroundColor White
Write-Host ' Quality Inspection - deployable package build' -ForegroundColor White
Write-Host '=============================================================' -ForegroundColor White

# ── 1. Preflight ─────────────────────────────────────────────────────────────
Write-Step 'Preflight'

try {
    $null = & git -C $RepoRoot rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'Not a git repository. This script packages from `git archive HEAD`.' }
} catch {
    Fail 'git is not available on PATH. Install Git for Windows and re-run.'
}

$headSha = (& git -C $RepoRoot rev-parse --short HEAD).Trim()
Write-Pass "HEAD is $headSha"

$dirty = & git -C $RepoRoot status --porcelain
if ($dirty) {
    if ($AllowDirtyTree) {
        Write-Warn 'Working tree is dirty. Packaging HEAD anyway; uncommitted changes are NOT included.'
    } else {
        Write-Host ''
        Write-Host '    Uncommitted changes:' -ForegroundColor Yellow
        $dirty | ForEach-Object { Write-Host "      $_" -ForegroundColor Yellow }
        Fail 'Working tree is dirty. Commit first, or re-run with -AllowDirtyTree (HEAD is packaged either way).'
    }
} else {
    Write-Pass 'Working tree is clean'
}

$seedSource = Join-Path $RepoRoot 'backend/prod.db'
if (-not (Test-Path -LiteralPath $seedSource)) {
    Fail "Seed database not found at backend/prod.db. It is gitignored, so it must exist locally to be packaged."
}
Write-Pass 'Seed database backend/prod.db found'

# ── 2. Destination ───────────────────────────────────────────────────────────
Write-Step 'Preparing output directory'

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputDir = Join-Path $env:TEMP "quality-inspection-package-$stamp"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

if (Test-Path -LiteralPath $OutputDir) {
    $existing = Get-ChildItem -LiteralPath $OutputDir -Force
    if ($existing) { Fail "Output directory is not empty: $OutputDir" }
} else {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
Write-Pass "Building into $OutputDir"

# ── 3. Export tracked files ──────────────────────────────────────────────────
Write-Step 'Exporting tracked files from HEAD (git archive)'

$archiveZip = Join-Path $env:TEMP ("qi-archive-{0}.zip" -f ([System.Guid]::NewGuid().ToString('N')))
& git -C $RepoRoot archive --format=zip -o $archiveZip HEAD
if ($LASTEXITCODE -ne 0) { Fail 'git archive failed.' }

Expand-Archive -LiteralPath $archiveZip -DestinationPath $OutputDir -Force
Remove-Item -LiteralPath $archiveZip -Force

$exported = (Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force).Count
Write-Pass "$exported tracked files exported (no .git/, no gitignored files)"

# ── 4. Prune ─────────────────────────────────────────────────────────────────
Write-Step 'Pruning development-only files'

$removed = 0

foreach ($glob in $PruneGlobsRoot) {
    Get-ChildItem -LiteralPath $OutputDir -Filter $glob -File -Force | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
        $removed++
    }
}

foreach ($rel in $PruneDirs) {
    $p = Join-Path $OutputDir $rel
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Recurse -Force
        $removed++
    }
}

foreach ($rel in $PruneFiles) {
    $p = Join-Path $OutputDir $rel
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        $removed++
    }
}

foreach ($fileName in $PruneAnywhereFiles) {
    Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force |
        Where-Object { $_.Name -eq $fileName } |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            $removed++
        }
}

foreach ($dirName in $PruneTestDirs) {
    Get-ChildItem -LiteralPath $OutputDir -Recurse -Directory -Force |
        Where-Object { $_.Name -eq $dirName } |
        ForEach-Object {
            if (Test-Path -LiteralPath $_.FullName) {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force
                $removed++
            }
        }
}

foreach ($pattern in $PruneTestFiles) {
    Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force -Filter $pattern |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            $removed++
        }
}

# Source maps are not produced by the current build config; assert rather than trust.
Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force -Filter '*.map' |
    ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
        $removed++
    }

Write-Pass "$removed development-only paths pruned"

# ── 5. Add installer payload ─────────────────────────────────────────────────
Write-Step 'Adding installer payload'

$installDir = Join-Path $OutputDir 'install'
if (-not (Test-Path -LiteralPath $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# The seed database ships under a neutral name. install.ps1 copies it to the
# runtime DATABASE_URL location on first install only, guarded by an existence
# check so a re-run or an update never overwrites live inspection data.
Copy-Item -LiteralPath $seedSource -Destination (Join-Path $installDir 'seed.db') -Force
$seedMb = [Math]::Round((Get-Item -LiteralPath $seedSource).Length / 1MB, 2)
Write-Pass "install/seed.db added (from backend/prod.db, $seedMb MB)"

$buildInfo = @(
    "Quality Inspection (Web) v4.0",
    "Package built : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),
    "Source commit : $headSha"
)
$buildInfo | Set-Content -LiteralPath (Join-Path $installDir 'BUILD-INFO.txt') -Encoding utf8
Write-Pass 'install/BUILD-INFO.txt written'

# ── 6. Verify: forbidden paths ───────────────────────────────────────────────
Write-Step 'Verifying: forbidden paths absent'

$pathHits = @()
foreach ($rel in $ForbiddenPaths) {
    $p = Join-Path $OutputDir $rel
    if (Test-Path -LiteralPath $p) { $pathHits += $rel }
}
if ($pathHits.Count -gt 0) {
    $pathHits | ForEach-Object { Write-Host "      present: $_" -ForegroundColor Red }
    Fail "$($pathHits.Count) forbidden path(s) found in the package."
}
Write-Pass "$($ForbiddenPaths.Count) forbidden paths confirmed absent"

# ── 7. Verify: forbidden strings ─────────────────────────────────────────────
Write-Step 'Verifying: forbidden strings absent'

$textFiles = Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force |
    Where-Object { $BinaryExtensions -notcontains $_.Extension.ToLower() }

Write-Info "scanning $($textFiles.Count) text files for: $($ForbiddenStrings -join ', ')"

$stringHits = @()
foreach ($file in $textFiles) {
    $match = Select-String -LiteralPath $file.FullName -Pattern $ForbiddenStrings -SimpleMatch -List -ErrorAction SilentlyContinue
    if ($match) {
        $rel = $file.FullName.Substring($OutputDir.Length).TrimStart('\', '/')
        $stringHits += ("{0}:{1}: {2}" -f $rel, $match.LineNumber, $match.Line.Trim())
    }
}
if ($stringHits.Count -gt 0) {
    $stringHits | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
    Fail "$($stringHits.Count) file(s) contain a forbidden string."
}
Write-Pass 'No forbidden strings found'

# ── 8. Verify: required files present ────────────────────────────────────────
Write-Step 'Verifying: required files present'

$missing = @()
foreach ($rel in $RequiredPaths) {
    $p = Join-Path $OutputDir $rel
    if (-not (Test-Path -LiteralPath $p)) { $missing += $rel }
}
if ($missing.Count -gt 0) {
    $missing | ForEach-Object { Write-Host "      missing: $_" -ForegroundColor Red }
    Fail "$($missing.Count) required file(s) missing from the package."
}
Write-Pass "$($RequiredPaths.Count) required files confirmed present"

# ── 9. Verify: bundled nssm.exe checksum ─────────────────────────────────────
Write-Step 'Verifying: bundled nssm.exe checksum'

$nssmInPkg = Join-Path $OutputDir 'install/tools/nssm.exe'
$nssmHash  = (Get-FileHash -Algorithm SHA256 -LiteralPath $nssmInPkg).Hash
if ($nssmHash -ne $NssmExeSha256) {
    Write-Host "      expected $NssmExeSha256" -ForegroundColor Red
    Write-Host "      actual   $nssmHash" -ForegroundColor Red
    Fail 'install/tools/nssm.exe does not match the pinned SHA256 - refusing to package it.'
}
Write-Pass "install/tools/nssm.exe SHA256 matches the pin ($($NssmExeSha256.Substring(0,16))...)"

# ── 10. Zip ──────────────────────────────────────────────────────────────────
$zipPath = ''
if ($Zip) {
    Write-Step 'Creating archive'
    $zipPath = "$OutputDir.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $OutputDir '*') -DestinationPath $zipPath
    $zipMb = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
    Write-Pass "$zipPath ($zipMb MB)"
}

# ── Summary ──────────────────────────────────────────────────────────────────
$finalFiles = (Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force).Count
$finalMb = [Math]::Round(((Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum / 1MB), 2)

Write-Host ''
Write-Host '=============================================================' -ForegroundColor Green
Write-Host ' PACKAGE BUILD OK' -ForegroundColor Green
Write-Host '=============================================================' -ForegroundColor Green
Write-Host "  Source commit : $headSha"
Write-Host "  Folder        : $OutputDir"
if ($Zip) { Write-Host "  Archive       : $zipPath" }
Write-Host "  Contents      : $finalFiles files, $finalMb MB"
Write-Host ''
Write-Host '  Next: copy to the server, then run install.ps1 from an elevated' -ForegroundColor White
Write-Host '        PowerShell prompt. See install/README.txt.' -ForegroundColor White
Write-Host ''
