"use client";

import Link from "next/link";

// Matches @[显示名称](nodeId) format
const MENTION_REGEX = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;

interface Props {
  content: string;
}

export default function MentionHighlight({ content }: Props) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const displayName = match[1];
    const nodeId = match[2];
    parts.push(
      <Link
        key={match.index}
        href={`/graph?node=${nodeId}`}
        className="rounded bg-blue-50 px-1 text-blue-600 hover:bg-blue-100 hover:underline"
        title={`跳转到图谱节点: ${displayName}`}
      >
        @{displayName}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : content}</>;
}
