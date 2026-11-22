# Política de Seguridad — Autem Render

## Modelo de uso (local, sin inicio de sesión)

Autem Render está diseñado como una **herramienta personal de escritorio/local** (similar a ComfyUI o Automatic1111):

- Por defecto, el servidor escucha **únicamente en `127.0.0.1:8000`** y aplica `TrustedHostMiddleware` para prevenir ataques de *DNS rebinding*.
- **No expongas el puerto `8000` a internet ni a redes públicas** sin configurar `AUTEM_ACCESS_TOKEN` en `.env`.
- Si utilizas un túnel (Cloudflare Tunnel, ngrok) o un servidor GPU remoto (RunPod, Vast.ai), define un token largo y aleatorio en `AUTEM_ACCESS_TOKEN` para exigir `Authorization: Bearer <token>` en toda la API.

## Protecciones integradas

- Las subidas de archivos se leen por tramos con límite de tamaño y validan el contenido binario real (Pillow `Image.verify()` para imágenes y cabecera `glTF` para `.glb`).
- Las escrituras en `.env` rechazan saltos de línea y caracteres de control.
- Las URLs de motores locales (`COMFYUI_URL`, `OLLAMA_URL`) solo permiten `http`/`https` sobre `localhost` o IPs privadas.
- El control de presupuesto (`DAILY_COST_LIMIT_USD` y `AUTEM_FREE_ONLY_MODE`) se valida **antes de cada provider dentro del bucle de fallback**.

## Reportar vulnerabilidades

Abre un issue privado o contacta al mantenedor del repositorio en GitHub.
