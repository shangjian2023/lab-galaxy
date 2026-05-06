"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminListEquipmentRequests,
  adminReplyEquipmentRequest,
  type EquipmentRequestItem,
} from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已批准",
  rejected: "已拒绝",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const QUICK_REPLIES: Record<string, { status: string; reply: string }[]> = {
  pending: [
    { status: "approved", reply: "同意申请，请联系管理员领取。" },
    { status: "rejected", reply: "暂时无法提供，请说明其他替代方案。" },
    { status: "rejected", reply: "该器材/场地目前维护中，预计下周可用。" },
  ],
};

export default function AdminEquipmentPage() {
  const [items, setItems] = useState<EquipmentRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Reply modal state
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
      // Update local list
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      setReplyingTo(null);
    } catch {
      alert("回复失败，请重试");
    } finally {
      setSubmittingReply(false);
    }
  };

  const applyQuickReply = (qr: { status: string; reply: string }) => {
    setReplyStatus(qr.status);
    setReplyText(qr.reply);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">器材申请管理</h1>
        <p className="text-sm text-black">审核用户的器材和实验室场地申请</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-black">状态：</span>
        {[
          { value: "", label: "全部" },
          { value: "pending", label: "待审核" },
          { value: "approved", label: "已批准" },
          { value: "rejected", label: "已拒绝" },
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
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-black">加载中...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-black">暂无申请记录</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
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
                      <button
                        onClick={() => openReply(item)}
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-black transition-colors hover:border-orange-300 hover:text-orange-600"
                      >
                        {item.status === "pending" ? "审核" : "修改"}
                      </button>
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
