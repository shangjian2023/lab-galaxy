"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UploadPanel from "@/components/UploadPanel";
import DocList from "@/components/DocList";

export default function DocumentsPage() {
  const { user, loading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-500">请先登录后查看文档</p>
          <a href="/login" className="text-blue-600 hover:underline">去登录</a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <UploadPanel onUploaded={() => setRefreshKey((k) => k + 1)} />
      <DocList refreshKey={refreshKey} />
    </main>
  );
}
