"use client";

/** Level display component with nickname effects and avatar frames. */

const FRAME_STYLES: Record<string, string> = {
  none: "",
  copper: "border-2 border-amber-700",
  silver: "border-2 border-gray-400 shadow-[0_0_6px_rgba(192,192,192,0.4)]",
  gold: "border-2 border-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]",
  diamond: "border-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  rainbow: "border-2 border-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 p-[2px]",
  dark_gold: "border-2 border-yellow-700 shadow-[0_0_10px_rgba(202,138,4,0.5)]",
  crown: "border-3 border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.6)]",
  galaxy: "border-2 border-indigo-400 shadow-[0_0_20px_rgba(129,140,248,0.5)]",
};

const NICKNAME_STYLES: Record<number, string> = {
  1: "text-gray-700",
  2: "text-gray-700",
  3: "text-yellow-600",
  4: "text-yellow-500",
  5: "bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent",
  6: "bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent",
  7: "bg-gradient-to-r from-purple-700 to-yellow-500 bg-clip-text text-transparent",
  8: "bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500 bg-clip-text text-transparent",
  9: "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent",
};

interface Props {
  level: number;
  icon: string;
  frame: string;
  nickname: string;
  avatar?: string | null;
  points: number;
  size?: "sm" | "md" | "lg";
}

export default function LevelBadge({ level, icon, frame, nickname, avatar, points, size = "md" }: Props) {
  const frameClass = FRAME_STYLES[frame] || "";
  const nickClass = NICKNAME_STYLES[level] || "text-gray-700";
  const sz = { sm: "h-8 w-8 text-lg", md: "h-10 w-10 text-xl", lg: "h-14 w-14 text-2xl" }[size];

  return (
    <div className="flex items-center gap-2">
      <div className={`relative flex items-center justify-center rounded-full bg-gray-100 ${sz} ${frameClass}`}>
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="text-black">{nickname[0]}</span>
        )}
        {/* Level icon overlay */}
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] shadow">
          {icon}
        </span>
      </div>
      <div>
        <p className={`text-sm font-bold ${nickClass}`}>{nickname}</p>
        <p className="text-[10px] text-black">VIP{level} · {points}分</p>
      </div>
    </div>
  );
}
