# 📚 网页归档站 (HTML Archive)

一个基于 GitHub + Cloudflare Pages 的网页归档管理系统，用于保存和管理 SingleFile 保存的 HTML 文件。

## ✨ 功能特点

- 📤 **上传管理** - 通过网页上传 SingleFile 保存的 HTML 文件
- 📂 **分类管理** - 支持多分类：科技脚本、知识储备、日常备份
- 🏷️ **标签系统** - 为文章添加标签，便于检索
- ✏️ **编辑功能** - 修改文章标题、分类、标签
- 🗑️ **删除功能** - 删除不需要的归档
- 🌐 **在线访问** - 通过 Cloudflare Pages 全球 CDN 访问
- 🔒 **安全存储** - 文件存储在 GitHub，永不丢失

## 📁 项目结构

```
html-archive/
├── index.html          # 主页面
├── style.css           # 样式文件
├── app.js              # 核心逻辑
├── README.md           # 项目说明
├── data/
│   └── index.json      # 文章索引（元数据）
└── archive/            # 存放归档的 HTML 文件
    └── *.html
```

## 🚀 部署步骤

### 1. 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 仓库名：`html-archive`
3. 选择 Public
4. 不要初始化 README
5. 点击 Create repository

### 2. 推送代码

```bash
cd html-archive
git init
git add .
git commit -m "初始化网页归档站"
git remote add origin https://github.com/你的用户名/html-archive.git
git branch -M main
git push -u origin main
```

### 3. 部署到 Cloudflare Pages

1. 登录 https://dash.cloudflare.com
2. 左侧菜单 → Workers & Pages → Create → Pages
3. Connect to Git → 选择仓库
4. 构建设置：
   - Framework preset: None
   - Build command: 留空
   - Build output directory: `/`
5. Save and Deploy

### 4. 配置

1. 访问你的域名（如 `html-archive.pages.dev`）
2. 点击右下角 ⚙️ 配置按钮
3. 填入：
   - **GitHub Token**: Personal Access Token（需要 repo 权限）
   - **GitHub 仓库**: `用户名/html-archive`

## 📖 使用说明

### 上传文件

1. 点击顶部 ➕ 上传文件
2. 选择 SingleFile 保存的 HTML 文件
3. 填写标题、选择分类、添加标签
4. 点击上传

### 编辑文章

1. 在文章卡片上点击"编辑"
2. 修改标题、分类或标签
3. 点击保存

### 删除文章

1. 在文章卡片上点击"删除"
2. 确认删除

### 筛选分类

- 点击顶部导航栏的分类标签
- 首页显示所有文章

## 🔑 GitHub Token 创建

1. 访问 https://github.com/settings/tokens
2. 点击 Generate new token (classic)
3. 勾选 `repo` 权限
4. 复制生成的 token

## 📱 SingleFile 使用

SingleFile 是一个浏览器扩展，可以将网页保存为单个 HTML 文件：

- [Chrome 扩展](https://chrome.google.com/webstore/detail/singlefile/mpiodijhfdjbapiejabbimfhlippbjhi)
- [Firefox 扩展](https://addons.mozilla.org/firefox/addon/single-file/)

使用方法：
1. 安装扩展
2. 打开要保存的网页
3. 点击 SingleFile 图标
4. 等待保存完成
5. 上传到归档站

## ⚠️ 注意事项

- 单文件建议小于 100MB（GitHub 限制）
- Token 存在浏览器 localStorage，不要分享给别人
- 建议使用独立的 GitHub 账号或 Token
- Cloudflare Pages 会自动重新部署（1-2分钟）

## 🔧 本地开发

```bash
# 克隆项目
git clone https://github.com/你的用户名/html-archive.git
cd html-archive

# 本地运行（需要 HTTP 服务器）
# 方法1: 使用 Python
python -m http.server 8000

# 方法2: 使用 Node.js
npx serve

# 访问 http://localhost:8000
```

## 📄 许可证

MIT License

## 🙏 致谢

- [SingleFile](https://github.com/gildas-lormeau/SingleFile) - 网页保存扩展
- [GitHub](https://github.com) - 代码托管
- [Cloudflare Pages](https://pages.cloudflare.com) - 静态网站托管
