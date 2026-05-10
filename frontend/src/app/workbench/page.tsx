"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getDocTree, getCardStream, toggleFavorite, type DocTreeNode, type CardItem } from "@/lib/api";
import DocTree from "@/components/workbench/DocTree";
import CardStream from "@/components/workbench/CardStream";
import DetailDrawer from "@/components/workbench/DetailDrawer";
import { useRouter, useSearchParams } from "next/navigation";

function WorkbenchPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetDocId = searchParams.get("doc");

  const [tree, setTree] = useState<DocTreeNode>({});
  const [cards, setCards] = useState<CardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [isLoadingCards, setIsLoadingCards] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const appliedDocParamRef = useRef<string | null>(null);
  const requestedDocPageRef = useRef<number | null>(null);

  const loadTree = useCallback(() => {
    if (!user) return;
    getDocTree().then(setTree);
  }, [user]);

  const loadCards = useCallback(async (p: number = 1, append = false) => {
    if (!user) return;
    setIsLoadingCards(true);
    try {
      const res = await getCardStream({ page: p, favorite_only: filterFavorites || undefined });
      if (append) {
        setCards((prev) => [...prev, ...res.cards]);
      } else {
        setCards(res.cards);
      }
      setTotal(res.total);
    } finally {
      setIsLoadingCards(false);
    }
  }, [user, filterFavorites]);

  useEffect(() => { loadTree(); }, [loadTree]);
  useEffect(() => { void loadCards(1, false); setPage(1); }, [filterFavorites, loadCards]);
  useEffect(() => { if (page > 1) void loadCards(page, true); }, [page, loadCards]);

  useEffect(() => {
    if (!targetDocId) {
      appliedDocParamRef.current = null;
      requestedDocPageRef.current = null;
      return;
    }
    if (appliedDocParamRef.current === targetDocId) return;
    if (filterFavorites) {
      setFilterFavorites(false);
      return;
    }
    const matched = cards.find((card) => card.id === targetDocId);
    if (matched) {
      setSelectedId(targetDocId);
      appliedDocParamRef.current = targetDocId;
      requestedDocPageRef.current = null;
      return;
    }
    if (!isLoadingCards && cards.length > 0 && cards.length < total && requestedDocPageRef.current !== page + 1) {
      requestedDocPageRef.current = page + 1;
      setPage((prev) => prev + 1);
    }
  }, [targetDocId, filterFavorites, cards, total, isLoadingCards, page]);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const handleToggleFavorite = useCallback(async (id: string) => {
    await toggleFavorite(id);
    setCards((prev) =>
      prev.map((c) => c.id === id ? { ...c, is_favorite: !c.is_favorite } : c),
    );
  }, []);

  const selectedCard = cards.find((c) => c.id === selectedId) || null;

  const handleJumpToGraph = useCallback((nodeId: string) => {
    router.push(`/graph?node=${nodeId}&scope=private`);
  }, [router]);

  const handleDeleteDoc = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    loadTree();
    void loadCards(1, false);
  }, [selectedId, loadTree, loadCards]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-black">加载中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-700">请先登录后使用工作台</p>
          <a href="/login" className="text-brand-600 hover:underline">去登录</a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-53px)] flex-col">
      <div className="flex items-center justify-between glass-light px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">工作台</h1>
          <p className="text-xs text-black">文档与知识图谱联动浏览</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-black">
            {total} 个文档 | {cards.filter((c) => c.is_favorite).length} 个收藏
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        <div className="w-56 flex-shrink-0 glass-warm overflow-hidden">
          <DocTree
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filterFavorites={filterFavorites}
            onFilterFavorites={setFilterFavorites}
          />
        </div>

        <div className="relative flex-1 overflow-hidden bg-transparent">
          {cards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-black">
              暂无文档，上传后开始浏览
            </div>
          ) : (
            <CardStream
              cards={cards}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleFavorite={handleToggleFavorite}
              loadMore={handleLoadMore}
              hasMore={cards.length < total}
            />
          )}
        </div>

        <DetailDrawer
          card={selectedCard}
          onClose={() => setSelectedId(null)}
          onJumpToGraph={handleJumpToGraph}
          onDelete={handleDeleteDoc}
        />
      </div>
    </main>
  );
}

export default function WorkbenchPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-black">加载中...</p></main>}>
      <WorkbenchPageContent />
    </Suspense>
  );
}
