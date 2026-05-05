"use client";

import Link from "next/link";
import type { TeamDetail } from "@/lib/api";

interface Props {
  team: TeamDetail;
}

export default function TeamSpaceHeader({ team }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <Link href="/team" className="text-gray-400 transition-colors hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-gray-800">{team.name}</h1>
          {team.description && (
            <p className="text-xs text-gray-400">{team.description}</p>
          )}
        </div>
      </div>
      <span className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-600">
        {team.member_count} 成员
      </span>
    </div>
  );
}
