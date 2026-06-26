# 网页抓取工具

支持知乎、淘股吧的网页内容抓取，基于 Puppeteer（Node.js）和 Playwright（Python）。

## 文件说明

| 文件 | 用途 | 用法 |
|------|------|------|
| `scraper.js` | 交互式主程序，知乎/淘股吧/通用 | `node scraper.js` |
| `quick.js` | 快速抓取知乎用户主页 | `node quick.js <URL>` |
| `deep.js` | 深度抓取，收集用户全部文章并提取全文 | `node deep.js <URL>` |
| `debug.js` | 调试工具，排查抓取问题 | `node debug.js` |
| `scraper.py` | Python 版交互式主程序 | `python scraper.py` |

## 快速开始

### Node.js

```bash
npm install
node scraper.js
```

### Python

```bash
pip install -r requirements.txt
python scraper.py
```

## 功能

- **知乎回答抓取**：输入回答链接，提取正文内容
- **知乎用户主页**：提取用户信息和内容列表
- **知乎深度抓取**：自动收集用户全部文章/回答并提取全文
- **淘股吧页面抓取**：支持登录态保存，自动检测登录墙
- **通用网页抓取**：输入任意 URL 自动判断并提取

## 输出

抓取内容保存在 `output/` 目录下。
