# Backend Deploy Guide (Cloudflare Workers + D1)

本文是后端上线手册，目标是把 `worker-mail-code/src` 部署为可用的 Cloudflare Worker。

## 1. 部署前准备

1. Cloudflare 账号已开通 Workers 与 D1。
2. GitHub 仓库中已有 `worker-mail-code/` 目录。
3. 你已拿到 2925 邮箱 IMAP 参数：
   - `IMAP_HOST`
   - `IMAP_PORT`
   - `IMAP_USER`
   - `IMAP_PASS`

## 2. 在 Cloudflare 创建 D1

1. Cloudflare Dashboard -> `Storage & Databases` -> `D1 SQL Database`。
2. 点击 `Create`，数据库名填 `mail-code-db`。
3. 复制 `Database ID`。
4. 确认 [wrangler.toml](./wrangler.toml) 的 `database_id` 已填真实值。

## 3. 初始化 D1 表结构

方式 A（推荐，命令行）：

```bash
cd worker-mail-code
npx wrangler d1 execute mail-code-db --remote --file=./schema.sql
```

方式 B（控制台）：

1. 进入 D1 数据库 `mail-code-db`。
2. 打开 SQL Console。
3. 执行 [schema.sql](./schema.sql) 全量内容。

## 4. Worker 项目在 Cloudflare 的配置

1. Cloudflare Dashboard -> `Workers & Pages` -> `Create` -> `Import a repository`。
2. 选择 GitHub 仓库：`gxuge/imapflow`。
3. Root directory 设置为 `worker-mail-code`。
4. Deploy command 设置为 `npx wrangler deploy`。
5. Build command 可留空。

## 5. D1 绑定（必须）

在 Worker 项目里：

1. `Settings` -> `Bindings` -> `Add binding`。
2. 类型选 D1。
3. Binding name 填 `DB`。
4. Database 选择 `mail-code-db`。

## 6. Secrets 配置（必须）

在 Worker 项目 `Settings` -> `Variables` -> `Add variable`，类型选择 `Secret`，新增：

- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_USER`
- `IMAP_PASS`
- `ADMIN_TOKEN`
- `WEBHOOK_SECRET`（建议）

## 7. Vars 配置（建议）

同页面添加 `Text` 变量：

- `POLL_LOOKBACK_MINUTES=10`
- `MAX_EMAILS_PER_POLL=20`
- `AUTO_CREATE_ALIAS=true`
- `STORE_BODY=false`
- `CODE_EXPIRE_SECONDS=3600`
- `PUBLIC_APP_ENABLED=true`
- `PUBLIC_CREATE_LIMIT_PER_10M=10`
- `ALLOWED_ORIGIN` 或 `ALLOWED_ORIGINS`（生产建议配置）

## 8. Cron 配置

1. Worker -> `Settings` -> `Triggers`。
2. 新增 Cron：`* * * * *`（每分钟）。

## 9. GitHub 自动部署建议

1. 生产分支建议固定 `master` 或 `main`。
2. 每次 `git push` 后 Cloudflare 自动部署。
3. 变量/Secrets 改动后，Cloudflare 会发布新版本；改完建议手动点一次 Deploy 确认。

## 10. 验证检查

1. 打开 `https://<worker-domain>/health`，返回 `ok=true`。
2. 用 `ADMIN_TOKEN` 调用：
   - `POST /api/requests/{requestId}/fetch`
3. 在 D1 `poll_runs` 看是否写入成功。
4. 在 `Logs` 查看是否有 IMAP 登录失败或配置缺失。

## 11. 常见错误

1. `binding DB of type d1 must have a valid database_id`：
   - `wrangler.toml` 的 `database_id` 仍是占位符。
2. `unauthorized`：
   - 管理接口缺少 `Authorization: Bearer <ADMIN_TOKEN>`。
3. `public_app_disabled`：
   - `PUBLIC_APP_ENABLED` 未开启。
