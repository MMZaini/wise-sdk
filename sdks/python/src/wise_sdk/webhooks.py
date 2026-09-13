"""Webhook verification and explicit SCA challenge detection."""
import base64
import binascii
from .generated.core.api_error import ApiError


def verify_webhook_signature(*, body: bytes, signature: str | None, public_key: str | bytes) -> bool:
    """Verify X-Signature-SHA256 using the original request bytes. Requires wise-sdk[webhooks]."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    if not isinstance(body, bytes):
        raise TypeError("Provide the original webhook body bytes")
    if not signature:
        return False
    try:
        decoded = base64.b64decode(signature, validate=True)
    except (binascii.Error, ValueError):
        return False
    key = serialization.load_pem_public_key(public_key.encode() if isinstance(public_key, str) else public_key)
    if not isinstance(key, rsa.RSAPublicKey):
        raise TypeError("Wise webhook verification requires an RSA public key")
    try:
        key.verify(decoded, body, padding.PKCS1v15(), hashes.SHA256())
        return True
    except InvalidSignature:
        return False


def get_sca_challenge(error: Exception) -> str | None:
    """Return the one-time token only for an explicit, rejected SCA challenge."""
    if not isinstance(error, ApiError) or error.status_code != 403:
        return None
    headers = {key.lower(): value for key, value in (error.headers or {}).items()}
    return (headers.get("x-2fa-approval") or None) if headers.get("x-2fa-approval-result") == "REJECTED" else None
