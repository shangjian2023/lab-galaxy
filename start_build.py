import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pkey = paramiko.RSAKey.from_private_key_file(r"D:\edge默认下载\shangjian.pem")
ssh.connect("193.112.70.157", username="ubuntu", pkey=pkey, timeout=30)

# Build script that stops infra, builds one at a time, then starts everything
script = r"""#!/bin/bash
cd /home/ubuntu/kg-platform-new
LOG=/tmp/deploy6.log
echo "=== Build started $(date) ===" > $LOG

echo "[1/5] Stopping infra to free RAM..." >> $LOG
sudo docker stop kg_postgres kg_neo4j kg_redis kg_minio 2>/dev/null >> $LOG 2>&1
sleep 3

echo "[2/5] Building backend..." >> $LOG
sudo docker build -f Dockerfile.backend --tag kg_backend:latest . >> $LOG 2>&1
echo "  backend exit: $?" >> $LOG

echo "[3/5] Building ai_service..." >> $LOG
sudo docker build -f Dockerfile.ai_service --tag kg_ai_service:latest . >> $LOG 2>&1
echo "  ai_service exit: $?" >> $LOG

echo "[4/5] Building frontend..." >> $LOG
sudo docker build -f Dockerfile.frontend --build-arg NEXT_PUBLIC_API_URL=https://graph.mazhuoran.cloud/api/v1 --tag kg_frontend:latest . >> $LOG 2>&1
echo "  frontend exit: $?" >> $LOG

echo "[5/5] Starting all services..." >> $LOG
sudo docker-compose -f docker-compose.prod.yml up -d >> $LOG 2>&1
echo "  up exit: $?" >> $LOG

echo "=== Build finished $(date) ===" >> $LOG
"""

# Write script
sftp = ssh.open_sftp()
with sftp.file("/home/ubuntu/build2.sh", "w") as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("chmod +x /home/ubuntu/build2.sh && echo ok", timeout=5)
print("Script uploaded:", stdout.read().decode().strip())

# Start detached
transport = ssh.get_transport()
channel = transport.open_session()
channel.get_pty()
channel.exec_command("cd /home/ubuntu && sudo nohup bash build2.sh > /dev/null 2>&1 &")
import time
time.sleep(3)
channel.close()
print("Build started. Check: tail -f /tmp/deploy6.log")

# Quick verify
stdin, stdout, stderr = ssh.exec_command("sleep 5 && head -10 /tmp/deploy6.log 2>/dev/null", timeout=10)
out = stdout.read().decode()
print("Log:", out if out else "empty yet - building...")

ssh.close()
