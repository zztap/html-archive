// functions/api/[[route]].js
// Cloudflare Pages Function — 代理 GitHub API + 管理员鉴权

// ====== 内存 session 存储 ======
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 小时

// ====== 登录失败限速（按 IP，内存） ======
const loginFails = new Map(); // ip -> { count, until }
const LOGIN_MAX_FAILS = 5;
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000;

function clientIp(request) {
    return request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown';
}

function loginBlocked(ip) {
    const rec = loginFails.get(ip);
    if (!rec) return false;
    if (Date.now() < rec.until) return true;
    loginFails.delete(ip);
    return false;
}

function recordLoginFail(ip) {
    const rec = loginFails.get(ip) || { count: 0, until: 0 };
    rec.count += 1;
    if (rec.count >= LOGIN_MAX_FAILS) {
        rec.until = Date.now() + LOGIN_COOLDOWN_MS;
        rec.count = 0;
    }
    loginFails.set(ip, rec);
}

function clearLoginFails(ip) {
    loginFails.delete(ip);
}

function cleanSessions() {
    const now = Date.now();
    for (const [token, expiry] of sessions) {
        if (now > expiry) sessions.delete(token);
    }
}

function createSession() {
    const token = crypto.randomUUID();
    sessions.set(token, Date.now() + SESSION_TTL);
    return token;
}

function validateSession(request) {
    cleanSessions();
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return false;
    const expiry = sessions.get(token);
    if (!expiry || Date.now() > expiry) {
        sessions.delete(token);
        return false;
    }
    return true;
}


// ====== 环境变量读取 ======
function getEnv(env) {
    return {
        token: env.GITHUB_TOKEN,
        repo: env.GITHUB_REPO,
        password: env.ADMIN_PASSWORD
    };
}

// ====== CORS：仅本站 + 本地开发 ======
const ALLOWED_ORIGINS = new Set([
    'https://html-archive.pages.dev',
    'http://localhost:8000',
    'http://localhost:8788',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8788'
]);

function corsHeadersFor(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = {
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin'
    };
    if (ALLOWED_ORIGINS.has(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}


// ====== GitHub Contents API 代理（读/删，≤1MB 写） ======
async function githubRequest(env, apiPath, options = {}) {
    const { repo, token } = getEnv(env);
    const url = `https://api.github.com/repos/${repo}/contents/${apiPath}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'html-archive-cf-proxy'
    };
    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body
    });

    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = { message: "解析响应失败" };
    }
    return { status: res.status, data };
}


// ====== Base64 解码 ======
function decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}


// ====== CF Pages 部署触发器 ======
async function triggerDeploy(env) {
    const hookUrl = env.CF_DEPLOY_HOOK_URL;
    if (!hookUrl) return;
    await fetch(hookUrl, { method: 'POST' });
}


// ====== GitHub Git Data API（大文件上传，≤100MB） ======
async function uploadLargeFile(env, filePath, content, message, retries = 3) {
    const { repo, token } = getEnv(env);
    const baseUrl = `https://api.github.com/repos/${repo}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'html-archive-cf-proxy',
        'Content-Type': 'application/json'
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const blobRes = await fetch(`${baseUrl}/git/blobs`, {
                method: 'POST', headers,
                body: JSON.stringify({ content, encoding: 'base64' })
            });
            if (!blobRes.ok) {
                const err = await blobRes.json().catch(() => ({}));
                return { status: blobRes.status, data: { error: '创建 blob 失败', detail: err } };
            }
            const blobData = await blobRes.json();

            const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, { headers });
            if (!refRes.ok) {
                return { status: refRes.status, data: { error: '获取分支引用失败' } };
            }
            const refData = await refRes.json();
            const parentSha = refData.object.sha;

            const commitRes = await fetch(`${baseUrl}/git/commits/${parentSha}`, { headers });
            if (!commitRes.ok) {
                return { status: commitRes.status, data: { error: '获取 commit 信息失败' } };
            }
            const commitData = await commitRes.json();
            const baseTreeSha = commitData.tree.sha;

            const treeRes = await fetch(`${baseUrl}/git/trees`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    base_tree: baseTreeSha,
                    tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }]
                })
            });
            if (!treeRes.ok) {
                return { status: treeRes.status, data: { error: '创建 tree 失败' } };
            }
            const treeData = await treeRes.json();

            const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
                method: 'POST', headers,
                body: JSON.stringify({ message, tree: treeData.sha, parents: [parentSha] })
            });
            if (!newCommitRes.ok) {
                return { status: newCommitRes.status, data: { error: '创建 commit 失败' } };
            }
            const newCommitData = await newCommitRes.json();

            const updateRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ sha: newCommitData.sha, force: false })
            });

            if (updateRes.status === 409 && attempt < retries) {
                await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
                continue;
            }

            if (!updateRes.ok) {
                return { status: updateRes.status, data: { error: '更新分支引用失败' } };
            }

            triggerDeploy(env).catch(() => {});

            return { status: 200, data: { sha: newCommitData.sha, success: true } };
        } catch (e) {
            if (attempt >= retries) {
                return { status: 500, data: { error: '服务器内部错误: ' + e.message } };
            }
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
    }
}

