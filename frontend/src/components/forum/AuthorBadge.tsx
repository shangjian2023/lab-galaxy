"use client";

import Link from "next/link";

interface Props {
  nickname: string;
  level: number;
  avatar: string | null;
}

export default function AuthorBadge({ nickname, level, avatar }: Props) {
  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-600">
          {nickname.charAt(0)}
        </span>
      )}
      <span className="text-xs text-black">{nickname}</span>
      <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold text-orange-500 ring-1 ring-orange-200/40">
        Lv{level}
      </span>
    </div>
  );
}
