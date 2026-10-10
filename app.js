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
const PAGE_SIZE = 10; // 每页条数
let currentPage = 1;
let lastRenderList = []; // 当前筛选排序后的完整列表
let currentMonthFilter = null; // 'YYYY-MM' or null — 时间归档
window.currentMonthFilter = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.currentFilter = currentFilter;
    window.currentArticles = currentArticles;
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

    // 导航分类（与侧栏同步）
    document.querySelectorAll('nav.blog-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            setCategoryFilter(link.dataset.category || 'all');
        });
    });

    // 上传表单
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);

    // 编辑表单
    document.getElementById('editForm').addEventListener('submit', handleEdit);

    // 文件选择自动填充标题和更新拖拽区文字
    document.getElementById('fileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const name = file.name.replace('.html', '');
            document.getElementById('titleInput').value = name;
            const dummy = document.querySelector('.file-dummy-text');
            if (dummy) dummy.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            // 预填原文 URL（可手改）
            const srcInput = document.getElementById('sourceUrlInput');
            if (srcInput && !srcInput.value) {
                try {
                    const head = await readFileHeadAsText(file, 64 * 1024);
                    const url = extractSourceUrlFromHtml(head);
                    if (url) srcInput.value = url;
                } catch (err) {}
            }
        }
    });


    // 记录近期阅读（标题 / 查看）
    const articlesEl = document.getElementById('articles');
    if (articlesEl && !articlesEl.dataset.recentBound) {
        articlesEl.dataset.recentBound = '1';
        articlesEl.addEventListener('click', (e) => {
            const a = e.target.closest('a[data-recent="1"]');
            if (!a) return;
            const card = a.closest('.article-card');
            if (!card) return;
            const title = card.querySelector('.card-title-link')?.textContent?.trim() || '';
            const chip = card.querySelector('.shortcode-chip')?.textContent?.trim() || '';
            const href = a.getAttribute('href') || '';
            let filename = '';
            if (href.includes('/archive/')) {
                try { filename = decodeURIComponent(href.split('/archive/')[1] || ''); } catch (err) {}
            }
            recordArticleOpen({ title, shortcode: chip, filename });
        });
    }


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
    document.getElementById('searchInput').addEventListener('input', () => {
        renderArticles(getArticlesForView(), currentFilter);
    });

    // 排序按钮点击
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            renderArticles(getArticlesForView(), currentFilter);
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
            window.currentArticles = currentArticles;
            if (typeof window.refreshSidebar === 'function') window.refreshSidebar(currentArticles);
            renderArticles(getArticlesForView(), currentFilter);
        } else if (response.status === 404) {
            currentArticles = [];
            window.currentArticles = currentArticles;
            renderArticles([], currentFilter);
            if (typeof window.refreshSidebar === 'function') window.refreshSidebar(currentArticles);
        } else {
            throw new Error('加载失败');
        }
    } catch (error) {
        console.error('加载文章失败:', error);
        document.getElementById('articles').innerHTML = '<p style="text-align:center; color:#e74c3c; padding:40px;">加载失败，请检查配置</p>';
    }
}

function getArticlesForView() {
    let list = currentArticles;
    if (currentMonthFilter) {
        list = list.filter(a => (a.date || '').startsWith(currentMonthFilter));
    }
    const keyword = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    if (keyword) {
        list = list.filter(a => {
            const matchTitle = a.title.toLowerCase().includes(keyword);
            const matchTags = (a.tags || []).some(t => t.toLowerCase().includes(keyword));
            const matchDesc = (a.description || '').toLowerCase().includes(keyword);
            return matchTitle || matchTags || matchDesc;
        });
    }
    return list;
}

