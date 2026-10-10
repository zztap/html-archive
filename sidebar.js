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
    const total = Math.max(articles.length, 1);
    ul.innerHTML = Object.keys(CAT_META).map(key => {
        const meta = CAT_META[key];
        const n = counts[key] || 0;
        const pct = key === 'all' ? 100 : Math.round((n / total) * 100);
        const isActive = (active || 'all') === key;
        return `<li>
            <button type="button" class="sidebar-cat${isActive ? ' active' : ''}" data-category="${key}">
                <span class="cat-row"><span>${meta.label}</span><span class="cat-count">${n}</span></span>
                <span class="cat-bar" aria-hidden="true"><span class="cat-bar-fill" style="width:${pct}%"></span></span>
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

/** 时间归档：按 YYYY-MM 聚合，点击筛选 */
function renderMonthArchive(articles) {
    const ul = document.getElementById('monthList');
    const clearBtn = document.getElementById('clearMonthBtn');
    if (!ul) return;
    const map = new Map();
    articles.forEach(a => {
        const ym = (a.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym)) return;
        map.set(ym, (map.get(ym) || 0) + 1);
    });
    const months = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const active = window.currentMonthFilter || '';
    if (clearBtn) clearBtn.classList.toggle('hidden', !active);

    if (!months.length) {
        ul.innerHTML = '<li class="recent-empty">暂无</li>';
        return;
    }
    ul.innerHTML = months.map(([ym, n]) => {
        const [y, m] = ym.split('-');
        const label = `${y} 年 ${Number(m)} 月`;
        const isActive = active === ym;
        return `<li>
            <button type="button" class="month-item${isActive ? ' active' : ''}" data-month="${ym}">
                <span>${label}</span>
                <span class="cat-count">${n}</span>
            </button>
        </li>`;
    }).join('');

    ul.querySelectorAll('.month-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const ym = btn.dataset.month;
            if (typeof window.setMonthFilter === 'function') {
                window.setMonthFilter(window.currentMonthFilter === ym ? null : ym);
            }
        });
    });
}

/** 近 16 周备份热力图：周为列、日为行；宽度自适应，无横向滚动 */
function renderHeatmap(articles) {
    const root = document.getElementById('heatmap');
    if (!root) return;

    const counts = new Map();
    articles.forEach(a => {
        const d = (a.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        counts.set(d, (counts.get(d) || 0) + 1);
    });

    const WEEKS = 16;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    // 本周周日为最后一列末尾；起点对齐到周日
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay());

    const weeks = [];
    const cursor = new Date(start);
    for (let w = 0; w < WEEKS; w++) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            const key = localDateKey(cursor);
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
    }

    const dow = ['日', '一', '二', '三', '四', '五', '六'];
    root.style.setProperty('--hm-weeks', String(WEEKS));
    root.innerHTML =
        `<div class="hm-dow">${dow.map(d => `<span>${d}</span>`).join('')}</div>` +
        `<div class="hm-grid">${weeks.map(week =>
            `<div class="hm-week">${week.map(cell => {
                if (cell.level < 0) {
                    return `<span class="hm-cell hm-empty" aria-hidden="true"></span>`;
                }
                const tip = `${cell.key} · ${cell.count} 篇`;
                return `<span class="hm-cell hm-l${cell.level}" title="${tip}" data-date="${cell.key}" data-count="${cell.count}"></span>`;
            }).join('')}</div>`
        ).join('')}</div>`;
}

function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
    renderMonthArchive(list);
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

    const clearMonth = document.getElementById('clearMonthBtn');
    if (clearMonth) {
        clearMonth.addEventListener('click', () => {
            if (typeof window.setMonthFilter === 'function') window.setMonthFilter(null);
        });
    }

    const heroToggle = document.getElementById('heroToggle');
    const heroExtra = document.getElementById('heroExtra');
    if (heroToggle && heroExtra) {
        heroToggle.addEventListener('click', () => {
            heroExtra.classList.toggle('hidden');
            const open = !heroExtra.classList.contains('hidden');
            heroToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            heroToggle.textContent = open ? '收起' : '详情';
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
