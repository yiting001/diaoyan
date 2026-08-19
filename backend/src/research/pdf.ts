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

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildReportHtml(title: string, markdown: string): string {
  const generatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const chapters = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const toc = chapters
    .map(
      (c, i) =>
        `<li><span class="toc-num">${String(i + 1).padStart(2, '0')}</span><span class="toc-title">${escapeHtml(c)}</span></li>`,
    )
    .join('\n');

  let idx = 0;
  const body = String(marked.parse(markdown)).replace(
    /<h2>/g,
    () => `<h2><span class="h2-num">${String(++idx).padStart(2, '0')}</span>`,
  );

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif; color: #201d1d; margin: 0; line-height: 1.85; font-size: 13px; }

  .cover { height: 96vh; display: flex; flex-direction: column; justify-content: center; page-break-after: always; padding: 0 24px; }
  .cover .brand { font-size: 14px; letter-spacing: 4px; color: #646262; margin-bottom: 12px; }
  .cover .slogan { font-size: 13px; letter-spacing: 2px; color: #9a9691; margin-bottom: 36px; }
  .cover h1 { font-size: 34px; line-height: 1.4; margin: 0 0 20px; border: none; }
  .cover .rule { width: 64px; height: 4px; background: #201d1d; margin-bottom: 28px; }
  .cover .meta { color: #646262; font-size: 13px; line-height: 2.2; }

  .toc { page-break-after: always; padding: 24px; }
  .toc h2 { font-size: 20px; border-bottom: 2px solid #201d1d; padding-bottom: 10px; }
  .toc ul { list-style: none; padding: 0; margin-top: 20px; }
  .toc li { display: flex; align-items: baseline; gap: 14px; padding: 9px 0; border-bottom: 1px dashed #d8d4cf; font-size: 14px; }
  .toc-num { color: #9a9691; font-size: 12px; }

  .content { padding: 0 24px; }
  .content h2 { font-size: 19px; margin: 34px 0 14px; padding: 8px 0 8px 14px; border-left: 4px solid #201d1d; background: #f5f2ec; page-break-after: avoid; }
  .h2-num { color: #9a9691; margin-right: 10px; font-size: 14px; }
  .content h3 { font-size: 15px; margin: 22px 0 8px; page-break-after: avoid; }
  .content p { margin: 8px 0; text-align: justify; }
  .content ul, .content ol { padding-left: 22px; }
  .content li { margin: 5px 0; }
  .content blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid #b8b2aa; background: #faf8f4; color: #4a4744; }
  .content table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 12px; page-break-inside: avoid; }
  .content th, .content td { border: 1px solid #cfcac3; padding: 7px 10px; text-align: left; }
  .content th { background: #f0ece5; }
  .content code { background: #f0ece5; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .content a { color: #1a4d8f; text-decoration: none; word-break: break-all; }
  .content hr { border: none; border-top: 1px solid #d8d4cf; margin: 20px 0; }

  .closing { margin: 40px 24px 24px; padding: 16px 18px; border: 1px solid #d8d4cf; background: #faf8f4; color: #4a4744; font-size: 12px; line-height: 2; page-break-inside: avoid; }
  .closing .closing-title { font-weight: bold; color: #201d1d; margin-bottom: 6px; }
</style></head>
<body>
<div class="cover">
  <div class="brand">凡夫价投智能体</div>
  <div class="slogan">企业战略和价值投资双重视角</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="rule"></div>
  <div class="meta">
    生成时间：${generatedAt}<br>
    生成方式：AI 智能体自动调研（含联网检索）<br>
    章节数量：${chapters.length} 章
  </div>
</div>
<div class="toc">
  <h2>目 录</h2>
  <ul>${toc}</ul>
</div>
<div class="content">
${body}
</div>
<div class="closing">
  <div class="closing-title">免责声明</div>
  本智能体输出调研报告仅为客观信息分析，不构成任何投资建议，投资有风险，决策请自行负责。<br>
  更多企业深度调研沟通请联系：fangfushangye
</div>
</body></html>`;
}

export async function renderPdf(title: string, markdown: string, outDir: string): Promise<string> {
  const html = buildReportHtml(title, markdown);

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
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#9a9691;display:flex;justify-content:space-between;padding:0 12mm;"><span>凡夫价投智能体 · 调研报告</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });
  } finally {
    await browser.close();
  }
  return outPath;
}
