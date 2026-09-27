#!/usr/bin/env bash
# doc-size.sh — Passage 文档体积自检（只读，不改动任何文件）
# 用法：bash docs/tools/doc-size.sh      退出码：0=全部在限内 1=越线或缺失
# 预算值与 `文档维护约定.md` §1 绑定，两处不一致本身就是维护缺陷。
set -u
trap '' PIPE
cd "$(dirname "$0")/.." || exit 2   # → docs/
[ -f AGENTS.md ] || { echo "❌ 不在 docs/ 下运行（脚本必须放 <项目>/docs/tools/）"; exit 2; }
fail=0

# 分类函数：先按路径判归档，再按文件名判前缀
# （归档文件名可能含「状态」「规范」等词，只按名字判会误档）
limit_of() {
  case "$1" in archive/*) echo 64; return ;; esac
  case "$(basename "$1")" in
    Passage_0*|文档维护约定.md|AGENTS_记录规范.md|AGENTS_平台规范.md|README.md) echo 8  ;;
    AGENTS.md)                 echo 28 ;;
    Agent交办事项.md)            echo 20 ;;
    Passage_3*)                echo 36 ;;    # 状态类：表格密集
    *)                         echo 24 ;;    # L2 按需层（含 engineering/）
  esac
}

show() {
  local f="$1" lim kb bytes mark
  [ -f "$f" ] || { printf "❌ 缺失    %s\n" "$f"; fail=1; return; }
  lim=$(limit_of "$f")
  bytes=$(wc -c < "$f" 2>/dev/null | tr -dc '0-9')
  kb=$(awk -v b="${bytes:-0}" 'BEGIN{printf "%.2f", b/1024}')
  mark="✅ 在限"; awk -v a="$kb" -v b="$lim" 'BEGIN{exit !(a>b)}' && { mark="⚠️ 越线"; fail=1; }
  # 余量阈值：余量 < 上限 5% 时提示「下一次新增前先拆」
  awk -v a="$kb" -v b="$lim" 'BEGIN{exit !((b-a)/b < 0.05)}' && mark="$mark ⚠️余量<5%"
  printf "%s  %7s / %-3s KB  %s\n" "$mark" "$kb" "$lim" "$f"
}

echo "── 开工必读（三件套）──"
show "Passage_0 文档地图.md"; show "AGENTS.md"; show "Agent交办事项.md"
echo "── 开工前置 ──"
for f in AGENTS_记录规范.md AGENTS_平台规范.md; do show "$f"; done
echo "── 体系规则 / 人类入口 ──"
show "文档维护约定.md"; show "README.md"
echo "── L2 按需层 ──"
for f in Passage_1*.md Passage_2*.md Passage_4*.md engineering/*.md; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in Passage_0*|Passage_3*) continue ;; esac
  show "$f"
done
echo "── L2 状态类 ──"
for f in Passage_3*.md; do [ -f "$f" ] || continue; show "$f"; done
echo "── L3 归档层 ──"
for f in archive/*.md; do [ -f "$f" ] || continue
  [ "$(basename "$f")" = README.md ] || show "$f"; done

# 汇总：开工起点 = 地图 + 必读，是每次接手的最小固定成本
mustread=$(cat "AGENTS.md" "Agent交办事项.md" 2>/dev/null | wc -c | tr -dc '0-9')
mp=$(cat "Passage_0 文档地图.md" 2>/dev/null | wc -c | tr -dc '0-9')
awk -v s=$((mustread+mp)) 'BEGIN{printf "\n  开工起点（地图+必读）%7.1f KB ≈ %.1f K token\n", s/1024, s/4267}'
echo "  ⚠️ development-logs/ 不设上限且不要通读：ls -t docs/development-logs/*/*.md | head -3"
[ "$fail" -eq 0 ] && echo "  EXIT=0 全部在限" || echo "  EXIT=1 存在越线或缺失"
exit "$fail"
