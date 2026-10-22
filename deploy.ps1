<#
.SYNOPSIS
    Publica el Teleprompter en GitHub Pages en un solo paso.

.DESCRIPTION
    1. Mira qué archivos han cambiado.
    2. Si alguno está en la caché del service worker (index.html, style.css,
       app.js, manifest, iconos), sube el número de VERSION de sw.js para que
       los móviles que ya tienen la app instalada reciban la actualización.
    3. Hace commit de todo y lo empuja a origin (GitHub Pages).

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -Message "Arreglo la velocidad del scroll"
    .\deploy.ps1 -NoPush          # solo commit local
    .\deploy.ps1 -NoBump          # no toca la versión del service worker

.NOTES
    Si PowerShell no deja ejecutarlo:
        powershell -ExecutionPolicy Bypass -File .\deploy.ps1
    o
        pwsh -File .\deploy.ps1
#>

[CmdletBinding()]
param(
    [string] $Message = "",
    [switch] $NoPush,
    [switch] $NoBump
)

$ErrorActionPreference = "Stop"

function Info($text) { Write-Host "  -> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "  OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  !  $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  X  $text" -ForegroundColor Red; exit 1 }

# --- Se ejecuta siempre desde la carpeta del script --------------------------
if ($PSScriptRoot) { Set-Location -LiteralPath $PSScriptRoot }

Write-Host ""
Write-Host "  Teleprompter · publicar" -ForegroundColor White
Write-Host "  -----------------------" -ForegroundColor DarkGray

# --- Comprobaciones mínimas ------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "Git no está instalado o no está en el PATH."
}

git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Esta carpeta no es un repositorio git. Crea uno con: git init -b main"
}

$swPath = Join-Path (Get-Location).Path "sw.js"
if (-not (Test-Path -LiteralPath $swPath)) {
    Fail "No encuentro sw.js en esta carpeta."
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
    Fail "No hay remoto 'origin'. Añádelo con: git remote add origin https://github.com/USUARIO/REPO.git"
}

# --- ¿Hay algo que publicar? ----------------------------------------------
$changes = @(git status --porcelain)
if ($changes.Count -eq 0) {
    Info "No hay cambios pendientes. Nada que publicar."
    exit 0
}

Write-Host ""
Write-Host "  Cambios detectados:" -ForegroundColor White
foreach ($line in $changes) { Write-Host "    $line" -ForegroundColor DarkGray }

# --- ¿Hay que subir la versión del service worker? -------------------------
# Solo es necesario si cambia algo que el service worker precachea.
$cachedAssets = @("index.html", "style.css", "app.js", "manifest.webmanifest", "icons/")
$needsBump = $false
foreach ($line in $changes) {
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3)
    foreach ($asset in $cachedAssets) {
        if ($path -like "*$asset*") { $needsBump = $true; break }
    }
    if ($needsBump) { break }
}

$pattern = "const VERSION = '(\d+)\.(\d+)\.(\d+)';"
$raw = [System.IO.File]::ReadAllText($swPath)
$match = [regex]::Match($raw, $pattern)
if (-not $match.Success) {
    Fail "No pude leer 'const VERSION = ''x.y.z'';' en sw.js"
}

$major = [int]$match.Groups[1].Value
$minor = [int]$match.Groups[2].Value
$patch = [int]$match.Groups[3].Value
$oldVersion = "$major.$minor.$patch"
$newVersion = "$major.$minor.$($patch + 1)"

if ($needsBump -and -not $NoBump) {
    $replacement = "const VERSION = '$newVersion';"
    $updated = [regex]::Replace($raw, $pattern, { param($m) $replacement }, 1)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($swPath, $updated, $utf8NoBom)
    Ok "Service worker: $oldVersion -> $newVersion (la caché se renovará)"
}
elseif ($NoBump) {
    Warn "Versión del service worker sin tocar ($oldVersion) por -NoBump."
}
else {
    Info "Ningún archivo cacheado ha cambiado: la versión sigue en $oldVersion."
}

# --- Commit ----------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Message)) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Publicar $stamp"
}

Info "Commit: $Message"
git add -A *> $null
git commit -m $Message *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "El commit falló. Revisa 'git status'."
}
Ok "Commit creado."

# --- Push ------------------------------------------------------------------
if ($NoPush) {
    Warn "No se ha subido nada (-NoPush). Para subirlo: git push origin HEAD"
    exit 0
}

Info "Subiendo a origin..."
git push origin HEAD
if ($LASTEXITCODE -ne 0) {
    Fail "El push falló. El commit está hecho en local; reintenta con: git push origin HEAD"
}
Ok "Subido."

# --- URL de Pages ----------------------------------------------------------
$url = $remote.Trim()
if ($url -match "github\.com[:/](?<user>[^/]+)/(?<repo>[^/.]+)(\.git)?$") {
    $site = "https://$($Matches['user']).github.io/$($Matches['repo'])/"
    Write-Host ""
    Write-Host "  GitHub Pages: $site" -ForegroundColor White
    Write-Host "  (tarda 1-2 minutos en reflejar los cambios)" -ForegroundColor DarkGray
    Write-Host "  Si abres la app desde el móvil y no ves los cambios: ciérrala y" -ForegroundColor DarkGray
    Write-Host "  vuelve a abrirla, para que el service worker nuevo se instale." -ForegroundColor DarkGray
}
else {
    Write-Host ""
    Info "Remoto: $remote"
}

Write-Host ""
