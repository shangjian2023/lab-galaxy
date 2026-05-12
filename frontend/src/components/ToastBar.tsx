"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Toast {
  id: number;
  msg: string;
  type: "success" | "error" | "info";
}

let nextId = 0;

export default function ToastBar() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { msg: string; type: Toast["type"] };
      const id = nextId++;
      setToasts((prev) => [...prev, { id, msg: detail.msg, type: detail.type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    };
    window.addEventListener("kg-notify", handler);
    return () => window.removeEventListener("kg-notify", handler);
  }, []);

  const colors: Record<Toast["type"], string> = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-blue-600 text-white",
  };

  const icons: Record<Toast["type"], string> = {
    success: "✓",
    error: "✗",
    info: "ℹ",
  };

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg ${colors[t.type]}`}
          >
            <span className="font-medium">{icons[t.type]}</span>
            <span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
