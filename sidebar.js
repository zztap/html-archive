// sidebar.js — 左侧栏：名片 / 热力图 / 分类 / 近期阅读 / 统计
// 顶栏行为不变；分类筛选与顶栏 nav 双向同步（via window.setCategoryFilter）

const RECENT_KEY = 'html-archive-recent';
const RECENT_MAX = 8;
const PROFILE_URL = 'data/site-profile.json';

const DEFAULT_PROFILE = {
    name: '网页归档',
    avatar: 'https://avatars.githubusercontent.com/u/160588858?v=4',
    bio: '个人 HTML 归档站：用 SingleFile 保存网页，GitHub + Cloudflare Pages 托管。',
    links: [
        { label: 'GitHub', url: 'https://github.com/zztap/html-archive' },
        { label: '站点', url: 'https://html-archive.pages.dev/' }
    ]
};

const CAT_META = {
    all: { label: '🏠 全部', key: 'all' },
    tech: { label: '💻 科技脚本', key: 'tech' },
    knowledge: { label: '📚 知识储备', key: 'knowledge' },
    backup: { label: '📁 日常备份', key: 'backup' }
};

let cachedProfile = null;

function escapeSide(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

async function loadSiteProfile() {
    if (cachedProfile) return cachedProfile;
    try {
        const res = await fetch(PROFILE_URL, { cache: 'no-cache' });
        if (res.ok) {
            cachedProfile = { ...DEFAULT_PROFILE, ...(await res.json()) };
            return cachedProfile;
        }
    } catch (e) {}
    cachedProfile = DEFAULT_PROFILE;
    return cachedProfile;
}

function renderProfileCard(profile) {
    const el = document.getElementById('profileCard');
    if (!el) return;
    const links = (profile.links || []).map(l =>
        `<a href="${escapeSide(l.url)}" target="_blank" rel="noopener noreferrer">${escapeSide(l.label)}</a>`
    ).join('');
    el.innerHTML = `
        <div class="profile-row">
            <img class="profile-avatar" src="${escapeSide(profile.avatar)}" alt="${escapeSide(profile.name)}" width="56" height="56" loading="lazy">
            <div class="profile-text">
                <div class="profile-name">${escapeSide(profile.name)}</div>
                <p class="profile-bio">${escapeSide(profile.bio)}</p>
            </div>
        </div>
        ${links ? `<div class="profile-links">${links}</div>` : ''}
    `;
}

function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function updateStats(articles) {
    const total = articles.length;
    const mk = monthKey();
    const monthCount = articles.filter(a => (a.date || '').startsWith(mk)).length;
    const t = document.getElementById('statTotal');
    const m = document.getElementById('statMonth');
    if (t) t.textContent = String(total);
    if (m) m.textContent = String(monthCount);
}

function renderSidebarCats(articles, active) {
    const ul = document.getElementById('sidebarCats');
    if (!ul) return;
    const counts = { all: articles.length, tech: 0, knowledge: 0, backup: 0 };
    articles.forEach(a => {
        if (counts[a.category] != null) counts[a.category] += 1;
    });
    ul.innerHTML = Object.keys(CAT_META).map(key => {
        const meta = CAT_META[key];
        const isActive = (active || 'all') === key;
        return `<li>
            <button type="button" class="sidebar-cat${isActive ? ' active' : ''}" data-category="${key}">
                <span>${meta.label}</span>
                <span class="cat-count">${counts[key] || 0}</span>
            </button>
        </li>`;
    }).join('');

    ul.querySelectorAll('.sidebar-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof window.setCategoryFilter === 'function') {
                window.setCategoryFilter(btn.dataset.category);
            }
        });
    });
}

