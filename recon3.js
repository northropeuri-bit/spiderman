const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const cookieFile = path.join(__dirname, 'tgb_cookies.json');
  if (fs.existsSync(cookieFile)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    await page.setCookie(...cookies);
  }
  await page.goto('https://www.tgb.cn/blog/1689620', {waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r => setTimeout(r, 5000));

  // 提取 allblog_article 的完整 HTML
  const html = await page.evaluate(() => {
    const el = document.querySelector('.allblog_article');
    return el ? el.outerHTML.slice(0, 8000) : 'NOT FOUND';
  });
  console.log('=== allblog_article HTML ===');
  console.log(html);

  // 提取文章行（table tr）
  const rows = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('.allblog_article tr, .allblog_article .article_item, .allblog_article .blog_item, .allblog_article [class*="item"], .allblog_article .row, .allblog_article li, .allblog_article tbody tr').forEach((el,i) => {
      if (i < 15) result.push({
        tag: el.tagName,
        class: el.className?.slice(0,100),
        text: el.innerText?.slice(0,250),
        html: el.outerHTML.slice(0,600)
      });
    });
    return result;
  });
  console.log('\n=== 文章行 (前15) ===');
  rows.forEach(r => {
    console.log(`\n[${r.tag}.${r.class}]`);
    console.log(`  text: ${r.text}`);
    console.log(`  html: ${r.html}`);
  });

  console.log('\ndone - 浏览器保持 10 秒');
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
})();
