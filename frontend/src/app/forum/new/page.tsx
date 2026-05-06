"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ThreadComposer from "@/components/forum/ThreadComposer";

function ThreadComposerInner() {
  const searchParams = useSearchParams();
  const defaultBoard = searchParams.get("board") || undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <ThreadComposer defaultBoard={defaultBoard} />
    </main>
  );
}

export default function NewThreadPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-8"><p className="text-black">加载中...</p></main>}>
      <ThreadComposerInner />
    </Suspense>
  );
}
