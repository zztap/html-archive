// 配置
const DATA_FILE = 'data/index.json';
const API_BASE = '/api';

// 分类映射
const CATEGORIES = {
    tech: '💻 科技脚本',
    knowledge: '📚 知识储备',
    backup: '📁 日常备份'
};

// 全局变量
let currentArticles = [];
let deleteIndex = -1;
let currentFilter = 'all'; // 记录当前选择的分类过滤
let currentSort = 'newest'; // 记录当前排序方式

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadArticles();
    setupEventListeners();
});

// 定义 UTF-8 安全的 Base64 编解码器（替代已废弃的 escape / unescape）
function decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
}

function encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
            currentFilter = link.dataset.category; // 保存当前选中的过滤器
            renderArticles(currentArticles, currentFilter);
        });
    });

    // 上传表单
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);

    // 编辑表单
    document.getElementById('editForm').addEventListener('submit', handleEdit);

    // 文件选择自动填充标题和更新拖拽区文字
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const name = file.name.replace('.html', '');
            document.getElementById('titleInput').value = name;
            // 更新拖拽区文字
            const dummy = document.querySelector('.file-dummy-text');
            if (dummy) dummy.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        }
    });

    // 拖拽上传支持
    const dropArea = document.querySelector('.file-drop-area');
    if (dropArea) {
        ['dragenter', 'dragover'].forEach(evt => {
            dropArea.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropArea.style.borderColor = 'var(--primary)';
                dropArea.style.background = 'var(--primary-light)';
            });
        });
        ['dragleave', 'drop'].forEach(evt => {
            dropArea.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropArea.style.borderColor = '';
                dropArea.style.background = '';
            });
        });
        dropArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                document.getElementById('fileInput').files = files;
                // 触发 change 事件
                const evt = new Event('change', { bubbles: true });
                document.getElementById('fileInput').dispatchEvent(evt);
            }
        });
    }

    // 搜索事件
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        if (!keyword) {
            renderArticles(currentArticles, currentFilter);
            return;
        }
        const filtered = currentArticles.filter(a => {
            const matchTitle = a.title.toLowerCase().includes(keyword);
            const matchTags = (a.tags || []).some(t => t.toLowerCase().includes(keyword));
            const matchDesc = (a.description || '').toLowerCase().includes(keyword);
            return matchTitle || matchTags || matchDesc;
        });
        renderArticles(filtered, currentFilter);
    });

    // 排序按钮点击
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            renderArticles(currentArticles, currentFilter);
        });
    });
}

