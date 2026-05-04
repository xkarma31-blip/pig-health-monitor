import json

path = '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/firebase-adminsdk.json'

with open(path, 'r') as f:
    # Since the JSON is currently broken, we can't use json.load
    content = f.read()

# We'll just manually fix it one more time but correctly this time.
# The goal is to have the private_key as a single string with literal \n escape sequences.

import re
match = re.search(r'"private_key":\s*"(.*?)"\s*,', content, re.DOTALL)
if match:
    pk_raw = match.group(1)
    # Remove all literal newlines and actual newlines
    pk_clean = pk_raw.replace('\n', '').replace('\r', '')
    
    # Now pk_clean has everything. Let's find BEGIN and END.
    if '-----BEGIN PRIVATE KEY-----' in pk_clean and '-----END PRIVATE KEY-----' in pk_clean:
        header = '-----BEGIN PRIVATE KEY-----'
        footer = '-----END PRIVATE KEY-----'
        base64_blob = pk_clean.split(header)[1].split(footer)[0]
        # Remove any literal \n escape sequences that might have been preserved
        base64_blob = base64_blob.replace('\\n', '')
        
        # Now re-construct with proper \n escape sequences
        wrapped = []
        for i in range(0, len(base64_blob), 64):
            wrapped.append(base64_blob[i:i+64])
        
        # We need the literal string '\n' in the JSON file.
        final_pk = header + '\n' + '\n'.join(wrapped) + '\n' + footer + '\n'
        
        # Load the rest of the JSON as a dict if possible, or just fix the string
        # Actually, let's just create a new dict for the whole thing to ensure it's valid JSON.
        
        # Regex to find other fields
        data = {}
        for key in ["type", "project_id", "private_key_id", "client_email", "client_id", "auth_uri", "token_uri", "auth_provider_x509_cert_url", "client_x509_cert_url", "universe_domain"]:
            m = re.search(f'"{key}":\s*"(.*?)"', content)
            if m:
                data[key] = m.group(1)
        
        data["private_key"] = final_pk
        
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        print("Successfully repaired and validated JSON")
    else:
        print("Could not identify BEGIN/END markers")
else:
    print("Could not find private_key match")
