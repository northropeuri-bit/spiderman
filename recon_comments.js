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

  await page.goto('https://www.tgb.cn/a/2rLFulXu2xf', {waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r => setTimeout(r, 5000));

  // 滚动
  for (let i=0;i<5;i++) { await page.evaluate(()=>window.scrollBy(0,2000)); await new Promise(r=>setTimeout(r,800)); }

  // 提取 comment-lists 里的所有直接子元素结构
  const structure = await page.evaluate(() => {
    const container = document.querySelector('.comment-lists');
    if (!container) return {error:'comment-lists not found'};

    // 获取所有子元素（不限于 div）
    const children = Array.from(container.children);
    const result = children.slice(0, 60).map((el, i) => ({
      index: i,
      tag: el.tagName,
      class: el.className?.slice(0, 150),
      id: el.id,
      textPreview: el.innerText?.slice(0, 150),
      childCount: el.children.length,
      // 看子元素结构
      childrenTags: Array.from(el.children).slice(0,6).map(c => ({
        tag: c.tagName,
        class: c.className?.slice(0, 100),
        text: c.innerText?.slice(0, 60)
      }))
    }));

    return {
      totalChildren: children.length,
      samples: result
    };
  });

  console.log(`comment-lists 子元素总数: ${structure.totalChildren}`);
  console.log(JSON.stringify(structure.samples, null, 2));

  fs.writeFileSync(path.join(__dirname, 'output', 'tgb_comment_structure.json'), JSON.stringify(structure, null, 2));
  console.log('\n✅ 已保存');

  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
})();
