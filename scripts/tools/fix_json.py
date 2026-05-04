import json
import re

path = '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/firebase-adminsdk.json'

with open(path, 'r') as f:
    content = f.read()

# Try to extract the private key content between the quotes
match = re.search(r'"private_key":\s*"(.*?)"\s*,', content, re.DOTALL)
if match:
    pk_raw = match.group(1)
    # Remove literal newlines
    pk_clean = pk_raw.replace('\n', '')
    # The string already contains \n sequences. Let's make sure they are preserved.
    # The error "Unparsed DER bytes remain" often means the base64 content is slightly wrong.
    
    # Let's try to reconstruct the PEM structure properly.
    # We want: -----BEGIN PRIVATE KEY-----\n[BASE64]\n-----END PRIVATE KEY-----\n
    
    parts = pk_clean.split('-----')
    # parts[0] is empty, parts[1] is BEGIN ..., parts[2] is the base64, parts[3] is END ..., parts[4] is empty
    header = '-----' + parts[1] + '-----'
    footer = '-----' + parts[3] + '-----'
    base64_blob = parts[2]
    
    # Remove all \n from base64_blob
    base64_blob = base64_blob.replace('\\n', '')
    
    # Re-wrap base64_blob every 64 chars
    wrapped = []
    for i in range(0, len(base64_blob), 64):
        wrapped.append(base64_blob[i:i+64])
    
    final_pk = header + '\\n' + '\\n'.join(wrapped) + '\\n' + footer + '\\n'
    
    # Update the content
    new_content = re.sub(r'"private_key":\s*"(.*?)"\s*,', f'"private_key": "{final_pk}",', content, flags=re.DOTALL)
    
    with open(path, 'w') as f:
        f.write(new_content)
    print("Successfully repaired private_key")
else:
    print("Could not find private_key in JSON")
