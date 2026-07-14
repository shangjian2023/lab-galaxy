# Lab Galaxy

AI-powered experiment knowledge graph platform. Upload docs → auto-extract entities → visualize connections.

简体中文说明

## 项目简介

Lab Galaxy 是一个用于构建实验知识图谱的工具平台。用户可以上传实验文档，平台自动抽取实体（如样品、试剂、设备、实验步骤等），并将这些实体和它们的关系以可视化图谱的方式展示，帮助研究人员快速理解、检索和分析实验信息。

## 主要功能

- 文档上传与管理
- 自动实体抽取（命名实体识别、关系抽取）
- 多文档实体去重与聚合
- 实验对象与操作的知识图谱可视化
- 支持快速检索与关系追溯

## 技术栈

根据仓库统计：
- TypeScript: 56.4%
- Python: 40.7%
- Shell: 1.8%
- Other: 1.1%

通常前端使用 TypeScript，后端/数据处理使用 Python。

## 快速开始（示例）

1. 克隆仓库

   git clone https://github.com/shangjian2023/lab-galaxy.git
   cd lab-galaxy

2. 后端（Python）示例

   - 进入后端目录（例如 `backend/`、`server/`，以仓库实际目录为准）
   - 创建虚拟环境并安装依赖：

     python -m venv .venv
     source .venv/bin/activate  # Windows: .venv\Scripts\activate
     pip install -r requirements.txt

   - 运行（示例命令，视实际入口调整）：

     python -m uvicorn main:app --reload

3. 前端（TypeScript）示例

   - 进入前端目录（例如 `frontend/`、`web/`，以仓库实际目录为准）
   - 安装依赖并启动：

     npm install
     npm run dev

4. 在浏览器打开前端地址（例如 http://localhost:3000）并根据界面上传文档进行测试。

> 注意：上面命令为通用示例。请根据仓库中的实际目录结构和 package/entry 文件调整。

## 项目结构（示意）

- backend/ 或 server/ — Python 后端与实体抽取服务
- frontend/ 或 web/ — TypeScript 前端，可视化界面
- docs/ — 示例文档或使用说明

## 贡献指南

欢迎贡献！请按照以下流程：

1. Fork 本仓库并创建分支：`git checkout -b feat/your-feature`
2. 提交代码并发起 PR，描述你的变更与动机
3. 通过 CI 并通过代码审查后合并

如需更详细的贡献规范（代码风格、测试等），请在仓库中添加或更新 CONTRIBUTING.md。

## 许可证

请查看仓库中的 LICENSE 文件获取授权信息。

## 联系方式

如需帮助或有建议，请在 Issues 里提问，或联系仓库维护者（见 GitHub 个人主页）。
