"use client";

import Link from "next/link";
import { getBoardInfo, getPostTypeInfo } from "./PostTypeBadge";

const AT_REGEX = /@([a-zA-Z0-9_一-鿿]+)/g;

interface Props {
  content: string;
}

export default function MentionHighlight({ content }: Props) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(AT_REGEX.source, AT_REGEX.flags);

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const nodeId = match[1];
    parts.push(
      <Link
        key={match.index}
        href={`/graph?node=${nodeId}`}
        className="rounded bg-blue-50 px-1 text-blue-600 hover:bg-blue-100 hover:underline"
      >
        @{nodeId}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : content}</>;
}
