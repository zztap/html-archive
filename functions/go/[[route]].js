// functions/go/[[route]].js
// 短链：/go/{shortcode}
// 策略：不把整页 HTML 经 Worker 缓冲（大文件易超时/OOM）。
// 1) 查索引得到 filename
// 2) 返回轻量外壳页：顶栏「回归档」+ iframe 加载站点静态 /archive/{filename}
//    （CF Pages 直接托管 archive/*.html，静态文件优先于 SPA）
// 3) 若请求带 ?raw=1 或 Accept 明确只要重定向，则 302 到 /archive/...

function getEnv(env) {
    return {
        token: env.GITHUB_TOKEN,
        repo: env.GITHUB_REPO
    };
}

async function fetchArticles(env) {
    const { repo, token } = getEnv(env);
    const url = `https://api.github.com/repos/${repo}/contents/data/index.json`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'html-archive-go-proxy'
        }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const binary = atob(data.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildShell(article, archivePath) {
    const title = escapeHtml(article.title || article.shortcode || '归档');
    const date = escapeHtml(article.date || '');
    const desc = escapeHtml(article.description || '');
    const rawSource = (article.sourceUrl || article.originalUrl || '').trim();
    // 仅允许 http(s) 原文链接，避免 javascript: 等
    const safeSource = /^https?:\/\//i.test(rawSource) ? rawSource : '';
    const sourceLink = safeSource
        ? `<a href="${escapeHtml(safeSource)}" target="_blank" rel="noopener noreferrer">打开原文</a>`
        : '';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 网页归档站</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,sans-serif;background:#0f172a}
  #bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 14px;
    background:#1e293b;color:#e2e8f0;font-size:13px;border-bottom:1px solid #334155;
    position:sticky;top:0;z-index:10}
  #bar a{color:#38bdf8;text-decoration:none;font-weight:600}
  #bar a:hover{text-decoration:underline}
  #bar .meta{opacity:.75;margin-left:auto}
  iframe{border:0;width:100%;height:calc(100vh - 40px);background:#fff;display:block}
</style>
</head>
<body>
  <div id="bar">
    <a href="/">← 回归档站</a>
    <a href="${escapeHtml(archivePath)}" target="_blank" rel="noopener">仅打开正文</a>
    ${sourceLink}
    <span>${title}</span>
    <span class="meta">${date}${desc ? ' · ' + desc : ''}</span>
  </div>
  <iframe src="${escapeHtml(archivePath)}" title="${title}"></iframe>
</body>
</html>`;
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const shortcode = decodeURIComponent(url.pathname.replace(/^\/go\//, '').replace(/\/$/, ''));

    if (!shortcode) {
        return new Response('Missing shortcode', { status: 400 });
    }

    try {
        const articles = await fetchArticles(env);
        if (!articles) {
            return new Response('无法读取归档索引', { status: 500 });
        }

        const article = articles.find(a => a.shortcode === shortcode);
        if (!article || !article.filename) {
            return new Response('归档未找到', { status: 404 });
        }

        const filename = article.filename;
        // 静态资源路径：保留文件名中的空格等，用 encodeURIComponent 按段编码
        const archivePath = '/archive/' + encodeURIComponent(filename).replace(/%2F/gi, '/');

        // 显式要求直链：302 到静态文件，避免任何 Worker 缓冲
        if (url.searchParams.get('raw') === '1' || url.searchParams.get('redirect') === '1') {
            return Response.redirect(new URL(archivePath, url.origin).toString(), 302);
        }

        // 默认：轻量外壳 + iframe 加载静态归档（不经 Worker 拉取大 HTML）
        const html = buildShell(article, archivePath);
        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=60'
            }
        });
    } catch (e) {
        // 索引/逻辑异常时无法可靠映射文件名，只能报错（无 fallback 目标）
        return new Response(`短链错误: ${e.message}`, { status: 500 });
    }
}
