/**
 * 淘股吧文章内容区侦察
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'https://www.tgb.cn/blog/1689620';
const OUTPUT_DIR = path.join(__dirname, 'output');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36');

  // 加载 cookie
  const cookieFile = path.join(__dirname, 'tgb_cookies.json');
  if (fs.existsSync(cookieFile)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    await page.setCookie(...cookies);
  }

  console.log(`打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  // 滚动
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(800);
  }

  // 精准提取文章列表
  const articles = await page.evaluate(() => {
    const result = [];

    // 尝试找到右侧主内容区的文章卡片
    // 淘股吧博客文章通常在一个大容器里，每个文章是一个卡片
    const mainSelectors = [
      '.all_right', '[class*="right"]',
      '.blog_list', '.article_list', '.topic_list',
      '.main_content', '#main_content',
    ];

    let mainContainer = null;
    for (const sel of mainSelectors) {
      mainContainer = document.querySelector(sel);
      if (mainContainer) break;
    }

    // 如果找不到，从 body 开始找 class 包含 blog/article/topic 的元素
    if (!mainContainer) {
      const candidates = document.querySelectorAll('[class*="blog" i], [class*="topic" i], [class*="article" i]');
      // 找包含最多子元素的
      let maxLen = 0;
      candidates.forEach(el => {
        if (el.innerText.length > maxLen && el.innerText.length > 500) {
          maxLen = el.innerText.length;
          mainContainer = el;
        }
      });
    }

    // 提取所有可能的文章条目
    const itemSelectors = [
      '.blog_item', '.topic_item', '.article_item',
      '[class*="blog_item"]', '[class*="topic_item"]',
      'li[class*="blog"]', 'li[class*="topic"]',
      '.list_item', '[class*="list_item"]',
      '.item', '[class*="-item"]',
      'div[class*="blog"]', 'div[class*="topic"]',
    ];

    let items = [];
    for (const sel of itemSelectors) {
      const els = (mainContainer || document).querySelectorAll(sel);
      if (els.length >= 3 && els.length > items.length) {
        items = Array.from(els);
      }
    }

    // 提取每个条目的标题、链接、时间
    items.forEach((item, i) => {
      const titleEl = item.querySelector('a[href*="/blog/"], a[href*="/topic/"], h3 a, h4 a, .title a, [class*="title"] a');
      const timeEl = item.querySelector('[class*="time"], [class*="date"], .time, .date, span:last-child');
      const link = titleEl ? titleEl.href : null;
      const title = titleEl ? titleEl.innerText.trim() : item.innerText.slice(0, 80);

      if (title && title.length > 2) {
        result.push({
          index: i,
          title: title.slice(0, 100),
          link: link ? link.slice(0, 150) : 'N/A',
          time: timeEl ? timeEl.innerText.trim() : '',
          itemHTML: item.outerHTML.slice(0, 400),
          itemClass: item.className?.slice(0, 100) || '',
        });
      }
    });

    return {
      items: result.slice(0, 20),
      totalFound: result.length,
      mainContainerClass: mainContainer ? mainContainer.className?.slice(0, 200) : 'NOT FOUND',
      mainContainerTag: mainContainer ? mainContainer.tagName : 'NOT FOUND',
    };
  });

  console.log(`\n主容器: ${articles.mainContainerTag}.${articles.mainContainerClass}`);
  console.log(`找到 ${articles.totalFound} 篇文章\n`);
  articles.items.forEach(a => {
    console.log(`${a.index + 1}. [${a.time}] ${a.title}`);
    console.log(`   链接: ${a.link}`);
    console.log(`   class: ${a.itemClass}`);
    console.log(`   HTML: ${a.itemHTML.slice(0, 200)}`);
    console.log('');
  });

  // 保存完整报告
  fs.writeFileSync(path.join(OUTPUT_DIR, 'tgb_articles.json'), JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`✅ 报告已保存`);

  console.log('\n浏览器保持打开 60 秒供查看...');
  await sleep(60000);
  await browser.close();
})();
