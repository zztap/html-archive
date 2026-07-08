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
        const timeout = setTimeout(() => controller.abort(), 10000);

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

        // 登录成功提示
        showToast('✅ 登录成功');

        // 刷新文章列表（显示编辑/删除按钮）
        if (typeof loadArticles === 'function') {
            loadArticles();
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

// Toast 提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #10b981; color: white; padding: 12px 28px; border-radius: 10px;
        font-size: 15px; font-weight: 600; z-index: 9999;
        box-shadow: 0 4px 20px rgba(16,185,129,0.4);
        animation: toastIn 0.3s ease, toastOut 0.3s ease 1.7s forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}
