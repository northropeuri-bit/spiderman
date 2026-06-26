/**
 * 深度抓取 — 知乎用户文章/回答全文
 * 用法: node deep.js <用户主页URL>
 * 从主页滚动 + 收集所有链接 → 逐个打开提取全文
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
if (!url) { console.log('用法: node deep.js <用户主页URL>'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, 'output');
const COOKIE_FILE = path.join(__dirname, 'zhihu_cookies.json');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function isBlocked(page) {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 500));
  return t.includes('验证') || t.includes('网络环境存在异常');
}

(async () => {
  console.log('启动 Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
  }

  console.log(`打开 ${url}`);
  // 用 networkidle0 等页面完全加载（包括 React 渲染）
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {
    console.log('  (networkidle2 超时，继续...)');
  });
  await sleep(3000);

  if (await isBlocked(page)) {
    console.log('⚠️ 验证码，请在浏览器点击验证，等待...');
    let w = 0;
    while (await isBlocked(page) && w < 180) { await sleep(3000); w += 3; }
    if (w < 180) console.log('✓ 通过');
    const c = await page.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(c, null, 2));
  }

  // 用户名
  const userName = await page.evaluate(() =>
    document.querySelector('.ProfileHeader-name')?.innerText?.trim() || 'unknown'
  );
  const safeName = userName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  const userDir = path.join(OUTPUT_DIR, safeName);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir);
  console.log(`用户: ${userName}`);

  // ── 疯狂滚动主页，加载尽可能多的内容 ──
  console.log('滚动加载内容...');
  const seen = new Set();
  for (let round = 0; round < 15; round++) {
    // 收集当前可见链接
    const newLinks = await page.evaluate(() => {
      const hrefs = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.href;
        if (h.includes('/p/') || h.includes('/answer/')) hrefs.push(h);
      });
      return hrefs;
    });
    newLinks.forEach(l => seen.add(l));

    await page.evaluate(() => window.scrollBy(0, 1200));
    await sleep(1200);
    process.stdout.write(`\r  已收集 ${seen.size} 个链接...`);
  }
  console.log(`\n共 ${seen.size} 篇文章/回答`);

  if (seen.size === 0) {
    console.log('没找到链接，尝试 dump 页面...');
    const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log(body);
    await browser.close();
    return;
  }

  // ── 逐个打开抓取全文 ──
  const links = Array.from(seen);
  const outputFile = path.join(userDir, 'full_articles.txt');
  let count = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    console.log(`[${i + 1}/${links.length}] ${link.slice(0, 70)}...`);

    try {
      const ap = await browser.newPage();
      await ap.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
      await ap.goto(link, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);

      // 滚动看全文有没有懒加载
      for (let s = 0; s < 3; s++) {
        await ap.evaluate(() => window.scrollBy(0, 1000));
        await sleep(500);
      }

      const article = await ap.evaluate(() => {
        const title = document.querySelector('h1')?.innerText?.trim() ||
                      document.querySelector('.QuestionHeader-title')?.innerText?.trim() ||
                      document.querySelector('[class*="Post-Title"]')?.innerText?.trim() || '';

        // 尝试各种内容选择器
        const selectors = [
          '.RichContent-inner', '.RichText', '.Post-RichText',
          '[class*="article-content"]', '[class*="answer-content"]',
          '.AnswerItem .RichContent', '.ArticleItem-content'
        ];
        let content = '';
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim().length > 50) {
            content = el.innerText.trim();
            break;
          }
        }

        return { title: title.slice(0, 200), content };
      });

      if (article.content && article.content.length > 50) {
        const block = `\n${'='.repeat(60)}\n${article.title || '(无标题)'}\n${'='.repeat(60)}\n\n${article.content}\n`;
        fs.appendFileSync(outputFile, block, 'utf-8');
        count++;
        console.log(`  ✓ ${article.content.length} 字`);
      } else {
        console.log('  ✗ 内容为空或太短');
      }

      await ap.close();
    } catch (e) {
      console.log(`  ✗ 出错: ${e.message}`);
    }

    await sleep(2000);
  }

  console.log(`\n✅ 完成！成功 ${count}/${links.length} 篇 → ${outputFile}`);
  await browser.close();
})();
