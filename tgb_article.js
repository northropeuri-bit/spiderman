/**
 * 淘股吧文章爬虫 v2 — 正文 + 评论（基于 DOM 结构提取）
 * 用法: node tgb_article.js <文章URL> [评论页数=20]
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const maxPages = parseInt(process.argv[3]) || 20;
if (!url) { console.log('用法: node tgb_article.js <URL> [页数]'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
const COOKIE_FILE = path.join(__dirname, 'tgb_cookies.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const articleId = url.split('/').pop();

// ═══ 解析单条评论 ═══
function parseComment(commentDiv) {
  const rightDiv = commentDiv.querySelector('.comment-data-right');
  if (!rightDiv) return null;

  const fullText = rightDiv.innerText.trim();
  const lines = fullText.split('\n');

  if (lines.length < 5) return null;

  const user = lines[0].trim();
  const date = lines[1].trim();
  // lines[2] === '只看TA'

  // 从末尾倒找楼层和按钮
  let floorIdx = -1;
  for (let i = lines.length - 1; i >= 3; i--) {
    const line = lines[i].trim();
    if (line.includes('· 淘股吧') || line.match(/^第?\d+楼/) || line === '沙发' || line === '板凳' || line === '地板') {
      floorIdx = i;
      break;
    }
  }

  // 评论文本 = line[3] 到 floorIdx-1
  const textLines = lines.slice(3, floorIdx > 3 ? floorIdx : lines.length);
  const text = textLines
    .filter(l => !['只看TA', '打赏', 'Ta', '回复'].includes(l.trim()) && !l.trim().startsWith('点赞('))
    .join('\n').trim();

  // 楼层
  let floor = '';
  if (floorIdx >= 3) {
    floor = lines[floorIdx].replace('· 淘股吧', '').trim();
  }

  // 点赞数
  let likes = 0;
  for (const l of lines) {
    const m = l.match(/点赞\((\d+)\)/);
    if (m) { likes = parseInt(m[1]); break; }
  }

  return { user, date, floor, text, likes };
}

// ═══ 提取当前页所有评论 ═══
async function extractComments(page) {
  return await page.evaluate(() => {
    const result = [];
    const commentDivs = document.querySelectorAll('.comment-lists .comment-data');
    commentDivs.forEach(div => {
      const rightDiv = div.querySelector('.comment-data-right');
      if (!rightDiv) return;

      const fullText = rightDiv.innerText.trim();
      const lines = fullText.split('\n');
      if (lines.length < 5) return;

      const user = lines[0].trim();
      const date = lines[1].trim();

      // 找楼层位置
      let floorIdx = -1;
      for (let i = lines.length - 1; i >= 3; i--) {
        const line = lines[i].trim();
        if (line.includes('· 淘股吧') || /^第?\d+楼/.test(line) ||
            line === '沙发' || line === '板凳' || line === '地板') {
          floorIdx = i;
          break;
        }
      }

      const textLines = lines.slice(3, floorIdx > 3 ? floorIdx : lines.length);
      const text = textLines
        .filter(l => !['只看TA', '打赏', 'Ta', '回复'].includes(l.trim()) && !l.trim().startsWith('点赞('))
        .join('\n').trim();

      let floor = '';
      if (floorIdx >= 3) {
        floor = lines[floorIdx].replace('· 淘股吧', '').trim();
      }

      let likes = 0;
      for (const l of lines) {
        const m = l.match(/点赞\((\d+)\)/);
        if (m) { likes = parseInt(m[1]); break; }
      }

      result.push({ user, date, floor, text, likes });
    });
    return result;
  });
}

// ═══ 主程序 ═══
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36');

  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    console.log('✓ Cookie 已加载');
  }

  console.log(`\n📄 ${url}`);
  console.log(`📑 评论最多 ${maxPages} 页\n`);

  // ── 第1步：正文 ──
  console.log('── 抓取正文 ──');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  // 登录检测
  let bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  if (bodyText.includes('登录可查看全文')) {
    console.log('⚠️ 需要登录！请在浏览器中登录...');
    while (true) {
      await sleep(5000);
      bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
      if (!bodyText.includes('登录可查看全文')) break;
      console.log('  等待登录...');
    }
    console.log('✓ 登录成功');
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);
  }

  // 提取文章信息
  const article = await page.evaluate(() => {
    const contentEl = document.querySelector('[class*="article-con"]');
    const text = contentEl ? contentEl.innerText.trim() : '';
    const lines = text.split('\n');

    // 第一行是标题，第二行是作者+时间+浏览+评论
    const title = lines[0] || '';
    const metaLine = lines[1] || '';

    // 提取总评论数
    const commentsMatch = metaLine.match(/评论\s*(\d+)/);
    const totalComments = commentsMatch ? commentsMatch[1] : '';

    // 正文从第三行开始（跳过标题和元数据行）
    const authorMatch = metaLine.match(/^(.+?)\s+淘股吧原创/);
    const author = authorMatch ? authorMatch[1].trim() : '';
    const dateMatch = metaLine.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';

    // 正文：跳过元数据行和数字行（浏览/评论数等）
    const contentLines = [];
    let started = false;
    for (let i = 2; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      // 跳过纯数字、分享、举报等 UI 文本
      if (/^\d+$/.test(l)) continue;
      if (['分享文章 >', '举报', '打赏Ta', '评论'].includes(l)) continue;
      if (l.startsWith('— 已有') || l.startsWith('（查看') || l.startsWith('话题与分类') ||
          l.startsWith('主题股票') || l.startsWith('主题概念') || l.startsWith('声明：')) continue;
      if (l.includes('相关推荐')) break;
      contentLines.push(l);
    }

    return { title, author, date, content: contentLines.join('\n'), totalComments };
  });

  console.log(`  标题: ${article.title}`);
  console.log(`  作者: ${article.author}`);
  console.log(`  时间: ${article.date}`);
  console.log(`  正文: ${article.content.length} 字`);
  console.log(`  总评论: ${article.totalComments}`);

  // ── 第2步：评论 ──
  console.log(`\n── 抓取评论 (最多 ${maxPages} 页) ──`);
  const allComments = [];

  for (let pg = 1; pg <= maxPages; pg++) {
    if (pg === 1) {
      // 滚动加载第一页
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await sleep(600);
      }
    } else {
      // 翻页
      try {
        const clicked = await page.evaluate(() => {
          const links = document.querySelectorAll('a');
          for (const a of links) {
            if (a.innerText.trim() === '下一页') {
              a.click();
              return true;
            }
          }
          return false;
        });
        if (!clicked) {
          console.log(`    找不到"下一页"，停止翻页`);
          break;
        }
        await sleep(3500);
      } catch (e) {
        console.log(`    翻页失败: ${e.message}`);
        break;
      }
    }

    const pageComments = await extractComments(page);
    console.log(`  第 ${pg}/${maxPages} 页 → ${pageComments.length} 条`);

    if (pageComments.length === 0 && pg > 1) {
      console.log('    没有更多评论');
      break;
    }

    allComments.push(...pageComments);
    await sleep(1000);
  }

  // ── 第3步：保存 ──
  console.log(`\n── 保存 (共 ${allComments.length} 条评论) ──`);
  const outDir = path.join(OUTPUT_DIR, `tgb_${articleId}`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // TXT
  let txt = `${'='.repeat(60)}\n`;
  txt += `${article.title}\n`;
  txt += `${'='.repeat(60)}\n`;
  txt += `作者: ${article.author}\n时间: ${article.date}\n总评论: ${article.totalComments}\n\n`;
  txt += `${article.content}\n\n`;
  txt += `${'='.repeat(60)}\n`;
  txt += `评论 (抓取 ${allComments.length} 条 / ${maxPages} 页)\n`;
  txt += `${'='.repeat(60)}\n\n`;

  allComments.forEach((c, i) => {
    txt += `#${i + 1} | ${c.user} | ${c.date} | ${c.floor} | 赞:${c.likes}\n`;
    txt += `${c.text}\n\n`;
  });

  const txtPath = path.join(outDir, 'full_article.txt');
  fs.writeFileSync(txtPath, txt, 'utf-8');
  console.log(`✅ TXT → ${txtPath}`);

  // JSON
  const jsonPath = path.join(outDir, 'full_article.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ article, comments: allComments, total: allComments.length }, null, 2), 'utf-8');
  console.log(`✅ JSON → ${jsonPath}`);

  console.log(`\n完成！`);
  await sleep(2000);
  await browser.close();
})();
