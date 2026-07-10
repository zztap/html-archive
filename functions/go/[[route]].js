// functions/go/[[route]].js
// 短链代理：go/KJ-YYMMDDNN → 直接从 GitHub 取 HTML 内容返回
// 地址栏始终显示短链，不跳转

const GITHUB_RAW = 'https://raw.githubusercontent.com';

function getEnv(env) {
    return {
        token: env.GITHUB_TOKEN,
        repo: env.GITHUB_REPO
    };
}

// 从 GitHub Contents API 读取 index.json（保证最新）
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

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const shortcode = url.pathname.replace('/go/', '');

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

        // 从 GitHub 原始文件地址直接拉取 HTML 内容
        const filename = article.filename;
        const rawUrl = `${GITHUB_RAW}/${env.GITHUB_REPO}/main/archive/${encodeURIComponent(filename)}`;
        const rawRes = await fetch(rawUrl);
        if (!rawRes.ok) {
            return new Response('无法获取归档文件', { status: 502 });
        }

        const html = await rawRes.text();
        return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    } catch (e) {
        return new Response(`代理错误: ${e.message}`, { status: 500 });
    }
}
