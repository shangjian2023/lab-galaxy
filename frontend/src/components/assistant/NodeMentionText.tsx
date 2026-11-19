import Link from "next/link";
import { AtSign } from "lucide-react";
import { parseNodeMentions } from "@/lib/node-mentions";

export function NodeMentionText({ text }: { text: string }) {
  const mentions = parseNodeMentions(text);
  if (!mentions.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.index > cursor) parts.push(text.slice(cursor, mention.index));
    parts.push(
      <Link className="node-mention-link" href={`/graph?node=${encodeURIComponent(mention.id)}`} key={`${mention.id}-${mention.index}`}>
        <AtSign size={11} />{mention.name}
      </Link>,
    );
    cursor = mention.index + mention.raw.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