// 加载文章列表
async function loadArticles() {
    // 显示骨架屏
    document.getElementById('articles').innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line long"></div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line long"></div>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/articles`);

        if (response.ok) {
            const data = await response.json();
            const content = decodeBase64(data.content);
            currentArticles = JSON.parse(content);
            renderArticles(currentArticles, currentFilter);
        } else if (response.status === 404) {
            currentArticles = [];
            renderArticles([], currentFilter);
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
    
    // 1. 过滤
    let list = filter === 'all' ? [...articles] : articles.filter(a => a.category === filter);

    // 2. 排序
    if (currentSort === 'oldest') {
        list.reverse(); // 原本 newest 在最前，reverse 变成 oldest 在前
    } else if (currentSort === 'title') {
        list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    }

    if (list.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:#666; padding:40px;">暂无文章</p>';
        return;
    }

    grid.innerHTML = list.map((article) => {
        // 找到在原始数组中的对应索引，保证编辑/删除操作的目标准确
        const originalIndex = articles.indexOf(article);
        return `
            <div class="article-card">
                <div class="card-header">
                    <h3>${escapeHtml(article.title)}</h3>
                    <div class="meta">
                        <span class="category-tag ${article.category}">${CATEGORIES[article.category] || article.category}</span>
                        <span class="date">${article.date}</span>
                    </div>
                    ${article.description ? `<p class="card-desc">${escapeHtml(article.description)}</p>` : ''}
                    ${article.tags && article.tags.length > 0 ? `
                        <div class="tags">
                            ${article.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <div class="actions">
                        <a href="archive/${article.filename}" target="_blank" class="view-btn">查看</a>
                        ${window.isAdmin && window.isAdmin() ? `
                            <button class="edit-btn" onclick="openEdit(${originalIndex})">编辑</button>
                            <button class="delete-btn" onclick="openDelete(${originalIndex})">删除</button>
                        ` : ''}
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
    document.getElementById('editDescription').value = article.description || '';

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
    if (!window.isAdmin || !window.isAdmin()) {
        showEditStatus('请先登录管理员账号', 'error');
        return;
    }

    const index = parseInt(document.getElementById('editIndex').value);
    const title = document.getElementById('editTitle').value;
    const category = document.getElementById('editCategory').value;
    const tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const description = document.getElementById('editDescription').value;

    showEditStatus('保存中...', 'success');

    try {
        // 更新文章信息
        currentArticles[index] = {
            ...currentArticles[index],
            title,
            category,
            tags,
            description
        };

        // 保存到 GitHub
        const indexContent = encodeBase64(JSON.stringify(currentArticles, null, 2));
        await uploadToGithub(DATA_FILE, indexContent, `编辑文章: ${title}`);

        showEditStatus('保存成功！', 'success');
        renderArticles(currentArticles, currentFilter);

        // 2秒后隐藏编辑面板
        setTimeout(() => {
            document.getElementById('editPanel').classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('编辑失败:', error);
        showEditStatus('保存失败: ' + error.message, 'error');
    }
}

// 处理删除（采用“先删文件，再更新索引”的串行安全机制）
async function handleDelete() {
    if (deleteIndex < 0 || !window.isAdmin || !window.isAdmin()) return;

    const article = currentArticles[deleteIndex];

    try {
        // 1. 先尝试删除 HTML 文件
        const deleteResult = await deleteFromGithub(`archive/${article.filename}`, `删除文件: ${article.filename}`);

        // 2. 从列表中移除该项（无论文件是否存在，索引都要更新）
        currentArticles.splice(deleteIndex, 1);

        // 3. 上传更新后的索引
        const indexContent = encodeBase64(JSON.stringify(currentArticles, null, 2));
        await uploadToGithub(DATA_FILE, indexContent, `删除文章: ${article.title}`);

        // 关闭弹窗并刷新
        document.getElementById('deleteModal').classList.add('hidden');
        deleteIndex = -1;
        renderArticles(currentArticles, currentFilter);
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 处理上传
async function handleUpload(e) {
    e.preventDefault();
    if (!window.isAdmin || !window.isAdmin()) {
        showUploadStatus('请先登录管理员账号', 'error');
        return;
    }

    const file = document.getElementById('fileInput').files[0];
    const title = document.getElementById('titleInput').value;
    const category = document.getElementById('categoryInput').value;
    const tags = document.getElementById('tagsInput').value.split(',').map(t => t.trim()).filter(Boolean);
    const description = document.getElementById('descriptionInput').value;

    if (!file) {
        showUploadStatus('请选择文件', 'error');
        return;
    }

    // 限制单文件 100MB (GitHub Git Data API 限制)
    if (file.size > 100 * 1024 * 1024) {
        showUploadStatus('文件超过 100MB，GitHub API 拒绝上传', 'error');
        return;
    }

    showUploadStatus('准备上传...', 'success');

    // 显示进度条
    const progressBar = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    progressBar.classList.remove('hidden');
    progressText.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
        // 读取文件
        const content = await readFileAsBase64(file);
        const filename = `${Date.now()}_${file.name}`;

        // 使用 XMLHttpRequest 上传 HTML 文件以获取真实的上传进度
        await new Promise((resolve, reject) => {
            const body = JSON.stringify({ message: `添加归档: ${title}`, content });
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', `${API_BASE}/archive/${filename}`);
            if (window.adminToken) {
                xhr.setRequestHeader('Authorization', `Bearer ${window.adminToken}`);
            }
            xhr.setRequestHeader('Content-Type', 'application/json');

            xhr.upload.addEventListener('progress', (ev) => {
                if (ev.lengthComputable) {
                    const pct = Math.round((ev.loaded / ev.total) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = pct + '%';
                }
            });

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`上传 HTML 错误（HTTP ${xhr.status}）`));
                }
            };
            xhr.onerror = () => reject(new Error('网络错误，无法上传'));
            xhr.send(body);
        });

        // HTML 上传成功后，更新索引数据结构
        currentArticles.unshift({
            title,
            filename,
            category,
            tags,
            description,
            date: new Date().toISOString().split('T')[0]
        });

        const indexContent = encodeBase64(JSON.stringify(currentArticles, null, 2));
        await uploadToGithub(DATA_FILE, indexContent, `更新索引: ${title}`);

        showUploadStatus('上传成功！', 'success');
        document.getElementById('uploadForm').reset();
        // 重置文件拖拽区文字
        const dummy = document.querySelector('.file-dummy-text');
        if (dummy) dummy.textContent = '点击或拖拽 HTML 文件到此区域';
        renderArticles(currentArticles, currentFilter);

        // 2秒后重置和隐藏上传面板
        setTimeout(() => {
            document.getElementById('uploadPanel').classList.add('hidden');
            progressBar.classList.add('hidden');
            progressText.classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('上传失败:', error);
        showUploadStatus('上传失败: ' + error.message, 'error');
        progressBar.classList.add('hidden');
        progressText.classList.add('hidden');
    }
}

// 废弃 readAsBinaryString -> 安全读取为 ArrayBuffer，并编码为 Base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            resolve(btoa(binary));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// 上传至 GitHub Contents API (带 SHA 校验和自动防冲突重试)
async function uploadToGithub(path, content, message, retries = 3) {
    let apiPath = '';
    if (path === DATA_FILE) {
        apiPath = '/api/articles';
    } else if (path.startsWith('archive/')) {
        apiPath = '/api/archive/' + path.replace('archive/', '');
    } else {
        apiPath = '/api/' + path;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        // 尝试获取最新 SHA (只对 index.json，新上传的 HTML 文件不需要 SHA 且 GET 也会 404)
        let sha = null;
        if (apiPath === '/api/articles') {
            try {
                const response = await fetch(apiPath);
                if (response.ok) {
                    const data = await response.json();
                    sha = data.sha;
                }
            } catch (err) {}
        }

        const body = {
            message,
            content
        };
        if (sha) body.sha = sha;

        const headers = {
            'Content-Type': 'application/json'
        };
        if (window.adminToken) {
            headers['Authorization'] = `Bearer ${window.adminToken}`;
        }

        const response = await fetch(apiPath, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body)
        });

        if (response.ok) {
            return response.json();
        }

        // 409 Conflict 表示 SHA 在获取和 PUT 之间被其他操作修改，执行退避并重试
        if (response.status === 409 && attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
            continue;
        }

        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
    }
}

async function deleteFromGithub(path, message) {
    const filename = path.replace('archive/', '');
    
    // 1. 获取要删除文件的最新 SHA
    const response = await fetch(`/api/articles/${filename}`);
    if (!response.ok) {
        // 文件不存在（已手动删除或上传失败），跳过删除步骤
        console.warn('文件 ' + filename + ' 不存在，跳过删除');
        return { skipped: true };
    }

    const fileData = await response.json();
    const sha = fileData.sha;

    // 2. 发送带有 SHA 的鉴权删除请求
    const deleteResponse = await fetch(`/api/archive/${filename}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.adminToken}`
        },
        body: JSON.stringify({ message, sha })
    });

    if (!deleteResponse.ok) {
        const err = await deleteResponse.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${deleteResponse.status}`);
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

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}