/** 近 53 周贡献热力图（按 article.date YYYY-MM-DD） */
function renderHeatmap(articles) {
    const root = document.getElementById('heatmap');
    if (!root) return;

    const counts = new Map();
    articles.forEach(a => {
        const d = (a.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        counts.set(d, (counts.get(d) || 0) + 1);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 对齐到本周周日结束，向前 53 周
    const end = new Date(today);
    const day = end.getDay(); // 0 Sun
    // 用周一为一列起点更接近 GitHub：把 week 起点设为周日
    const cells = [];
    // 53*7 = 371 days ending today
    const totalDays = 53 * 7;
    const start = new Date(end);
    start.setDate(start.getDate() - (totalDays - 1));
    // align start to Sunday
    start.setDate(start.getDate() - start.getDay());

    const weeks = [];
    let cursor = new Date(start);
    while (cursor <= end || weeks.length < 53) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            const key = cursor.toISOString().slice(0, 10);
            const c = counts.get(key) || 0;
            let level = 0;
            if (c >= 4) level = 4;
            else if (c >= 3) level = 3;
            else if (c >= 2) level = 2;
            else if (c >= 1) level = 1;
            const future = cursor > end;
            week.push({ key, count: c, level: future ? -1 : level });
            cursor.setDate(cursor.getDate() + 1);
        }
        weeks.push(week);
        if (weeks.length >= 53 && cursor > end) break;
        if (weeks.length > 60) break;
    }

    root.innerHTML = weeks.map(week =>
        `<div class="hm-week">${week.map(cell => {
            if (cell.level < 0) {
                return `<span class="hm-cell hm-empty" data-date="${cell.key}"></span>`;
            }
            const tip = `${cell.key} · ${cell.count} 篇`;
            return `<span class="hm-cell hm-l${cell.level}" data-date="${cell.key}" data-count="${cell.count}" title="${tip}"></span>`;
        }).join('')}</div>`
    ).join('');
}

function getRecent() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function saveRecent(list) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

/** 记录一次阅读（由 app.js 在点击查看/标题时调用） */
window.recordRecentReading = function(article) {
    if (!article) return;
    const href = article.shortcode
        ? `/go/${encodeURIComponent(article.shortcode)}`
        : `/archive/${encodeURIComponent(article.filename || '')}`;
    const item = {
        title: article.title || '未命名',
        shortcode: article.shortcode || '',
        filename: article.filename || '',
        href,
        at: Date.now()
    };
    let list = getRecent().filter(x =>
        !(x.shortcode && item.shortcode && x.shortcode === item.shortcode) &&
        !(x.filename && item.filename && x.filename === item.filename) &&
        x.href !== item.href
    );
    list.unshift(item);
    saveRecent(list);
    renderRecentList();
};

function renderRecentList() {
    const ul = document.getElementById('recentList');
    if (!ul) return;
    const list = getRecent();
    if (!list.length) {
        ul.innerHTML = '<li class="recent-empty">暂无记录</li>';
        return;
    }
    ul.innerHTML = list.map(item => `
        <li>
            <a href="${escapeSide(item.href)}" target="_blank" rel="noopener"
               onclick='window.recordRecentReading && window.recordRecentReading(${JSON.stringify({
                   title: item.title, shortcode: item.shortcode, filename: item.filename
               })})'>
                ${escapeSide(item.title)}
            </a>
        </li>
    `).join('');
}

window.syncSidebarCategoryActive = function syncSidebarCategoryActive(category) {
    document.querySelectorAll('.sidebar-cat').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
}

/** 文章列表变化后刷新侧栏（统计/热力图/分类计数） */
window.refreshSidebar = function(articles) {
    const list = Array.isArray(articles) ? articles : [];
    updateStats(list);
    renderHeatmap(list);
    const active = (typeof window.currentFilter === 'string')
        ? window.currentFilter
        : (document.querySelector('nav.blog-nav a.active')?.dataset.category || 'all');
    renderSidebarCats(list, active);
    renderRecentList();
};

function setupSidebarChrome() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('siteSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const clearBtn = document.getElementById('clearRecentBtn');

    function closeMobile() {
        document.body.classList.remove('sidebar-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        if (backdrop) backdrop.classList.add('hidden');
    }
    function openMobile() {
        document.body.classList.add('sidebar-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        if (backdrop) backdrop.classList.remove('hidden');
    }

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            if (document.body.classList.contains('sidebar-open')) closeMobile();
            else openMobile();
        });
    }
    if (backdrop) backdrop.addEventListener('click', closeMobile);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem(RECENT_KEY);
            renderRecentList();
        });
    }

    // 窄屏点分类后自动收起
    document.getElementById('sidebarCats')?.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-cat') && window.matchMedia('(max-width: 960px)').matches) {
            closeMobile();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupSidebarChrome();
    const profile = await loadSiteProfile();
    renderProfileCard(profile);
    renderRecentList();
    // 若文章已加载则刷新；否则等 app.js loadArticles 调用 refreshSidebar
    if (Array.isArray(window.currentArticles) && window.currentArticles.length) {
        window.refreshSidebar(window.currentArticles);
    }
});
