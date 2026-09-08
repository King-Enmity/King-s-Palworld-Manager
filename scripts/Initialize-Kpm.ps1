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

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)]
        [scriptblock]$Command,

        [Parameter(Mandatory)]
        [string]$Label
    )

    $oldErrorActionPreference = $ErrorActionPreference
    $nativePreferenceExists = $null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)
    if ($nativePreferenceExists) {
        $oldNativePreference = $PSNativeCommandUseErrorActionPreference
    }

    try {
        # Git and Docker legitimately write progress/status messages to stderr.
        # Treat their exit codes as authoritative rather than turning stderr into
        # a terminating PowerShell error when the caller has EAP=Stop.
        $ErrorActionPreference = 'Continue'
        if ($nativePreferenceExists) {
            $PSNativeCommandUseErrorActionPreference = $false
        }

        $output = & $Command 2>&1
        $nativeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldErrorActionPreference
        if ($nativePreferenceExists) {
            $PSNativeCommandUseErrorActionPreference = $oldNativePreference
        }
    }

    foreach ($line in @($output)) {
        Add-Detail "${Label}: $line"
    }

    return [pscustomobject]@{
        ExitCode = $nativeExitCode
        Output   = @($output)
    }
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
            $clone = Invoke-NativeCommand -Label 'git clone' -Command { git clone $Repository . }
            if ($clone.ExitCode -ne 0) {
                throw "Repository clone failed with exit code $($clone.ExitCode)."
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
        $fetch = Invoke-NativeCommand -Label 'git fetch' -Command { git fetch --all --prune }
        if ($fetch.ExitCode -ne 0) {
            throw "Git fetch failed with exit code $($fetch.ExitCode)."
        }

        $checkout = Invoke-NativeCommand -Label 'git checkout' -Command { git checkout $Branch }
        if ($checkout.ExitCode -ne 0) {
            throw "Could not check out branch '$Branch' (exit code $($checkout.ExitCode))."
        }

        $pull = Invoke-NativeCommand -Label 'git pull' -Command { git pull --ff-only }
        if ($pull.ExitCode -ne 0) {
            throw "Git pull failed with exit code $($pull.ExitCode)."
        }

        $branchResult = Invoke-NativeCommand -Label 'git branch' -Command { git branch --show-current }
        if ($branchResult.ExitCode -ne 0) {
            throw 'Could not determine the active Git branch.'
        }
        $activeBranch = ($branchResult.Output | Select-Object -First 1).ToString().Trim()
        Add-Result "OK  Branch: $activeBranch"

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

        $docker = Invoke-NativeCommand -Label 'docker version' -Command { docker version --format '{{.Server.Version}}' }
        if ($docker.ExitCode -ne 0 -or $docker.Output.Count -eq 0) {
            throw 'Docker is installed but the Docker engine is not reachable.'
        }
        $dockerVersion = ($docker.Output | Select-Object -First 1).ToString().Trim()
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
