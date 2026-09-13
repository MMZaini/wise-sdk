"""Opt-in sandbox reads. Output contains counts, never profile details or tokens."""
import json
import os
import sys
from wise_sdk import WiseClient, WiseEnvironment

if not os.getenv("WISE_ACCESS_TOKEN"):
    raise SystemExit("Set WISE_ACCESS_TOKEN to a sandbox token")


def run():
    with WiseClient(environment=WiseEnvironment.SANDBOX, max_retries=0, timeout=20) as client:
        profiles = client.profiles.list()
        if not profiles or profiles[0].id is None:
            raise ValueError("No sandbox profile is available")
        balances = client.balances.list(profile_id=profiles[0].id, types="STANDARD,SAVINGS")
    return {"language": "python", "profiles": len(profiles), "balances": len(balances), "result": "passed"}


try:
    print(json.dumps(run()))
except Exception as error:
    print(json.dumps({"language": "python", "result": "failed", "status": getattr(error, "status_code", None), "errorType": type(error).__name__}))
    sys.exit(1)
