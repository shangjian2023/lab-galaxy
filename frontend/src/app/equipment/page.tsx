"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  getEquipmentCatalog,
  submitEquipmentRequest,
  getMyEquipmentRequests,
  type EquipmentCatalogItem,
  type EquipmentRequestItem,
} from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export default function EquipmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [myRequests, setMyRequests] = useState<EquipmentRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<"catalog" | "my-requests">("catalog");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [reqType, setReqType] = useState<"equipment" | "lab_space">("equipment");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Load catalog
  useEffect(() => {
    getEquipmentCatalog().then((res) => setCatalog(res.items)).catch(() => {});
  }, []);

  // Load my requests
  const loadMyRequests = () => {
    getMyEquipmentRequests().then((res) => setMyRequests(res.items)).catch(() => {});
  };
  useEffect(() => {
    if (user) loadMyRequests();
  }, [user]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("请填写名称");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await submitEquipmentRequest({
        request_type: reqType,
        title: title.trim(),
        description: description.trim(),
        quantity,
      });
      setSuccessMsg("申请已提交，等待管理员审核");
      setTitle("");
      setDescription("");
      setQuantity(1);
      loadMyRequests();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const openFormForItem = (itemName: string) => {
    setReqType("equipment");
    setTitle(itemName);
    setDescription("");
    setQuantity(1);
    setSuccessMsg("");
    setErrorMsg("");
    setShowModal(true);
  };

  const openLabSpaceForm = () => {
    setReqType("lab_space");
    setTitle("");
    setDescription("");
    setSuccessMsg("");
    setErrorMsg("");
    setShowModal(true);
  };

  const statusLabel: Record<string, string> = {
    pending: "待审核",
    approved: "已批准",
    rejected: "已拒绝",
  };
  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  if (authLoading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-black">加载中...</p>
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">实验器材</h1>
          <p className="text-sm text-black">浏览器材目录、提交使用申请</p>
        </div>
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
          onClick={() => setActiveTab("my-requests")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "my-requests"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-black hover:text-orange-600"
          }`}
        >
          我的申请
        </button>
      </div>

      {/* Catalog tab */}
      {activeTab === "catalog" && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openFormForItem(item.name)}
                className="group cursor-pointer rounded-xl border-2 border-gray-200 bg-white p-4 text-left transition-all hover:border-orange-400 hover:shadow-lg active:scale-95"
              >
                <span className="text-3xl transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
                <h3 className="mt-2 text-sm font-semibold text-black">{item.name}</h3>
                <p className="mt-1 text-xs text-gray-700">{item.description}</p>
                <div className="mt-2 text-xs text-orange-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  点击申请 &rarr;
                </div>
              </button>
            ))}
          </div>

          {/* Lab space request button */}
          <div className="mt-8">
            <button
              type="button"
              onClick={openLabSpaceForm}
              className="w-full rounded-xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-black transition-colors hover:border-orange-400 hover:text-orange-600"
            >
              + 申请实验室场地
            </button>
          </div>
        </>
      )}

      {/* My requests tab */}
      {activeTab === "my-requests" && (
        <div className="space-y-6">
          {/* My requests list */}
          <div>
            <h2 className="mb-4 text-lg font-bold text-black">我的申请</h2>
            {myRequests.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white py-8 text-center text-sm text-black">
                暂无申请记录，先去器材目录提交一份吧
              </p>
            ) : (
              <div className="space-y-3">
                {myRequests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-black">{req.title}</span>
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${statusColor[req.status] || ""}`}
                          >
                            {statusLabel[req.status] || req.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-black">
                          {req.request_type === "equipment" ? "器材" : "实验室场地"}
                          {req.request_type === "equipment" && req.quantity > 1
                            ? ` × ${req.quantity}`
                            : ""}
                          {" · "}
                          {req.created_at ? new Date(req.created_at).toLocaleDateString("zh-CN") : "未知"}
                        </p>
                        {req.description && (
                          <p className="mt-1 text-xs text-black">{req.description}</p>
                        )}
                        {req.admin_reply && (
                          <div className="mt-2 rounded-lg bg-orange-50 px-3 py-2">
                            <span className="text-xs font-medium text-orange-700">
                              管理员回复：
                            </span>
                            <p className="mt-0.5 text-xs text-black">{req.admin_reply}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Application Modal ---- */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-bold text-black">
                  {reqType === "equipment" ? "申请实验器材" : "申请实验室场地"}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Type toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReqType("equipment")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      reqType === "equipment"
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-black hover:bg-gray-200"
                    }`}
                  >
                    实验器材
                  </button>
                  <button
                    type="button"
                    onClick={() => setReqType("lab_space")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      reqType === "lab_space"
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-black hover:bg-gray-200"
                    }`}
                  >
                    实验室场地
                  </button>
                </div>

                {/* Title */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-black">
                    {reqType === "equipment" ? "器材名称" : "场地名称"}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={reqType === "equipment" ? "例如：显微镜" : "例如：A栋301实验室"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Quantity */}
                {reqType === "equipment" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-black">数量</label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-black">
                    申请理由（选填）
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="请说明用途和使用时间..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-orange-400 focus:outline-none"
                  />
                </div>

                {/* Messages */}
                {successMsg && (
                  <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                    {successMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {errorMsg}
                  </div>
                )}

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                  >
                    {submitting ? "提交中..." : "提交申请"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
