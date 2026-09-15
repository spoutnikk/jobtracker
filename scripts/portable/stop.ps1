$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComposeFile = Join-Path $ProjectRoot "compose.yaml"

function Stop-WithError {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Error $Message
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Stop-WithError "Docker est introuvable. Installez ou démarrez Docker Desktop."
}

try {
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose indisponible."
    }
}
catch {
    Stop-WithError "Docker Compose est indisponible."
}

try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker indisponible."
    }
}
catch {
    Stop-WithError "Docker Desktop n'est pas démarré ou n'est pas accessible."
}

Write-Host "Arrêt de JobTracker..."

docker compose `
    -f $ComposeFile `
    down

if ($LASTEXITCODE -ne 0) {
    Stop-WithError "L'arrêt des conteneurs JobTracker a échoué."
}

Write-Host "JobTracker est arrêté. Les données ont été conservées."