function syncFilterChrome() {
    document.querySelectorAll('nav.blog-nav a').forEach(l => {
        l.classList.toggle('active', (l.dataset.category || 'all') === currentFilter);
    });
    if (typeof window.syncSidebarCategoryActive === 'function') {
        window.syncSidebarCategoryActive(currentFilter);
    } else {
        document.querySelectorAll('.sidebar-cat').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === currentFilter);
        });
    }
    document.querySelectorAll('.month-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.month === currentMonthFilter);
    });
    const clearMonth = document.getElementById('clearMonthBtn');
    if (clearMonth) clearMonth.classList.toggle('hidden', !currentMonthFilter);
}

// 顶栏 + 侧栏共用的分类筛选（保持两边高亮一致）
function setCategoryFilter(category) {
    currentFilter = category || 'all';
    window.currentFilter = currentFilter;
    syncFilterChrome();
    renderArticles(getArticlesForView(), currentFilter);
}
window.setCategoryFilter = setCategoryFilter;

function setMonthFilter(ym) {
    currentMonthFilter = ym || null;
    window.currentMonthFilter = currentMonthFilter;
    syncFilterChrome();
    renderArticles(getArticlesForView(), currentFilter);
    // 刷新侧栏「清除」按钮显隐（分类计数仍相对全量）
    if (typeof window.refreshSidebar === 'function') {
        window.refreshSidebar(currentArticles);
        syncFilterChrome();
    }
}
window.setMonthFilter = setMonthFilter;

// 渲染文章列表（编号分页）
function renderArticles(articles, filter = 'all', resetPage = true) {
    const grid = document.getElementById('articles');
    const countEl = document.getElementById('resultCount');
    const pagerWrap = document.getElementById('pagerWrap');
    const searchKeyword = (document.getElementById('searchInput')?.value || '').trim();

    if (resetPage) currentPage = 1;

    // 1. 过滤（articles 可能是搜索子集；编辑索引永远相对 currentArticles）
    let list = filter === 'all' ? [...articles] : articles.filter(a => a.category === filter);

    // 2. 排序
    if (currentSort === 'oldest') {
        list = [...list].reverse();
    } else if (currentSort === 'title') {
        list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    } else {
        list = [...list];
    }

    lastRenderList = list;
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE) || 1);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    if (list.length === 0) {
        if (countEl) countEl.textContent = '共 0 篇';
        let emptyMsg = '暂无文章';
        if (searchKeyword) {
            emptyMsg = `没有找到与「${escapeHtml(searchKeyword)}」匹配的归档`;
        } else if (filter !== 'all') {
            emptyMsg = `「${CATEGORIES[filter] || filter}」分类下暂无文章`;
        } else if (currentMonthFilter) {
            emptyMsg = '该月份暂无文章';
        }
        grid.innerHTML = `<p style="text-align:center; color:#666; padding:40px;">${emptyMsg}</p>`;
        renderPager(0, 1);
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, list.length);
    const pageItems = list.slice(start, end);

    if (countEl) {
        countEl.textContent = `显示 ${start + 1}–${end} / ${list.length} 篇 · 第 ${currentPage}/${totalPages} 页`;
    }

    grid.innerHTML = pageItems.map((article) => {
        const originalIndex = currentArticles.indexOf(article);
        const viewHref = article.shortcode
            ? `/go/${encodeURIComponent(article.shortcode)}`
            : `/archive/${encodeURIComponent(article.filename)}`;
        return `
            <div class="article-card">
                <div class="card-header">
                    <h3><a href="${viewHref}" target="_blank" class="card-title-link" data-recent="1">${escapeHtml(article.title)}</a></h3>
                    <div class="meta">
                        <span class="category-tag ${article.category}">${CATEGORIES[article.category] || article.category}</span>
                        <span class="date">${article.date}</span>
                        ${article.shortcode ? `<span class="shortcode-chip" title="短码">${escapeHtml(article.shortcode)}</span>` : ''}
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
                        <a href="${viewHref}" target="_blank" class="view-btn" data-recent="1">查看</a>
                        ${article.shortcode ? `<button type="button" class="copy-btn" onclick="copyShortLink('${escapeHtml(article.shortcode)}')">复制短链</button>` : ''}
                        ${window.isAdmin && window.isAdmin() && originalIndex >= 0 ? `
                            <button class="edit-btn" onclick="openEdit(${originalIndex})">编辑</button>
                            <button class="delete-btn" onclick="openDelete(${originalIndex})">删除</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderPager(list.length, totalPages);
}

/** 生成页码序列：含首页/末页省略，如 [1, '…', 4, 5, 6, '…', 12] */
function buildPageNumbers(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const set = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);
    const nums = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < nums.length; i++) {
        if (i > 0 && nums[i] - nums[i - 1] > 1) out.push('…');
        out.push(nums[i]);
    }
    return out;
}

