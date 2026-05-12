import sys, io, paramiko, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = "193.112.70.157"
USER = "ubuntu"
PEM_PATH = r"D:\edge默认下载\shangjian.pem"

pkey = paramiko.RSAKey.from_private_key_file(PEM_PATH)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, pkey=pkey, timeout=30)
print("SSH connected.")

NS = "kg-platform"

def run(cmd, label="", timeout=60):
    print(f"\n--- {label} ---")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    safe = out.encode('ascii', errors='replace').decode('ascii')
    print(safe)
    if err:
        safe_err = err.encode('ascii', errors='replace').decode('ascii')
        print("STDERR:", safe_err)
    return out.strip()

# ========== 1. Upload all changed files via SFTP ==========
sftp = ssh.open_sftp()

# Create patch directories
run("sudo mkdir -p /tmp/patch/backend/app/api /tmp/patch/backend/app/models /tmp/patch/backend/app/schemas /tmp/patch/backend/app/services /tmp/patch/backend/app/core /tmp/patch/ai_service/app/core /tmp/patch/ai_service/app/services /tmp/patch/frontend/src /tmp/patch/frontend/src/components/graph", "mkdir dirs")
run("sudo chown -R ubuntu:ubuntu /tmp/patch", "chown dirs")

backend_files = {
    "D:/X/ai_service/app/core/config.py": "/tmp/patch/ai_service/app/core/config.py",
    "D:/X/ai_service/app/services/graph.py": "/tmp/patch/ai_service/app/services/graph.py",
    "D:/X/ai_service/app/services/llm.py": "/tmp/patch/ai_service/app/services/llm.py",
    "D:/X/ai_service/app/services/query.py": "/tmp/patch/ai_service/app/services/query.py",
    "D:/X/ai_service/app/services/rebuild_index.py": "/tmp/patch/ai_service/app/services/rebuild_index.py",
    "D:/X/ai_service/app/services/vector.py": "/tmp/patch/ai_service/app/services/vector.py",
    "D:/X/backend/app/api/admin.py": "/tmp/patch/backend/app/api/admin.py",
    "D:/X/backend/app/api/documents.py": "/tmp/patch/backend/app/api/documents.py",
    "D:/X/backend/app/api/graph.py": "/tmp/patch/backend/app/api/graph.py",
    "D:/X/backend/app/core/deps.py": "/tmp/patch/backend/app/core/deps.py",
    "D:/X/backend/app/main.py": "/tmp/patch/backend/app/main.py",
    "D:/X/backend/app/models/models.py": "/tmp/patch/backend/app/models/models.py",
    "D:/X/backend/app/schemas/document.py": "/tmp/patch/backend/app/schemas/document.py",
    "D:/X/backend/app/services/ai_client.py": "/tmp/patch/backend/app/services/ai_client.py",
    "D:/X/backend/app/services/storage.py": "/tmp/patch/backend/app/services/storage.py",
    "D:/X/frontend/src/app/admin/documents/page.tsx": "/tmp/patch/frontend/src/app/admin/documents/page.tsx",
    "D:/X/frontend/src/app/equipment/page.tsx": "/tmp/patch/frontend/src/app/equipment/page.tsx",
    "D:/X/frontend/src/app/graph/page.tsx": "/tmp/patch/frontend/src/app/graph/page.tsx",
    "D:/X/frontend/src/app/workbench/page.tsx": "/tmp/patch/frontend/src/app/workbench/page.tsx",
    "D:/X/frontend/src/app/globals.css": "/tmp/patch/frontend/src/app/globals.css",
    "D:/X/frontend/src/app/layout.tsx": "/tmp/patch/frontend/src/app/layout.tsx",
    "D:/X/frontend/src/components/ProcessingChamber.tsx": "/tmp/patch/frontend/src/components/ProcessingChamber.tsx",
    "D:/X/frontend/src/components/UploadPanel.tsx": "/tmp/patch/frontend/src/components/UploadPanel.tsx",
    "D:/X/frontend/src/components/DocList.tsx": "/tmp/patch/frontend/src/components/DocList.tsx",
    "D:/X/frontend/src/components/ToastBar.tsx": "/tmp/patch/frontend/src/components/ToastBar.tsx",
    "D:/X/frontend/src/components/graph/MiniGraph.tsx": "/tmp/patch/frontend/src/components/graph/MiniGraph.tsx",
    "D:/X/frontend/src/components/forum/MentionHighlight.tsx": "/tmp/patch/frontend/src/components/forum/MentionHighlight.tsx",
    "D:/X/frontend/src/components/graph/SmartNodeLink.tsx": "/tmp/patch/frontend/src/components/graph/SmartNodeLink.tsx",
    "D:/X/frontend/src/components/query/QueryPanel.tsx": "/tmp/patch/frontend/src/components/query/QueryPanel.tsx",
    "D:/X/frontend/src/components/team/ChatMentionInput.tsx": "/tmp/patch/frontend/src/components/team/ChatMentionInput.tsx",
    "D:/X/frontend/src/components/team/ChatMessage.tsx": "/tmp/patch/frontend/src/components/team/ChatMessage.tsx",
    "D:/X/frontend/src/components/workbench/DetailDrawer.tsx": "/tmp/patch/frontend/src/components/workbench/DetailDrawer.tsx",
    "D:/X/frontend/src/lib/api.ts": "/tmp/patch/frontend/src/lib/api.ts",
}

