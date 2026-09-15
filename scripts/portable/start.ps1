$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComposeFile = Join-Path $ProjectRoot "compose.yaml"

$AppUrl = "http://localhost:8080"
$HealthUrl = "$AppUrl/api/health"
$MaxAttempts = 30
$WaitSeconds = 2

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

Write-Host "Démarrage de JobTracker..."

docker compose `
    -f $ComposeFile `
    up -d --build

if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Le démarrage des conteneurs JobTracker a échoué."
}

Write-Host -NoNewline "Attente de JobTracker"

for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    try {
        Invoke-WebRequest `
            -Uri $HealthUrl `
            -Method Get `
            -TimeoutSec 2 `
            -UseBasicParsing `
            | Out-Null

        Write-Host ""
        Write-Host "JobTracker est prêt : $AppUrl"

        Start-Process $AppUrl

        exit 0
    }
    catch {
        Write-Host -NoNewline "."
        Start-Sleep -Seconds $WaitSeconds
    }
}

Write-Host ""

docker compose `
    -f $ComposeFile `
    ps

Stop-WithError "JobTracker n'est pas devenu disponible après $($MaxAttempts * $WaitSeconds) secondes."
