"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Atom,
  Bell,
  BookOpen,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogIn,
  Menu,
  Network,
  Search,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/components/app/AuthProvider";

const navigation = [
  { href: "/", label: "研究概览", icon: LayoutDashboard },
  { href: "/graph", label: "知识星图", icon: Network },
  { href: "/documents", label: "文档中心", icon: FileText },
  { href: "/assistant", label: "研究助手", icon: Sparkles },
];

const secondaryNavigation = [
  { href: "/team", label: "协作空间", icon: Users },
  { href: "/templates", label: "实验模板", icon: BookOpen },
];

const pageNames: Record<string, string> = {
  "/": "研究概览",
  "/graph": "知识星图",
  "/documents": "文档中心",
  "/assistant": "研究助手",
  "/account": "账户与访问",
  "/team": "协作空间",
  "/templates": "实验模板",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => setMobileOpen(false), [pathname]);

  if (pathname === "/login" || pathname === "/register") return children;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (value) router.push(`/graph?q=${encodeURIComponent(value)}`);
  };

  const sidebar = (
    <>
      <Link href="/" className="brand" aria-label="Lab Galaxy 首页">
        <span className="brand-mark"><Atom size={23} strokeWidth={1.7} /></span>
        <span>
          <span className="brand-name">Lab Galaxy</span>
          <span className="brand-subtitle">创新实验知识平台</span>
        </span>
      </Link>

      <Link href="/account" className="workspace-switcher">
        <span className="workspace-avatar">{user?.displayName.slice(0, 1) ?? "公"}</span>
        <span className="min-w-0 flex-1">
          <span className="workspace-name">{user ? "个人研究空间" : "公开语料空间"}</span>
          <span className="workspace-meta">{authLoading ? "读取登录状态…" : user ? (user.role === "admin" ? "管理员 · 已审核" : "研究员 · 已审核") : "登录后使用私有知识"}</span>
        </span>
        <ChevronRight size={14} aria-hidden="true" />
      </Link>

      <nav className="sidebar-nav" aria-label="主导航">
        <p className="nav-section-label">研究工作台</p>
        {navigation.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {active ? <span className="nav-active-dot" /> : null}
            </Link>
          );
        })}
        <p className="nav-section-label nav-section-spaced">资源与协作</p>
        {secondaryNavigation.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <Link href="/documents" className="sidebar-upload">
          <Upload size={17} />
          <span>导入实验文档</span>
        </Link>
        <Link href="/account" className="sidebar-profile">
          <span className="profile-avatar">{user?.displayName.slice(0, 1) ?? <LogIn size={13} />}</span>
          <span className="min-w-0 flex-1">
            <span className="profile-name">{authLoading ? "账户加载中" : user?.displayName ?? "登录 / 注册"}</span>
            <span className="profile-meta">{user ? user.email : "公开报告可免登录阅读"}</span>
          </span>
          {user ? <span className="status-indicator" title="已登录" /> : null}
        </Link>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      {mobileOpen ? (
        <div className="mobile-sidebar-layer">
          <button className="mobile-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="关闭导航" />
          <aside className="mobile-sidebar">
            <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={19} /></button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
            <span className="topbar-crumb">Lab Galaxy</span>
            <ChevronRight size={13} className="topbar-chevron" />
            <span className="topbar-page">{pageNames[pathname] ?? "研究工作台"}</span>
          </div>
          <div className="topbar-actions">
            <form className="global-search" onSubmit={submitSearch} role="search">
              <Search size={16} aria-hidden="true" />
              <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索实体、文档或关系" aria-label="全局搜索" />
              <kbd>⌘ K</kbd>
            </form>
            <span className="demo-pill"><span />DEMO</span>
            <button className="icon-button notification-button" aria-label="通知，暂无未读消息"><Bell size={18} /></button>
            <Link href="/account" className={`topbar-avatar ${user ? "" : "guest"}`} aria-label={user ? `账户：${user.displayName}` : "登录或注册"}>{user?.displayName.slice(0, 1) ?? <LogIn size={14} />}</Link>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
