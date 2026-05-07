import requests
import json

API_KEY = "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc"
DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com"
UID = "xgC6Hkq2a6XrNG5emkf5cuyjpiu2"
TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg2OGU0YWNlMGI2NTE2ZDM2YjlmNTZkZThjZTQ5Nzg4ZmNjZGFjNDMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3R1ZGlvLTEyNDg3Nzg2MzMtOTlmNjIiLCJhdWQiOiJzdHVkaW8tMTI0ODc3ODYzMy05OWY2MiIsImF1ZCI6InN0dWRpby0xMjQ4Nzc4NjMzLTk5ZjYyIiwiaWF0IjoxNzc4MTU1MDE3LCJleHAiOjE3NzgxNTg2MTcsInVzZXJfaWQiOiJ4Z0M2SGtxMmE2WHJORzVlbWtmNWN1eWpwaXUyIiwic3ViIjoieGdDNkhrcTJhNlhyTkc1ZW1rZjVjdXlqcGl1MiIsImF1dGhfdGltZSI6MTc3ODE1NTAxNywiZW1haWwiOiJhZG1pbkBmYXJtLmxvY2FsIiwiZW1haWxfdmVyaWZpZWQiOmZhbHNlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbImFkbWluQGZhcm0ubG9jYWwiXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.iozKwsrk9krBtHu7N8pBZ5HT0JQiXgS-Q9XR_gNOtH5ynvrS-FI5VVEbZ_ZR_YoZ7HSacjT3xTwy31qhu2YvsTyHOPPfxOjMdVbe_p5Um4nj-S6u3dp0gxfZIK3ApdGc9rAbIs0PSnT_onwe4ovUK-sgFQfUnBR4-Jo9NO6ACCTjegDa4iMzWV7oO1f6qcAh0wp9wogWIzmUFNanqjpPodGk3kuyhBmo4r1ubQJ0LwihggdWUZG0DVs3kp3cbl8alY2z3O-2_uf-wOMduV9-kbStHhFxAqScV4-GCzVitiS_FjP08V_5dolUnWqALTQVkRk8jj537_BffIuT6nZRbA"

roster_data = {
    "peppa-001": {
        "name": "Peppa",
        "enrolledAt": "2026-05-07T00:00:00Z",
        "lastSeen": "2026-05-07T12:00:00Z",
        "status": "active",
        "temperature": 38.5,
        "tags": ["HEALTHY"],
        "healthStatus": "NORMAL"
    },
    "bacon-a1": {
        "name": "Bacon-A1",
        "enrolledAt": "2026-05-07T00:00:00Z",
        "lastSeen": "2026-05-07T12:00:00Z",
        "status": "active",
        "temperature": 39.1,
        "tags": ["ACTIVE"],
        "healthStatus": "NORMAL"
    },
    "pig-alpha": {
        "name": "Mock Alpha",
        "enrolledAt": "2026-05-07T00:00:00Z",
        "lastSeen": "2026-05-07T12:00:00Z",
        "status": "active",
        "temperature": 38.2,
        "tags": ["MOCK"],
        "healthStatus": "NORMAL"
    },
    "pig-beta": {
        "name": "Mock Beta",
        "enrolledAt": "2026-05-07T00:00:00Z",
        "lastSeen": "2026-05-07T12:00:00Z",
        "status": "active",
        "temperature": 39.8,
        "tags": ["FEVER"],
        "healthStatus": "WARNING"
    }
}

def set_data(path, data):
    url = f"{DATABASE_URL}/{path}.json?auth={TOKEN}"
    response = requests.put(url, json=data)
    if response.status_code == 200:
        print(f"Successfully set data at {path}")
    else:
        print(f"Failed to set data at {path}: {response.text}")

print("Initiating restoration protocol...")
set_data(f"users/{UID}/roster", roster_data)
set_data("roster", roster_data)
print("Protocol complete. Peppa and the mock pigs are restored.")
