"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { soundEngine } from "@/lib/audio/SoundEngine";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SoundSettings({ open, onClose }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(60);
  const [intensity, setIntensity] = useState(70);

  useEffect(() => {
    soundEngine.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    soundEngine.setVolume(volume / 100);
  }, [volume]);

  const handleTest = (type: "connect" | "insight" | "hover" | "achievement") => {
    soundEngine.play(type);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="glass-modal-overlay fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            className="glass-card w-80 rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
          <h3 className="mb-4 text-sm font-bold text-gray-800">音效与动画设置</h3>

          {/* Sound toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-black">音效</span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-orange-500" : "bg-gray-300"}`}
            >
              <motion.div
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                animate={{ left: enabled ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          {/* Volume */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-black">音量</span>
              <span className="text-xs text-black">{volume}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          {/* Animation intensity */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-black">动画强度</span>
              <span className="text-xs text-black">{intensity}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          {/* Test sounds */}
          <div className="mb-3">
            <span className="mb-2 block text-xs text-gray-700">试听音效</span>
            <div className="grid grid-cols-2 gap-2">
              <TestBtn label="连接音" onClick={() => handleTest("connect")} />
              <TestBtn label="洞察音" onClick={() => handleTest("insight")} />
              <TestBtn label="提示音" onClick={() => handleTest("hover")} />
              <TestBtn label="成就音" onClick={() => handleTest("achievement")} />
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-secondary w-full rounded-lg py-2 text-xs font-medium"
          >
            关闭
          </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TestBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-button rounded-lg px-3 py-1.5 text-[10px] font-medium text-black hover:text-orange-600"
    >
      {label}
    </button>
  );
}
