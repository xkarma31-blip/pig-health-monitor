import requests
import json

API_KEY = "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc"
EMAIL = "admin@farm.local"
PASSWORD = "357631"

url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "returnSecureToken": True
}

response = requests.post(url, json=payload)
if response.status_code == 200:
    data = response.json()
    print(f"UID: {data['localId']}")
    print(f"ID Token: {data['idToken']}")
else:
    print(f"Failed to login: {response.text}")
