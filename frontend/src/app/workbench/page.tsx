"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getDocTree, getCardStream, toggleFavorite, discoverInsights, type DocTreeNode, type CardItem, type InsightEvent } from "@/lib/api";
import { soundEngine } from "@/lib/audio/SoundEngine";
import DocTree from "@/components/workbench/DocTree";
import CardStream from "@/components/workbench/CardStream";
import DetailDrawer from "@/components/workbench/DetailDrawer";
import InsightOverlay from "@/components/insight/InsightOverlay";
import InsightCard from "@/components/insight/InsightCard";
import SoundSettings from "@/components/insight/SoundSettings";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

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

  const [insights, setInsights] = useState<InsightEvent[]>([]);
  const [activeInsight, setActiveInsight] = useState<InsightEvent | null>(null);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [animationIntensity, setAnimationIntensity] = useState(0.7);
  const [showInsightPanel, setShowInsightPanel] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    discoverInsights().then((res) => {
      if (res.insights.length > 0) {
        setInsights(res.insights);
        // Auto-show insight overlay removed — only triggered after document upload completion
      }
    });
  }, [user]);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const handleToggleFavorite = useCallback(async (id: string) => {
    await toggleFavorite(id);
    soundEngine.play("connect");
    setCards((prev) =>
      prev.map((c) => c.id === id ? { ...c, is_favorite: !c.is_favorite } : c),
    );
  }, []);

  const selectedCard = cards.find((c) => c.id === selectedId) || null;

  const handleJumpToGraph = useCallback((nodeId: string) => {
    soundEngine.play("hover");
    router.push(`/graph?node=${nodeId}&scope=private`);
  }, [router]);

  const handleDeleteDoc = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    loadTree();
    void loadCards(1, false);
  }, [selectedId, loadTree, loadCards]);

  const handleViewInsight = useCallback((insight: InsightEvent) => {
    setActiveInsight(insight);
    soundEngine.play("insight");
  }, []);

  const handleDismissInsight = useCallback((_type: string) => {
    setInsights((prev) => prev.slice(1));
    if (insights.length <= 1) setShowInsightPanel(false);
  }, [insights.length]);

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
      <InsightOverlay
        insight={activeInsight}
        onDismiss={() => setActiveInsight(null)}
        animationIntensity={animationIntensity}
      />

      <SoundSettings open={showSoundSettings} onClose={() => setShowSoundSettings(false)} />

      <div className="flex items-center justify-between glass-light px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">工作台</h1>
          <p className="text-xs text-black">文档与知识图谱联动浏览</p>
        </div>
        <div className="flex items-center gap-4">
          {insights.length > 0 && (
            <button
              onClick={() => setShowInsightPanel(!showInsightPanel)}
              className="glass-button flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-orange-700"
            >
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </motion.span>
              {insights.length} 条洞察
            </button>
          )}

          <button
            onClick={() => setShowSoundSettings(true)}
            className="glass-button rounded-lg p-1.5 text-black"
            title="音效设置"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </button>

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

          <AnimatePresence>
            {showInsightPanel && insights.length > 0 && (
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="glass-card rounded-t-2xl absolute bottom-0 left-0 right-0 max-h-[40vh] overflow-y-auto p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-orange-700">AI 洞察</h3>
                  <button onClick={() => setShowInsightPanel(false)} className="text-xs text-black hover:text-black">
                    收起
                  </button>
                </div>
                <div className="space-y-3">
                  {insights.map((insight, i) => (
                    <InsightCard
                      key={`${insight.type}-${i}`}
                      insight={insight}
                      onView={handleViewInsight}
                      onDismiss={handleDismissInsight}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
