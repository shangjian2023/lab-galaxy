import { PageHeader } from "@/components/app/PageHeader";
import { AccountPanel } from "@/components/app/AccountPanel";

export const metadata = { title: "创建研究账户" };

export default function RegisterPage() {
  return (
    <>
      <PageHeader eyebrow="RESEARCH IDENTITY / 研究身份" title="建立清晰的知识边界。" description="创建真实研究账户。后续账号需要管理员审核；文档、会话与团队共享均按服务端权限隔离。" />
      <AccountPanel initialMode="register" />
    </>
  );
}
