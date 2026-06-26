/**
 * 淘股吧页面结构侦察
 * 用法: node recon.js <URL>
 * 自动检测登录状态，无需手动按 Enter
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
if (!url) { console.log('用法: node recon.js <URL>'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 自动检测是否需要登录
async function waitForLogin(page) {
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));

  // 不需要登录 → 直接返回
  if (!bodyText.includes('登录') && !bodyText.includes('请先登录')) {
    console.log('✓ 已登录，无需重新认证\n');
    return true;
  }

  // 需要登录 → 自动轮询等用户
  console.log('\n⚠️  需要登录！请在弹出的 Chrome 窗口中登录淘股吧');
  console.log('   脚本每 4 秒自动检测登录状态...\n');

  let waited = 0;
  const maxWait = 180; // 最长等 3 分钟
  while (waited < maxWait) {
    await sleep(4000);
    waited += 4;

    // 检测登录成功的标志：页面出现用户相关内容
    const loggedIn = await page.evaluate(() => {
      const text = document.body.innerText.slice(0, 1000);
      // 登录后这些词应该消失
      if (text.includes('请先登录') && !text.includes('退出')) return false;
      // 登录后会出现用户相关元素
      const hasUser = document.querySelector('.avatar, .user-avatar, [class*="avatar"]') ||
                      document.querySelector('.nickname, .user-name, [class*="user"]');
      const noLoginPrompt = !text.includes('请先登录');
      return hasUser && noLoginPrompt;
    });

    if (loggedIn) {
      console.log('✓ 登录成功！\n');
      const cookies = await page.cookies();
      fs.writeFileSync(path.join(__dirname, 'tgb_cookies.json'), JSON.stringify(cookies, null, 2));
      console.log('✓ 登录态已保存\n');
      await sleep(1000);
      return true;
    }

    if (waited % 20 === 0) {
      console.log(`  等待中... (${waited}秒)`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(2000);
    }
  }

  console.log('⚠️ 超时，尝试继续...');
  return false;
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

  // 尝试加载已有 cookie
  const cookieFile = path.join(__dirname, 'tgb_cookies.json');
  if (fs.existsSync(cookieFile)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    await page.setCookie(...cookies);
    console.log('✓ 已加载淘股吧登录态');
  }

  console.log(`打开 ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  // 自动等登录
  await waitForLogin(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // ── 侦察：分析页面结构 ──
  console.log('═══════════════════════════════════════');
  console.log('  页面结构侦察报告');
  console.log('═══════════════════════════════════════\n');

  const report = await page.evaluate(() => {
    const result = {
      url: location.href,
      title: document.title,
    };

    // 1. 用户信息
    const userInfo = {};
    const avatar = document.querySelector('.avatar, .user-avatar, .user_avatar, img[class*="avatar"]');
    const nickname = document.querySelector('.nickname, .user-name, .user_name, .username');
    if (avatar) userInfo.avatar = avatar.src?.slice(0, 80);
    if (nickname) userInfo.nickname = nickname.innerText?.trim();

    // 2. 内容容器匹配
    const contentSelectors = [
      'article', '.article', '.blog', '.post', '.topic',
      '[class*="article"]', '[class*="blog"]', '[class*="post"]', '[class*="topic"]',
      '[class*="content"]', '[class*="main"]',
      '.list', '[class*="list"]', '[class*="item"]',
      '.thread', '[class*="thread"]', '.reply', '[class*="reply"]',
      '.card', '[class*="card"]',
      '[class*="tgb"]',
    ];

    const contentMatches = {};
    contentSelectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) contentMatches[sel] = els.length;
      } catch(e) {}
    });

    // 3. 文章链接
    const links = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href.includes('/blog/') || href.includes('/thread/') ||
          href.includes('/topic/') || href.includes('/post/') ||
          href.includes('/article/')) {
        links.push({
          href: href.slice(0, 150),
          text: a.innerText?.trim()?.slice(0, 80),
          className: a.className?.slice(0, 80),
        });
      }
    });

    // 4. 分页
    const pagination = [];
    document.querySelectorAll('.pagination a, .page a, [class*="page"] a, .pager a, [class*="pager"] a').forEach(a => {
      const text = a.innerText?.trim();
      if (text && text.length < 10) {
        pagination.push({ text, href: a.href?.slice(0, 150) });
      }
    });

    // 5. HTML 样本
    const mainArea = document.querySelector('main, .main, .content, [class*="main"], [class*="content"], #content, #main');
    const bodySample = (mainArea || document.body).innerHTML.slice(0, 5000);

    return {
      ...result,
      userInfo,
      contentMatches,
      links: links.slice(0, 30),
      linkCount: links.length,
      pagination,
      paginationCount: pagination.length,
      bodySample,
    };
  });

  // 输出
  console.log(`标题: ${report.title}`);
  console.log(`用户: ${JSON.stringify(report.userInfo)}`);
  console.log(`\n--- 内容容器匹配 (选择器 → 匹配数) ---`);
  const sorted = Object.entries(report.contentMatches).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 20).forEach(([sel, count]) => {
    console.log(`  ${sel}: ${count} 个`);
  });

  console.log(`\n--- 文章/帖子链接 (共 ${report.linkCount} 个) ---`);
  report.links.forEach((l, i) => {
    console.log(`  ${i + 1}. [${l.text}]`);
    console.log(`     ${l.href}`);
  });

  console.log(`\n--- 分页 (${report.paginationCount} 个) ---`);
  report.pagination.forEach(p => console.log(`  [${p.text}] ${p.href}`));
  if (report.paginationCount === 0) console.log('  (未找到标准分页)');

  // 保存
  const reportPath = path.join(OUTPUT_DIR, 'tgb_recon.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n✅ 完整报告 → ${reportPath}`);

  const htmlPath = path.join(OUTPUT_DIR, 'tgb_page_sample.html');
  fs.writeFileSync(htmlPath, report.bodySample, 'utf-8');
  console.log(`✅ HTML 样本 → ${htmlPath}`);

  console.log('\n侦察完成，浏览器 5 秒后关闭...');
  await sleep(5000);
  await browser.close();
  console.log('再见。');
})();
