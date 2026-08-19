import { marked } from 'marked';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer-core';

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  try {
    const managed = fs
      .readdirSync('/opt/.devin/chrome/chrome')
      .map((d) => `/opt/.devin/chrome/chrome/${d}/chrome-linux64/chrome`)
      .find((p) => fs.existsSync(p));
    if (managed) return managed;
  } catch {
    // managed Chrome dir not present
  }
  throw new Error('未找到 Chrome/Chromium，无法生成 PDF');
}

export async function renderPdf(title: string, markdown: string, outDir: string): Promise<string> {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  body { font-family: "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif; color: #201d1d; padding: 24px 32px; line-height: 1.7; }
  h1 { font-size: 26px; border-bottom: 2px solid #201d1d; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 28px; border-left: 4px solid #201d1d; padding-left: 10px; }
  li { margin: 4px 0; }
  .meta { color: #646262; font-size: 12px; margin-bottom: 24px; }
</style></head>
<body>
<h1>${title}</h1>
<div class="meta">生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · AI 智能体自动调研报告</div>
${marked.parse(markdown)}
</body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `report-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`);
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await browser.close();
  }
  return outPath;
}
