/**
 * 调试 — 打印知乎用户页的 tab 和链接
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'zhihu_cookies.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
  }

  const url = 'https://www.zhihu.com/people/zhang-yun-66-38';
  console.log(`打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 先看当前 URL（可能被重定向）
  console.log(`当前 URL: ${page.url()}`);

  // 尝试直接导航到 /posts
  console.log('\n--- 导航到 /posts ---');
  await page.goto(url + '/posts', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(3000);
  console.log(`当前 URL: ${page.url()}`);

  // 滚动
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(600);
  }

  // 查找所有链接
  const links = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href.includes('/p/') || href.includes('/answer/') || href.includes('/column/')) {
        result.push({ href, text: a.innerText.slice(0, 60) });
      }
    });
    return result;
  });

  console.log(`\n找到 ${links.length} 个文章/回答链接:`);
  links.forEach((l, i) => console.log(`  ${i + 1}. ${l.href.slice(0,80)}`));

  // 测试抓第一个链接
  if (links.length > 0) {
    console.log(`\n--- 测试抓取第1篇 ---`);
    const ap = await browser.newPage();
    await ap.goto(links[0].href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    const article = await ap.evaluate(() => {
      const title = document.querySelector('h1')?.innerText?.trim() || '';
      const content = document.querySelector('.RichText')?.innerText?.trim() ||
                      document.querySelector('.Post-RichText')?.innerText?.trim() ||
                      document.querySelector('[class*="RichContent"]')?.innerText?.trim() || '';
      return { title, content: content.slice(0, 300) };
    });

    console.log(`  标题: ${article.title}`);
    console.log(`  正文前300字: ${article.content}`);
    await ap.close();
  }

  console.log('\n浏览器保持打开，可查看。Ctrl+C 退出。');
})();
