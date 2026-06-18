#!/usr/bin/env python3
"""Seed script: create 5 users, forum posts, and nudt team discussions.
Run on the server: python3 /tmp/seed_content.py
"""

import json
import time
import urllib.request
import urllib.error
import ssl

ssl._create_default_https_context = ssl._create_unverified_context
BASE = "http://localhost:30080/api/v1"
NUDT_TEAM = "544ea97d-a60c-49f2-9248-86dc681f6a6d"

# ── helpers ──

def api(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:200]
        print(f"  ERR {e.code}: {err}")
        return None
    except Exception as e:
        print(f"  EXC: {e}")
        return None

def register(u):
    r = api("POST", "/users/register", {"username": u["username"], "email": u["email"], "password": u["pw"]})
    print(f"  register {u['username']}: {'ok' if r else 'exists/err'}")
    return r

def login(u):
    r = api("POST", "/users/login", {"username": u["username"], "password": u["pw"]})
    if r and "access_token" in r:
        u["token"] = r["access_token"]
        print(f"  login {u['username']}: ok")
    else:
        print(f"  login {u['username']}: FAIL")
    return r

def invite_to_team(admin_token, username):
    r = api("POST", f"/teams/{NUDT_TEAM}/invite", {"username": username}, admin_token)
    print(f"  invite {username}: {'ok' if r else 'err'}")
    return r

def post_thread(token, data):
    r = api("POST", "/forum/threads", data, token)
    if r and "id" in r:
        print(f"    post ok: {data['title'][:30]}")
    else:
        print(f"    post FAIL: {data['title'][:30]}")
    return r

def post_message(token, content):
    r = api("POST", f"/teams/{NUDT_TEAM}/messages", {"content": content}, token)
    print(f"    msg: {'ok' if r else 'err'} {content[:40]}")
    return r

# ── Document IDs for @mentions ──
DOC_AI   = "b49372ba-c605-4542-9ecf-912541bd2398"  # AI硬件到应用架构
DOC_IOT  = "f6809a83-3e72-4c4b-b718-0d62066f4fa4"  # 小米智能门锁 FreeRTOS
DOC_EDGE = "e7bddbba-73cd-457e-8d45-28fa25be769b"  # 迷你主机智能家居边缘计算
DOC_ROBOT= "870ef2c0-69da-4867-b3f3-3c673ff25ec6"  # ROS2仿生机器狗
DOC_DRONE= "91a14e10-2faf-4b06-98c2-faa6f2875e78"  # 自主竞速无人机
DOC_4LEG = "c3e957dd-d172-4ed7-a4a0-008f3575e44d"  # 四足机械狗PyBullet
DOC_CPU  = "0d2223b7-60bc-44b0-afe9-8e522b5e1d0a"  # CPU功耗建模
DOC_PERF = "2604e486-1bcf-4581-b6c9-a88fab7ca0a0"  # 并行性能多模态
DOC_NLP  = "72664c5d-e1d7-4f9b-937c-d3827758c0d7"  # 甘露寺莫言组技术拆解
DOC_MULTI= "b5c1ac5c-c10e-4474-9fb2-4c0e497dc3ca"  # 多模态智能感知
DOC_OPEN = "18c86a6d-886b-40fd-8763-6668dc06e19f"  # OpenCV无人机
DOC_PWR  = "edf82099-c0a6-46d5-8267-121e5fb53cb8"  # 笔记本功耗控制

# ── Users ──
USERS = [
    {"username": "ai_explorer",    "email": "ai@lab.com",    "pw": "admin123", "nickname": "AI探索者",       "domain": "AI"},
    {"username": "cloud_builder",  "email": "cloud@lab.com",  "pw": "admin123", "nickname": "云原生架构师",   "domain": "Cloud"},
    {"username": "iot_pioneer",    "email": "iot@lab.com",    "pw": "admin123", "nickname": "物联网先锋",     "domain": "IoT"},
    {"username": "cyber_sentinel", "email": "sec@lab.com",    "pw": "admin123", "nickname": "安全分析师",     "domain": "Sec"},
    {"username": "robot_whisperer","email": "bot@lab.com",    "pw": "admin123", "nickname": "自主系统工程师", "domain": "Robot"},
]

