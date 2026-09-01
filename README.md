# 陈瑶的商业晨报 · 苹果简洁风新站

每日 08:00（中国时区）自动制作、保存并发布「陈瑶的商业晨报」——一份覆盖商业地产、招商首店、零售餐饮、品牌设计、政策趋势与淮安本地的每日商业资讯站点。

## 站点结构

| 页面 | 说明 |
|---|---|
| `index.html` | 完整最新"昨日"页（六类：推广与会员/商业地产/招商与首店/零售与餐饮/品牌与设计/政策与趋势） |
| `daily/YYYY-MM-DD.html` | 每日独立归档页 |
| `archive.html` | 更早日报（按月归档）+ 知识库行业档案 |
| `design.html` | 站酷商业设计案例（四类 + 往期折叠） |
| `huaian.html` | 淮安本地（本地最新/商业资料库/其他大事） |
| `knowledge.html` | 知识库原文阅读器（`?doc=<文件>`） |
| `kb-originals/` | 可公开发布的知识库原文 |

## 构建与发布

```bash
# 旧站一次性迁移（历史数据重渲染）
node scripts/migrate.cjs <旧站目录>

# 每日构建：data/YYYY-MM-DD.json → daily 页 + index.html + 日索引
node scripts/build-daily.cjs --date 2026-09-02 [--huaian-file data/huaian.json] [--design-file data/design.json]

# 发布自检（日期边界/来源/空分组/配图/iframe/导航/../链接）
node scripts/guard.cjs --date 2026-09-02 [--check-links]
```

## 每日数据文件结构（data/YYYY-MM-DD.json）

```json
{
  "date": "2026-09-02",
  "range": "09.01",
  "observe": ["观察1。", "观察2。"],
  "groups": [
    ["推广与会员", [["09.01", "来源", "标题", "摘要(40-70字)", "可借鉴(20-40字)", "关键词", "链接", ""]]]
  ],
  "stats": { "candidates": 40, "deepRead": 26, "kbMatches": 0, "huaianLatest": 1 }
}
```

## 每日流水线（定时任务触发）

1. 知识库增量扫描（仅读上次运行后新增/修改的行业文本，维护 `kb-scan-state`）
2. 外部候选池采集（首轮 ≤80 条标题级，去重评分：时效25/来源20/关联20/可行动20/独特性15）
3. 深读全局前 36 条，交叉核验 → 每日"昨日"最多 30 条
4. 淮安本地候选池（≤30 条候选、≤12 条深读，政府/商场一手来源优先）
5. 构建页面 → 发布守卫 → git 提交推送 → GitHub Pages 上线
