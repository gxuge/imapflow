# Frontend Deploy Guide (Cloudflare Pages + Functions Proxy)

本文是前端上线手册，目标是把 `pages-client/` 部署为 Pages 站点，并通过 Pages Functions 代理后端 API。

## 1. 为什么要用 Pages Functions 代理

1. 前端只请求同域 `/api/*`，减少跨域问题。
2. 真实 Worker 地址不写到前端静态代码。
3. 后端地址放在 Pages 变量 `BACKEND_ORIGIN`，便于切换环境。

## 2. 前端目录说明

- 页面入口：`pages-client/index.html`
- 页面逻辑：`pages-client/assets/app.js`
- 安全头：`pages-client/_headers`
- 代理函数：`pages-client/functions/api/[[path]].js`

## 3. 在 Cloudflare Pages 创建项目

1. Cloudflare Dashboard -> `Workers & Pages` -> `Create` -> `Pages` -> `Import repository`。
2. 选择仓库：`gxuge/imapflow`。
3. Root directory 设为：`worker-mail-code/pages-client`。
4. Build command 留空。
5. Build output directory 设为：`.`。

## 4. 配置 Pages 环境变量（关键）

在 Pages 项目 `Settings` -> `Environment variables` 添加：

- `BACKEND_ORIGIN=https://你的-worker域名`
  - 示例：`https://imapflow.635764803.workers.dev`

说明：

1. 变量填 Pages 的 Production 环境。
2. 如果你有 Preview 环境，也建议同步配置。

## 5. 部署与发布

1. 点击 `Save and Deploy`。
2. 首次部署完成后，访问 `https://<your-pages-domain>/`。

## 6. 联调步骤

1. 打开页面后，先点“连接测试”。
2. 连接测试通过标准：
   - `D1正常`
   - `IMAP已配置`
   - `公开接口已启用`
3. 输入邮箱地址，点击“开始接码”。
4. 任务状态应从 `pending` 进入 `found` 或 `expired`。

## 7. 需要同时检查的后端项

1. Worker 已部署成功。
2. D1 schema 已执行。
3. Worker 的 Secrets 已填完整。
4. Worker 已启用 `PUBLIC_APP_ENABLED=true`。

## 8. 安全建议

1. 不要在前端代码里硬编码 `ADMIN_TOKEN`。
2. 管理 API 只用于内部脚本，不给前端调用。
3. 保持 `pages-client/_headers` 的 CSP 与安全头。
4. 如果被频繁刷接口，调小 `PUBLIC_CREATE_LIMIT_PER_10M`。

## 9. 常见问题

1. 点击按钮提示网络错误：
   - 先看连接测试是否通过。
   - 检查 `BACKEND_ORIGIN` 是否写错。
2. 返回 `missing_backend_origin`：
   - Pages 变量未配置或未发布到当前环境。
3. 返回 `forbidden_route`：
   - 代理函数只允许转发 `/api/public/*`，这是安全限制。