# ── Forum posts per user ──
POSTS = {
    "ai_explorer": [
        {"board": "methodology",  "post_type": "insight",  "title": "大模型微调实战：LoRA vs Full Fine-tuning 的工程取舍",
         "tags": ["LLM","微调","LoRA"],
         "content": "在实际项目中对比了 LoRA 和全参微调的效果差异。LoRA 在 7B 模型上用单张 A100 训练 4 小时达到了全参微调 92% 的效果，但推理延迟多了 8ms。\n\n关键发现：LoRA rank 设为 64 时，在领域问答任务上基本追平全参，但在代码生成任务上差距明显（约 15%）。建议：数据量 < 10K 条用 LoRA，> 50K 条且任务复杂时考虑全参。\n\n@[AI 硬件到应用架构的学习与迁移]({DOC_AI}) 这篇文档中的硬件选型思路对微调时的 GPU 调度很有参考价值。"},
        {"board": "emergency_room","post_type": "challenge", "title": "RAG 架构落地踩坑：检索命中但生成乱答",
         "tags": ["RAG","检索增强","排错"],
         "content": "RAG 系统上线后发现一个问题：向量检索召回了正确的文档片段，但 LLM 生成的回答完全不对。\n\n排查路径：1) 检查 prompt 模板 — 发现 context 拼接时 JSON 转义导致格式错乱；2) chunk 大小 512 token 太大，关键信息被稀释；3) 改为 256 token + 50% 重叠后效果显著提升。\n\n另外建议：在 context 中加入 chunk 的来源文档名和段落号，方便 LLM 引用和用户溯源。"},
        {"board": "cross_discipline","post_type": "regular", "title": "多模态大模型的工程化挑战：图文理解的延迟优化",
         "tags": ["多模态","视觉","性能"],
         "content": "部署了一个图文理解模型（7B 参数，支持图片输入），遇到两个工程挑战：\n\n1. 图片预处理是瓶颈：高分辨率图片的 resize + normalize 占了 40% 的端到端延迟，改用 GPU 预处理后从 800ms 降到 200ms。\n2. 多图输入时显存线性增长，3 张 1080p 图片就 OOM。解决方案：对图片做 patch 裁剪 + 动态批处理。\n\n@[多模态智能感知系统]({DOC_MULTI}) 这篇的感知融合思路可以借鉴到多模态推理的输入整合。"},
        {"board": "aha_square",    "post_type": "insight",  "title": "Prompt Engineering 不只是写提示词：结构化思维更重要",
         "tags": ["Prompt","方法论"],
         "content": "观察了很多团队使用 LLM 的方式，发现最大的误区是把 Prompt Engineering 当成'写一句好的提问'。\n\n实际上，有效的 Prompt 是一个系统工程：1) 明确角色和约束（system prompt）；2) 用 few-shot 树立输出格式；3) 分步骤推理（Chain-of-Thought）比直接问效果好 30%+；4) 关键信息放在 prompt 开头和结尾（首因效应+近因效应）。\n\n建议每个团队维护一个 Prompt 模板库，像管理代码一样管理 prompt。"},
        {"board": "methodology",  "post_type": "insight",  "title": "从 GPT-4 到开源 LLM：企业技术选型决策框架",
         "tags": ["选型","开源","成本"],
         "content": "帮三家创业公司做过 LLM 选型，总结出一个决策框架：\n\n成本维度：GPT-4 Turbo ≈ $0.01/1K token，自建 7B 模型月成本 ≈ ¥3000（含 GPU 租赁）。数据量 < 1M token/天时用 API 更划算。\n\n隐私维度：涉及医疗/金融数据必须私有部署。开源方案推荐 Qwen2-72B 或 DeepSeek-V2。\n\n效果维度：通用任务 GPT-4 仍然最强；垂直领域微调后的 7B 模型可以超越 GPT-4（前提是训练数据质量高）。"},
        {"board": "graph_hall",   "post_type": "insight",  "title": "AI Agent 的记忆机制设计：短期、长期与情景记忆",
         "tags": ["Agent","记忆","架构"],
         "content": "设计一个研究助手 Agent 时，把记忆分成了三层：\n\n短期记忆（对话上下文）：滑动窗口 + 摘要压缩，保留最近 10 轮。\n长期记忆（知识库）：向量检索 + 图谱关联，用 RAG 实现。\n情景记忆（任务历史）：每次任务的输入/输出/反思存入数据库，下次遇到类似任务时检索复用。\n\n关键设计：在每次任务结束后，让 Agent 自己写一段'反思'存入情景记忆，比直接存原始结果效果好 40%。\n\n这和本平台的图谱设计理念很像——知识的关联和演化比孤立的记录更有价值。"},
    ],
    "cloud_builder": [
        {"board": "methodology",  "post_type": "insight",  "title": "Kubernetes 故障排查的系统化方法论",
         "tags": ["K8s","运维","方法论"],
         "content": "总结了一套 K8s 故障排查的标准流程：\n\n1. 先看 Pod 状态（kubectl get pods），区分 CrashLoopBackOff / ImagePullBackOff / Pending。\n2. kubectl describe pod 看 Events，80% 的问题在这一步定位。\n3. kubectl logs --previous 看上一个容器的日志（OOM 经常导致重启后日志丢失）。\n4. kubectl exec 进容器检查文件系统和网络连通性。\n5. 最后才看 kubelet 日志和节点状态。\n\n最常见的三个坑：资源 limits 设太低导致 OOM；ConfigMap/Secret 更新后 Pod 没自动重启；LivenessProbe 和 ReadinessProbe 配反。"},
        {"board": "emergency_room","post_type": "challenge", "title": "容器网络不通？一篇搞定 Calico/Flannel CNI 调试",
         "tags": ["网络","CNI","Calico"],
         "content": "上周排查一个 Pod 跨节点通信失败的问题，花了 6 小时，记录下排查路径：\n\n1. 同节点 Pod 互通 → 节点内没问题。\n2. 跨节点不通 → 先检查 iptables/nftables 规则（calico 的规则经常被 firewalld 清掉）。\n3. 发现 calico-node Pod 状态异常 → 看日志发现 BGP peering 失败。\n4. 根因：云服务商的安全组没开 BGP 端口 179。\n\n教训：新建集群时一定先检查云安全组规则，特别是 overlay 网络需要放行的协议和端口。"},
        {"board": "cross_discipline","post_type": "regular", "title": "Service Mesh 的代价：Istio Sidecar 性能开销实测",
         "tags": ["ServiceMesh","Istio","性能"],
         "content": "在一个 50 微服务的项目中测量了 Istio Sidecar 的实际开销：\n\n延迟：P99 延迟增加 3-5ms（主要是 mTLS 握手和策略检查）。\nCPU：每个 sidecar 额外占 50-100m CPU，50 个服务 ≈ 额外 2.5-5 核。\n内存：每个 sidecar 约 60MB，50 个 ≈ 3GB。\n\n结论：对延迟敏感的内部服务（如缓存代理），建议用 traffic.sidecar.istio.io/excludeOutboundPorts 跳过 sidecar。对需要 mTLS 和可观测性的服务，这个开销是值得的。"},
        {"board": "methodology",  "post_type": "insight",  "title": "GitOps 落地一年的血泪总结：ArgoCD 实战经验",
         "tags": ["GitOps","ArgoCD","DevOps"],
         "content": "用 ArgoCD 管理了 12 个集群一年，分享几个教训：\n\n1. ApplicationSet 比手动 Application 管理高效 10 倍，特别是多集群场景。\n2. 一定要用 Kustomize overlays 区分环境（dev/staging/prod），不要用 Helm values 覆盖（太容易出错）。\n3. ArgoCD 的 auto-sync 看起来方便，但在生产环境建议关闭——等 PR review 后手动 sync 更安全。\n4. 最大的坑：Git 仓库权限管理。建议给 ArgoCD 一个只读 deploy key，写操作走 CI/CD pipeline。"},
        {"board": "aha_square",    "post_type": "insight",  "title": "Serverless 在边缘计算场景的真实表现：冷启动是最大敌人",
         "tags": ["Serverless","边缘","Lambda"],
         "content": "在一个 IoT 数据预处理项目中尝试了 Serverless（AWS Lambda@Edge + Cloudflare Workers），结果：\n\n冷启动：Node.js 运行时冷启动 200-500ms，Python 500ms-1.5s。对于实时数据处理场景不可接受。\n\n解决方案：设 reserved concurrency（预热实例），但成本从 $5/月涨到 $50/月。\n\n最终结论：边缘 Serverless 适合事件驱动型任务（如 webhook 处理、数据转发），不适合需要持续连接的场景（如 WebSocket、长轮询）。对于后者，还是用 K3s/KubeEdge 部署常驻 Pod 更靠谱。"},
        {"board": "methodology",  "post_type": "regular", "title": "从单体到微服务：渐进式拆分的三个阶段",
         "tags": ["微服务","架构","迁移"],
         "content": "帮一个 20 人团队从 Django 单体拆分到微服务，总结出三阶段策略：\n\n阶段一（1-2月）：抽出独立的数据访问层，用 API Gateway 统一入口。不动业务逻辑。\n阶段二（3-4月）：按领域边界拆出 3-5 个核心服务（用户、订单、支付）。用事件驱动解耦。\n阶段三（持续）：逐步迁移剩余模块，引入 Service Mesh 管理服务间通信。\n\n核心原则：每次只拆一个服务，验证稳定后再拆下一个。千万别大爆炸式重构——见过太多团队这么干最后项目延期半年。"},
    ],
    "iot_pioneer": [
        {"board": "methodology",  "post_type": "insight",  "title": "树莓派 vs ESP32：嵌入式开发平台选型指南",
         "tags": ["树莓派","ESP32","选型"],
         "content": "根据项目需求选择平台的决策树：\n\n需要运行 Linux / 摄像头 / 复杂计算 → 树莓派 4/5。优点是生态成熟、调试方便；缺点是功耗高（3-5W）、不支持深度睡眠。\n\n需要电池供电 / WiFi+BLE / 简单控制 → ESP32。优点是功耗极低（μA 级睡眠）、成本低（¥15）；缺点是调试困难、内存有限。\n\n需要两者结合 → ESP32 做传感器节点 + 树莓派做网关。这是最常见的工业 IoT 架构。\n\n@[小米智能门锁中 FreeRTOS 的应用]({DOC_IOT}) 这篇文档详细分析了 FreeRTOS 在 ESP32 上的任务调度，非常实用。"},
        {"board": "emergency_room","post_type": "challenge", "title": "MQTT 消息丢失排查全流程：从客户端到 Broker",
         "tags": ["MQTT","消息队列","排错"],
         "content": "生产环境出现 MQTT 消息丢失，排查路径：\n\n1. 检查 QoS 设置 — 发现用的 QoS 0（最多一次），改为 QoS 1（至少一次）。\n2. 仍有丢失 → 检查 Broker（EMQX）日志，发现客户端频繁断连重连。\n3. 根因：网络不稳定导致 TCP 连接中断，QoS 1 的消息在重连时未重发。\n4. 解决：启用 clean_session=false + 持久化订阅，配合 QoS 1。\n5. 额外建议：客户端设置遗嘱消息（LWT），监控设备在线状态。\n\nMQTT 的 QoS 不是万能的，网络层的稳定性才是根本。"},
        {"board": "cross_discipline","post_type": "regular", "title": "边缘 AI 推理：TensorFlow Lite 在 MCU 上的量化实战",
         "tags": ["TFLite","量化","边缘AI"],
         "content": "把一个图像分类模型（MobileNetV2）部署到 ESP32-S3 上的过程：\n\n原始模型 14MB → INT8 量化后 3.5MB → ESP32-S3 推理一次约 800ms。\n\n关键优化：1) 用 TensorFlow Lite Micro 替代完整 TFLite runtime（ROM 从 1.2MB 降到 200KB）。2) 把输入图片从 224x224 降到 128x128，精度损失 < 2%，速度提升 3 倍。3) 利用 ESP32-S3 的向量指令加速卷积。\n\n最终效果：128x128 输入，INT8 量化，单次推理 ~250ms，满足实时分类需求。\n\n@[基于迷你主机的智能家居边缘计算系统]({DOC_EDGE}) 这篇的边缘推理架构值得参考。"},
        {"board": "aha_square",    "post_type": "insight",  "title": "LoRaWAN 在智慧农业中的实际部署经验",
         "tags": ["LoRa","农业","IoT"],
         "content": "在一个智慧农业项目中部署了 50 个 LoRa 传感器节点，覆盖 200 亩农田。经验总结：\n\n1. 天线高度比功率更重要：网关天线架高 15m（用一根竹竿），覆盖半径从 2km 扩到 8km。\n2. 地形影响巨大：丘陵地带要设 3-4 个网关才能全覆盖。\n3. 传感器功耗管理：每 10 分钟采集一次，用 DS3231 闹钟唤醒，电池寿命从 2 周延长到 8 个月。\n4. 数据格式：用 CayenneLPP 编码（比 JSON 省 80% 带宽），但调试时不方便。\n\nLoRa 适合低频、小数据量、远距离的农业场景，不适合视频或高频数据。"},
        {"board": "methodology",  "post_type": "regular", "title": "FreeRTOS 任务调度的五个常见陷阱",
         "tags": ["FreeRTOS","嵌入式","调度"],
         "content": "用 FreeRTOS 开发了 3 个项目，踩过的坑：\n\n1. 优先级反转：低优先级任务持锁，高优先级任务等锁 → 用互斥信号量的优先级继承解决。\n2. 栈溢出：每个任务的栈大小要留 20% 余量，开启 configCHECK_FOR_STACK_OVERFLOW。\n3. 中断中调用 API：必须用 FromISR 后缀的版本，否则硬 fault。\n4. 动态内存分配：heap_4 方案比 heap_1 碎片少，但还是建议尽量静态分配。\n5. 多任务访问外设：用互斥量保护 SPI/I2C 总线，别用全局变量标志位。\n\n@[小米智能门锁中 FreeRTOS 的应用]({DOC_IOT}) 这篇文档的任务设计对理解优先级调度很有帮助。"},
        {"board": "graph_hall",   "post_type": "insight",  "title": "传感器数据融合：卡尔曼滤波的工程实现心得",
         "tags": ["卡尔曼","融合","算法"],
         "content": "用卡尔曼滤波融合 IMU + GPS 数据做定位，工程实现的几个要点：\n\n1. 状态向量设计：[x, y, vx, vy, yaw, yaw_rate]，不要把所有传感器数据都塞进去。\n2. 过程噪声 Q 和观测噪声 R 的调参是核心：Q 太大 → 跟踪太灵敏（噪声大）；Q 太小 → 响应慢。建议用 Allan 方差法从传感器数据标定。\n3. 扩展卡尔曼（EKF）对非线性系统效果有限 → 如果角度变化大，考虑用 UKF 或直接上粒子滤波。\n4. 工程技巧：用对称性约束 P 矩阵（Joseph 形式更新）防止数值发散。"},
    ],
    "cyber_sentinel": [
        {"board": "methodology",  "post_type": "insight",  "title": "零信任架构落地的三个阶段：从理念到实践",
         "tags": ["零信任","安全","架构"],
         "content": "零信任不是买一个产品就能实现的，需要分阶段推进：\n\n阶段一（基础）：网络微分段。用 Calico NetworkPolicy 把集群按命名空间隔离，服务间只开放必要的端口。\n阶段二（核心）：身份验证。每个服务调用必须携带 JWT，API Gateway 做统一鉴权。引入 mTLS 替代网络信任。\n阶段三（高级）：持续评估。对每次请求做动态风险评估（设备指纹 + 行为基线 + 时间异常）。\n\n最大阻力不是技术，是组织——开发团队习惯了内网互信，改成零信任需要改代码、改流程、改心态。"},
        {"board": "emergency_room","post_type": "challenge", "title": "渗透测试中发现的五个高频 Web 漏洞（2024年版）",
         "tags": ["渗透","Web安全","漏洞"],
         "content": "今年做了 15 个渗透测试项目，出现频率最高的五个漏洞：\n\n1. IDOR（越权访问）：占 60%。修复：用 ABAC 模型，别只靠前端隐藏。\n2. JWT 未验证签名：前端解码 JWT 就信任内容。修复：后端必须验签 + 检查 exp。\n3. SSRF：用户可控的 URL 参数直接请求内网。修复：白名单 + 禁止内网 IP 段。\n4. 文件上传绕过：只检查 Content-Type 不检查文件头。修复：magic bytes 校验 + 存储隔离。\n5. SQL 注入（仍然存在！）：ORM 的 raw query 拼接。修复：永远用参数化查询。\n\n最讽刺的是，IDOR 这个"简单"漏洞仍然是第一大类，因为业务逻辑审查容易被忽视。"},
        {"board": "cross_discipline","post_type": "regular", "title": "容器安全：从镜像扫描到运行时防护的完整方案",
         "tags": ["容器","安全","镜像"],
         "content": "容器安全的三个层次：\n\n1. 构建时：用 Trivy 扫描镜像漏洞，设 CI 门禁（高危漏洞阻断部署）。用 Distroless 或 Alpine 替代 Ubuntu/Debian 基础镜像（减少 80% 的 CVE）。\n2. 部署时：用 OPA/Gatekeeper 策略限制特权容器、hostPath 挂载、root 用户。用 Seccomp 限制系统调用。\n3. 运行时：用 Falco 监控异常行为（如容器内执行 shell、读 /etc/shadow）。用 NetworkPolicy 限制 Pod 出站流量。\n\n最容易被忽略的是运行时防护——很多团队只做了镜像扫描，一旦攻击者进了容器就毫无感知。"},
        {"board": "aha_square",    "post_type": "regular",  "title": "CTF 逆向题的解题思维框架",
         "tags": ["CTF","逆向","方法论"],
         "content": "打 CTF 三年，总结逆向题的解题框架：\n\n第一步：静态分析。用 Ghidra/IDA 看 main 函数结构，找输入校验逻辑。重点看字符串引用（"correct"/"wrong"）和比较指令。\n\n第二步：动态调试。在关键比较处下断点，看寄存器/内存中的值。gdb + pwndbg 是标配。\n\n第三步：模式识别。常见模式：XOR 加密（密钥循环）、base64 变种、自定义 hash、反调试（ptrace 检测、时间检查）。\n\n第四步：写脚本逆推。用 Python + z3 求解器处理复杂的约束条件。\n\n新手最容易犯的错误：一上来就 F5 反编译，看不懂就放弃。应该先跑一下程序看行为，再静态分析。"},
        {"board": "methodology",  "post_type": "insight",  "title": "内网横向移动检测的工程实践",
         "tags": ["内网","检测","蓝队"],
         "content": "红队模拟攻击后，蓝队的横向移动检测方案：\n\n1. 日志采集：Windows 事件 ID 4624（登录）+ 4648（显式凭据）+ Sysmon ID 3（网络连接）。Linux 收 auth.log + audit.log。\n\n2. 检测规则：短时间内同一账号从多个 IP 登录（Pass-the-Hash）；非工作时间的 RDP 连接；SMB 横向复制（PsExec 特征）。\n\n3. 关联分析：用图数据库（Neo4j！）建模用户-设备-时间的关联图，检测异常路径。比如：用户 A 正常只访问服务器 X，突然访问了服务器 Y 和 Z。\n\n4. 响应：检测到横向移动后自动隔离源主机（通过 EDR API），同时告警 SOC。\n\n知识图谱在安全分析中的应用潜力巨大——把实体关系可视化后，攻击路径一目了然。"},
    ],
    "robot_whisperer": [
        {"board": "methodology",  "post_type": "insight",  "title": "ROS2 节点通信机制深度解析：Topic vs Service vs Action",
         "tags": ["ROS2","通信","架构"],
         "content": "ROS2 三种通信方式的选择指南：\n\nTopic（发布/订阅）：适合持续数据流（传感器、odom）。异步、无返回。用 QoS 策略控制可靠性。\n\nService（请求/响应）：适合一次性查询（获取参数、触发动作）。同步阻塞，超时要自己处理。\n\nAction（目标/反馈/结果）：适合长时间任务（导航、抓取）。异步，支持取消和进度反馈。\n\n常见错误：用 Service 调用长时间任务（如导航）导致调用方阻塞；用 Topic 传控制命令导致丢失（QoS 不匹配）。\n\n建议：传感器数据用 Topic BEST_EFFORT；控制命令用 Topic RELIABLE；查询用 Service；任务用 Action。\n\n@[基于 ROS2 平台的仿生机器狗控制与优化]({DOC_ROBOT}) 这篇文档的节点架构设计很有参考价值。"},
        {"board": "emergency_room","post_type": "challenge", "title": "SLAM 在动态环境中的鲁棒性问题与解决方案",
         "tags": ["SLAM","导航","鲁棒性"],
         "content": "在人来人往的实验室跑 SLAM，遇到的核心问题：\n\n1. 动态物体污染地图：行人被当成静态障碍物写入地图，导致后续路径规划失败。\n2. 回环检测失败：环境变化后（门开了/椅子移了），之前的特征匹配不上。\n\n解决方案：\n- 用 Dynamic-物体过滤：结合语义分割（YOLO）把人/车等动态物体从点云中移除，再送入 SLAM。\n- 用多 session 地图：定期清理地图中长期未观测到的区域。\n- 回环检测加时间衰减：越老的匹配权重越低。\n\n最终效果：动态环境下的定位精度从 ±2m 提升到 ±30cm。\n\n@[基于 ROS2 平台的仿生机器狗控制与优化]({DOC_ROBOT}) 中的传感器融合方案对动态环境下的鲁棒性有帮助。"},
        {"board": "cross_discipline","post_type": "regular", "title": "强化学习在机器人控制中的 sim-to-real 鸿沟",
         "tags": ["强化学习","仿真","迁移"],
         "content": "用 PPO 训练四足机器人走路，仿真里走得很好，实体机器人摔倒了。sim-to-real 的核心挑战：\n\n1. 动力学差异：仿真器的摩擦模型太理想，真实地面有地毯/瓷砖/砂石。\n2. 传感器噪声：仿真里 IMU 数据是干净的，真实的有漂移和延迟。\n3. 执行器延迟：仿真里电机响应是即时的，真实舵机有 20-50ms 延迟。\n\n解决方法：Domain Randomization（随机化仿真参数）+ System Identification（标定真实物理参数）。在 PyBullet 中随机化摩擦、质量、延迟等参数，让策略学到鲁棒的控制。\n\n@[四足机械狗 PyBullet 仿真技术拆解与控制]({DOC_4LEG}) 这篇的仿真环境搭建和参数调优非常详细。"},
        {"board": "aha_square",    "post_type": "regular",  "title": "无人机路径规划：从 A* 到 RRT* 的演进",
         "tags": ["路径规划","无人机","算法"],
         "content": "无人机路径规划算法的演进历程：\n\nA*（网格搜索）：简单直观，适合 2D 栅格地图。缺点是高维空间（3D+姿态）计算量爆炸。\n\nRRT（快速随机树）：适合高维空间，但路径不最优、有锯齿。RRT* 加了重布线，渐近最优但计算量大。\n\nHybrid A*：结合 A* 和 RRT 的优点，用连续空间搜索 + 启发式引导。DJI/大疆的飞控就用类似算法。\n\n实践建议：低空避障用 A*（2D 够用）；长距离航线规划用 RRT*；室内精细操作用 Hybrid A*。\n\n@[自主竞速无人机技术拆解与创新]({DOC_DRONE}) 这篇的竞速场景路径规划非常有参考价值。"},
        {"board": "methodology",  "post_type": "regular",  "title": "四足机器人步态控制的 PID 调参实战",
         "tags": ["PID","步态","控制"],
         "content": "给四足机器人调 PID 步态控制的实战记录：\n\n问题：机器人走路时身体左右摇摆，关节抖动。\n\n调参过程：\n1. 先调 P（比例）：从小到大加，直到机器人能勉强站立。P 太大会振荡。\n2. 再调 D（微分）：抑制振荡。D 太大会高频抖动（肉眼可见的关节震颤）。\n3. 最后调 I（积分）：消除稳态误差。四足机器人一般 I 很小甚至不用。\n\n关键发现：每个关节需要独立的 PID 参数。髋关节和膝关节的惯量差 3 倍，同一套参数不行。\n\n最终参数范围：Kp=50-150, Kd=5-20, Ki=0-2（经验值，和具体机构相关）。\n\n@[四足机械狗 PyBullet 仿真技术拆解与控制]({DOC_4LEG}) 中的仿真调参可以先在虚拟环境里找大致范围。"},
        {"board": "graph_hall",   "post_type": "insight",  "title": "多传感器融合定位：IMU+LiDAR+视觉的工程实践",
         "tags": ["融合","定位","传感器"],
         "content": "在室内机器人上实现了 IMU + 2D LiDAR + 单目视觉的三源融合定位：\n\n方案选型：用 robot_localization 包的 EKF（扩展卡尔曼滤波），输入 IMU 的姿态和 LiDAR 的里程计，视觉做回环校正。\n\n挑战：\n1. 时间同步：三个传感器频率不同（IMU 200Hz、LiDAR 10Hz、视觉 15Hz），用 message_filters 做时间对齐。\n2. 坐标系标定：LiDAR 到 IMU 的外参标定误差 > 2cm 就会导致累积漂移。用 calibration 标定工具解决。\n3. 视觉退化：弱光/白墙环境下视觉特征不足，退化为纯 LiDAR+IMU 模式。\n\n最终精度：室内 ±5cm（有视觉辅助时），±15cm（纯 LiDAR+IMU）。\n\n@[多模态智能感知系统]({DOC_MULTI}) 这篇的多模态融合架构对定位系统设计有启发。"},
        {"board": "methodology",  "post_type": "regular",  "title": "从仿真到实物的 sim-to-real 迁移：PyBullet 实战记录",
         "tags": ["PyBullet","仿真","迁移"],
         "content": "用 PyBullet 搭建四足机器人仿真环境并迁移到实物的完整流程：\n\n1. 仿真环境搭建：导入 URDF 模型，设重力/摩擦/地面参数。用 setJointMotorControl2 设 PD 控制器。\n\n2. 策略训练：用 PPO 算法，观测空间=[关节角度, 角速度, IMU姿态, 足端力]，奖励=前进速度 - 能耗 - 摔倒惩罚。\n\n3. Domain Randomization：随机化摩擦系数(0.3-1.2)、质量(±20%)、延迟(0-30ms)、地面坡度(±5°)。\n\n4. 实物部署：策略输出关节角度目标 → ESP32 执行 → 实物比仿真走得慢但基本稳定。\n\n教训：仿真里 1000 步就能学会的策略，实物需要 3000+ 步 fine-tune。把仿真步长调大（0.002→0.005s）可以加速训练但降低精度。\n\n@[四足机械狗 PyBullet 仿真技术拆解与控制]({DOC_4LEG}) 这篇文档对 PyBullet 的配置细节覆盖很全面。"},
    ],
}