function renderPager(totalItems, totalPages) {
    const wrap = document.getElementById('pagerWrap');
    if (!wrap) return;
    if (!totalItems || totalPages <= 1) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }
    wrap.classList.remove('hidden');
    const pages = buildPageNumbers(currentPage, totalPages);
    const prevDisabled = currentPage <= 1 ? ' disabled' : '';
    const nextDisabled = currentPage >= totalPages ? ' disabled' : '';
    wrap.innerHTML = `
        <button type="button" class="pager-btn" data-page="1"${currentPage === 1 ? ' disabled' : ''}>首页</button>
        <button type="button" class="pager-btn pager-nav" data-page="${currentPage - 1}"${prevDisabled}>上一页</button>
        ${pages.map(p => {
            if (p === '…') return '<span class="pager-ellipsis" aria-hidden="true">…</span>';
            const active = p === currentPage ? ' active' : '';
            return `<button type="button" class="pager-btn${active}" data-page="${p}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</button>`;
        }).join('')}
        <button type="button" class="pager-btn pager-nav" data-page="${currentPage + 1}"${nextDisabled}>下一页</button>
        <button type="button" class="pager-btn" data-page="${totalPages}"${currentPage === totalPages ? ' disabled' : ''}>末页</button>
    `;
    wrap.querySelectorAll('.pager-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page, 10);
            if (!p || p === currentPage) return;
            goToPage(p);
        });
    });
}

function goToPage(page) {
    currentPage = page;
    renderArticles(getArticlesForView(), currentFilter, false);
    const panel = document.querySelector('.control-panel') || document.getElementById('articles');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyShortLink(shortcode) {
    const url = `${location.origin}/go/${shortcode}`;
    try {
        await navigator.clipboard.writeText(url);
        if (typeof showToast === 'function') showToast('已复制短链');
        else alert('已复制: ' + url);
    } catch (e) {
        prompt('复制短链：', url);
    }
}

async function runHealthCheck() {
    if (!window.isAdmin || !window.isAdmin()) {
        if (typeof window.requireAdmin === 'function') {
            window.requireAdmin(() => runHealthCheck());
        }
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/health`, {
            headers: { 'Authorization': `Bearer ${window.adminToken}` }
        });
        if (res.status === 401) {
            window.adminToken = null;
            if (typeof window.requireAdmin === 'function') {
                window.requireAdmin(() => runHealthCheck());
            }
            return;
        }
        const data = await res.json();
        if (!res.ok) {
            alert('健康检查失败: ' + (data.error || res.status));
            return;
        }
        const lines = [
            data.ok ? '✅ 索引与文件一致' : '⚠️ 发现不一致',
            `索引条目: ${data.articleCount}`,
            `archive 文件: ${data.archiveCount}`,
            data.missingFiles?.length ? `索引有、文件缺失:\n- ${data.missingFiles.join('\n- ')}` : '无缺失文件',
            data.orphanFiles?.length ? `文件有、索引缺失:\n- ${data.orphanFiles.join('\n- ')}` : '无孤儿文件',
            data.duplicateShortcodes?.length ? `重复短码: ${data.duplicateShortcodes.join(', ')}` : '短码无重复'
        ];
        alert(lines.join('\n'));
    } catch (e) {
        alert('健康检查出错: ' + e.message);
    }
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
    const editSrc = document.getElementById('editSourceUrl');
    if (editSrc) editSrc.value = article.sourceUrl || '';

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
    const sourceUrl = (document.getElementById('editSourceUrl')?.value || '').trim();

    showEditStatus('保存中...', 'success');

    try {
        // 更新文章信息
        currentArticles[index] = {
            ...currentArticles[index],
            title,
            category,
            tags,
            description,
            ...(sourceUrl ? { sourceUrl } : { sourceUrl: undefined })
        };
        if (!sourceUrl) delete currentArticles[index].sourceUrl;

        // 保存到 GitHub
        const indexContent = encodeBase64(JSON.stringify(currentArticles, null, 2));
        await uploadToGithub(DATA_FILE, indexContent, `编辑文章: ${title}`);

        showEditStatus('保存成功！', 'success');
        window.currentArticles = currentArticles;
        renderArticles(currentArticles, currentFilter);
        if (typeof window.refreshSidebar === 'function') window.refreshSidebar(currentArticles);

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
        window.currentArticles = currentArticles;
        renderArticles(currentArticles, currentFilter);
        if (typeof window.refreshSidebar === 'function') window.refreshSidebar(currentArticles);
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
    let sourceUrl = (document.getElementById('sourceUrlInput')?.value || '').trim();

    if (!file) {
        showUploadStatus('请选择文件', 'error');
        return;
    }

    if (file.size > 100 * 1024 * 1024) {
        showUploadStatus('文件超过 100MB，GitHub API 拒绝上传', 'error');
        return;
    }

    showUploadStatus('准备上传...', 'success');

    const progressBar = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    progressBar.classList.remove('hidden');
    progressText.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    let uploadedFilename = null;
    let indexPushed = false;

    try {
        // 若表单未填原文，尝试从 SingleFile HTML 元数据解析
        if (!sourceUrl) {
            try {
                const textHead = await readFileHeadAsText(file, 64 * 1024);
                sourceUrl = extractSourceUrlFromHtml(textHead) || '';
            } catch (err) {
                console.warn('解析原文 URL 失败', err);
            }
        }

        const content = await readFileAsBase64(file);
        const filename = `${Date.now()}_${file.name}`;
        uploadedFilename = filename;

        const now = new Date();
        const yymmdd = String(now.getFullYear()).slice(2) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        const PREFIX = { tech: 'KJ', knowledge: 'ZS', backup: 'RB' };
        const prefix = PREFIX[category] || 'QT';
        const used = new Set(currentArticles.map(a => a.shortcode).filter(Boolean));
        let seq = currentArticles.filter(a =>
            a.shortcode && a.shortcode.startsWith(prefix + '-' + yymmdd)
        ).length + 1;
        let shortcode = `${prefix}-${yymmdd}${String(seq).padStart(2, '0')}`;
        while (used.has(shortcode)) {
            seq += 1;
            shortcode = `${prefix}-${yymmdd}${String(seq).padStart(2, '0')}`;
            if (seq > 99) throw new Error('今日短码已用尽，请稍后再试');
        }

        await new Promise((resolve, reject) => {
            const body = JSON.stringify({ message: `添加归档: ${title}`, content });
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', `${API_BASE}/archive/${encodeURIComponent(filename)}`);
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
                } else if (xhr.status === 401) {
                    window.adminToken = null;
                    if (typeof window.requireAdmin === 'function') {
                        window.requireAdmin(() => {
                            document.getElementById('uploadBtn').click();
                        });
                    }
                    reject(new Error('登录已过期，请重新登录'));
                } else {
                    reject(new Error(`上传 HTML 错误（HTTP ${xhr.status}）`));
                }
            };
            xhr.onerror = () => reject(new Error('网络错误，无法上传'));
            xhr.send(body);
        });

        const entry = {
            title,
            filename,
            category,
            tags,
            description,
            date: new Date().toISOString().split('T')[0],
            shortcode
        };
        if (sourceUrl) entry.sourceUrl = sourceUrl;

        currentArticles.unshift(entry);
        indexPushed = true;

        try {
            const indexContent = encodeBase64(JSON.stringify(currentArticles, null, 2));
            await uploadToGithub(DATA_FILE, indexContent, `更新索引: ${title}`);
        } catch (indexErr) {
            // 索引失败：回滚内存并尽量删除已上传的 HTML，避免孤儿文件
            if (indexPushed) {
                currentArticles.shift();
                indexPushed = false;
            }
            showUploadStatus('索引更新失败，正在清理已上传文件…', 'error');
            try {
                await deleteFromGithub(`archive/${filename}`, `回滚孤儿文件: ${filename}`);
                showUploadStatus('上传失败（索引未写入，已清理孤儿 HTML）: ' + indexErr.message, 'error');
            } catch (cleanErr) {
                console.error('清理孤儿失败', cleanErr);
                showUploadStatus(
                    '上传失败且清理孤儿未成功，请用健康检查处理: ' + filename + ' — ' + indexErr.message,
                    'error'
                );
            }
            progressBar.classList.add('hidden');
            progressText.classList.add('hidden');
            return;
        }

        showUploadStatus('上传成功！', 'success');
        document.getElementById('uploadForm').reset();
        const dummy = document.querySelector('.file-dummy-text');
        if (dummy) dummy.textContent = '点击或拖拽 HTML 文件到此区域';
        window.currentArticles = currentArticles;
        renderArticles(currentArticles, currentFilter);
        if (typeof window.refreshSidebar === 'function') window.refreshSidebar(currentArticles);

        setTimeout(() => {
            document.getElementById('uploadPanel').classList.add('hidden');
            progressBar.classList.add('hidden');
            progressText.classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('上传失败:', error);
        // HTML 上传阶段失败时无需清孤儿；若已 push 索引则不应走到这里
        if (indexPushed) {
            currentArticles.shift();
        }
        showUploadStatus('上传失败: ' + error.message, 'error');
        progressBar.classList.add('hidden');
        progressText.classList.add('hidden');
    }
}

