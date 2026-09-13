"""Typed clients for the Wise Platform API."""

from .generated import *
from .client import AsyncWiseClient, WiseClient
from .generated.environment import WiseClientEnvironment as WiseEnvironment
from .generated.core.api_error import ApiError

__version__ = "0.1.0"
