// admin.js — 管理员登录/退出/状态管理

window.adminToken = null;

window.isAdmin = function() {
    return !!window.adminToken;
};

// ====== DOM 元素 ======
const adminModal = document.getElementById('adminModal');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminPasswordInput = document.getElementById('adminPassword');
const confirmLoginBtn = document.getElementById('confirmLogin');
const closeAdminBtn = document.getElementById('closeAdmin');
const adminStatus = document.getElementById('adminStatus');

// ====== 初始化 UI ======
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
});

function updateUI() {
    if (window.isAdmin()) {
        document.getElementById('uploadBtn').style.display = 'inline-flex';
        adminLoginBtn.classList.add('hidden');
        adminLogoutBtn.classList.remove('hidden');
    } else {
        document.getElementById('uploadBtn').style.display = 'none';
        adminLoginBtn.classList.remove('hidden');
        adminLogoutBtn.classList.add('hidden');
    }
}

// ====== 事件监听 ======
adminLoginBtn.addEventListener('click', () => {
    adminModal.classList.remove('hidden');
    adminPasswordInput.focus();
});

closeAdminBtn.addEventListener('click', () => {
    adminModal.classList.add('hidden');
    adminStatus.textContent = '';
    adminStatus.className = 'status';
});

adminLogoutBtn.addEventListener('click', () => {
    window.adminToken = null;
    updateUI();
    // 重新加载列表以隐藏编辑/删除操作
    if (typeof loadArticles === 'function') {
        loadArticles();
    }
});

confirmLoginBtn.addEventListener('click', handleLogin);
adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// ====== 登录验证 ======
async function handleLogin() {
    const password = adminPasswordInput.value;
    if (!password) {
        showAdminStatus('请输入密码', 'error');
        return;
    }

    showAdminStatus('验证中...', 'success');

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '密码错误');
        }

        const data = await res.json();
        window.adminToken = data.token; // 保存并暴露给全局使用

        adminModal.classList.add('hidden');
        updateUI();
        adminPasswordInput.value = '';

        // 重新加载文章列表（激活管理控制选项）
        if (typeof loadArticles === 'function') {
            loadArticles();
        }
    } catch (error) {
        showAdminStatus(error.message, 'error');
    }
}

// ====== 辅助 ======
function showAdminStatus(message, type) {
    adminStatus.textContent = message;
    adminStatus.className = `status ${type}`;
}