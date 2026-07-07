// 配置
const CONFIG_KEY = 'html-archive-config';
const DATA_FILE = 'data/index.json';

// 分类映射
const CATEGORIES = {
    tech: '💻 科技脚本',
    knowledge: '📚 知识储备',
    backup: '📁 日常备份'
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadArticles();
    setupEventListeners();
});

// 加载配置
function loadConfig() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    document.getElementById('githubToken').value = config.token || '';
    document.getElementById('githubRepo').value = config.repo || '';
}

// 保存配置
function saveConfig() {
    const config = {
        token: document.getElementById('githubToken').value,
        repo: document.getElementById('githubRepo').value
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    document.getElementById('configModal').classList.add('hidden');
    loadArticles(); // 重新加载
}

// 获取配置
function getConfig() {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
}

// 设置事件监听
function setupEventListeners() {
    // 上传按钮
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('uploadPanel').classList.toggle('hidden');
    });

    // 配置按钮
    document.getElementById('configBtn').addEventListener('click', () => {
        document.getElementById('configModal').classList.toggle('hidden');
    });

    document.getElementById('saveConfig').addEventListener('click', saveConfig);
    document.getElementById('closeConfig').addEventListener('click', () => {
        document.getElementById('configModal').classList.add('hidden');
    });

    // 导航分类
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            filterArticles(link.dataset.category);
        });
    });

    // 上传表单
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);

    // 文件选择自动填充标题
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const name = file.name.replace('.html', '');
            document.getElementById('titleInput').value = name;
        }
    });
}

// 加载文章列表
async function loadArticles() {
    const config = getConfig();
    if (!config.token || !config.repo) {
        showStatus('请先配置 GitHub Token 和仓库', 'error');
        return;
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${DATA_FILE}`, {
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            const articles = JSON.parse(content);
            renderArticles(articles);
        } else if (response.status === 404) {
            // 文件不存在，初始化空数组
            renderArticles([]);
        } else {
            throw new Error('加载失败');
        }
    } catch (error) {
        console.error('加载文章失败:', error);
        showStatus('加载失败，请检查配置', 'error');
    }
}

// 渲染文章列表
function renderArticles(articles, filter = 'all') {
    const grid = document.getElementById('articles');
    const filtered = filter === 'all' ? articles : articles.filter(a => a.category === filter);

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:#666; padding:40px;">暂无文章</p>';
        return;
    }

    grid.innerHTML = filtered.map(article => `
        <div class="article-card">
            <div class="card-header">
                <h3>${escapeHtml(article.title)}</h3>
                <div class="meta">
                    <span class="category-tag ${article.category}">${CATEGORIES[article.category]}</span>
                    <span class="date">${article.date}</span>
                </div>
                ${article.tags ? `
                    <div class="tags">
                        ${article.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
            <div class="card-footer">
                <a href="archive/${article.filename}" target="_blank" class="view-btn">查看</a>
            </div>
        </div>
    `).join('');
}

// 筛选文章
function filterArticles(category) {
    const config = getConfig();
    if (!config.token || !config.repo) return;

    fetch(`https://api.github.com/repos/${config.repo}/contents/${DATA_FILE}`, {
        headers: {
            'Authorization': `token ${config.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
        const content = decodeURIComponent(escape(atob(data.content)));
        const articles = JSON.parse(content);
        renderArticles(articles, category);
    })
    .catch(() => {});
}

// 处理上传
async function handleUpload(e) {
    e.preventDefault();
    const config = getConfig();
    if (!config.token || !config.repo) {
        showStatus('请先配置 GitHub Token 和仓库', 'error');
        return;
    }

    const file = document.getElementById('fileInput').files[0];
    const title = document.getElementById('titleInput').value;
    const category = document.getElementById('categoryInput').value;
    const tags = document.getElementById('tagsInput').value.split(',').map(t => t.trim()).filter(Boolean);

    if (!file) {
        showStatus('请选择文件', 'error');
        return;
    }

    showStatus('上传中...', 'success');

    try {
        // 读取文件
        const content = await readFileAsBase64(file);
        const filename = `${Date.now()}_${file.name}`;

        // 上传HTML文件
        await uploadToGithub(`archive/${filename}`, content, `添加归档: ${title}`);

        // 更新索引
        const articles = await getArticles(config);
        articles.unshift({
            title,
            filename,
            category,
            tags,
            date: new Date().toISOString().split('T')[0]
        });

        const indexContent = btoa(unescape(encodeURIComponent(JSON.stringify(articles, null, 2))));
        await uploadToGithub(DATA_FILE, indexContent, `更新索引: ${title}`);

        showStatus('上传成功！', 'success');
        document.getElementById('uploadForm').reset();
        loadArticles();
    } catch (error) {
        console.error('上传失败:', error);
        showStatus('上传失败: ' + error.message, 'error');
    }
}

// 读取文件为Base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(btoa(reader.result));
        reader.onerror = reject;
        reader.readAsBinaryString(file);
    });
}

// 获取文章列表
async function getArticles(config) {
    try {
        const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${DATA_FILE}`, {
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return JSON.parse(decodeURIComponent(escape(atob(data.content))));
        }
        return [];
    } catch {
        return [];
    }
}

// 上传到GitHub
async function uploadToGithub(path, content, message) {
    const config = getConfig();

    // 检查文件是否存在（获取SHA）
    let sha = null;
    try {
        const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            sha = data.sha;
        }
    } catch {}

    const body = {
        message,
        content
    };
    if (sha) body.sha = sha;

    const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error('GitHub API 错误');
    }

    return response.json();
}

// 显示状态
function showStatus(message, type) {
    const status = document.getElementById('uploadStatus');
    status.textContent = message;
    status.className = `status ${type}`;
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
