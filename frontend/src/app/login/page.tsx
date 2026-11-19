import { PageHeader } from "@/components/app/PageHeader";
import { AccountPanel } from "@/components/app/AccountPanel";

export const metadata = { title: "登录研究空间" };

export default function LoginPage() {
  return (
    <>
      <PageHeader eyebrow="SECURE ACCESS / 研究账户" title="回到你的研究空间。" description="登录后继续管理私有文档、知识抽取、证据问答与团队协作。公开实验报告无需登录即可阅读。" />
      <AccountPanel initialMode="login" />
    </>
  );
}
