import json
import re

path = '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/firebase-adminsdk.json'

with open(path, 'r') as f:
    content = f.read()

match = re.search(r'"private_key":\s*"(.*?)"\s*', content, re.DOTALL)
if match:
    pk_raw = match.group(1)
    # Remove literal newlines and actual newlines
    pk_clean = pk_raw.replace('\n', '').replace('\r', '')
    
    if '-----BEGIN PRIVATE KEY-----' in pk_clean and '-----END PRIVATE KEY-----' in pk_clean:
        header = '-----BEGIN PRIVATE KEY-----'
        footer = '-----END PRIVATE KEY-----'
        base64_blob = pk_clean.split(header)[1].split(footer)[0]
        # Remove all \n escape sequences AND SPACES
        base64_blob = base64_blob.replace('\\n', '').replace(' ', '')
        
        wrapped = []
        for i in range(0, len(base64_blob), 64):
            wrapped.append(base64_blob[i:i+64])
        
        final_pk = header + '\n' + '\n'.join(wrapped) + '\n' + footer + '\n'
        
        # Load the whole JSON to preserve everything correctly
        # We need to make the JSON valid first if it's currently broken.
        # But fix_json_v2 should have made it valid.
        try:
            data = json.loads(content)
        except:
            # Fallback if v2 failed to make it valid
            data = {}
            for key in ["type", "project_id", "private_key_id", "client_email", "client_id", "auth_uri", "token_uri", "auth_provider_x509_cert_url", "client_x509_cert_url", "universe_domain"]:
                m = re.search(f'"{key}":\s*"(.*?)"', content)
                if m: data[key] = m.group(1)
        
        data["private_key"] = final_pk
        
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        print("Successfully repaired (v3) and validated JSON")
    else:
        print("Markers not found")
else:
    print("No match")
