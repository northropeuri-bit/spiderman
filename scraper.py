"""
网页抓取工具 — 支持知乎 & 淘股吧
用法: python scraper.py
"""

import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

STATE_FILE = Path(__file__).parent / "browser_state.json"
OUTPUT_DIR  = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# 通用工具
# ═══════════════════════════════════════════════════════════════

def launch_browser(pw, headless=False):
    """启动 Chromium，返回 browser + context + page"""
    browser = pw.chromium.launch(headless=headless)
    context = browser.new_context(
        locale="zh-CN",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    page = context.new_page()
    return browser, context, page


def save_state(context):
    """保存登录态到本地文件"""
    context.storage_state(path=str(STATE_FILE))
    print(f"  ✓ 登录态已保存到 {STATE_FILE}")


def load_state(context):
    """从本地加载登录态，没有则返回 False"""
    if STATE_FILE.exists():
        context.add_cookies(json.loads(STATE_FILE.read_text(encoding="utf-8")).get("cookies", []))
        return True
    return False


# ═══════════════════════════════════════════════════════════════
# 知乎
# ═══════════════════════════════════════════════════════════════

def scrape_zhihu(browser, context, url):
    """用真实浏览器渲染知乎页面，提取回答正文"""
    page = context.new_page()
    print(f"[知乎] 打开 {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3000)  # 等 zse-ck 解密 + 内容渲染

    # 滚动触发懒加载
    for _ in range(3):
        page.evaluate("window.scrollBy(0, 800)")
        page.wait_for_timeout(800)

    try:
        # 尝试多种选择器
        content = page.evaluate("""() => {
            const sel = document.querySelector('.RichContent-inner');
            if (sel) return sel.innerText;
            const sel2 = document.querySelector('.AnswerItem .RichText');
            if (sel2) return sel2.innerText;
            const sel3 = document.querySelector('[class*="answer"]');
            return sel3 ? sel3.innerText : '';
        }""")
    except Exception:
        content = page.inner_text("body")

    if not content or len(content) < 50:
        # 兜底：拿整个 body
        content = page.inner_text("body")

    # 保存
    out_path = OUTPUT_DIR / "zhihu_answer.txt"
    out_path.write_text(content, encoding="utf-8")
    print(f"[知乎] 已保存 → {out_path}")
    print(f"  前 200 字预览:\n  {content[:200]}")
    page.close()
    return content


# ═══════════════════════════════════════════════════════════════
# 淘股吧
# ═══════════════════════════════════════════════════════════════

LOGIN_URL_TGB = "https://www.tgb.cn/login"


def scrape_tgb(browser, context, url, headless=False):
    """淘股吧 — 如需登录则暂停，用户手动登录后继续"""
    page = context.new_page()
    print(f"[淘股吧] 打开 {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)

    # 检测是否被重定向到登录页
    if "login" in page.url.lower():
        if headless:
            raise RuntimeError("需要登录，请用有头模式运行并在浏览器中手动登录")

        print("─" * 50)
        print("🔐 需要登录！请在浏览器中手动完成登录")
        print("   登录成功后回到终端按 Enter 继续...")
        print("─" * 50)
        # 先切到目标页让用户登录
        page.goto(LOGIN_URL_TGB, wait_until="domcontentloaded")
        input(">>> 按 Enter 继续 ")
        page.wait_for_timeout(500)
        # 重新请求目标页
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        # 如果还是登录页，重新登录
        if "login" in page.url.lower():
            print("  仍未登录，再试一次...")
            page.goto(LOGIN_URL_TGB, wait_until="domcontentloaded")
            input(">>> 登录后按 Enter ")
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2000)

        save_state(context)

    # 提取内容
    try:
        content = page.evaluate("""() => {
            const main = document.querySelector('.blog-content') ||
                         document.querySelector('.article-content') ||
                         document.querySelector('[class*="content"]');
            return main ? main.innerText : document.body.innerText;
        }""")
    except Exception:
        content = page.inner_text("body")

    out_path = OUTPUT_DIR / "tgb_content.txt"
    out_path.write_text(content, encoding="utf-8")
    print(f"[淘股吧] 已保存 → {out_path}")
    print(f"  前 200 字预览:\n  {content[:200]}")
    page.close()
    return content


# ═══════════════════════════════════════════════════════════════
# 交互菜单
# ═══════════════════════════════════════════════════════════════

def menu():
    print("""
╔════════════════════════════╗
║    网页抓取工具             ║
║  1. 知乎回答抓取            ║
║  2. 淘股吧页面抓取          ║
║  3. 自定义 URL（自动判断）   ║
║  0. 退出                    ║
╚════════════════════════════╝""")

    choice = input(">>> ").strip()
    return choice


def main():
    print("启动浏览器...")
    with sync_playwright() as pw:
        browser, context, page = launch_browser(pw, headless=False)

        while True:
            choice = menu()
            if choice == "0":
                break

            url = input("  输入网址: ").strip()
            if not url:
                continue

            if "zhihu.com" in url:
                scrape_zhihu(browser, context, url)
            elif "tgb.cn" in url:
                scrape_tgb(browser, context, url)
            else:
                print("  未知站点，尝试通用抓取...")
                p = context.new_page()
                p.goto(url, wait_until="domcontentloaded", timeout=30000)
                p.wait_for_timeout(3000)
                text = p.inner_text("body")
                out = OUTPUT_DIR / "page.txt"
                out.write_text(text, encoding="utf-8")
                print(f"  已保存 → {out}")
                p.close()

        browser.close()
        print("再见。")


if __name__ == "__main__":
    main()