# Ensure all remote subdirectories exist
remote_dirs = set()
for remote in backend_files.values():
    d = remote.rsplit("/", 1)[0]
    remote_dirs.add(d)
for d in sorted(remote_dirs):
    run("sudo mkdir -p " + d, "mkdir " + d)
    run("sudo chown ubuntu:ubuntu " + d, "chown " + d)

for local, remote in backend_files.items():
    print("  Uploading " + local)
    sftp.put(local, remote)

sftp.close()
print("\nUpload done.")

# ========== 2. Copy into backend pod ==========
stdin, stdout, stderr = ssh.exec_command(
    "sudo kubectl get pods -n " + NS + " -l app=backend -o jsonpath='{.items[0].metadata.name}'",
    timeout=30)
backend_pod = stdout.read().decode().strip()
print("\nBackend pod: " + backend_pod)

# Copy backend files
run("sudo kubectl cp /tmp/patch/backend/app/api/admin.py " + NS + "/" + backend_pod + ":/app/app/api/admin.py -c backend", "cp admin.py")
run("sudo kubectl cp /tmp/patch/backend/app/api/documents.py " + NS + "/" + backend_pod + ":/app/app/api/documents.py -c backend", "cp documents.py")
run("sudo kubectl cp /tmp/patch/backend/app/api/graph.py " + NS + "/" + backend_pod + ":/app/app/api/graph.py -c backend", "cp graph.py")
run("sudo kubectl cp /tmp/patch/backend/app/core/deps.py " + NS + "/" + backend_pod + ":/app/app/core/deps.py -c backend", "cp deps.py")
run("sudo kubectl cp /tmp/patch/backend/app/main.py " + NS + "/" + backend_pod + ":/app/app/main.py -c backend", "cp main.py")
run("sudo kubectl cp /tmp/patch/backend/app/models/models.py " + NS + "/" + backend_pod + ":/app/app/models/models.py -c backend", "cp models.py")
run("sudo kubectl cp /tmp/patch/backend/app/schemas/document.py " + NS + "/" + backend_pod + ":/app/app/schemas/document.py -c backend", "cp document.py")
run("sudo kubectl cp /tmp/patch/backend/app/services/ai_client.py " + NS + "/" + backend_pod + ":/app/app/services/ai_client.py -c backend", "cp ai_client.py")
run("sudo kubectl cp /tmp/patch/backend/app/services/storage.py " + NS + "/" + backend_pod + ":/app/app/services/storage.py -c backend", "cp storage.py")

# Copy AI service files
run("sudo kubectl cp /tmp/patch/ai_service/app/core/config.py " + NS + "/" + backend_pod + ":/app/app/core/config.py -c ai-service", "cp ai config.py")
run("sudo kubectl cp /tmp/patch/ai_service/app/services/graph.py " + NS + "/" + backend_pod + ":/app/app/services/graph.py -c ai-service", "cp ai graph.py")
run("sudo kubectl cp /tmp/patch/ai_service/app/services/llm.py " + NS + "/" + backend_pod + ":/app/app/services/llm.py -c ai-service", "cp ai llm.py")
run("sudo kubectl cp /tmp/patch/ai_service/app/services/query.py " + NS + "/" + backend_pod + ":/app/app/services/query.py -c ai-service", "cp ai query.py")
run("sudo kubectl cp /tmp/patch/ai_service/app/services/rebuild_index.py " + NS + "/" + backend_pod + ":/app/app/services/rebuild_index.py -c ai-service", "cp ai rebuild_index.py")
run("sudo kubectl cp /tmp/patch/ai_service/app/services/vector.py " + NS + "/" + backend_pod + ":/app/app/services/vector.py -c ai-service", "cp ai vector.py")

