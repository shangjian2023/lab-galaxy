#!/usr/bin/env python3
"""Patch local-path-provisioner config to explicitly map node vm-0-12-ubuntu"""
import subprocess
import json

# Build the config.json we want in the configmap
new_config = json.dumps({
    "nodePathMap": [
        {"node": "vm-0-12-ubuntu", "paths": ["/var/lib/rancher/k3s/storage"]}
    ]
})

# Build a JSON patch that replaces the config.json key
patch = json.dumps({
    "data": {
        "config.json": new_config
    }
})

# The full kubectl command to run on the remote server
remote_cmd = f'''sudo kubectl patch configmap local-path-config -n kube-system --type merge -p '{patch}' '''

print("Remote command:")
print(remote_cmd)

# SSH to the server and execute
ssh_cmd = f'ssh -i "/d/edge默认下载/shangjian.pem" ubuntu@193.112.70.157 {json.dumps(remote_cmd)}'
result = subprocess.run(ssh_cmd, shell=True, capture_output=True, text=True)
print("\nSTDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("Return code:", result.returncode)
