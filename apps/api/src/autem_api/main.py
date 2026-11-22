import hmac
from collections.abc import Awaitable, Callable
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from autem_api.api.v1.router import api_router
from autem_api.config import get_api_settings
from autem_api.domain.errors import (
    DomainError,
    build_error_payload,
    humanize_exception_message,
)
from autem_api.services.cost_service import DailyCostLimitError
from autem_api.services.scene_service import SceneNotFoundError
from autem_core.logging import configure_logging, get_logger

logger = get_logger("autem_api.errors")


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        title, detail, default_hint = humanize_exception_message(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=exc.code,
                title=exc.title or title,
                detail=detail,
                hint=exc.hint or default_hint,
                action_url=exc.action_url,
                action_label=exc.action_label,
            ),
        )

    @app.exception_handler(SceneNotFoundError)
    async def handle_scene_not_found(_request: Request, exc: SceneNotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=build_error_payload(
                code="SCENE_NOT_FOUND",
                title="Escena 3D no encontrada",
                detail=str(exc) or "La escena o el modelo 3D solicitado no está disponible.",
                hint="Importa un archivo GLB/OBJ/STL o selecciona otra escena guardada.",
            ),
        )

    @app.exception_handler(DailyCostLimitError)
    async def handle_cost_limit(_request: Request, exc: DailyCostLimitError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            content=build_error_payload(
                code="COST_PROTECTION_ACTIVE",
                title="Protección de modo gratuito activa",
                detail=str(exc),
                hint=(
                    "Selecciona un motor local gratuito o ajusta tus "
                    "preferencias en Configuración."
                ),
                action_url="/settings",
                action_label="Abrir Configuración",
            ),
        )

    @app.exception_handler(ValueError)
    async def handle_value_error(_request: Request, exc: ValueError) -> JSONResponse:
        title, detail, hint = humanize_exception_message(str(exc))
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=build_error_payload(
                code="INVALID_INPUT",
                title=title,
                detail=detail,
                hint=hint,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        loc = " · ".join(str(part) for part in first.get("loc", []) if part != "body")
        field_info = f" ({loc})" if loc else ""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=build_error_payload(
                code="VALIDATION_ERROR",
                title="Revisa los datos enviados",
                detail=(
                    f"Uno de los campos enviados{field_info} está incompleto "
                    "o tiene un formato no válido."
                ),
                hint="Verifica los parámetros del formulario e inténtalo de nuevo.",
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_request: Request, exc: HTTPException) -> JSONResponse:
        raw_detail = exc.detail if isinstance(exc.detail, str) else "Solicitud no válida."
        title, detail, hint = humanize_exception_message(raw_detail)
        action_url = "/settings" if exc.status_code in (402, 503) else None
        action_label = "Ir a Configuración" if action_url else None
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=f"HTTP_{exc.status_code}",
                title=title,
                detail=detail,
                hint=hint,
                action_url=action_url,
                action_label=action_label,
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("api.unhandled_error", path=str(request.url.path), error=str(exc))
        title, detail, hint = humanize_exception_message(str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=build_error_payload(
                code="INTERNAL_SERVER_ERROR",
                title=title,
                detail=detail,
                hint=hint,
            ),
        )


def create_app() -> FastAPI:
    repo_root = Path(__file__).resolve().parents[4]
    load_dotenv(repo_root / ".env", override=False)
    load_dotenv(override=False)

    settings = get_api_settings()
    configure_logging(settings.autem_log_level)

    app = FastAPI(
        title="Autem Render API",
        version="0.1.0",
        description="API para render arquitectónico, imagen a 3D y video con IA multi-proveedor.",
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "*.localhost", "testserver"],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def optional_access_token_guard(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        expected = get_api_settings().autem_access_token.strip()
        if (
            expected
            and request.method != "OPTIONS"
            and request.url.path.startswith("/api/v1/")
            and not request.url.path.startswith("/api/v1/health")
            and not request.url.path.startswith("/api/v1/share/")
        ):
            auth_header = request.headers.get("authorization", "")
            token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
            if not token or not hmac.compare_digest(token, expected):
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content=build_error_payload(
                        code="UNAUTHORIZED",
                        title="Token de acceso requerido",
                        detail="Configura Authorization: Bearer <AUTEM_ACCESS_TOKEN>.",
                    ),
                )
        return await call_next(request)

    _register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
