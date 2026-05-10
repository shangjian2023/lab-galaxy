"use client";

import { useState, useCallback, useEffect } from "react";
import { getNodeContext } from "@/lib/api";

interface Props {
  nodeId: string;
  displayName: string;
  className?: string;
  children?: React.ReactNode;
}

export default function SmartNodeLink({ nodeId, displayName, className, children }: Props) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ scope: string; node: Props["displayName"] } | null>(null);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    // If we already resolved, let the link navigate normally
    if (resolved) return;

    e.preventDefault();
    setChecking(true);
    setError(null);

    try {
      const ctx = await getNodeContext(nodeId);
      if (!ctx.accessible) {
        setError("无权访问此节点");
        return;
      }
      setResolved({ scope: ctx.scope, node: ctx.node.name || displayName });
      // Navigate to the correct scope
      const scopeParam = ctx.scope === "team" ? "&scope=private" : ctx.scope === "public" ? "&scope=public" : "";
      window.location.href = `/graph?node=${nodeId}${scopeParam}`;
    } catch {
      setError("无法验证节点权限");
    } finally {
      setChecking(false);
    }
  }, [nodeId, displayName, resolved]);

  return (
    <>
      <a
        href={`/graph?node=${nodeId}`}
        onClick={handleClick}
        className={className || "rounded bg-blue-50 px-1 text-blue-600 hover:bg-blue-100 hover:underline"}
        title={`跳转到图谱节点: ${displayName}`}
      >
        {children || `@${displayName}`}
      </a>

      {/* Error dialog */}
      {error && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setError(null)}>
          <div className="mx-4 max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h3 className="text-sm font-bold text-gray-800">权限不足</h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">{error}</p>
            <button
              onClick={() => setError(null)}
              className="w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {checking && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/20">
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
            正在验证权限...
          </div>
        </div>
      )}
    </>
  );
}
