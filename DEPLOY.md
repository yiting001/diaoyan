# 凡夫价投智能体 部署文档

## 方式一：Docker 部署（推荐，agent.fanfu.xyz 当前采用）

仓库已含 `docker-compose.yml`、`backend/Dockerfile`（含 Chromium 与中文字体）、`frontend/Dockerfile`（nginx 静态 + /api 反代）。容器只监听 `127.0.0.1:8180`，TLS 由宿主机 nginx 终结。

```bash
# 1. 上传代码到服务器 /opt/diaoyan，创建 .env
cd /opt/diaoyan
echo "JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" > .env

# 2. 构建并启动（数据持久化在 ./data）
docker compose build
docker compose up -d
```

宿主机 nginx 配置 `agent.fanfu.xyz`：80 端口放行 `/.well-known/acme-challenge/`（webroot 如 `/www/wwwroot/acme`）并 301 到 https；443 端口用 Let's Encrypt 证书，`proxy_pass http://127.0.0.1:8180`，务必带 `proxy_buffering off; proxy_read_timeout 600s;`（SSE 流式进度需要）。

证书签发与自动续期（certbot Docker 镜像，凌晨 cron 续期后 reload nginx）：

```bash
docker run --rm -v /www/server/letsencrypt:/etc/letsencrypt -v /www/wwwroot/acme:/www/wwwroot/acme \
  certbot/certbot certonly --webroot -w /www/wwwroot/acme -d agent.fanfu.xyz \
  --agree-tos --register-unsafely-without-email --non-interactive
```

升级：上传新代码后 `docker compose build && docker compose up -d`。

## 方式二：裸机部署

本项目为前后端分离结构：

- `backend/`：NestJS API（端口默认 3000，全部接口前缀 `/api`），SQLite 数据库，Puppeteer 生成 PDF
- `frontend/`：React + Vite 前端（构建产物为纯静态文件）

## 一、服务器要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Linux（推荐 Ubuntu 20.04+）|
| Node.js | 20 LTS 及以上（含 npm）|
| Chrome/Chromium | 必须安装，用于渲染 PDF |
| 中文字体 | 必须安装（否则 PDF 中文显示为方块）|
| 内存 | 建议 2GB 以上（Chrome 渲染 PDF 需要）|
| 域名 + HTTPS | 微信支付回调必须公网 HTTPS，可用 nginx + Let's Encrypt |

安装 Chrome 与中文字体（Ubuntu 示例）：

```bash
# Chromium（或安装 google-chrome-stable）
sudo apt-get update
sudo apt-get install -y chromium-browser fonts-noto-cjk
```

若 Chrome 安装在非常规路径，通过环境变量 `CHROME_PATH` 指定可执行文件路径。

## 二、获取代码

```bash
git clone https://github.com/yiting001/diaoyan.git
cd diaoyan
```

## 三、后端部署

### 1. 构建

```bash
cd backend
npm install
npm run build        # 产物在 backend/dist
```

### 2. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 监听端口，默认 `3000` |
| `JWT_SECRET` | **生产必填** | JWT 签名密钥，务必改为随机长字符串（默认值仅供开发）|
| `DATA_DIR` | 否 | 数据目录，默认相对工作目录的 `data/`；SQLite 库为 `data/app.sqlite`，PDF 存于 `data/pdfs/` |
| `CHROME_PATH` | 否 | Chrome/Chromium 可执行文件路径（自动探测失败时指定）|

### 3. 启动（推荐 systemd）

`/etc/systemd/system/fanfu-backend.service`：

```ini
[Unit]
Description=Fanfu Agent Backend
After=network.target

[Service]
WorkingDirectory=/opt/diaoyan/backend
Environment=PORT=3000
Environment=JWT_SECRET=请改成随机长字符串
Environment=DATA_DIR=/opt/diaoyan/backend/data
ExecStart=/usr/bin/node dist/main.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fanfu-backend
```

也可以用 PM2：`pm2 start dist/main.js --name fanfu-backend`。

首次启动会自动建表并写入种子数据：管理员账号 `admin@example.com` / `admin123`，**上线后请立即在后台「用户管理」修改密码**。

## 四、前端部署

```bash
cd frontend
npm install
npm run build        # 产物在 frontend/dist
```

将 `frontend/dist` 拷贝到 nginx 静态目录（如 `/var/www/fanfu`）。

## 五、nginx 反向代理（HTTPS）

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 前端静态文件（SPA 路由回退到 index.html）
    root /var/www/fanfu;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;      # 调研任务/SSE 流式进度需要长连接
        proxy_buffering off;          # SSE 必须关闭缓冲
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

> 任务进度使用 SSE（Server-Sent Events），`proxy_buffering off` 和较长的
> `proxy_read_timeout` 必须配置，否则前端看不到流式进度。

## 六、上线后的后台配置

用管理员登录后依次配置：

1. **供应商**：添加 OpenAI 兼容供应商（DeepSeek、Moonshot、通义等），填 Base URL、API Key、模型名、输入/输出单价；在「智能体」中为智能体选择该供应商。
2. **联网搜索**：供应商页底部填博查AI（bochaai.com）API Key，点「测试搜索」通过后启用。
3. **支付配置**（如需微信支付）：填 AppID、AppSecret、商户号、APIv3 密钥，上传商户证书（pem 私钥+证书 或 p12 文件）；通知地址填 `https://your-domain.com/api/pay/notify`（必须公网 HTTPS）。
4. **套餐管理**：创建按次 / 按年 / 按年+Token / 按次+Token 套餐。普通用户需持有有效套餐才能提交调研任务。

## 七、数据备份与升级

- 备份：定期备份 `DATA_DIR` 整个目录（`app.sqlite` 数据库 + `pdfs/` 报告文件）。
- 升级：

```bash
cd /opt/diaoyan && git pull
cd backend && npm install && npm run build && sudo systemctl restart fanfu-backend
cd ../frontend && npm install && npm run build && cp -r dist/* /var/www/fanfu/
```

数据库结构变更由 TypeORM `synchronize` 自动同步，无需手工迁移。

## 八、常见问题

| 现象 | 处理 |
| --- | --- |
| PDF 生成失败「未找到 Chrome/Chromium」 | 安装 Chrome/Chromium 或设置 `CHROME_PATH` |
| PDF 中文乱码/方块 | 安装中文字体：`sudo apt-get install -y fonts-noto-cjk` |
| 任务页看不到流式进度 | 检查 nginx `proxy_buffering off` 与 `proxy_read_timeout` |
| 提交任务被拒「请先购买套餐」 | 属正常校验；后台「套餐管理」可手动为用户开通权益 |
| 微信支付回调不生效 | 通知地址必须为公网 HTTPS，且与支付配置中的域名一致 |
