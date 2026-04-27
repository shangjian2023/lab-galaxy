"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminListNodes,
  adminCreateNode,
  adminUpdateNode,
  adminDeleteNode,
  adminListRelations,
  adminCreateRelation,
  adminDeleteRelation,
  type GraphNode,
  type GraphRelation,
} from "@/lib/api";

const NODE_TYPES = ["Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"];
const REL_TYPES = ["USES", "BASED_ON", "SIMILAR_TO", "REQUIRES", "RELATED_TO"];

export default function AdminGraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relations, setRelations] = useState<GraphRelation[]>([]);
  const [tab, setTab] = useState<"nodes" | "relations">("nodes");
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [showCreateRelation, setShowCreateRelation] = useState(false);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const loadNodes = () => adminListNodes().then(setNodes);
  const loadRelations = () => adminListRelations().then(setRelations);

  useEffect(() => {
    loadNodes();
    loadRelations();
  }, []);

  // Node CRUD
  const handleCreateNode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await adminCreateNode({
      type: fd.get("type") as string,
      name: fd.get("name") as string,
      summary: (fd.get("summary") as string) || "",
    });
    setShowCreateNode(false);
    loadNodes();
  };

  const handleUpdateNode = async (id: string) => {
    await adminUpdateNode(id, {
      name: editValues.name,
      type: editValues.type,
      summary: editValues.summary,
    });
    setEditingNode(null);
    loadNodes();
  };

  const handleDeleteNode = async (id: string) => {
    if (!confirm("确定删除此节点？（关联关系也会被删除）")) return;
    await adminDeleteNode(id);
    loadNodes();
    loadRelations();
  };

  // Relation CRUD
  const handleCreateRelation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await adminCreateRelation({
      source_id: fd.get("source_id") as string,
      target_id: fd.get("target_id") as string,
      type: fd.get("type") as string,
      confidence: Number(fd.get("confidence")) || 0.5,
    });
    setShowCreateRelation(false);
    loadRelations();
  };

  const handleDeleteRelation = async (r: GraphRelation) => {
    if (!confirm("确定删除此关系？")) return;
    await adminDeleteRelation(r.source_id, r.target_id, r.type);
    loadRelations();
  };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">知识图谱管理</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab("nodes")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "nodes" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
            节点 ({nodes.length})
          </button>
          <button onClick={() => setTab("relations")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "relations" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
            关系 ({relations.length})
          </button>
        </div>
      </div>

      {/* ===== Nodes Tab ===== */}
      {tab === "nodes" && (
        <div>
          <div className="mb-3">
            <button onClick={() => setShowCreateNode(true)}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
              + 新建节点
            </button>
          </div>

          <AnimatePresence>
            {showCreateNode && (
              <Modal onClose={() => setShowCreateNode(false)} title="新建节点">
                <form onSubmit={handleCreateNode} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">类型</label>
                    <select name="type" className="w-full rounded border px-3 py-2 text-sm">
                      {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">名称</label>
                    <input name="name" required className="w-full rounded border px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">描述</label>
                    <textarea name="summary" rows={3} className="w-full rounded border px-3 py-2 text-sm" />
                  </div>
                  <button type="submit" className="w-full rounded-lg bg-orange-600 py-2 text-sm font-medium text-white">创建</button>
                </form>
              </Modal>
            )}
          </AnimatePresence>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">描述</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id} className="border-t hover:bg-gray-50">
                    <td className="max-w-[120px] truncate px-3 py-2 font-mono text-xs text-gray-400">{n.id}</td>
                    <td className="px-3 py-2">
                      {editingNode === n.id ? (
                        <select value={editValues.type ?? n.type}
                          onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
                          className="rounded border px-2 py-1 text-xs">
                          {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{n.type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingNode === n.id ? (
                        <input value={editValues.name ?? n.name}
                          onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                          className="w-full rounded border px-2 py-1 text-xs" />
                      ) : (
                        <span className="font-medium">{n.name}</span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      {editingNode === n.id ? (
                        <input value={editValues.summary ?? n.summary}
                          onChange={(e) => setEditValues({ ...editValues, summary: e.target.value })}
                          className="w-full rounded border px-2 py-1 text-xs" />
                      ) : (
                        <span className="text-gray-500 truncate block">{n.summary || "-"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 space-x-2">
                      {editingNode === n.id ? (
                        <>
                          <button onClick={() => handleUpdateNode(n.id)} className="text-xs text-green-600 hover:underline">保存</button>
                          <button onClick={() => setEditingNode(null)} className="text-xs text-gray-500 hover:underline">取消</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingNode(n.id); setEditValues({ name: n.name, type: n.type, summary: n.summary }); }}
                            className="text-xs text-blue-600 hover:underline">编辑</button>
                          <button onClick={() => handleDeleteNode(n.id)}
                            className="text-xs text-red-600 hover:underline">删除</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Relations Tab ===== */}
      {tab === "relations" && (
        <div>
          <div className="mb-3">
            <button onClick={() => setShowCreateRelation(true)}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
              + 新建关系
            </button>
          </div>

          <AnimatePresence>
            {showCreateRelation && (
              <Modal onClose={() => setShowCreateRelation(false)} title="新建关系">
                <form onSubmit={handleCreateRelation} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">源节点 ID</label>
                    <select name="source_id" required className="w-full rounded border px-3 py-2 text-sm">
                      <option value="">选择源节点</option>
                      {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">目标节点 ID</label>
                    <select name="target_id" required className="w-full rounded border px-3 py-2 text-sm">
                      <option value="">选择目标节点</option>
                      {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">关系类型</label>
                    <select name="type" className="w-full rounded border px-3 py-2 text-sm">
                      {REL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">置信度</label>
                    <input name="confidence" type="number" step="0.1" min="0" max="1" defaultValue={0.5}
                      className="w-full rounded border px-3 py-2 text-sm" />
                  </div>
                  <button type="submit" className="w-full rounded-lg bg-orange-600 py-2 text-sm font-medium text-white">创建</button>
                </form>
              </Modal>
            )}
          </AnimatePresence>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">源节点</th>
                  <th className="px-3 py-2 font-medium">关系</th>
                  <th className="px-3 py-2 font-medium">目标节点</th>
                  <th className="px-3 py-2 font-medium">置信度</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {relations.map((r, i) => {
                  const src = nodeMap.get(r.source_id);
                  const tgt = nodeMap.get(r.target_id);
                  return (
                    <tr key={`${r.source_id}-${r.target_id}-${r.type}-${i}`} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-medium">{src?.name ?? r.source_id.slice(0, 8)}</span>
                        {src && <span className="ml-1 text-xs text-gray-400">({src.type})</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{r.type}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{tgt?.name ?? r.target_id.slice(0, 8)}</span>
                        {tgt && <span className="ml-1 text-xs text-gray-400">({tgt.type})</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-gray-500">{(r.confidence * 100).toFixed(0)}%</span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleDeleteRelation(r)}
                          className="text-xs text-red-600 hover:underline">删除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}
