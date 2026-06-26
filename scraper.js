/**
 * 网页抓取工具 — 支持知乎、淘股吧
 * 用法: node scraper.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE_FILE = path.join(__dirname, 'browser_state.json');
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(r => rl.question(q, r)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
// 通用
// ═══════════════════════════════════════════════════════════════

async function launchBrowser(headless = false) {
  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });
  return { browser, page };
}

async function saveCookies(page) {
  const cookies = await page.cookies();
  fs.writeFileSync(STATE_FILE, JSON.stringify(cookies, null, 2));
  console.log('  ✓ 登录 Cookie 已保存');
}

async function loadCookies(page) {
  if (fs.existsSync(STATE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// 知乎
// ═══════════════════════════════════════════════════════════════

async function scrapeZhihu(browser, url) {
  const page = await browser.newPage();
  console.log(`[知乎] 打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 等 zse-ck 解密 + 内容渲染
  await sleep(4000);

  // 滚动触发懒加载
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(800);
  }

  let content = '';
  try {
    content = await page.evaluate(() => {
      const sel = document.querySelector('.RichContent-inner');
      if (sel) return sel.innerText;
      const sel2 = document.querySelector('.AnswerItem .RichText');
      if (sel2) return sel2.innerText;
      const sel3 = document.querySelector('[class*="answer"] [class*="content"]');
      return sel3 ? sel3.innerText : document.body.innerText.slice(0, 5000);
    });
  } catch (e) {
    content = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  }

  const outPath = path.join(OUTPUT_DIR, 'zhihu_answer.txt');
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`[知乎] 已保存 → ${outPath}`);
  console.log(`  ${content.slice(0, 200)}...`);
  await page.close();
  return content;
}

// ═══════════════════════════════════════════════════════════════
// 淘股吧
// ═══════════════════════════════════════════════════════════════

async function scrapeTgb(browser, url) {
  const page = await browser.newPage();
  // 先尝试加载已有 cookie
  await loadCookies(page);

  console.log(`[淘股吧] 打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  // 检测是否被重定向到登录页
  if (page.url().includes('login')) {
    console.log('─'.repeat(50));
    console.log('🔐 需要登录！浏览器窗口已打开');
    console.log('   请在浏览器中手动登录淘股吧');
    console.log('   登录成功后回到终端按 Enter');
    console.log('─'.repeat(50));
    await page.goto('https://www.tgb.cn/login', { waitUntil: 'domcontentloaded' });
    await ask('>>> 按 Enter 继续 ');
    await sleep(500);

    // 重新请求目标页
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    if (page.url().includes('login')) {
      console.log('  仍未登录，重试...');
      await page.goto('https://www.tgb.cn/login', { waitUntil: 'domcontentloaded' });
      await ask('>>> 登录后按 Enter ');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
    }

    await saveCookies(page);
  }

  let content = '';
  try {
    content = await page.evaluate(() => {
      const main = document.querySelector('.blog-content') ||
                   document.querySelector('.article-content') ||
                   document.querySelector('[class*="content"]') ||
                   document.querySelector('article');
      return main ? main.innerText : document.body.innerText.slice(0, 5000);
    });
  } catch (e) {
    content = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  }

  const outPath = path.join(OUTPUT_DIR, 'tgb_content.txt');
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`[淘股吧] 已保存 → ${outPath}`);
  console.log(`  ${content.slice(0, 200)}...`);
  await page.close();
  return content;
}

// ═══════════════════════════════════════════════════════════════
// 主菜单
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('启动浏览器...');
  const { browser } = await launchBrowser(false);

  while (true) {
    console.log(`
╔════════════════════════════╗
║    网页抓取工具             ║
║  1. 知乎回答抓取            ║
║  2. 淘股吧页面抓取          ║
║  3. 自定义 URL（自动判断）   ║
║  0. 退出                    ║
╚════════════════════════════╝`);
    const choice = (await ask('>>> ')).trim();
    if (choice === '0') break;
    if (!['1', '2', '3'].includes(choice)) continue;

    const url = (await ask('  输入网址: ')).trim();
    if (!url) continue;

    try {
      if (url.includes('zhihu.com')) {
        await scrapeZhihu(browser, url);
      } else if (url.includes('tgb.cn')) {
        await scrapeTgb(browser, url);
      } else {
        console.log('  未知站点，通用抓取...');
        const p = await browser.newPage();
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000);
        const text = await p.evaluate(() => document.body.innerText.slice(0, 5000));
        const out = path.join(OUTPUT_DIR, 'page.txt');
        fs.writeFileSync(out, text, 'utf-8');
        console.log(`  已保存 → ${out}`);
        await p.close();
      }
    } catch (e) {
      console.error(`  出错: ${e.message}`);
    }
  }

  await browser.close();
  console.log('再见。');
  process.exit(0);
}

main();
