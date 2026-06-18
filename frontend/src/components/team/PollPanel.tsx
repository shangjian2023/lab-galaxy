"use client";

import { useCallback, useEffect, useState } from "react";
import { closePoll, createPoll, listPolls, votePoll, type TeamPoll } from "@/lib/api";

interface Props {
  teamId: string;
  currentUserId: string;
}

export default function PollPanel({ teamId, currentUserId }: Props) {
  const [polls, setPolls] = useState<TeamPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPolls(await listPolls(teamId));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [teamId, load]);

  const submit = async () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || clean.length < 2) return;
    setBusy(true);
    try {
      await createPoll(teamId, question.trim(), clean);
      setQuestion("");
      setOptions(["", ""]);
      setShowForm(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (p: TeamPoll, idx: number) => {
    if (p.status === "closed") return;
    try {
      await votePoll(teamId, p.id, idx);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const total = (p: TeamPoll) => Object.values(p.counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Action row (title is provided by the tab bar) */}
      <div className="flex items-center justify-end border-b border-black/5 px-3 py-2">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="glass-button rounded-lg px-2.5 py-1 text-xs text-[#6B5D50] transition-all duration-200 hover:-translate-y-0.5 hover:text-[#492D22]"
        >
          {showForm ? "取消" : "+ 发起投票"}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {showForm && (
          <div className="liquid-glass-compact space-y-2 p-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="投票问题…"
              maxLength={200}
              className="glass-input w-full rounded-lg px-2.5 py-1.5 text-sm"
            />
            {options.map((o, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={o}
                  onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`选项 ${i + 1}`}
                  className="glass-input w-full rounded-lg px-2.5 py-1.5 text-sm"
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))}
                    className="glass-button rounded-lg px-2 text-xs text-[#6B5D50]"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                onClick={() => setOptions((arr) => [...arr, ""])}
                className="glass-button w-full rounded-lg px-2 py-1 text-xs text-[#6B5D50]"
              >
                + 添加选项
              </button>
            )}
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-lg bg-[#9A8C73] px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#8C7D70] disabled:opacity-50"
            >
              {busy ? "发布中…" : "发布投票"}
            </button>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-[#6B5D50]">加载中…</p>
        ) : polls.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B5D50]">还没有投票，发起第一个吧</p>
        ) : (
          polls.map((p) => {
            const t = total(p);
            return (
              <div key={p.id} className="liquid-glass-compact p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[#492D22]">{p.question}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      p.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {p.status === "open" ? "进行中" : "已结束"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {p.options.map((opt, idx) => {
                    const c = p.counts[String(idx)] || 0;
                    const pct = t > 0 ? Math.round((c / t) * 100) : 0;
                    const mine = p.my_vote === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => vote(p, idx)}
                        disabled={p.status === "closed"}
                        className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all duration-200 ${
                          mine ? "border-[#9A8C73] bg-[#DBC7B5]/30" : "border-black/5 bg-black/[0.02]"
                        } ${p.status === "open" ? "hover:-translate-y-0.5 hover:border-[#9A8C73]/40 hover:shadow-sm" : "cursor-default"}`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[#9A8C73]/15 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between">
                          <span className={`font-medium ${mine ? "text-[#492D22]" : "text-[#4a3e34]"}`}>
                            {mine && "✓ "}
                            {opt}
                          </span>
                          <span className="text-[#6B5D50]">
                            {c} · {pct}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-[#6B5D50]">
                  <span>{t} 人参与</span>
                  {p.created_by === currentUserId && p.status === "open" && (
                    <button
                      onClick={() => closePoll(teamId, p.id).then(load)}
                      className="glass-button rounded px-2 py-0.5 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      结束投票
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
