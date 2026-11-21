# Arranca FastAPI (:8000) y Next.js (:3000) juntos en Windows
$ErrorActionPreference = "Stop"

Write-Host "Iniciando Autem Render API en http://localhost:8000 ..." -ForegroundColor Cyan
$api = Start-Process -FilePath "uv" -ArgumentList "run", "uvicorn", "autem_api.main:app", "--reload", "--port", "8000" -PassThru -NoNewWindow

Write-Host "Iniciando Autem Render Web en http://localhost:3000 ..." -ForegroundColor Cyan
try {
    pnpm --dir apps/web dev
} finally {
    if ($api -and !$api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
}
