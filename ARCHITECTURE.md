# 当前架构

## 数据流

1. **读**：浏览器 `GET /api/articles` → Pages Function 用 `GITHUB_TOKEN` 读仓库 `data/index.json` → 前端渲染卡片。
2. **写**：管理员登录 `POST /api/auth` 得 session → 上传 HTML `PUT /api/archive/...`（Git Data API）→ 再 `PUT /api/articles` 更新索引。
3. **短链**：`/go/{shortcode}` → Function 查索引 → 返回带顶栏的外壳页，iframe 加载静态 `/archive/{filename}`（大文件不经 Worker 缓冲）。`?raw=1` 时 302 直达静态文件。

## 安全

- `ADMIN_PASSWORD` / `GITHUB_TOKEN` / `GITHUB_REPO` 仅在 Cloudflare 环境变量。
- 公开 `/api/ping` 只返回 `{ ok: true }`；配置探测在需登录的 `/api/health`。
- CORS 限制为 `html-archive.pages.dev` 与本地开发 origin；登录失败按 IP 限速。

## 源真相

GitHub `main` + Cloudflare Pages 部署产物为准；本地 `archive/` 可不完整。
