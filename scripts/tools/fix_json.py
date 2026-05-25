#!/usr/bin/env python3
"""
Fix malformed private_key in Firebase admin SDK JSON.
Usage: python fix_json.py [path/to/firebase-adminsdk.json]
"""

import json
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/firebase-adminsdk.json'

with open(path, 'r') as f:
    content = f.read()

match = re.search(r'"private_key":\s*"(.*?)"\s*', content, re.DOTALL)
if match:
    pk_raw = match.group(1)
    pk_clean = pk_raw.replace('\n', '').replace('\r', '')

    if '-----BEGIN PRIVATE KEY-----' in pk_clean and '-----END PRIVATE KEY-----' in pk_clean:
        header = '-----BEGIN PRIVATE KEY-----'
        footer = '-----END PRIVATE KEY-----'
        base64_blob = pk_clean.split(header)[1].split(footer)[0]
        base64_blob = base64_blob.replace('\\n', '').replace(' ', '')

        wrapped = [base64_blob[i:i+64] for i in range(0, len(base64_blob), 64)]
        final_pk = header + '\n' + '\n'.join(wrapped) + '\n' + footer + '\n'

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            data = {}
            for key in ["type", "project_id", "private_key_id", "client_email", "client_id", "auth_uri", "token_uri", "auth_provider_x509_cert_url", "client_x509_cert_url", "universe_domain"]:
                m = re.search(f'"{key}":\s*"(.*?)"', content)
                if m:
                    data[key] = m.group(1)

        data["private_key"] = final_pk

        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        print("Successfully repaired private_key in", path)
    else:
        print("Could not identify BEGIN/END markers")
else:
    print("Could not find private_key in JSON")
