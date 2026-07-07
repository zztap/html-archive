// 配置
const CONFIG_KEY = 'html-archive-config';
const DATA_FILE = 'data/index.json';

// 分类映射
const CATEGORIES = {
    tech: '💻 科技脚本',
    knowledge: '📚 知识储备',
    backup: '📁 日常备份'
};

// 全局变量
let currentArticles = [];
let deleteIndex = -1;

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
    loadArticles();
}

// 获取配置
function getConfig() {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
}

// 设置事件监听
function setupEventListeners() {
    // 上传按钮
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('uploadPanel').classList.remove('hidden');
        document.getElementById('editPanel').classList.add('hidden');
    });

    // 取消上传
    document.getElementById('cancelUpload').addEventListener('click', () => {
        document.getElementById('uploadPanel').classList.add('hidden');
    });

    // 取消编辑
    document.getElementById('cancelEdit').addEventListener('click', () => {
        document.getElementById('editPanel').classList.add('hidden');
    });

    // 配置按钮
    document.getElementById('configBtn').addEventListener('click', () => {
        document.getElementById('configModal').classList.toggle('hidden');
    });

    document.getElementById('saveConfig').addEventListener('click', saveConfig);
    document.getElementById('closeConfig').addEventListener('click', () => {
        document.getElementById('configModal').classList.add('hidden');
    });

    // 删除确认
    document.getElementById('confirmDelete').addEventListener('click', handleDelete);
    document.getElementById('cancelDelete').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.add('hidden');
        deleteIndex = -1;
    });

    // 导航分类
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            renderArticles(currentArticles, link.dataset.category);
        });
    });

    // 上传表单
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);

    // 编辑表单
    document.getElementById('editForm').addEventListener('submit', handleEdit);

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
        document.getElementById('articles').innerHTML = '<p style="text-align:center; color:#666; padding:40px;">请点击右下角 ⚙️ 配置 GitHub Token 和仓库</p>';
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
            currentArticles = JSON.parse(content);
            renderArticles(currentArticles);
        } else if (response.status === 404) {
            currentArticles = [];
            renderArticles([]);
        } else {
            throw new Error('加载失败');
        }
    } catch (error) {
        console.error('加载文章失败:', error);
        document.getElementById('articles').innerHTML = '<p style="text-align:center; color:#e74c3c; padding:40px;">加载失败，请检查配置</p>';
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

    grid.innerHTML = filtered.map((article, displayIdx) => {
        // 找到在原始数组中的索引
        const originalIndex = articles.indexOf(article);
        return `
            <div class="article-card">
                <div class="card-header">
                    <h3>${escapeHtml(article.title)}</h3>
                    <div class="meta">
                        <span class="category-tag ${article.category}">${CATEGORIES[article.category]}</span>
                        <span class="date">${article.date}</span>
                    </div>
                    ${article.tags && article.tags.length > 0 ? `
                        <div class="tags">
                            ${article.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <div class="actions">
                        <a href="archive/${article.filename}" target="_blank" class="view-btn">查看</a>
                        <button class="edit-btn" onclick="openEdit(${originalIndex})">编辑</button>
                        <button class="delete-btn" onclick="openDelete(${originalIndex})">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 打开编辑面板
function openEdit(index) {
    const article = currentArticles[index];
    if (!article) return;

    document.getElementById('editIndex').value = index;
    document.getElementById('editFilename').value = article.filename;
    document.getElementById('editTitle').value = article.title;
    document.getElementById('editCategory').value = article.category;
    document.getElementById('editTags').value = (article.tags || []).join(', ');

    document.getElementById('editPanel').classList.remove('hidden');
    document.getElementById('uploadPanel').classList.add('hidden');
    document.getElementById('editStatus').className = 'status';
    document.getElementById('editStatus').textContent = '';

    // 滚动到编辑面板
    document.getElementById('editPanel').scrollIntoView({ behavior: 'smooth' });
}

// 打开删除确认
function openDelete(index) {
    deleteIndex = index;
    const article = currentArticles[index];
    document.getElementById('deleteMessage').textContent = `确定要删除「${article.title}」吗？此操作不可撤销。`;
    document.getElementById('deleteModal').classList.remove('hidden');
}

// 处理编辑
async function handleEdit(e) {
    e.preventDefault();
    const config = getConfig();
    if (!config.token || !config.repo) {
        showEditStatus('请先配置 GitHub Token 和仓库', 'error');
        return;
    }

    const index = parseInt(document.getElementById('editIndex').value);
    const title = document.getElementById('editTitle').value;
    const category = document.getElementById('editCategory').value;
    const tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(Boolean);

    showEditStatus('保存中...', 'success');

    try {
        // 更新文章信息
        currentArticles[index] = {
            ...currentArticles[index],
            title,
            category,
            tags
        };

        // 保存到 GitHub
        const indexContent = btoa(unescape(encodeURIComponent(JSON.stringify(currentArticles, null, 2))));
        await uploadToGithub(DATA_FILE, indexContent, `编辑文章: ${title}`);

        showEditStatus('保存成功！', 'success');
        renderArticles(currentArticles);

        // 2秒后隐藏编辑面板
        setTimeout(() => {
            document.getElementById('editPanel').classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('编辑失败:', error);
        showEditStatus('保存失败: ' + error.message, 'error');
    }
}

// 处理删除
async function handleDelete() {
    const config = getConfig();
    if (!config.token || !config.repo || deleteIndex < 0) return;

    const article = currentArticles[deleteIndex];

    try {
        // 从列表中移除
        currentArticles.splice(deleteIndex, 1);

        // 保存索引
        const indexContent = btoa(unescape(encodeURIComponent(JSON.stringify(currentArticles, null, 2))));
        await uploadToGithub(DATA_FILE, indexContent, `删除文章: ${article.title}`);

        // 删除HTML文件（可选，注释掉则保留文件）
        try {
            await deleteFromGithub(`archive/${article.filename}`, `删除文件: ${article.filename}`);
        } catch (e) {
            console.log('删除文件失败，但索引已更新');
        }

        // 关闭弹窗并刷新
        document.getElementById('deleteModal').classList.add('hidden');
        deleteIndex = -1;
        renderArticles(currentArticles);
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 处理上传
async function handleUpload(e) {
    e.preventDefault();
    const config = getConfig();
    if (!config.token || !config.repo) {
        showUploadStatus('请先配置 GitHub Token 和仓库', 'error');
        return;
    }

    const file = document.getElementById('fileInput').files[0];
    const title = document.getElementById('titleInput').value;
    const category = document.getElementById('categoryInput').value;
    const tags = document.getElementById('tagsInput').value.split(',').map(t => t.trim()).filter(Boolean);

    if (!file) {
        showUploadStatus('请选择文件', 'error');
        return;
    }

    showUploadStatus('上传中...', 'success');

    try {
        // 读取文件
        const content = await readFileAsBase64(file);
        const filename = `${Date.now()}_${file.name}`;

        // 上传HTML文件
        await uploadToGithub(`archive/${filename}`, content, `添加归档: ${title}`);

        // 更新索引
        currentArticles.unshift({
            title,
            filename,
            category,
            tags,
            date: new Date().toISOString().split('T')[0]
        });

        const indexContent = btoa(unescape(encodeURIComponent(JSON.stringify(currentArticles, null, 2))));
        await uploadToGithub(DATA_FILE, indexContent, `更新索引: ${title}`);

        showUploadStatus('上传成功！', 'success');
        document.getElementById('uploadForm').reset();
        renderArticles(currentArticles);

        // 2秒后隐藏上传面板
        setTimeout(() => {
            document.getElementById('uploadPanel').classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('上传失败:', error);
        showUploadStatus('上传失败: ' + error.message, 'error');
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

// 从GitHub删除文件
async function deleteFromGithub(path, message) {
    const config = getConfig();

    // 获取文件SHA
    const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
        headers: {
            'Authorization': `token ${config.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error('文件不存在');
    }

    const data = await response.json();

    // 删除文件
    const deleteResponse = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `token ${config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message,
            sha: data.sha
        })
    });

    if (!deleteResponse.ok) {
        throw new Error('删除失败');
    }

    return deleteResponse.json();
}

// 显示上传状态
function showUploadStatus(message, type) {
    const status = document.getElementById('uploadStatus');
    status.textContent = message;
    status.className = `status ${type}`;
}

// 显示编辑状态
function showEditStatus(message, type) {
    const status = document.getElementById('editStatus');
    status.textContent = message;
    status.className = `status ${type}`;
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