# Verify
run("sudo kubectl exec " + backend_pod + " -n " + NS + " -c backend -- grep -c pending_review /app/app/api/documents.py", "verify backend")
run("sudo kubectl exec " + backend_pod + " -n " + NS + " -c ai-service -- grep -c temperature /app/app/services/llm.py", "verify ai-service")

# Restart
run("sudo kubectl rollout restart deployment backend -n " + NS, "restart backend")
run("sudo kubectl rollout restart deployment ai-service -n " + NS, "restart ai-service")
run("sudo kubectl rollout status deployment backend -n " + NS + " --timeout=90s", "wait backend")
run("sudo kubectl rollout status deployment ai-service -n " + NS + " --timeout=90s", "wait ai-service")

# ========== 3. Frontend ==========
frontend_files = [
    ("/tmp/patch/frontend/src/lib/api.ts", "/opt/kg-platform/frontend/src/lib/api.ts"),
    ("/tmp/patch/frontend/src/app/globals.css", "/opt/kg-platform/frontend/src/app/globals.css"),
    ("/tmp/patch/frontend/src/app/layout.tsx", "/opt/kg-platform/frontend/src/app/layout.tsx"),
    ("/tmp/patch/frontend/src/components/UploadPanel.tsx", "/opt/kg-platform/frontend/src/components/UploadPanel.tsx"),
    ("/tmp/patch/frontend/src/components/ProcessingChamber.tsx", "/opt/kg-platform/frontend/src/components/ProcessingChamber.tsx"),
    ("/tmp/patch/frontend/src/app/admin/documents/page.tsx", "/opt/kg-platform/frontend/src/app/admin/documents/page.tsx"),
    ("/tmp/patch/frontend/src/components/graph/MiniGraph.tsx", "/opt/kg-platform/frontend/src/components/graph/MiniGraph.tsx"),
    ("/tmp/patch/frontend/src/components/ToastBar.tsx", "/opt/kg-platform/frontend/src/components/ToastBar.tsx"),
    ("/tmp/patch/frontend/src/components/DocList.tsx", "/opt/kg-platform/frontend/src/components/DocList.tsx"),
    ("/tmp/patch/frontend/src/app/equipment/page.tsx", "/opt/kg-platform/frontend/src/app/equipment/page.tsx"),
    ("/tmp/patch/frontend/src/app/graph/page.tsx", "/opt/kg-platform/frontend/src/app/graph/page.tsx"),
    ("/tmp/patch/frontend/src/app/workbench/page.tsx", "/opt/kg-platform/frontend/src/app/workbench/page.tsx"),
    ("/tmp/patch/frontend/src/components/forum/MentionHighlight.tsx", "/opt/kg-platform/frontend/src/components/forum/MentionHighlight.tsx"),
    ("/tmp/patch/frontend/src/components/graph/SmartNodeLink.tsx", "/opt/kg-platform/frontend/src/components/graph/SmartNodeLink.tsx"),
    ("/tmp/patch/frontend/src/components/query/QueryPanel.tsx", "/opt/kg-platform/frontend/src/components/query/QueryPanel.tsx"),
    ("/tmp/patch/frontend/src/components/team/ChatMentionInput.tsx", "/opt/kg-platform/frontend/src/components/team/ChatMentionInput.tsx"),
    ("/tmp/patch/frontend/src/components/team/ChatMessage.tsx", "/opt/kg-platform/frontend/src/components/team/ChatMessage.tsx"),
    ("/tmp/patch/frontend/src/components/workbench/DetailDrawer.tsx", "/opt/kg-platform/frontend/src/components/workbench/DetailDrawer.tsx"),
]

for src, dest in frontend_files:
    run("sudo cp " + src + " " + dest, "cp " + dest.split("/")[-1])

run("grep -c visible_teams /opt/kg-platform/frontend/src/lib/api.ts", "verify api.ts")
run("grep -c visibleTeams /opt/kg-platform/frontend/src/components/UploadPanel.tsx", "verify UploadPanel")
run("grep -c adminApproveDocument /opt/kg-platform/frontend/src/app/admin/documents/page.tsx", "verify admin docs")

# Build frontend (use explicit tag matching k8s deployment image name)
run("cd /opt/kg-platform && sudo docker build -t kg_frontend:latest -f Dockerfile.frontend . 2>&1 || true", "build frontend", timeout=360)

# Export to containerd
run("sudo docker save kg_frontend:latest | sudo k3s ctr images import -", "import to containerd", timeout=60)

# Restart frontend deployment
run("sudo kubectl rollout restart deployment frontend -n " + NS, "restart frontend")

time.sleep(20)

run("sudo kubectl get pods -n " + NS, "all pods")
ssh.close()
print("\n=== Deployment complete ===")
