import { PageHeader } from "@/components/app/PageHeader";
import { AccountPanel } from "@/components/app/AccountPanel";

export const metadata = { title: "账户与访问" };

export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="IDENTITY / KNOWLEDGE BOUNDARY" title="你的知识，有清晰的边界。" description="真实账户、管理员审核与服务端可见性控制。公开报告仍可免登录阅读，模型问答只向已审核账号开放。" />
      <AccountPanel />
    </>
  );
}
