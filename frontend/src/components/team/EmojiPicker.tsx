"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊",
  "😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋",
  "😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡",
  "🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬",
  "🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢",
  "🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎",
  "🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲","😳",
  "🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱",
  "😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠",
  "👍","👎","👏","🙌","🤝","💪","🔥","❤️","💯","🎉",
  "👀","💡","⭐","🌟","✅","❌","⚡","🚀","💬","📌",
];

const KAOMOJI = [
  "(≧▽≦)", "(^_^)", "(T_T)", "(>_<)", "(;_;)",
  "(￣▽￣)", "(¬_¬)", "(づ￣ ³￣)づ", "(╯°□°）╯", "╰（‵□′）╯",
  "(๑•̀ㅂ•́)و✧", "( ´ ▽ ` )ﾉ", "¯\\_(ツ)_/¯", "(°∀°)ﾉﾞ",
  "(๑˃̵ᴗ˂̵)و", "(๑•̀ㅂ•́)و✧",
];

interface Props {
  onSelect: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, isOpen, onClose }: Props) {
  const [tab, setTab] = useState<"emoji" | "kaomoji">("emoji");
  const ref = useRef<HTMLDivElement>(null);

  const handleSelect = (item: string) => {
    onSelect(item);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          ref={ref}
          className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-[#DBC7B5]/30 bg-white/95 shadow-xl backdrop-blur-sm"
          style={{ backdropFilter: "blur(12px)" }}
        >
          {/* Tabs */}
          <div className="flex border-b border-[#DBC7B5]/20">
            <button
              onClick={() => setTab("emoji")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "emoji" ? "text-[#492D22] border-b-2 border-[#9A8C73]" : "text-[#9A8C73] hover:text-[#6B5D50]"
              }`}
            >
              表情
            </button>
            <button
              onClick={() => setTab("kaomoji")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "kaomoji" ? "text-[#492D22] border-b-2 border-[#9A8C73]" : "text-[#9A8C73] hover:text-[#6B5D50]"
              }`}
            >
              颜文字
            </button>
          </div>

          {/* Content */}
          <div className="max-h-56 overflow-y-auto p-2">
            {tab === "emoji" ? (
              <div className="grid grid-cols-10 gap-0.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => handleSelect(e)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors hover:bg-[#DBC7B5]/30"
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {KAOMOJI.map((k) => (
                  <button
                    key={k}
                    onClick={() => handleSelect(k)}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono text-[#6B5D50] transition-colors hover:bg-[#DBC7B5]/30"
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
