# Arranca Autem Render en MODO PRODUCCIÓN LOCAL (navegación instantánea < 15ms entre páginas)
$ErrorActionPreference = "Stop"

Write-Host "Compilando frontend optimizado (Next.js)..." -ForegroundColor Cyan
pnpm --dir apps/web build

Write-Host "Iniciando Autem Render API en http://localhost:8000 ..." -ForegroundColor Cyan
$api = Start-Process -FilePath "uv" -ArgumentList "run", "uvicorn", "autem_api.main:app", "--host", "127.0.0.1", "--port", "8000" -PassThru -NoNewWindow

Write-Host "Iniciando Autem Render Web (producción rápida) en http://localhost:3000 ..." -ForegroundColor Green
try {
    pnpm --dir apps/web start
} finally {
    if ($api -and !$api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
}
