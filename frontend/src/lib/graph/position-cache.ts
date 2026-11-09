/**
 * 图谱位置缓存：IndexedDB（idb-keyval），按 用户 + scope(+team) 隔离。
 *
 * 旧版把位置缓存写在全局 localStorage（跨账号共享同一份坐标），
 * 这里改为独立命名空间：不同用户、不同 scope 的布局互不可见，
 * 未授权情况下不会跨账号泄漏节点位置。延迟加载 idb-keyval，
 * 键构造与签名计算为纯函数（可单测，无需 IndexedDB）。
 */

export const CACHE_SCHEMA_VERSION = 1;

export interface LayoutCacheRecord {
  version: number;
  /** 数据签名（节点+边 id 集合哈希），签名不符即弃用 */
  signature: string;
  positions: Record<string, [number, number]>;
  pinned: string[];
  savedAt: number;
}

export interface CacheScope {
  userId: string;
  scope: "private" | "team" | "public";
  teamId?: string | null;
}

/**
 * 缓存命名空间（IndexedDB database 名）：用户与 scope 完全隔离。
 * demo 模式使用独立的 "demo" 用户命名空间，不污染真实账号。
 */
export function cacheNamespace(scopeInfo: CacheScope): string {
  const user = scopeInfo.userId || "anonymous";
  const team = scopeInfo.teamId || "-";
  return `layout:v${CACHE_SCHEMA_VERSION}:u:${user}:s:${scopeInfo.scope}:t:${team}`;
}

/** 单条记录键：命名空间 + 图签名（同一 scope 下不同过滤结果各存一份） */
export function cacheKey(namespace: string, signature: string): string {
  return `${namespace}::${signature}`;
}

/** 数据签名：只取 id 集合（内容变化不影响布局复用） */
export function graphSignature(nodeIds: readonly string[], edgeKeys: readonly string[]): string {
  const part = (list: readonly string[]) => {
    const sorted = [...list].sort();
    let h = 0x811c9dc5;
    for (const s of sorted) {
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h ^= 0x1f;
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  };
  return `n${part(nodeIds)}-e${part(edgeKeys)}`;
}

type Store = import("idb-keyval").UseStore;

let storeCache = new Map<string, Promise<Store>>();

async function getStore(namespace: string): Promise<Store> {
  const existing = storeCache.get(namespace);
  if (existing) return existing;
  const promise = import("idb-keyval").then(({ createStore }) =>
    createStore(`lab-galaxy-graph:${namespace}`, "kv"),
  );
  storeCache.set(namespace, promise);
  return promise;
}

export async function loadLayout(scopeInfo: CacheScope, signature: string): Promise<LayoutCacheRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const { get } = await import("idb-keyval");
    const store = await getStore(cacheNamespace(scopeInfo));
    const record = (await get(cacheKey(cacheNamespace(scopeInfo), signature), store)) as
      | LayoutCacheRecord
      | undefined;
    if (!record || record.version !== CACHE_SCHEMA_VERSION || record.signature !== signature) {
      return null;
    }
    return record;
  } catch {
    return null; // 隐私模式/配额失败等：无缓存也可用
  }
}

export async function saveLayout(
  scopeInfo: CacheScope,
  signature: string,
  positions: Record<string, [number, number]>,
  pinned: readonly string[],
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const { set } = await import("idb-keyval");
    const namespace = cacheNamespace(scopeInfo);
    const store = await getStore(namespace);
    const record: LayoutCacheRecord = {
      version: CACHE_SCHEMA_VERSION,
      signature,
      positions,
      pinned: [...pinned],
      savedAt: Date.now(),
    };
    await set(cacheKey(namespace, signature), record, store);
  } catch {
    // 写失败静默：缓存是纯优化
  }
}
