/**
 * 快速抓取 — 自动等待用户手动过验证码/登录
 * 用法: node quick.js <url>
 * 浏览器会打开，你手动处理验证码或登录，脚本自动检测后继续
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
if (!url) { console.log('用法: node quick.js <url>'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, 'output');
const COOKIE_FILE = path.join(__dirname, 'zhihu_cookies.json');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 检查页面是否还有验证码/登录墙
async function isBlocked(page) {
  const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
  return text.includes('验证') || text.includes('网络环境存在异常') ||
         text.includes('登录知乎') || text.includes('请登录后查看');
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

  // 加载已有 cookie
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    console.log('✓ 已加载知乎登录态');
  }

  console.log(`打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 检测验证码/登录墙，自动等待用户处理
  const maxWait = 120; // 最长等 120 秒
  let waited = 0;
  while (await isBlocked(page) && waited < maxWait) {
    if (waited === 0) {
      console.log('\n⚠️  检测到验证码或登录墙！');
      console.log('   请在弹出的 Chrome 窗口中手动处理（点击验证 / 扫码登录）');
      console.log('   脚本会每 3 秒检测一次，通过后自动继续...\n');
    }
    await sleep(3000);
    waited += 3;
    // 刷新一下页面
    if (waited % 15 === 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(2000);
    }
  }

  if (waited >= maxWait) {
    console.log('⏰ 超时，尝试强制提取当前页内容...');
  } else if (waited > 0) {
    console.log('✓ 验证通过！');
    // 验证通过后保存 cookie
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    console.log('✓ 登录态已保存');
  }

  // 滚动
  console.log('抓取中...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(600);
  }

  // 提取
  const { name, content } = await page.evaluate(() => {
    const name = document.querySelector('.ProfileHeader-name')?.innerText?.trim() || 'unknown';
    const bio  = document.querySelector('.ProfileHeader-headline')?.innerText?.trim() || '';
    const items = document.querySelectorAll('.ContentItem-title');
    const titles = Array.from(items).map(el => el.innerText.trim());
    const text = `用户名: ${name}\n简介: ${bio}\n\n--- 内容列表 ---\n${titles.join('\n')}\n\n--- 页面全文 ---\n${document.body.innerText.slice(0, 5000)}`;
    return { name, content: text };
  });

  // 用用户名做文件名，空格替换为下划线，去掉特殊字符
  const safeName = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') || 'unknown';
  const outPath = path.join(OUTPUT_DIR, `zhihu_${safeName}.txt`);
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`\n✅ 已保存 → ${outPath}`);
  console.log(`\n📄 预览:\n${content.slice(0, 500)}`);
  console.log('\n浏览器 5 秒后关闭...');
  await sleep(5000);
  await browser.close();
})();
