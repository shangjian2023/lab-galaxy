export interface ParsedNodeMention {
  id: string;
  name: string;
  raw: string;
  index: number;
}

const MENTION_SOURCE = /@\[([^\]\r\n]{1,120})\]\(([a-zA-Z0-9-]{1,80})\)/g;

export function parseNodeMentions(value: string, limit = 4): ParsedNodeMention[] {
  const mentions: ParsedNodeMention[] = [];
  for (const match of value.matchAll(MENTION_SOURCE)) {
    if (mentions.length >= limit) break;
    mentions.push({ name: match[1], id: match[2], raw: match[0], index: match.index ?? 0 });
  }
  return mentions;
}

/** 将展示标记还原为自然语言，供会话标题、全文检索和模型问题使用。 */
export function nodeMentionsToText(value: string): string {
  return value.replace(MENTION_SOURCE, (_raw, name: string) => `@${name}`);
}
