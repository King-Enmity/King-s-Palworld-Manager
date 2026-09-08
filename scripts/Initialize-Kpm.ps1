[CmdletBinding()]
param(
    [string]$ProjectPath = 'D:\KingsPalworldManager',
    [string]$Repository = 'https://github.com/King-Enmity/King-s-Palworld-Manager.git',
    [string]$Branch = 'feat/v1-foundation'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$results = [System.Collections.Generic.List[string]]::new()
$details = [System.Collections.Generic.List[string]]::new()
$exitCode = 0

function Add-Result([string]$Message) {
    $results.Add($Message)
}

function Add-Detail([string]$Message) {
    $details.Add($Message)
}

try {
    foreach ($command in @('git', 'docker')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Required command '$command' was not found in PATH."
        }
    }

    if (-not (Test-Path 'D:\')) {
        throw 'Drive D: was not found.'
    }

    if (-not (Test-Path $ProjectPath)) {
        New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
        Add-Result "OK  Created project directory: $ProjectPath"
    }

    $gitDirectory = Join-Path $ProjectPath '.git'

    if (-not (Test-Path $gitDirectory)) {
        $existingItems = @(Get-ChildItem -LiteralPath $ProjectPath -Force)
        if ($existingItems.Count -gt 0) {
            throw "Project path exists and is not empty, but is not a Git repository: $ProjectPath"
        }

        Push-Location $ProjectPath
        try {
            $cloneOutput = git clone $Repository . 2>&1
            $cloneOutput | ForEach-Object { Add-Detail "git clone: $_" }
            if ($LASTEXITCODE -ne 0) {
                throw 'Repository clone failed.'
            }
        }
        finally {
            Pop-Location
        }

        Add-Result "OK  Repository cloned into: $ProjectPath"
    }
    else {
        Add-Result 'OK  Git repository already present; clone skipped.'
    }

    Push-Location $ProjectPath
    try {
        $fetchOutput = git fetch --all --prune 2>&1
        $fetchOutput | ForEach-Object { Add-Detail "git fetch: $_" }
        if ($LASTEXITCODE -ne 0) {
            throw 'Git fetch failed.'
        }

        $checkoutOutput = git checkout $Branch 2>&1
        $checkoutOutput | ForEach-Object { Add-Detail "git checkout: $_" }
        if ($LASTEXITCODE -ne 0) {
            throw "Could not check out branch: $Branch"
        }

        $pullOutput = git pull --ff-only 2>&1
        $pullOutput | ForEach-Object { Add-Detail "git pull: $_" }
        if ($LASTEXITCODE -ne 0) {
            throw 'Git pull failed.'
        }

        Add-Result "OK  Branch: $(git branch --show-current)"

        $requiredFiles = @(
            'README.md',
            'Dockerfile',
            'compose.yaml',
            'compose.dev.yaml',
            'docs\architecture.md',
            'docs\development.md',
            'docs\save-management.md'
        )

        foreach ($file in $requiredFiles) {
            if (-not (Test-Path $file)) {
                throw "Expected repository file missing: $file"
            }
        }
        Add-Result 'OK  Repository structure verified'

        $dockerVersion = docker version --format '{{.Server.Version}}' 2>&1
        if ($LASTEXITCODE -ne 0 -or -not $dockerVersion) {
            throw 'Docker is installed but the Docker engine is not reachable.'
        }
        Add-Result "OK  Docker Engine: $dockerVersion"
    }
    finally {
        Pop-Location
    }
}
catch {
    Add-Result "ERROR  $($_.Exception.Message)"
    $exitCode = 1
}

Write-Host ''
Write-Host '========== KPM BOOTSTRAP RESULTS ==========' -ForegroundColor Cyan
$results | ForEach-Object { Write-Host $_ }

if ($details.Count -gt 0) {
    Write-Host ''
    Write-Host '------------- COMMAND DETAILS -------------' -ForegroundColor DarkCyan
    $details | ForEach-Object { Write-Host $_ }
}

Write-Host '===========================================' -ForegroundColor Cyan

exit $exitCode
