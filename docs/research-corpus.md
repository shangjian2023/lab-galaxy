# 公开计算机实验报告语料

## 来源与使用边界

当前导入器面向公开仓库中**已经完成的实验报告**，不把课程实验指导书标成实验报告：

- [MinmusLin/Computer_Network_Experiment_Reports](https://github.com/MinmusLin/Computer_Network_Experiment_Reports)：计算机网络实验报告。仓库声明 MIT License，README 同时要求仅用于个人学习研究、非商业用途并遵守学术诚信。
- [LolipopJ/uestc-coursework-repo](https://github.com/LolipopJ/uestc-coursework-repo)：操作系统、云计算、数据库、软件工程等实验报告。公开可访问，但未发现明确开放许可证；作者注明仅供参考。

文件仅用于本机解析功能验证，不进入 Git，不随应用重新发布。每条数据库记录保存原始文件 URL、来源页面、机构、许可说明、SHA-256 和本地路径，便于核对与删除。

## 本地目录

- `data/public-cs-reports-sources.json`：候选来源清单。
- `data/public-cs-reports/<文档 ID>/source.pdf`：每份原始文件使用独立目录。
- `data/public-cs-reports/import-summary.json`：本次成功与失败明细。
- `data/lab-galaxy.db`：真实 SQLite 开发数据库。

`data/` 已被 `.gitignore` 排除。下载内容只作为不可信数据处理，不执行文档中的程序、宏或脚本；仅接受通过文件结构校验的 PDF/DOCX，单文件上限 30 MiB。

## 可重复执行

```bash
python -I scripts/prepare_github_corpus.py
python -I scripts/import_public_corpus.py \
  --sources data/public-cs-reports-sources.json \
  --data-dir data/public-cs-reports \
  --database data/lab-galaxy.db \
  --limit 50
python -I scripts/verify_corpus.py data/lab-galaxy.db
python -I -m unittest discover -s scripts/tests -v
```

导入器支持续跑：已存在的原文件会按仓库预期大小和文档结构重新校验并复用；解析失败会写入 `failed` 状态和错误原因，不生成空白成功记录。GitHub 文件优先通过已配置的 `gh api` Blob 接口下载，避免 Raw 连接不稳定；清单仍保存公开 Raw URL 作为来源地址。当前 PostgreSQL 服务未在本机运行，因此先使用 SQLite 完成真实持久化，不能据此声称 PostgreSQL/pgvector 已部署。

## 已验证结果

2026-11-08 本机导入验收：50 份报告解析成功、0 份失败，共 853 页、816 个文本分块、126 个识别章节、365,502 个清理后字符。`scripts/verify_corpus.py` 对全部原文件重新计算 SHA-256，未发现哈希、来源唯一性或追溯完整性错误。TCP/UDP 与 Hadoop 的真实 Qwen 问答均已验证；无证据测试不会调用模型。

## 数据与 API

SQLite 保存文档、逐页文本、识别章节和重叠文本分块。Next.js 提供：

- `GET /api/corpus/documents`：真实文档列表。
- `GET /api/corpus/documents/:id`：原文、章节和分块。
- `GET /api/corpus/stats`：真实语料统计。
- `POST /api/corpus/ask`：登录后，本地全文检索会在当前账户可见范围内命中最多 6 个原文分块，并将问题与这些分块发送至服务端配置的 Qwen。

未命中证据时，问答接口直接返回无证据说明，不调用模型补写答案。当前不是向量检索；问答要求已审核账户，匿名请求返回 401。公开报告仍可免登录阅读，私有和团队文档的列表、详情、检索、统计与问答使用同一服务端授权条件，详见 [账户与知识边界](auth-and-access.md)。
