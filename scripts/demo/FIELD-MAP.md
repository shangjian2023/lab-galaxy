# 演示录制字段图(Discover 产出,2026-11-19)

供 demo-video.mjs 选择器使用;全部经 discover.mjs/discover2.mjs 实测验证。

## 全局(AppShell)

- 导航搜索框:`input[placeholder="检索知识档案"]`(title=全局搜索,快捷键 `/`)
- 氛围(油画背景)按钮:`button[title="调整油画背景"]`(打开不透明度控制)
- 账户徽章:`a.atlas-account`(文本含"本机研究管理员",验收锚点)
- 导航链接:`nav a:has-text("知识星图"|"实验档案"|"研究助手"|"协作空间")`

## 首页 /

- CTA:`a.btn.btn-primary:has-text("进入知识星图")`(首个)
- 内嵌助手输入:`input[placeholder*="询问实验"]`

## 图谱 /graph

- 画布:`.graph-canvas`(内部 1040×678,交互用 boundingBox 中心坐标)
- 深链:`/graph?node=<id>`;蓝牙通信实验=d0fb8d3f-0f81-46b8-bfc0-59e761a6ff4c
- 过滤搜索:`input[placeholder="搜索实体、方法或结论"]`(清空恢复全图)
- 视图切换:button:has-text("关系图"/"数据表")
- 检查器页签:button:has-text("详情"/"节点"/"外观"/"力场")
- 工具栏(带 title):`button[title="放大"|"缩小"|"适应全部节点"|"重新布局"|"恢复环境漂移"|"全屏图谱"]`
- 悬停预览卡:`.graph-node-preview`(380ms 出现,内含"从这里探索关系"按钮)
- 右键菜单:button:has-text("从这里探索"/"固定节点"/"居中查看")、a:has-text("查看关联文档")
- 局部探索深度:底部浮条 select(1/2/3 跳)+ "全局"返回按钮;Esc 退出探索/全屏

## 文档 /documents

- 导入:button:has-text("导入新文档") → 面板;收起:button:has-text("收起导入面板")
- 文件:`input[type=file].hidden`(setInputFiles 直传)
- 可见范围:面板内 select;上传:button:has-text("上传并解析")
- 任务行:button.row-action / "刷新文档库"
- 标本卡:button.specimen-card(新文档卡文本含 "Bluetooth")
- 档案单:button:has-text("展开解析原文")
- 抽取:button.knowledge-extraction-toggle → 分块数 select + input[type=checkbox] + button:has-text("开始一次抽取") → button:has-text("核对无误,发布到星图") → a/button:has-text("在真实星图中查看")

## 助手 /assistant

- 输入:`input[placeholder*="询问实验"]`(title=向研究助手提问)
- 新会话:button:has-text("新建研究会话")
- @提及下拉:`button.node-mention-option`(输入 "@Wireshark" 全名可精确匹配;Enter 引用)
- 发送:输入框右侧提交按钮(form 内最后一个 submit)
- 证据卡:`details` 折叠卡 + a:has-text("在文档中心查看")

## 团队 /team

- 名称:`#team-name`;创建:button:has-text("创建团队")
- 令牌:`#invite-token`;加入:button:has-text("加入团队")
- 详情页:创建后跳 /team/<id>;邀请:button:has-text("创建一次性邀请")

## 注意

- 图谱页 `networkidle` 会超时(力导常驻),一律用 `load` + 固定等待
- npm script-shell 坏,浏览器/服务均直接 node 调 bin
- 会话 cookie:`lab_galaxy_session` ← data/demo-session.token(HttpOnly,须用 addCookies)
