import json
import pathlib
import ssl
import subprocess
import sys

import httpx
import pytest
from wise_sdk import WiseClient, WiseEnvironment, create_mtls_context


def test_real_mtls_connection():
    root = pathlib.Path(__file__).resolve().parents[3]
    with subprocess.Popen([sys.executable, root / "tests/mtls-server.py"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as server:
        try:
            config = json.loads(server.stdout.readline())
            context = create_mtls_context(cert_path=config["cert"], key_path=config["key"], ca_path=config["ca"])
            assert context.verify_mode == ssl.CERT_REQUIRED
            assert context.check_hostname
            with httpx.Client(verify=context, trust_env=False) as http:
                with WiseClient(access_token="test", environment=WiseEnvironment(api=config["origin"] + "/2026Q3", cards=config["origin"]), httpx_client=http) as client:
                    assert client.profiles.list() == []
            with httpx.Client(verify=ssl.create_default_context(cafile=config["ca"]), trust_env=False) as http:
                with pytest.raises(httpx.TransportError):
                    http.get(config["origin"])
        finally:
            server.stdin.write("stop\n")
            server.stdin.flush()
            server.wait(timeout=10)
