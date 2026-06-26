/**
 * 淘股吧文章页侦察 v3 — 分步式
 * 第一步: 打开页面，等用户手动登录
 * 第二步: 用户信号后自动分析
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'https://www.tgb.cn/a/2rLFulXu2xf';
const OUTPUT_DIR = path.join(__dirname, 'output');
const SIGNAL_FILE = path.join(__dirname, 'tgb_ready.txt');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 清除上次信号文件
  if (fs.existsSync(SIGNAL_FILE)) fs.unlinkSync(SIGNAL_FILE);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36');

  console.log(`打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 第一步：等用户在浏览器中登录，然后创建信号文件
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  请在浏览器中登录淘股吧');
  console.log('  登录成功、页面能看到完整内容后，');
  console.log('  在终端输入: echo done > scraper/tgb_ready.txt');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 轮询信号文件
  while (!fs.existsSync(SIGNAL_FILE)) {
    await sleep(2000);
  }
  fs.unlinkSync(SIGNAL_FILE);
  console.log('✓ 收到信号，开始分析...\n');

  // 保存登录态
  const cookies = await page.cookies();
  fs.writeFileSync(path.join(__dirname, 'tgb_cookies.json'), JSON.stringify(cookies, null, 2));
  console.log('✓ Cookie 已更新\n');

  // 刷新确保内容全加载
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // 滚动加载评论
  console.log('滚动加载评论...');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 2000));
    await sleep(800);
  }

  // ── 全面分析 ──
  const report = await page.evaluate(() => {
    // 正文
    const contentSelectors = [
      '.article_content', '.topic_content', '.post_content',
      '[class*="article-con"]', '[class*="article_content"]',
      '[class*="topic_content"]', '.detail_content',
      '.article-text', '[class*="post-text"]',
    ];
    let contentText = '', contentSel = '';
    for (const sel of contentSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 50) {
        contentText = el.innerText.trim().slice(0, 3000);
        contentSel = sel;
        break;
      }
    }

    // 评论容器 & 评论项
    let commentContainerInfo = null;
    let commentItems = [];

    // 找包含评论数最多的容器
    const candidates = [];
    document.querySelectorAll('[class]').forEach(el => {
      const cls = el.className.toLowerCase();
      if (cls.includes('huifu') || cls.includes('comment') || cls.includes('reply') || cls.includes('floor')) {
        const children = el.querySelectorAll('[class]').length;
        if (children >= 3) {
          candidates.push({
            tag: el.tagName,
            class: el.className.slice(0, 200),
            children: children,
            textLen: el.innerText.length,
          });
        }
      }
    });

    // 找评论项
    const itemPatterns = ['huifu', 'comment_item', 'reply_item', 'floor'];
    for (const pat of itemPatterns) {
      const items = document.querySelectorAll(`[class*="${pat}"]`);
      if (items.length >= 3) {
        commentItems = Array.from(items).slice(0, 5).map((item, i) => ({
          index: i,
          tag: item.tagName,
          class: item.className?.slice(0, 200),
          text: item.innerText?.slice(0, 400),
          html: item.outerHTML.slice(0, 800),
        }));
        break;
      }
    }

    // 找"楼主"标记
    const louzhuItems = [];
    document.querySelectorAll('[class]').forEach(el => {
      if (el.innerText?.includes('楼主') && el.innerText.length < 200) {
        louzhuItems.push({ tag: el.tagName, class: el.className?.slice(0,100), text: el.innerText.slice(0,100) });
      }
    });

    // 分页
    const pager = [];
    document.querySelectorAll('a[href*="page"], .pagination a, [class*="page"] a').forEach(a => {
      const t = a.innerText?.trim();
      if (t && /^\d+$/.test(t)) pager.push({ page: t, href: a.href?.slice(0, 200) });
    });

    return {
      contentSel,
      contentText,
      commentCandidates: candidates.slice(0, 10),
      commentItems,
      louzhuItems: louzhuItems.slice(0, 8),
      pager,
      bodySnippet: document.body.innerText.slice(0, 5000),
    };
  });

  console.log(`正文选择器: ${report.contentSel}`);
  console.log(`\n=== 正文 ===`);
  console.log(report.contentText);
  console.log(`\n=== 评论容器候选 ===`);
  report.commentCandidates.forEach(c => {
    console.log(`  ${c.tag}.${c.class} | 子元素:${c.children} | 文本长度:${c.textLen}`);
  });
  console.log(`\n=== 评论项样本 ===`);
  report.commentItems.forEach(c => {
    console.log(`\n  [${c.tag}.${c.class}]`);
    console.log(`  ${c.text}`);
  });
  console.log(`\n=== 楼主标记 ===`);
  report.louzhuItems.forEach(l => console.log(`  ${l.tag}.${l.class}: ${l.text}`));
  console.log(`\n=== 分页 ===`);
  report.pager.forEach(p => console.log(`  第${p.page}页: ${p.href}`));

  fs.writeFileSync(path.join(OUTPUT_DIR, 'tgb_article_full.json'), JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'tgb_article_body.txt'), report.bodySnippet, 'utf-8');
  console.log(`\n✅ 报告已保存`);

  console.log('浏览器保持打开 30 秒...');
  await sleep(30000);
  await browser.close();
})();
