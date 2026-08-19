# AI 智能体产品调研平台

NestJS + LangChain + LangGraph + SQLite 的全栈应用：用户选择后台配置的智能体，提交产品名称，智能体自动调研并生成 PDF 报告（可预览/下载）。

## 功能

- 用户注册 / 登录（JWT，首个注册用户自动成为管理员；种子管理员 `admin@example.com` / `admin123`）
- 智能体列表 → 提交产品名 → LangGraph 三节点流水线（大纲 → 分章节调研 → 汇总）→ Puppeteer 渲染中文 PDF
- PDF 在线预览（iframe）与下载
- 后台管理：
  - 智能体 CRUD，系统/大纲/章节提示词可编辑
  - 模型供应商管理（OpenAI 兼容 API：baseUrl / apiKey / model / 输入输出单价；内置 Mock 供应商无需 Key 即可演示）
  - Token 用量统计：总量、按模型、按用户、明细，费用按供应商单价自动计算
  - 链路追踪：每次任务一条 Trace，LangGraph 各节点（含每次 LLM 调用与 PDF 渲染）记录为 Span（输入/输出/token/耗时）
  - 套餐管理：按次收费、按年付费、按年+Token 计价、按次+Token 计价
- UI 遵循 DESIGN_1.md（Berkeley Mono 风格等宽字体、米白画布、ASCII 括号图标、4px 圆角）

## 运行

```bash
# 后端（端口 3000，SQLite 数据库自动创建于 backend/data/app.sqlite）
cd backend && npm install && npm run build && node dist/main.js

# 前端（端口 5173，/api 代理到 3000）
cd frontend && npm install && npm run dev
```

生成 PDF 需要本机有 Chrome/Chromium（可用 `CHROME_PATH` 环境变量指定路径）。

## 接入真实大模型

后台「供应商」页面添加 OpenAI 兼容供应商（如 OpenAI、DeepSeek、Moonshot、通义等），填入 Base URL、API Key、模型名与单价，然后在「智能体」编辑中选择该供应商即可。
