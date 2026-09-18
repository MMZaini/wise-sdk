"""Typed clients for the Wise Platform API."""

from typing import TYPE_CHECKING
from . import generated as _generated

if TYPE_CHECKING:
    from .generated import *
from .client import AsyncWiseClient, WiseClient
from .generated.environment import WiseClientEnvironment as WiseEnvironment
from .generated.core.api_error import ApiError
from .auth import WiseOAuth, AsyncWiseOAuth, OAuthTokens, OAuthError, TokenManager, AsyncTokenManager, create_oauth_state, validate_oauth_state
from .mtls import create_mtls_context
from .webhooks import verify_webhook_signature, get_sca_challenge
from .pagination import PaginationError, iter_recipients, async_iter_recipients, iter_activities, async_iter_activities, iter_transfers, async_iter_transfers

__version__ = "0.2.0"

__all__ = list(dict.fromkeys([*_generated.__all__, "WiseClient", "AsyncWiseClient", "WiseEnvironment", "ApiError",
    "WiseOAuth", "AsyncWiseOAuth", "OAuthTokens", "OAuthError", "TokenManager", "AsyncTokenManager",
    "create_oauth_state", "validate_oauth_state", "create_mtls_context", "verify_webhook_signature", "get_sca_challenge",
    "PaginationError", "iter_recipients", "async_iter_recipients", "iter_activities", "async_iter_activities", "iter_transfers", "async_iter_transfers"]))


def __getattr__(name: str):
    return getattr(_generated, name)


def __dir__():
    return sorted(set(globals()) | set(__all__))
