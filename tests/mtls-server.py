"""Temporary test CA, certificates and a server that requires client authentication."""
import datetime
import http.server
import json
import pathlib
import ssl
import sys
import tempfile
import threading

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID


def certificate(name, issuer, issuer_key, *, ca=False, server=False):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    now = datetime.datetime.now(datetime.timezone.utc)
    builder = x509.CertificateBuilder().subject_name(subject).issuer_name(issuer or subject).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=1)).not_valid_after(now + datetime.timedelta(days=1)).add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    builder = builder.add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
    builder = builder.add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key((issuer_key or key).public_key()), critical=False)
    builder = builder.add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=not ca,
        data_encipherment=False, key_agreement=False, key_cert_sign=ca, crl_sign=ca,
        encipher_only=None, decipher_only=None), critical=True)
    if not ca:
        builder = builder.add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH if server else ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
    if server:
        builder = builder.add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False)
    return key, builder.sign(issuer_key or key, hashes.SHA256())


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        assert self.connection.getpeercert()
        body = b"[]"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory(prefix="wise-mtls-test-") as directory:
    root = pathlib.Path(directory)
    ca_key, ca = certificate("Test CA", None, None, ca=True)
    for name, server in (("server", True), ("client", False)):
        key, cert = certificate("localhost" if server else "Test client", ca.subject, ca_key, server=server)
        (root / f"{name}.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (root / f"{name}.key").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    (root / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(root / "server.pem", root / "server.key")
    context.load_verify_locations(root / "ca.pem")
    context.verify_mode = ssl.CERT_REQUIRED
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(json.dumps({"origin": f"https://localhost:{server.server_port}", "cert": str(root / "client.pem"), "key": str(root / "client.key"), "ca": str(root / "ca.pem")}), flush=True)
    sys.stdin.readline()
    server.shutdown()
    server.server_close()
