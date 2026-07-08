// functions/api/[[route]].js
// Cloudflare Pages Function — 代理 GitHub API + 管理员鉴权

// ====== 内存 session 存储 ======
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 小时

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
            // 1. 创建 blob（把 base64 内容存到 Git 对象存储）
            const blobRes = await fetch(`${baseUrl}/git/blobs`, {
                method: 'POST', headers,
                body: JSON.stringify({ content, encoding: 'base64' })
            });
            if (!blobRes.ok) {
                const err = await blobRes.json().catch(() => ({}));
                return { status: blobRes.status, data: { error: '创建 blob 失败', detail: err } };
            }
            const blobData = await blobRes.json();

            // 2. 获取最新 commit SHA
            const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, { headers });
            if (!refRes.ok) {
                return { status: refRes.status, data: { error: '获取分支引用失败' } };
            }
            const refData = await refRes.json();
            const parentSha = refData.object.sha;

            // 3. 获取当前 commit 的 tree SHA
            const commitRes = await fetch(`${baseUrl}/git/commits/${parentSha}`, { headers });
            if (!commitRes.ok) {
                return { status: commitRes.status, data: { error: '获取 commit 信息失败' } };
            }
            const commitData = await commitRes.json();
            const baseTreeSha = commitData.tree.sha;

            // 4. 创建新 tree（包含已有文件 + 新文件）
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

            // 5. 创建新 commit
            const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
                method: 'POST', headers,
                body: JSON.stringify({ message, tree: treeData.sha, parents: [parentSha] })
            });
            if (!newCommitRes.ok) {
                return { status: newCommitRes.status, data: { error: '创建 commit 失败' } };
            }
            const newCommitData = await newCommitRes.json();

            // 6. 更新分支引用
            const updateRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ sha: newCommitData.sha, force: false })
            });

            // 409 = 并发冲突，重试
            if (updateRes.status === 409 && attempt < retries) {
                await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
                continue;
            }

            if (!updateRes.ok) {
                return { status: updateRes.status, data: { error: '更新分支引用失败' } };
            }

            // 成功后触发 CF Pages 部署（如有配置）
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


// ====== 主路由 ======
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 头
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const json = (body, status = 200, extraHeaders = {}) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
        });

    // ---------- 公开路由（无需登录） ----------

    // GET /api/ping — 探针
    if (method === 'GET' && path === '/api/ping') {
        return json({ pong: true, hasToken: !!env.GITHUB_TOKEN, hasPassword: !!env.ADMIN_PASSWORD, repo: env.GITHUB_REPO || '未设置' });
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
        const filename = path.replace('/api/articles/', '');
        const { status, data } = await githubRequest(env, `archive/${filename}`);
        if (status !== 200) return json({ error: '文件不存在' }, 404);
        return json(data);
    }

    // POST /api/auth — 管理员登录
    if (method === 'POST' && path === '/api/auth') {
        const body = await request.json();
        if (body.password !== env.ADMIN_PASSWORD) {
            return json({ error: '密码错误' }, 403);
        }
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
        { method: 'PUT',  prefix: '/api/articles' },      // 更新 index.json
        { method: 'PUT',  prefix: '/api/archive/' },       // 上传 HTML 文件
        { method: 'DELETE', prefix: '/api/archive/' }       // 删除 HTML 文件
    ];

    const needsAuth = writePaths.some(p => method === p.method && path.startsWith(p.prefix));
    if (needsAuth && !validateSession(request)) {
        return json({ error: '未登录或 session 已过期' }, 401);
    }

    // PUT /api/articles — 更新 index.json（Contents API，文件小不走 Git Data）
    if (method === 'PUT' && path === '/api/articles') {
        const body = await request.json();
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

    // PUT /api/archive/:filename — 上传大文件 HTML（Git Data API，≤100MB）
    if (method === 'PUT' && path.startsWith('/api/archive/')) {
        const filename = path.replace('/api/archive/', '');
        const body = await request.json();
        const result = await uploadLargeFile(env, `archive/${filename}`, body.content, body.message);
        if (result.status > 299) {
            return json({ error: '上传失败', detail: result.data }, result.status);
        }
        return json(result.data);
    }

    // DELETE /api/archive/:filename — 删除 HTML 文件（Contents API 可删任意大小）
    if (method === 'DELETE' && path.startsWith('/api/archive/')) {
        const filename = path.replace('/api/archive/', '');
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

    // 未匹配路由
    return json({ error: 'Not Found' }, 404);
}
