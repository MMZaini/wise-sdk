import importlib
import pkgutil

import httpx
import pytest
import wise_sdk.generated
from wise_sdk.generated import WiseClient
from wise_sdk.generated.environment import WiseClientEnvironment
from wise_sdk.generated.core.api_error import ApiError


def test_every_generated_module_imports():
    for module in pkgutil.walk_packages(wise_sdk.generated.__path__, wise_sdk.generated.__name__ + "."):
        importlib.import_module(module.name)


def test_client_can_be_constructed_with_custom_transport():
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[]))) as transport:
        client = WiseClient(environment=WiseClientEnvironment.SANDBOX, access_token="test", httpx_client=transport)
        assert client.profiles.list() == []


def test_empty_error_body_is_not_a_successful_simulation():
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(403))) as transport:
        client = WiseClient(environment=WiseClientEnvironment.SANDBOX, access_token="test", httpx_client=transport)
        with pytest.raises(ApiError) as error:
            client.simulations.change_transfer_state(transfer_id=1, status="processing")
        assert error.value.status_code == 403
