import type { KnowledgeGraphData, ResearchDocument } from "./research-types";

export const demoGraph: KnowledgeGraphData = {
  nodes: [
    { id: "exp-water", name: "光催化水分解", type: "核心实验", group: "experiment", summary: "通过 Pt/TiO₂ 异质结提升可见光条件下的产氢效率，并比较不同焙烧温度的影响。", year: 2026, documentId: "doc-water" },
    { id: "exp-film", name: "钙钛矿薄膜制备", type: "关联实验", group: "experiment", summary: "探索反溶剂滴加时机对薄膜结晶质量与缺陷密度的影响。", year: 2026, documentId: "doc-film" },
    { id: "sample-tio2", name: "TiO₂ 纳米薄膜", type: "样品", group: "resource", summary: "以溶胶-凝胶法制备的锐钛矿相二氧化钛薄膜，厚度约 240 nm。", year: 2026, documentId: "doc-water" },
    { id: "reagent-pt", name: "氯铂酸", type: "试剂", group: "resource", summary: "用于光沉积 Pt 助催化剂，使用前避光保存并记录批次。", year: 2026, documentId: "doc-water" },
    { id: "equip-xenon", name: "氙灯光源", type: "设备", group: "resource", summary: "300 W 模拟太阳光源，实验前预热 20 分钟并校准光强。", year: 2025 },
    { id: "equip-furnace", name: "管式炉", type: "设备", group: "resource", summary: "用于薄膜恒温焙烧，本组实验设置 450 ℃ 与 550 ℃ 两个梯度。", year: 2025 },
    { id: "method-gel", name: "溶胶-凝胶法", type: "实验方法", group: "knowledge", summary: "通过水解、缩聚和旋涂形成均匀薄膜，关键变量为陈化时间与旋涂速度。", year: 2025, documentId: "doc-water" },
    { id: "method-xrd", name: "XRD 表征", type: "表征方法", group: "knowledge", summary: "用于确认晶相组成并比较焙烧前后的结晶度变化。", year: 2026 },
    { id: "result-h2", name: "产氢速率提升 38%", type: "实验结论", group: "knowledge", summary: "在相同光强与反应体积下，优化样品相对对照组的平均产氢速率提升 38%。", year: 2026, documentId: "doc-water" },
    { id: "theory-junction", name: "肖特基结", type: "理论知识", group: "knowledge", summary: "金属与半导体接触形成势垒，有助于抑制光生电子与空穴复合。", year: 2025 },
    { id: "result-defect", name: "缺陷密度下降", type: "实验结论", group: "knowledge", summary: "优化反溶剂滴加时机后，薄膜表面针孔减少，荧光寿命得到改善。", year: 2026, documentId: "doc-film" },
    { id: "method-antisolvent", name: "反溶剂工程", type: "实验方法", group: "knowledge", summary: "利用反溶剂诱导快速成核，以获得致密、均匀的钙钛矿薄膜。", year: 2026, documentId: "doc-film" },
  ],
  edges: [
    { id: "e01", source: "exp-water", target: "sample-tio2", relation: "制备" },
    { id: "e02", source: "exp-water", target: "reagent-pt", relation: "消耗" },
    { id: "e03", source: "exp-water", target: "equip-xenon", relation: "使用" },
    { id: "e04", source: "sample-tio2", target: "equip-furnace", relation: "焙烧" },
    { id: "e05", source: "sample-tio2", target: "method-gel", relation: "采用" },
    { id: "e06", source: "sample-tio2", target: "method-xrd", relation: "表征" },
    { id: "e07", source: "exp-water", target: "result-h2", relation: "得到" },
    { id: "e08", source: "result-h2", target: "theory-junction", relation: "解释" },
    { id: "e09", source: "reagent-pt", target: "theory-junction", relation: "形成" },
    { id: "e10", source: "exp-film", target: "method-antisolvent", relation: "采用" },
    { id: "e11", source: "exp-film", target: "result-defect", relation: "得到" },
    { id: "e12", source: "method-antisolvent", target: "result-defect", relation: "影响" },
    { id: "e13", source: "exp-film", target: "equip-furnace", relation: "使用" },
    { id: "e14", source: "method-xrd", target: "result-defect", relation: "验证" },
    { id: "e15", source: "exp-water", target: "exp-film", relation: "共享方法" },
  ],
};

export const demoDocuments: ResearchDocument[] = [
  { id: "doc-water", title: "光催化水分解实验记录.pdf", fileType: "PDF", size: "4.8 MB", status: "completed", updatedAt: "今天 14:32", entities: 18, relations: 26, owner: "林研究员" },
  { id: "doc-film", title: "钙钛矿薄膜制备方案.docx", fileType: "DOCX", size: "1.2 MB", status: "completed", updatedAt: "今天 11:08", entities: 12, relations: 17, owner: "林研究员" },
  { id: "doc-xrd", title: "XRD 表征数据汇总.pdf", fileType: "PDF", size: "8.6 MB", status: "processing", updatedAt: "昨天 18:40", entities: 0, relations: 0, owner: "周同学" },
  { id: "doc-review", title: "光沉积操作流程 v3.pptx", fileType: "PPTX", size: "3.1 MB", status: "review", updatedAt: "11 月 5 日", entities: 9, relations: 11, owner: "周同学" },
  { id: "doc-failed", title: "旧版实验记录扫描件.pdf", fileType: "PDF", size: "18.4 MB", status: "failed", updatedAt: "11 月 3 日", entities: 0, relations: 0, owner: "林研究员", error: "扫描件未包含可识别文本，请补充 OCR 后重试。" },
];

export const groupMeta = {
  experiment: { label: "实验", color: "#7856a8", description: "研究项目与实验过程" },
  resource: { label: "资源", color: "#c47a22", description: "样品、试剂与设备" },
  knowledge: { label: "知识", color: "#00856f", description: "方法、理论与结论" },
} as const;
