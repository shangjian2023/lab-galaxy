export type CardArtifact = "network" | "hardware" | "algorithm" | "software" | "database" | "security" | "ai" | "mobile" | "web" | "os" | "distributed";

const SECURITY = /信息安全|网络安全|密码学|加密|解密|认证|防火墙|入侵检测|漏洞|数字签名|security|cryptograph|encryption|firewall/i;
const AI = /人工智能|机器学习|神经网络|深度学习|自然语言处理|计算机视觉|强化学习|artificial intelligence|machine learning|neural network|deep learning/i;
const DATABASE = /数据库|关系代数|sql\b|mysql|postgresql|sqlite|oracle|事务处理|索引结构|database/i;
const DISTRIBUTED = /分布式|云计算|hadoop|spark|mapreduce|hdfs|zookeeper|集群计算|distributed system/i;
const MOBILE = /移动应用|移动端|安卓|android|ios\b|flutter|移动开发|智能手机/i;
const WEB = /web\b|网站|网页|前端|html|css\b|javascript|typescript|react|vue\b|servlet|jsp\b/i;
const OS = /操作系统|进程管理|线程同步|死锁|页面置换|内存管理|文件系统|operating system|process scheduling/i;
const NETWORK = /网络|组网|路由|交换|无线|局域网|以太网|tcp|udp|ip\b|dns|dhcp|http|socket|wireless|network/i;
const HARDWARE = /组成原理|计算机组成|体系结构|单片机|嵌入式|芯片|处理器|cpu|存储器|数字逻辑|电路|硬件|hardware|circuit/i;
const ALGORITHM = /数据结构|算法|二叉树|排序|查找|图论|最短路径|递归|动态规划|algorithm|binary tree|sorting/i;

/** Decorative category only; it never changes or describes the underlying document data. */
export function cardArtifactForTitle(title: string): CardArtifact {
  if (SECURITY.test(title)) return "security";
  if (AI.test(title)) return "ai";
  if (DATABASE.test(title)) return "database";
  if (DISTRIBUTED.test(title)) return "distributed";
  if (MOBILE.test(title)) return "mobile";
  if (OS.test(title)) return "os";
  if (NETWORK.test(title)) return "network";
  if (WEB.test(title)) return "web";
  if (HARDWARE.test(title)) return "hardware";
  if (ALGORITHM.test(title)) return "algorithm";
  return "software";
}
