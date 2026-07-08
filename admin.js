// admin.js — 管理员登录/退出/状态管理

window.adminToken = null;
let pendingAction = null; // 登录成功后执行的回调

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
        adminLoginBtn.classList.add('hidden');
        adminLogoutBtn.classList.remove('hidden');
    } else {
        adminLoginBtn.classList.remove('hidden');
        adminLogoutBtn.classList.add('hidden');
    }
}

// ====== 要求管理员身份（未登录则弹登录框，登录后执行回调） ======
window.requireAdmin = function(callback) {
    if (window.isAdmin()) {
        callback();
        return;
    }
    pendingAction = callback;
    adminModal.classList.remove('hidden');
    adminPasswordInput.focus();
};

// ====== 事件监听 ======
adminLoginBtn.addEventListener('click', () => {
    pendingAction = null; // 手动点 🔒 时无后续操作
    adminModal.classList.remove('hidden');
    adminPasswordInput.focus();
});

closeAdminBtn.addEventListener('click', () => {
    adminModal.classList.add('hidden');
    adminStatus.textContent = '';
    adminStatus.className = 'status';
    pendingAction = null;
});

adminLogoutBtn.addEventListener('click', () => {
    window.adminToken = null;
    updateUI();
    if (typeof loadArticles === 'function') {
        loadArticles();
    }
});

confirmLoginBtn.addEventListener('click', handleLogin);
adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// ====== 登录验证（带超时） ======
async function handleLogin() {
    const password = adminPasswordInput.value;
    if (!password) {
        showAdminStatus('请输入密码', 'error');
        return;
    }

    showAdminStatus('验证中...', 'success');
    confirmLoginBtn.disabled = true;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 秒超时

        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) {
            let errMsg = '密码错误';
            try {
                const err = await res.json();
                errMsg = err.error || `服务器错误 (${res.status})`;
            } catch (e) {
                errMsg = `服务器错误 (${res.status})`;
            }
            throw new Error(errMsg);
        }

        const data = await res.json();
        window.adminToken = data.token;

        adminModal.classList.add('hidden');
        updateUI();
        adminPasswordInput.value = '';
        adminStatus.textContent = '';
        adminStatus.className = 'status';

        // 刷新文章列表（显示编辑/删除按钮）
        if (typeof loadArticles === 'function') {
            loadArticles();
        }

        // 执行登录前的待处理操作
        if (pendingAction) {
            const action = pendingAction;
            pendingAction = null;
            action();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            showAdminStatus('请求超时，请检查网络或稍后重试', 'error');
        } else {
            showAdminStatus(error.message, 'error');
        }
    } finally {
        confirmLoginBtn.disabled = false;
    }
}

// ====== 辅助 ======
function showAdminStatus(message, type) {
    adminStatus.textContent = message;
    adminStatus.className = `status ${type}`;
}