async function listArchiveDir(env) {
    const { status, data } = await githubRequest(env, 'archive');
    if (status !== 200 || !Array.isArray(data)) {
        return { status, files: [] };
    }
    return {
        status: 200,
        files: data.filter(f => f.type === 'file').map(f => f.name)
    };
}


// ====== 主路由 ======
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = corsHeadersFor(request);
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const json = (body, status = 200, extraHeaders = {}) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
        });

    // ---------- 公开路由（无需登录） ----------

    // GET /api/ping — 仅返回存活状态，不暴露密钥/仓库信息
    if (method === 'GET' && path === '/api/ping') {
        return json({ ok: true });
    }

    // GET /api/articles — 读取 index.json
    if (method === 'GET' && path === '/api/articles') {
        const { status, data } = await githubRequest(env, 'data/index.json');
        if (status === 404) return json([], 200);
        if (status !== 200) return json({ error: '加载失败' }, 500);
        return json(data);
    }

    // GET /api/articles/:filename — 读取单个归档 HTML 的元信息（获取 SHA 用于删除）
    if (method === 'GET' && path.startsWith('/api/articles/')) {
        const filename = decodeURIComponent(path.replace('/api/articles/', ''));
        const { status, data } = await githubRequest(env, `archive/${filename}`);
        if (status !== 200) return json({ error: '文件不存在' }, 404);
        return json(data);
    }

    // POST /api/auth — 管理员登录（失败限速）
    if (method === 'POST' && path === '/api/auth') {
        const ip = clientIp(request);
        if (loginBlocked(ip)) {
            return json({ error: '尝试过多，请 5 分钟后再试' }, 429);
        }
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return json({ error: '无效请求' }, 400);
        }
        if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
            recordLoginFail(ip);
            return json({ error: '密码错误' }, 403);
        }
        clearLoginFails(ip);
        const token = createSession();
        return json({ token });
    }

    // POST /api/auth/check — 检查当前 session
    if (method === 'POST' && path === '/api/auth/check') {
        const ok = validateSession(request);
        return json({ valid: ok });
    }

    // ---------- 管理员路由（需要 Bearer token） ----------

    const writePaths = [
        { method: 'PUT',  prefix: '/api/articles' },
        { method: 'PUT',  prefix: '/api/archive/' },
        { method: 'DELETE', prefix: '/api/archive/' }
    ];

    const needsAuth = writePaths.some(p => method === p.method && path.startsWith(p.prefix))
        || (method === 'GET' && path === '/api/health');

    if (needsAuth && !validateSession(request)) {
        return json({ error: '未登录或 session 已过期' }, 401);
    }

    // GET /api/health — 管理员：索引与 archive 一致性 + 配置是否齐全（不返回密钥值）
    if (method === 'GET' && path === '/api/health') {
        const { status, data } = await githubRequest(env, 'data/index.json');
        if (status !== 200) {
            return json({ error: '无法读取索引', detail: data }, 500);
        }
        let articles = [];
        try {
            articles = JSON.parse(decodeBase64(data.content));
        } catch (e) {
            return json({ error: '索引解析失败' }, 500);
        }
        const { status: listStatus, files } = await listArchiveDir(env);
        if (listStatus !== 200) {
            return json({ error: '无法列出 archive/', status: listStatus }, 500);
        }
        const indexFiles = articles.map(a => a.filename).filter(Boolean);
        const fileSet = new Set(files);
        const indexSet = new Set(indexFiles);
        const missingFiles = indexFiles.filter(f => !fileSet.has(f));
        const orphanFiles = files.filter(f => !indexSet.has(f));
        const shortcodes = articles.map(a => a.shortcode).filter(Boolean);
        const shortcodeDupes = shortcodes.filter((s, i) => shortcodes.indexOf(s) !== i);
        return json({
            ok: missingFiles.length === 0 && orphanFiles.length === 0 && shortcodeDupes.length === 0,
            articleCount: articles.length,
            archiveCount: files.length,
            missingFiles,
            orphanFiles,
            duplicateShortcodes: [...new Set(shortcodeDupes)],
            config: {
                hasToken: !!env.GITHUB_TOKEN,
                hasPassword: !!env.ADMIN_PASSWORD,
                hasRepo: !!env.GITHUB_REPO,
                hasDeployHook: !!env.CF_DEPLOY_HOOK_URL
            }
        });
    }

    // PUT /api/articles — 更新 index.json
    if (method === 'PUT' && path === '/api/articles') {
        const body = await request.json();
        // 短码唯一性校验
        try {
            const decoded = JSON.parse(decodeBase64(body.content));
            if (Array.isArray(decoded)) {
                const codes = decoded.map(a => a.shortcode).filter(Boolean);
                const dup = codes.find((s, i) => codes.indexOf(s) !== i);
                if (dup) {
                    return json({ error: `短码重复: ${dup}` }, 400);
                }
            }
        } catch (e) {
            // 非预期内容仍交给 GitHub，但记录
        }
        const putBody = {
            message: body.message || '更新索引',
            content: body.content,
            ...(body.sha ? { sha: body.sha } : {})
        };
        const { status, data } = await githubRequest(env, 'data/index.json', {
            method: 'PUT',
            body: JSON.stringify(putBody)
        });
        if (status < 200 || status > 299) {
            return json({ error: '保存失败', detail: data }, status);
        }
        return json(data);
    }

    // PUT /api/archive/:filename — 上传大文件 HTML
    if (method === 'PUT' && path.startsWith('/api/archive/')) {
        const filename = decodeURIComponent(path.replace('/api/archive/', ''));
        const body = await request.json();
        const result = await uploadLargeFile(env, `archive/${filename}`, body.content, body.message);
        if (result.status > 299) {
            return json({ error: '上传失败', detail: result.data }, result.status);
        }
        return json(result.data);
    }

    // DELETE /api/archive/:filename — 删除 HTML 文件
    if (method === 'DELETE' && path.startsWith('/api/archive/')) {
        const filename = decodeURIComponent(path.replace('/api/archive/', ''));
        const body = await request.json();
        const { status, data } = await githubRequest(env, `archive/${filename}`, {
            method: 'DELETE',
            body: JSON.stringify({ message: body.message, sha: body.sha })
        });
        if (status < 200 || status > 299) {
            return json({ error: '删除失败', detail: data }, status);
        }
        return json({ ok: true });
    }

    return json({ error: 'Not Found' }, 404);
}
