from typing import Any


class DomainError(Exception):
    """Base error for domain rules with user-friendly Spanish metadata."""

    status_code: int = 400
    code: str = "DOMAIN_ERROR"
    title: str = "No se pudo completar la acción"
    hint: str | None = None
    action_url: str | None = None
    action_label: str | None = None

    def __init__(
        self,
        detail: str,
        *,
        title: str | None = None,
        hint: str | None = None,
        code: str | None = None,
        status_code: int | None = None,
        action_url: str | None = None,
        action_label: str | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        if title is not None:
            self.title = title
        if hint is not None:
            self.hint = hint
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        if action_url is not None:
            self.action_url = action_url
        if action_label is not None:
            self.action_label = action_label


class JobNotFoundError(DomainError):
    """Raised when a job ID does not exist."""

    status_code = 404
    code = "JOB_NOT_FOUND"
    title = "Proyecto o generación no encontrada"
    hint = (
        "Es posible que el trabajo haya expirado o sido eliminado. "
        "Intenta crear una nueva generación."
    )


class ProviderUnavailableError(DomainError):
    """Raised when no requested provider is available."""

    status_code = 503
    code = "PROVIDER_UNAVAILABLE"
    title = "Ningún motor de generación está activo"
    hint = "Inicia tu servidor local (ComfyUI) o activa una clave de proveedor en Configuración."
    action_url = "/settings"
    action_label = "Configurar motor"


def humanize_exception_message(raw_message: str) -> tuple[str, str, str | None]:
    """
    Convert raw technical exception text into a pleasant Spanish (title, detail, hint) tuple.
    """
    msg = (raw_message or "").strip()
    lower = msg.lower()

    if "no hay ningún provider" in lower or "ningún provider" in lower or "fal_key" in lower:
        return (
            "Motor de IA pendiente de activar",
            (
                "Aún no hay un motor local encendido ni una clave cloud "
                "conectada para procesar esta solicitud."
            ),
            "Puedes iniciar ComfyUI en tu equipo o conectar un proveedor desde Configuración.",
        )

    if "debes subir al menos una imagen" in lower or "se requiere al menos una imagen" in lower:
        return (
            "Falta la imagen de entrada",
            "Selecciona o arrastra una imagen arquitectónica (PNG, JPEG o WebP) antes de comenzar.",
            "Puedes subir desde 1 hasta 4 vistas del mismo proyecto.",
        )

    if "límite diario" in lower or "modo solo gratis" in lower or "presupuesto" in lower:
        return (
            "Protección de modo gratuito activa",
            msg,
            "Usa un motor local gratuito o ajusta tus preferencias en Configuración.",
        )

    if "401" in lower or "403" in lower or "unauthorized" in lower or "forbidden" in lower:
        return (
            "Credencial no autorizada por el proveedor",
            "El proveedor externo rechazó la clave configurada o la sesión expiró.",
            "Revisa tu clave en Configuración y pulsa «Probar conexión» para verificarla.",
        )

    if "429" in lower or "rate limit" in lower or "quota" in lower or "insufficient" in lower:
        return (
            "Proveedor temporalmente saturado o sin saldo",
            "El servicio externo alcanzó su límite de peticiones o créditos disponibles.",
            "Espera unos segundos o selecciona otro motor disponible.",
        )

    if (
        "connecterror" in lower
        or "connection refused" in lower
        or "puerto cerrado" in lower
        or "timed out" in lower
        or "timeout" in lower
    ):
        return (
            "Motor local en espera",
            "No recibimos respuesta del servidor de generación en el puerto configurado.",
            (
                "Si usas un motor local (como ComfyUI u Ollama), "
                "asegúrate de que esté abierto y en ejecución."
            ),
        )

    if "formato no soportado" in lower:
        return (
            "Formato de archivo incompatible",
            msg,
            (
                "Formatos admitidos: PNG, JPEG, WebP para imágenes "
                "y GLB, GLTF, OBJ, STL para mallas 3D."
            ),
        )

    if "no encontrado" in lower or "not found" in lower:
        return (
            "Recurso no disponible",
            msg if msg else "El archivo o proyecto solicitado ya no se encuentra disponible.",
            "Vuelve a subir el archivo o selecciona otro proyecto del historial.",
        )

    clean_detail = (
        msg
        if msg and not any(tok in lower for tok in ("traceback", "errno", "object at 0x"))
        else "Ocurrió un inconveniente inesperado al procesar la solicitud en el servidor."
    )
    return (
        "No pudimos completar la operación",
        clean_detail,
        "Intenta nuevamente o verifica el estado de tus motores en Configuración.",
    )


def build_error_payload(
    *,
    code: str,
    title: str,
    detail: str,
    hint: str | None = None,
    action_url: str | None = None,
    action_label: str | None = None,
) -> dict[str, Any]:
    """Standard error payload returned by the backend API."""
    return {
        "detail": detail,
        "error": {
            "code": code,
            "title": title,
            "detail": detail,
            "hint": hint,
            "action_url": action_url,
            "action_label": action_label,
        },
    }