# ── Team messages per user ──
MESSAGES = {
    "ai_explorer": [
        "大家好！我是 AI 方向的，主要研究大模型应用落地 🤖 有问题欢迎交流！",
        "刚在图谱里发现 @[AI硬件到应用架构的学习与迁移] 这篇实验和我研究的方向很相关，里面的硬件选型思路可以借鉴",
        "分享一个发现：把 RAG 检索结果用图谱结构组织比扁平列表效果好很多，因为实体之间的关联本身就是上下文 📊",
        "有人试过在图谱上做路径推理吗？比如从「大模型」出发，沿着关系边找到「GPU工作站」→「散热方案」这种隐性关联 🔍",
        "今天用平台的 AI 问答查了一下多模态相关的实验，推荐结果很精准 👍 @[多模态智能感知系统]",
    ],
    "cloud_builder": [
        "大家好 👋 我负责云原生和 DevOps 方向，K8s/容器相关的问题可以问我",
        "这个知识图谱平台的部署架构挺有意思的，后端 FastAPI + 前端 Next.js + Neo4j 图数据库，都是我熟悉的技术栈",
        "图谱的团队空间功能不错，比 Slack 更适合讨论技术问题——可以直接 @实体节点，比纯文本链接好用多了",
        "建议可以在图谱上加一个「技术栈」维度的视图，把实验用到的技术（Docker、ROS、MQTT 等）也作为节点关联起来，这样技术选型时一目了然 🧩",
    ],
    "iot_pioneer": [
        "大家好！我是做物联网和嵌入式的 📡 树莓派/ESP32/传感器相关的问题可以找我",
        "@[小米智能门锁中 FreeRTOS 的应用] 这篇实验我仔细看了，任务优先级设计很合理，特别是中断处理的部分",
        "我在图谱里发现好几个实验都用了传感器融合——卡尔曼滤波、IMU+GPS 这些，要不要我整理一份传感器选型指南放到平台？",
        "刚借用了一套物联网传感器套件，准备做个温湿度+光照的环境监测 demo 🌡️ 有想法的同学可以一起合作",
        "图谱的搜索功能建议加上按器材筛选——比如我想看「哪些实验用了树莓派」，现在只能搜标题，不太方便",
    ],
    "cyber_sentinel": [
        "各位好 🔐 我是安全方向的，负责渗透测试和安全架构设计",
        "看到图谱里有好几个涉及网络通信的实验，安全方面可能需要关注——MQTT 默认不加密、ROS2 的 DDS 认证也要注意配置",
        "建议平台的用户认证可以考虑加上 2FA——目前只有密码登录，作为知识管理平台，数据安全很重要",
        "@[基于 ROS2 平台的仿生机器狗控制与优化] 这篇如果涉及远程控制，通信链路的安全性需要评估——ROS2 默认的 DDS 不加密，可以用 sros2 加一层",
        "有个想法：可以在图谱上标注每个实验的「安全风险等级」，帮助评审时快速识别需要重点审查的内容 🛡️",
    ],
    "robot_whisperer": [
        "大家好 🤖 我做自主系统（机器人/无人机/自动驾驶），ROS2 和嵌入式控制是老本行",
        "@[四足机械狗 PyBullet 仿真技术拆解与控制] 和 @[基于 ROS2 平台的仿生机器狗控制与优化] 这两篇可以对比看——前者侧重仿真，后者侧重实物控制，互补",
        "图谱的「实验时间线」功能很好用，可以看到一个技术方向从 23 级到 24 级的演进——比如从四足到无人机，控制算法有共通之处",
        "有没有人对多机器人协作感兴趣？我在研究编队控制，需要 SLAM + 路径规划 + 通信协议的综合知识 📡",
        "平台的器材借用系统很实用！我刚借了开发板套件和机器人平台，准备做一个 SLAM demo，完成后会上传实验报告 📋",
    ],
}

