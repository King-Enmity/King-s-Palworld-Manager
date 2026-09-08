[CmdletBinding()]
param(
    [string]$ProjectPath = 'D:\KingsPalworldManager',
    [string]$Repository = 'https://github.com/King-Enmity/King-s-Palworld-Manager.git'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$results = [System.Collections.Generic.List[string]]::new()

function Add-Result([string]$Message) {
    $results.Add($Message)
}

try {
    foreach ($command in @('git', 'docker')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Required command '$command' was not found in PATH."
        }
    }

    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    if (-not $dockerVersion) {
        throw 'Docker is installed but the Docker engine is not reachable.'
    }
    Add-Result "Docker engine: $dockerVersion"

    if (-not (Test-Path $ProjectPath)) {
        New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
        Add-Result "Created project directory: $ProjectPath"
    }

    if (-not (Test-Path (Join-Path $ProjectPath '.git'))) {
        if ((Get-ChildItem -LiteralPath $ProjectPath -Force | Measure-Object).Count -gt 0) {
            throw "Project path exists and is not empty: $ProjectPath"
        }
        git clone $Repository $ProjectPath | Out-Null
        Add-Result "Cloned repository: $Repository"
    }
    else {
        Add-Result 'Git repository already present; clone skipped.'
    }

    Set-Location $ProjectPath
    git fetch --all --prune | Out-Null
    git checkout feat/v1-foundation | Out-Null
    git pull --ff-only | Out-Null
    Add-Result "Checked out branch: $(git branch --show-current)"

    if (-not (Test-Path '.env')) {
        Copy-Item '.env.example' '.env'
        Add-Result 'Created .env from .env.example (change all placeholder passwords before starting containers).'
    }
    else {
        Add-Result '.env already exists; existing local settings preserved.'
    }

    $composeCheck = docker compose config --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose config validation failed: $composeCheck"
    }
    Add-Result 'Docker Compose configuration syntax: valid'
}
catch {
    Add-Result "ERROR: $($_.Exception.Message)"
    $script:exitCode = 1
}
finally {
    Write-Host ''
    Write-Host '=== King''s Palworld Manager setup results ===' -ForegroundColor Cyan
    foreach ($result in $results) {
        Write-Host " - $result"
    }
}

if ($script:exitCode) { exit $script:exitCode }
