import { describe, expect, it } from "vitest";
import { nodeMentionsToText, parseNodeMentions } from "./node-mentions";

describe("node mentions", () => {
  it("保留旧版 @[名称](id) 语义并还原自然语言问题", () => {
    const input = "请比较 @[UDP协议](node-udp-1) 与 @[TCP协议](node-tcp-2) 的实验结论";
    expect(parseNodeMentions(input).map(({ id, name, raw }) => ({ id, name, raw }))).toEqual([
      { id: "node-udp-1", name: "UDP协议", raw: "@[UDP协议](node-udp-1)" },
      { id: "node-tcp-2", name: "TCP协议", raw: "@[TCP协议](node-tcp-2)" },
    ]);
    expect(parseNodeMentions(input).map((mention) => mention.index)).toEqual([input.indexOf("@[UDP"), input.indexOf("@[TCP")]);
    expect(nodeMentionsToText(input)).toBe("请比较 @UDP协议 与 @TCP协议 的实验结论");
  });

  it("最多读取四个节点，避免无界上下文", () => {
    const input = Array.from({ length: 6 }, (_, index) => `@[节点${index}](node-${index})`).join(" ");
    expect(parseNodeMentions(input)).toHaveLength(4);
  });

  it("拒绝不符合标记语法的普通邮箱和括号文本", () => {
    expect(parseNodeMentions("name@example.com @[缺少ID] @[坏ID](!!!)")).toEqual([]);
  });
});
