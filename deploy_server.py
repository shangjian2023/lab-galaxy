import paramiko
import secrets
import string

HOST = "193.112.70.157"
USER = "ubuntu"
PEM_PATH = r"D:\edge默认下载\shangjian.pem"
DOMAIN = "graph.mazhuoran.cloud"

def gen_pw(length=16):
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

# Load PEM key
print("=== Loading key ===")
pkey = paramiko.RSAKey.from_private_key_file(PEM_PATH)

# Connect
print("=== Connecting ===")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, pkey=pkey, timeout=30)
print("Connected.")

# Upload tar.gz
print("=== Uploading kg.tar.gz (810KB) ===")
sftp = ssh.open_sftp()
sftp.put("D:/X/kg_upload.tar.gz", "/home/ubuntu/kg.tar.gz", callback=lambda x, y: print(f"\rUploaded {x}/{y} bytes", end=""))
sftp.close()
print("\nUpload done.")

# Write .env on server
print("=== Writing .env ===")
env_content = f"""DOMAIN={DOMAIN}
POSTGRES_PASSWORD={gen_pw(20)}
NEO4J_PASSWORD={gen_pw(20)}
MINIO_ACCESS_KEY={gen_pw(16)}
MINIO_SECRET_KEY={gen_pw(16)}
SECRET_KEY={gen_pw(64)}
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-218abd12b8fe4e749384bc05568dd424
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
LOG_LEVEL=INFO
"""

cmd = f"""mkdir -p /opt/kg-platform && cd /opt/kg-platform && tar xzf /home/ubuntu/kg.tar.gz && cat > /opt/kg-platform/.env << 'ENVEOF'
{env_content}
ENVEOF"""
stdin, stdout, stderr = ssh.exec_command(f"sudo bash -c '{cmd}'")
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("STDERR:", err)

# Install Docker if needed
print("=== Checking Docker ===")
stdin, stdout, stderr = ssh.exec_command("which docker")
docker_installed = stdout.read().decode().strip()
if not docker_installed:
    print("Installing Docker...")
    stdin, stdout, stderr = ssh.exec_command("curl -fsSL https://get.docker.com | sudo sh 2>&1")
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out[-500:] if len(out) > 500 else out)
    if err:
        print("STDERR:", err[-500:] if len(err) > 500 else err)
else:
    print(f"Docker found: {docker_installed}")

# Run docker compose
print("=== Starting services (this will take several minutes) ===")
stdin, stdout, stderr = ssh.exec_command(
    "cd /opt/kg-platform && sudo docker compose -f docker-compose.prod.yml up -d --build 2>&1",
    timeout=600
)
out = stdout.read().decode()
err = stderr.read().decode()
if out:
    print(out)
if err:
    print("STDERR:", err)

ssh.close()
print("=== Done ===")
print(f"Visit: https://{DOMAIN}")