/** 从 SingleFile / 常见 meta 中提取原文 URL */
function extractSourceUrlFromHtml(html) {
    if (!html) return '';
    const patterns = [
        /(?:^|\n)\s*url:\s*(https?:\/\/\S+)/i,
        /property=["']og:url["']\s+content=["']([^"']+)["']/i,
        /content=["']([^"']+)["']\s+property=["']og:url["']/i,
        /name=["']url["']\s+content=["'](https?:\/\/[^"']+)["']/i,
        /content=["'](https?:\/\/[^"']+)["']\s+name=["']url["']/i,
        /<link[^>]+rel=["']canonical["'][^>]+href=["'](https?:\/\/[^"']+)["']/i
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m && m[1]) {
            return m[1].replace(/[>,\s]+$/, '').trim();
        }
    }
    return '';
}

function readFileHeadAsText(file, maxBytes) {
    const blob = file.slice(0, maxBytes);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsText(blob);
    });
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

        // 409 Conflict → SHA 过期退避重试
        if (response.status === 409 && attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
            continue;
        }

        // 401 登录过期，弹登录框
        if (response.status === 401) {
            window.adminToken = null;
            if (typeof window.requireAdmin === 'function') {
                window.requireAdmin(() => {});
            }
            throw new Error('登录已过期，请重新登录');
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
window.copyShortLink = copyShortLink;
window.runHealthCheck = runHealthCheck;

window.goToPage = goToPage;

function recordArticleOpen(article) {
    if (typeof window.recordRecentReading === 'function') {
        window.recordRecentReading(article);
    }
}
window.recordArticleOpen = recordArticleOpen;
