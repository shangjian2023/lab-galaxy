"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Atom,
  FileText,
  ImageOff,
  LayoutDashboard,
  LogIn,
  Menu,
  Network,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/components/app/AuthProvider";

const navigation = [
  { href: "/", label: "研究概览", icon: LayoutDashboard },
  { href: "/graph", label: "知识星图", icon: Network },
  { href: "/documents", label: "实验档案", icon: FileText },
  { href: "/assistant", label: "研究助手", icon: Sparkles },
];

const secondaryNavigation = [
  { href: "/team", label: "协作空间", icon: Users },
];

function atmosphereFor(pathname: string) {
  if (pathname === "/team" || pathname.startsWith("/team/")) return { asset: "rooms/turner-harbor", name: "harbor" };
  if (pathname === "/graph") return { asset: "atmospheres/graph-landscape", name: "night" };
  if (pathname === "/documents") return { asset: "atmospheres/documents-still-life", name: "ochre" };
  if (pathname === "/assistant" || pathname === "/workbench") return { asset: "atmospheres/workbench-evening", name: "dusk" };
  if (pathname === "/account" || pathname.startsWith("/admin") || pathname === "/profile" || pathname === "/growth") return { asset: "atmospheres/profile-portrait", name: "moss" };
  if (pathname.startsWith("/forum")) return { asset: "atmospheres/forum-flower-study", name: "ochre" };
  return { asset: "atmospheres/home-water-lilies", name: "moss" };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [artVisible, setArtVisible] = useState(true);
  const [artOpacity, setArtOpacity] = useState(42);
  const [artSettingsOpen, setArtSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const atmosphere = atmosphereFor(pathname);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("lab-galaxy-atmosphere");
    const opacityValue = window.localStorage.getItem("lab-galaxy-atmosphere-opacity");
    const savedOpacity = Number(opacityValue);
    setArtVisible(saved !== "off");
    if (opacityValue !== null && Number.isFinite(savedOpacity) && savedOpacity >= 0 && savedOpacity <= 70) {
      setArtOpacity(savedOpacity);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.atmosphere = artVisible ? "on" : "off";
    document.documentElement.style.setProperty("--atmosphere-opacity", String(artOpacity / 100));
    window.localStorage.setItem("lab-galaxy-atmosphere", artVisible ? "on" : "off");
    window.localStorage.setItem("lab-galaxy-atmosphere-opacity", String(artOpacity));
  }, [artVisible, artOpacity]);

  useEffect(() => {
    setMobileOpen(false);
    setArtSettingsOpen(false);
  }, [pathname]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (value) router.push(`/graph?q=${encodeURIComponent(value)}`);
  };

  const links = [...navigation, ...secondaryNavigation];

  return (
    <div className="app-shell" data-atmosphere={atmosphere.name}>
      <div className={`atlas-atmosphere atlas-atmosphere-${atmosphere.name}`} aria-hidden="true">
        <picture>
          {atmosphere.name === "harbor" ? <source media="(max-width: 720px)" srcSet="/images/rooms/turner-harbor-mobile.webp" type="image/webp" /> : null}
          <img src={`/images/${atmosphere.asset}.webp`} alt="" width="1200" height="900" decoding="async" fetchPriority="high" />
        </picture>
      </div>

      <header className="atlas-nav">
        <div className="atlas-nav-inner">
          <Link href="/" className="atlas-brand" aria-label="Lab Galaxy 首页">
            <span className="atlas-brand-mark"><Atom size={25} strokeWidth={1.45} /></span>
            <span><strong>LAB GALAXY</strong><small>LAB KNOWLEDGE ATLAS</small></span>
          </Link>

          <nav className="atlas-primary" aria-label="主导航">
            {links.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.label}</Link>;
            })}
          </nav>

          <div className="atlas-nav-actions">
            <form className="atlas-search" onSubmit={submitSearch} role="search">
              <Search size={15} aria-hidden="true" />
              <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="检索知识档案" aria-label="全局搜索" />
              <kbd>⌘ K</kbd>
            </form>
            <div className="atlas-atmosphere-control">
              <button className="atlas-icon-button atmosphere-toggle" onClick={() => setArtSettingsOpen((value) => !value)} aria-expanded={artSettingsOpen} aria-label="调整油画背景" title="调整油画背景"><SlidersHorizontal size={16} /></button>
              {artSettingsOpen ? <div className="atlas-art-popover">
                <div className="atlas-art-heading"><span>油画氛围</span><output>{artOpacity}%</output></div>
                <label htmlFor="atlas-art-opacity">背景不透明度</label>
                <input id="atlas-art-opacity" type="range" min="0" max="70" step="1" value={artOpacity} onChange={(event) => setArtOpacity(Number(event.target.value))} />
                <div className="atlas-art-scale"><span>清淡</span><span>浓郁</span></div>
                <button className="btn btn-secondary w-full" onClick={() => setArtVisible((value) => !value)} aria-pressed={!artVisible}><ImageOff size={14} />{artVisible ? "关闭艺术背景" : "开启艺术背景"}</button>
                <small>浓度与开关会保存在此浏览器</small>
              </div> : null}
            </div>
            <Link href="/account" className={`atlas-account ${user ? "signed-in" : ""}`} aria-label={user ? `账户：${user.displayName}` : "登录或注册"}>
              <span className="atlas-account-avatar">{user?.displayName.slice(0, 1) ?? <LogIn size={14} />}</span>
              <span>{authLoading ? "读取账户" : user?.displayName ?? "登录 / 注册"}</span>
            </Link>
            <button className="atlas-icon-button atlas-mobile-trigger" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {mobileOpen ? <div className="atlas-mobile-layer">
        <button className="atlas-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="关闭导航" />
        <aside className="atlas-mobile-menu">
          <div className="atlas-mobile-heading"><span>探索知识 atlas</span><button className="atlas-icon-button" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={19} /></button></div>
          <nav aria-label="移动端主导航">{links.map((item, index) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{String(index + 1).padStart(2, "0")}</span><item.icon size={18} /><strong>{item.label}</strong></Link>;
          })}</nav>
          <div className="atlas-mobile-art">
            <label htmlFor="atlas-mobile-art-opacity"><span>油画背景不透明度</span><output>{artOpacity}%</output></label>
            <input id="atlas-mobile-art-opacity" type="range" min="0" max="70" step="1" value={artOpacity} onChange={(event) => setArtOpacity(Number(event.target.value))} />
            <button className="atlas-text-action" onClick={() => setArtVisible((value) => !value)}><ImageOff size={14} />{artVisible ? "切换到低干扰模式" : "恢复油画背景"}</button>
          </div>
          <form className="atlas-mobile-search" onSubmit={submitSearch} role="search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索实体、方法或结论" aria-label="移动端全局搜索" /></form>
          <p>实验文档 · 知识关系 · 证据问答 · 团队协作</p>
        </aside>
      </div> : null}

      <div className="app-main">
        <main className="content-area">{children}</main>
        <footer className="atlas-footer"><span>LAB GALAXY · RESEARCH, CONNECTED.</span><span>艺术背景来自 Getty Open Content · 作品信息随资产保存</span></footer>
      </div>
    </div>
  );
}
