export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="glass-card p-10 text-center">
        <h1 className="mb-2 text-7xl font-bold text-warm-300">404</h1>
        <p className="mb-6 text-lg text-[#6b5e50]">页面不存在</p>
        <a href="/" className="btn-primary inline-block">返回首页</a>
      </div>
    </main>
  );
}
