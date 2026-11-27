/**
 * 概念名自动分词（数据驱动的形态素挖掘，无需外部词典）
 *
 * 动机：点击热点概念「机器人执行器」时，候选池内概念名恰好包含该全名的个股极少
 * （2 只），但含「机器人」词根的概念族（机器人概念/人形机器人/虚拟机器人）覆盖
 * 43 只。把概念名拆成数据中共享的词根、任一词根命中即入选，可显著提高命中率。
 *
 * 规则：
 * 1. 先剥离通用后缀（概念/板块，90% 概念名以此结尾，参与分词只会产生跨边界碎片）
 * 2. 贪心最长匹配：从左到右，取能在「其他概念名」中找到的最长子串为词根
 * 3. 词根含通用停用词（概念/板块/相关等）直接跳过，避免「G概念」类垃圾词根
 * 4. 剩余单字跳过（单字中文区分度近零）
 *
 * 词表来自候选池全部个股的贴切概念名（客户端即可构建），点击/输入的长词都会扩展。
 */
const TOKEN_STOPWORDS = ["概念", "板块", "相关", "指数", "龙头", "综合"] as const;

export function extractConceptTokens(name: string, vocab: Iterable<string>): string[] {
  const trimmed = name.trim();
  // 剥离通用后缀后再分词（全名本身仍作为第一优先 token 由调用方保留）
  const clean = trimmed.replace(/(?:概念|板块)+$/, "");
  if (clean.length < 2) return [];
  const others = [...new Set(vocab)].filter(v => v && v !== trimmed);
  if (others.length === 0) return [];
  const tokens: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let matched: string | null = null;
    for (let len = clean.length - i; len >= 2; len--) {
      const sub = clean.slice(i, i + len);
      if (TOKEN_STOPWORDS.some(sw => sub.includes(sw))) continue;
      if (others.some(v => v.includes(sub))) {
        matched = sub;
        break;
      }
    }
    if (matched) {
      tokens.push(matched);
      i += matched.length;
    } else {
      i += 1; // 单字无区分度，跳过
    }
  }
  return tokens;
}