# ── Main ──

def main():
    print("=== Setting admin password ===")
    import subprocess, hashlib, base64, os
    # Generate bcrypt hash for 'admin123' and update admin password
    hash_script = "import bcrypt; print(bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode())"
    result = subprocess.run(["python3", "-c", hash_script], capture_output=True, text=True)
    if result.returncode == 0:
        pw_hash = result.stdout.strip()
        update_sql = f"UPDATE users SET hashed_password = '{pw_hash}' WHERE username = 'admin';"
        subprocess.run([
            "sudo", "k3s", "kubectl", "exec", "-i", "postgres-0", "-n", "kg-platform", "--",
            "sh", "-c", f'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "{update_sql}"'
        ], capture_output=True)
        print("  admin password set to 'admin123'")
    else:
        print("  WARNING: bcrypt not available, trying default admin password")

    print("\n=== Registering users ===")
    for u in USERS:
        register(u)
        time.sleep(0.3)

    print("\n=== Logging in ===")
    for u in USERS:
        login(u)
        time.sleep(0.3)

    print("\n=== Logging in as admin ===")
    admin = {"username": "admin", "pw": "admin123"}
    login(admin)
    admin_token = admin.get("token")
    if not admin_token:
        print("FATAL: admin login failed. Trying 'admin' as password...")
        admin["pw"] = "admin"
        login(admin)
        admin_token = admin.get("token")
    if not admin_token:
        print("FATAL: cannot login as admin. Skipping team invites.")

    print("\n=== Inviting users to nudt team ===")
    if admin_token:
        for u in USERS:
            invite_to_team(admin_token, u["username"])
            time.sleep(0.3)

    print("\n=== Creating forum posts ===")
    for u in USERS:
        user_posts = POSTS.get(u["username"], [])
        print(f"\n  [{u['nickname']}] creating {len(user_posts)} posts...")
        for p in user_posts:
            post_thread(u["token"], {
                "board": p["board"],
                "title": p["title"],
                "content": p["content"],
                "post_type": p["post_type"],
                "tags": p["tags"],
            })
            time.sleep(0.5)

    print("\n=== Posting team messages ===")
    for u in USERS:
        user_msgs = MESSAGES.get(u["username"], [])
        print(f"\n  [{u['nickname']}] posting {len(user_msgs)} messages...")
        for msg in user_msgs:
            post_message(u["token"], msg)
            time.sleep(0.5)

    print("\n=== DONE ===")
    total_posts = sum(len(v) for v in POSTS.values())
    total_msgs = sum(len(v) for v in MESSAGES.values())
    print(f"  {len(USERS)} users, {total_posts} forum posts, {total_msgs} team messages")

if __name__ == "__main__":
    main()
