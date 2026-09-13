"""Verified TLS contexts for partner client certificates."""
import ssl


def create_mtls_context(*, cert_path: str, key_path: str, ca_path: str | None = None,
                        password: str | None = None) -> ssl.SSLContext:
    """Pass this context as verify= to an httpx.Client or httpx.AsyncClient."""
    context = ssl.create_default_context(cafile=ca_path)
    context.load_cert_chain(certfile=cert_path, keyfile=key_path, password=password)
    return context
