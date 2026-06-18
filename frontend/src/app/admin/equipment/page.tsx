"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminListEquipmentRequests,
  adminReplyEquipmentRequest,
  markEquipmentReturned,
  getAllCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  type EquipmentRequestItem,
  type EquipmentCatalogItem,
} from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已批准",
  rejected: "已拒绝",
  returned: "已归还",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  returned: "bg-gray-200 text-gray-600",
};

const QUICK_REPLIES: Record<string, { status: string; reply: string }[]> = {
  pending: [
    { status: "approved", reply: "同意申请，请联系管理员领取。" },
    { status: "rejected", reply: "暂时无法提供，请说明其他替代方案。" },
    { status: "rejected", reply: "该器材/场地目前维护中，预计下周可用。" },
  ],
};

const COMMON_ICONS = ["🖥️", "🎮", "🖨️", "📈", "⚡", "🔍", "🔧", "🌐", "📡", "🥽", "⌨️", "🔌", "📊", "🔥", "💾", "🔋", "🔄", "📦", "🤖", "🎯", "📱", "🖱️", "💡", "🛠️"];

export default function AdminEquipmentPage() {
  const [activeTab, setActiveTab] = useState<"requests" | "catalog">("catalog");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">器材管理</h1>
        <p className="text-sm text-black">管理器材目录和审核用户申请</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "catalog"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-black hover:text-orange-600"
          }`}
        >
          器材目录
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "requests"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-black hover:text-orange-600"
          }`}
        >
          申请审核
        </button>
      </div>

      {activeTab === "catalog" ? <CatalogTab /> : <RequestsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog tab
// ---------------------------------------------------------------------------

function CatalogTab() {
  const [items, setItems] = useState<EquipmentCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentCatalogItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("🔧");
  const [formDesc, setFormDesc] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formStock, setFormStock] = useState(0);
  const [formUnit, setFormUnit] = useState("个");
  const [formOrder, setFormOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getAllCatalogItems()
      .then((res) => setItems(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (item: EquipmentCatalogItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormIcon(item.icon);
    setFormDesc(item.description || "");
    setFormImage(item.image_url || "");
    setFormStock(item.stock);
    setFormUnit(item.unit || "个");
    setFormOrder(item.sort_order);
  };

  const startAdd = () => {
    setShowAddForm(true);
    setEditingItem(null);
    setFormName("");
    setFormIcon("🔧");
    setFormDesc("");
    setFormImage("");
    setFormStock(0);
    setFormUnit("个");
    setFormOrder(items.length);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      if (editingItem) {
        const updated = await updateCatalogItem(editingItem.id, {
          name: formName,
          icon: formIcon,
          description: formDesc,
          image_url: formImage || undefined,
          stock: formStock,
          unit: formUnit,
          sort_order: formOrder,
        });
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      } else {
        const created = await createCatalogItem({
          name: formName,
          icon: formIcon,
          description: formDesc,
          image_url: formImage || undefined,
          stock: formStock,
          unit: formUnit,
          sort_order: formOrder,
        });
        setItems((prev) => [...prev, created]);
      }
      setEditingItem(null);
      setShowAddForm(false);
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: EquipmentCatalogItem) => {
    try {
      const updated = await updateCatalogItem(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    } catch {
      alert("操作失败，请重试");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除该器材？")) return;
    try {
      await deleteCatalogItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {
      alert("删除失败，请重试");
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-black">共 {items.length} 个器材</span>
        <button
          onClick={startAdd}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
        >
          + 添加器材
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-black">加载中...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-4 transition-all ${
                item.is_active ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <span className="text-2xl">{item.icon}</span>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-black">{item.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-black">{item.description || "暂无描述"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium ${item.stock > 0 ? "text-green-600" : "text-gray-400"}`}>
                      库存 {item.stock} {item.unit}
                    </span>
                    <span className="text-xs text-black">排序: {item.sort_order}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.is_active ? "启用" : "停用"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => startEdit(item)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleToggleActive(item)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600"
                >
                  {item.is_active ? "停用" : "启用"}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-red-300 hover:text-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <AnimatePresence>
        {(showAddForm || editingItem) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
            onClick={() => { setShowAddForm(false); setEditingItem(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-bold text-black">
                {editingItem ? "编辑器材" : "添加器材"}
              </h3>

              {/* Icon picker */}
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-black">图标</label>
                <div className="flex flex-wrap gap-1">
                  {COMMON_ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setFormIcon(ic)}
                      className={`rounded p-1 text-lg transition-colors ${
                        formIcon === ic ? "bg-orange-100 ring-1 ring-orange-400" : "hover:bg-gray-100"
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-black">名称</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：高性能服务器"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-black">描述</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="器材用途说明..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                />
              </div>

              {/* Image URL */}
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-black">实物图 URL（选填）</label>
                <input
                  type="url"
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  placeholder="https://example.com/equipment.jpg"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                />
                {formImage && (
                  <img src={formImage} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover" />
                )}
              </div>

              {/* Stock + Unit */}
              <div className="mb-3 flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-black">库存数量</label>
                  <input
                    type="number"
                    min={0}
                    value={formStock}
                    onChange={(e) => setFormStock(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                  />
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-sm font-medium text-black">单位</label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                  >
                    {["个", "组", "块", "套", "台", "盒", "片", "条", "根", "把"].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort order */}
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-black">排序序号</label>
                <input
                  type="number"
                  value={formOrder}
                  onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowAddForm(false); setEditingItem(null); }}
                  className="rounded-lg px-4 py-2 text-sm text-black hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={submitting || !formName.trim()}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                >
                  {submitting ? "保存中..." : "保存"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests tab
// ---------------------------------------------------------------------------

function RequestsTab() {
  const [items, setItems] = useState<EquipmentRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [replyingTo, setReplyingTo] = useState<EquipmentRequestItem | null>(null);
  const [replyStatus, setReplyStatus] = useState("approved");
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const pageSize = 20;

  const load = () => {
    setLoading(true);
    adminListEquipmentRequests(page, statusFilter || undefined)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, statusFilter]);

  const openReply = (item: EquipmentRequestItem) => {
    setReplyingTo(item);
    setReplyStatus(item.status === "pending" ? "approved" : item.status);
    setReplyText(item.admin_reply || "");
  };

  const submitReply = async () => {
    if (!replyingTo) return;
    setSubmittingReply(true);
    try {
      const updated = await adminReplyEquipmentRequest(replyingTo.id, {
        status: replyStatus,
        reply: replyText,
      });
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      setReplyingTo(null);
    } catch (e: unknown) {
      alert((e as Error).message || "回复失败，请重试");
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleMarkReturned = async (item: EquipmentRequestItem) => {
    if (!confirm(`确认 ${item.title} 已归还？`)) return;
    try {
      const updated = await markEquipmentReturned(item.id);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    } catch (e: unknown) {
      alert((e as Error).message || "操作失败");
    }
  };

  const applyQuickReply = (qr: { status: string; reply: string }) => {
    setReplyStatus(qr.status);
    setReplyText(qr.reply);
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-black">状态：</span>
        {[
          { value: "", label: "全部" },
          { value: "pending", label: "待审核" },
          { value: "approved", label: "已批准" },
          { value: "rejected", label: "已拒绝" },
          { value: "returned", label: "已归还" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => {
              setStatusFilter(s.value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s.value
                ? "bg-orange-100 text-orange-700"
                : "bg-gray-100 text-black hover:bg-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-black">共 {total} 条</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="py-12 text-center text-sm text-black">加载中...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-black">暂无申请记录</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">申请人</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">名称</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">数量</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">申请时间</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 transition-colors hover:bg-orange-50/50"
                  >
                    <td className="px-4 py-3 text-sm text-black">
                      {item.user_nickname || item.user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-black">
                      {item.request_type === "equipment" ? "器材" : "实验室场地"}
                    </td>
                    <td className="px-4 py-3 text-sm text-black">
                      <div>
                        {item.title}
                        {item.catalog_name && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                            {item.catalog_name}
                          </span>
                        )}
                        {item.description && (
                          <p className="mt-0.5 text-xs text-black">{item.description}</p>
                        )}
                        {item.admin_reply && (
                          <p className="mt-0.5 text-xs text-orange-600">
                            回复：{item.admin_reply}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-black">
                      {item.request_type === "equipment" ? item.quantity : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] || ""}`}
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-black">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString("zh-CN") : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openReply(item)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600"
                        >
                          {item.status === "pending" ? "审核" : "修改"}
                        </button>
                        {item.status === "approved" && item.request_type === "equipment" && (
                          <button
                            onClick={() => handleMarkReturned(item)}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-blue-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                          >
                            标记归还
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-black">
                第 {page} 页 / 共 {Math.ceil(total / pageSize) || 1} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reply Modal */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
            onClick={() => setReplyingTo(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1 text-lg font-bold text-black">审核申请</h3>
              <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-black">
                <span className="font-medium">{replyingTo.user_nickname || "用户"}</span> 申请了{" "}
                <span className="font-medium">
                  {replyingTo.request_type === "equipment" ? "器材" : "实验室场地"}
                </span>
                ：<span className="font-medium">{replyingTo.title}</span>
                {replyingTo.request_type === "equipment" && replyingTo.quantity > 1
                  ? ` × ${replyingTo.quantity}`
                  : ""}
                {replyingTo.description && (
                  <p className="mt-1 text-xs text-black">{replyingTo.description}</p>
                )}
              </div>

              {/* Quick replies */}
              {replyingTo.status === "pending" && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-black">快捷回复：</p>
                  <div className="flex flex-wrap gap-2">
                    {(QUICK_REPLIES["pending"] || []).map((qr, i) => (
                      <button
                        key={i}
                        onClick={() => applyQuickReply(qr)}
                        className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                          replyStatus === qr.status && replyText === qr.reply
                            ? "bg-orange-500 text-white"
                            : "border border-gray-200 bg-white text-black hover:border-orange-300"
                        }`}
                      >
                        {qr.status === "approved" ? "同意" : "拒绝"}：{qr.reply.slice(0, 10)}...
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Status toggle */}
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setReplyStatus("approved")}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    replyStatus === "approved"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 text-black hover:bg-gray-200"
                  }`}
                >
                  批准
                </button>
                <button
                  onClick={() => setReplyStatus("rejected")}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    replyStatus === "rejected"
                      ? "bg-red-500 text-white"
                      : "bg-gray-100 text-black hover:bg-gray-200"
                  }`}
                >
                  拒绝
                </button>
              </div>

              {/* Reply text */}
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="输入回复内容..."
                rows={3}
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
              />

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setReplyingTo(null)}
                  className="rounded-lg px-4 py-2 text-sm text-black hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  onClick={submitReply}
                  disabled={submittingReply || !replyText.trim()}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                >
                  {submittingReply ? "提交中..." : "确认"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
