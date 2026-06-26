# Spiderman — 网页抓取工具

支持知乎、淘股吧的网页内容抓取，基于 Puppeteer（Node.js）。

---

## 文件结构

```
spiderman/
├── README.md                          ← 本文件
│
├── 知乎抓取 ──────────────────────
│   ├── quick.js                      快速抓取用户主页（标题 + 预览）
│   ├── deep.js                       深度抓取（收集链接 → 逐个打开提取全文）
│   └── scraper.js                    交互式主程序（知乎/淘股吧/通用）
│
├── 淘股吧抓取 ────────────────────
│   ├── tgb_article.js                文章爬虫（正文 + 翻页评论）
│   ├── recon.js                      博客主页结构侦察
│   ├── recon2.js                     文章列表结构侦察
│   ├── recon3.js                     HTML 深入侦察
│   ├── recon_article.js             文章页 + 评论结构侦察
│   └── recon_comments.js            评论 DOM 结构侦察
│
├── 其他 ──────────────────────────
│   ├── debug.js                      知乎抓取调试工具
│   ├── scraper.py                    Python 版交互式主程序
│   ├── package.json                  Node 依赖
│   └── requirements.txt              Python 依赖
│
├── output/                          抓取结果（详见下方 output 结构）
│   ├── 涅伐劳沃特/
│   └── tgb_2rLFulXu2xf/
│
├── .gitignore                        排除 node_modules/、output/、cookie
└── tgb_cookies.json                  淘股吧登录态（本地，不提交）
```

---

## 快速开始

```bash
npm install
```

### 知乎 — 快速抓取用户主页
```bash
node quick.js <知乎用户主页URL>
```

### 知乎 — 深度抓取全部回答
```bash
node deep.js <知乎用户主页URL>
```

### 淘股吧 — 抓取文章 + 全部评论
```bash
node tgb_article.js <文章URL> [页数]
```

---

## output/ 抓取结果结构

```
output/
│
├── 涅伐劳沃特/                        知乎用户深度抓取
│   ├── 涅伐劳沃特_知乎回答_01.md       100篇回答全文 (Markdown)
│   └── full_articles.txt               原始抓取文本
│
└── tgb_2rLFulXu2xf/                   淘股吧文章 "乌合之众"
    ├── 乌合之众_2026-05-13.md           全量抓取（8,268条评论）
    ├── 乌合之众_2026-05-13.json         结构化数据
    ├── 乌合之众_2026-05-13.txt          原始文本
    └── 乌合之众_佛山古怪发言_2026-05-13.md  清洗版（1,633条楼主发言）
```

---

## 知乎爬取：quick.js → deep.js

| 工具 | 抓取方式 | 内容 | 适用场景 |
|------|----------|------|----------|
| `quick.js` | 只抓主页 | 标题列表 + 预览片段 | 快速了解用户 |
| `deep.js` | 主页收集链接 → 逐个打开 | **全文**，Markdown 格式 | 深度阅读 |

> `quick.js` 给的是货架照片，`deep.js` 把每件商品打开看了。

## 淘股吧爬取：tgb_article.js

| 步骤 | 说明 |
|------|------|
| 1. 加载登录态 | 从 `tgb_cookies.json` 恢复，过期则弹窗等用户登录 |
| 2. 提取正文 | 选择器 `[class*="article-con"]` |
| 3. 逐页翻页 | 点击"下一页"，每页 ~50 条评论 |
| 4. DOM 解析 | 每条评论 `DIV.comment-data` → 用户/时间/楼层/正文/点赞 |
| 5. 保存 | TXT + JSON，可选转 Markdown |

---

## 侦察脚本

当目标网站改版导致选择器失效时，使用侦察脚本分析新结构：

| 脚本 | 用途 |
|------|------|
| `recon.js` | 淘股吧博客主页结构 |
| `recon2.js` | 文章列表结构 |
| `recon3.js` | 文章 HTML 深入 |
| `recon_article.js` | 文章页 + 评论结构 |
| `recon_comments.js` | 评论 DOM 结构 |
| `check_op_time.js` | 楼主时间字段排查 |

---

## 技能文档（Skill）

在 `trade_task_01` 仓库的 `.claude/skills/` 中有配套 Skill：

| Skill | 用途 |
|------|------|
| `spiderman-scrape.md` | 知乎抓取标准流程 |
| `tgb-scrape.md` | 淘股吧抓取标准流程 |
| `tgb-clean.md` | 淘股吧数据清洗流程 |
| `git-upload.md` | GitHub 上传操作 |

---

## 安全规则

- `output/` 默认不提交 Git（`.gitignore` 排除）
- Cookie 文件绝不提交
- 抓取内容需用户确认后 `git add -f` 上传
