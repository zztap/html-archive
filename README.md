# 网页归档站 (HTML Archive)

基于 **GitHub + Cloudflare Pages** 的静态网页归档站，用于保存与浏览 [SingleFile](https://github.com/gildas-lormeau/SingleFile) 导出的整页 HTML。

线上站点：https://html-archive.pages.dev/  
仓库：https://github.com/zztap/html-archive

## 功能

- 分类浏览：科技脚本 / 知识储备 / 日常备份
- 标题、标签、描述搜索与排序
- 管理员登录后上传、编辑、删除归档
- 短链访问：`/go/{短码}`（如 `/go/KJ-26071001`）
- 文件与索引存于 GitHub，由 Cloudflare Pages 自动部署

## 架构概览

| 部分 | 说明 |
|------|------|
| 静态前端 | `index.html` / `app.js` / `admin.js` / `style.css` |
| 索引 | `data/index.json`（标题、分类、标签、短码、文件名） |
| 归档正文 | `archive/*.html` |
| API 代理 | `functions/api/[[route]].js`：鉴权、读写 GitHub |
| 短链 | `functions/go/[[route]].js`：短码 → 静态归档页 |

**源真相**：线上内容以 GitHub `main` + Cloudflare Pages 为准。本地克隆的 `archive/` 可以不完整，只适合改前端/Functions 代码。

## 鉴权与密钥（Cloudflare 环境变量）

在 Pages 项目 → Settings → Environment variables 配置（**不要**写进仓库或浏览器）：

| 变量 | 用途 |
|------|------|
| `ADMIN_PASSWORD` | 管理员登录密码 |
| `GITHUB_TOKEN` | 有 `repo` 权限的 GitHub Token，供 Functions 写仓库 |
| `GITHUB_REPO` | 仓库名，如 `zztap/html-archive` |
| `CF_DEPLOY_HOOK_URL` | （可选）Deploy Hook，上传后触发重新部署 |

客户端**从不**持有 GitHub Token；写操作需先 `POST /api/auth` 拿到 session，再带 `Authorization: Bearer …`。

## 管理员使用

1. 打开站点 →「管理登录」→ 输入 `ADMIN_PASSWORD`
2. 「上传归档」选择 SingleFile 的 `.html`，填写标题/分类/标签
3. 上传走 Git Data API（单文件建议 &lt; 100MB）
4. 列表可编辑元数据或删除（会删 GitHub 上对应文件）

短码规则：`分类前缀-YYMMDD序号`（科技 `KJ` / 知识 `ZS` / 备份 `RB`），上传时自动生成并校验唯一。

## 部署

1. 将本仓库接入 Cloudflare Pages（Framework：None，输出目录：`/`）
2. 配置上表环境变量
3. 推送 `main` 后 Pages 自动构建；Functions 随仓库 `functions/` 一起生效

本地预览静态页（API/短链需 Pages 或 `wrangler pages dev`）：

```bash
python -m http.server 8000
# 或
npx wrangler pages dev .
```

## 目录结构

```
html-archive/
├── index.html / app.js / admin.js / style.css
├── data/index.json
├── archive/*.html
├── functions/api/[[route]].js
└── functions/go/[[route]].js
```

## 许可证

MIT
