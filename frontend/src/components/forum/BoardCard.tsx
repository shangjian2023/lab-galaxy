"use client";

import { motion } from "framer-motion";
import type { ForumBoard } from "@/lib/api";
import { useRouter } from "next/navigation";

interface Props {
  board: ForumBoard;
  index: number;
}

export default function BoardCard({ board, index }: Props) {
  const router = useRouter();

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      onClick={() => router.push(`/forum/${board.slug}`)}
      className="liquid-glass-card flex cursor-pointer flex-col gap-3 p-5 text-left"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{board.icon}</span>
        <div>
          <h3 className="text-base font-bold text-gray-800">{board.name}</h3>
          <p className="text-[11px] text-gray-700">{board.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{board.thread_count} 帖子</span>
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: board.color }}
        />
      </div>
    </motion.button>
  );
}
