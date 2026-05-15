"use client";

import Link from "next/link";
import type { TeamDetail } from "@/lib/api";

interface Props {
  team: TeamDetail;
}

export default function TeamSpaceHeader({ team }: Props) {
  return (
    <div className="flex items-center justify-between px-6 py-3" style={{ background: "#F4F1EE", borderBottom: "1px solid rgba(154,140,115,0.15)" }}>
      <div className="flex items-center gap-3">
        <Link href="/team" className="text-[#6B5D50] transition-colors hover:text-[#492D22]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-sm font-bold text-[#492D22]">{team.name}</h1>
        </div>
      </div>
      <span className="rounded-full bg-[#DBC7B5]/40 px-2.5 py-0.5 text-[10px] font-medium text-[#6B5D50]">
        {team.member_count} 成员
      </span>
    </div>
  );
}
