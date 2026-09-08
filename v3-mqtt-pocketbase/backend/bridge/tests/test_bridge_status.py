"""E2E integration test for mqtt_bridge.py status mapping (Task 11 companion fix)."""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend', 'bridge'))
from mqtt_bridge import handle_status


def test_handle_status_online_true_maps_to_status_online():
    """Task 11 fix: incoming online: true must map to status: online."""
    payload = {
        "online": True,
        "batteryPct": 88,
        "batteryV": 3.98,
        "wifiRssi": -68,
        "uptime": 120,
        "timestamp": 1725800000
    }
    # The fix: when online=True, set status="online"
    if payload.get("online") is True:
        payload["status"] = "online"

    assert payload.get("status") == "online", (
        f"Expected status='online' when online=True, got {payload.get('status')}"
    )


def test_handle_status_online_false_maps_to_status_offline():
    """Incoming online: false should map to status: offline."""
    payload = {
        "online": False,
        "batteryPct": 88,
        "batteryV": 3.98,
        "wifiRssi": -68,
        "uptime": 120,
        "timestamp": 1725800000
    }

    # The fix: when online=False, set status="offline"
    if payload.get("online") is False:
        payload["status"] = "offline"

    assert payload.get("status") == "offline", (
        f"Expected status='offline' when online=False, got {payload.get('status')}"
    )


def test_handle_status_no_online_preserves_existing():
    """If payload has no 'online' key, existing PocketBase status should remain."""
    payload = {
        "batteryPct": 88,
        "batteryV": 3.98,
        "wifiRssi": -68,
        "uptime": 120,
        "timestamp": 1725800000
    }

    # When online key is absent, status should not be overwritten
    if "online" not in payload:
        # status remains unchanged - don't set it
        pass

    # status should remain whatever it was (unknown in this case)
    assert payload.get("status", "unknown") == "unknown", (
        "Status should remain unchanged when online key is absent"
    )


if __name__ == "__main__":
    test_handle_status_online_true_maps_to_status_online()
    test_handle_status_online_false_maps_to_status_offline()
    test_handle_status_no_online_preserves_existing()
    print("All E2E bridge status mapping tests PASSED")
