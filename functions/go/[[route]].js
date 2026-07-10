// functions/go/[[route]].js
// 短链重定向：go/KJ-YYMMDDNN → archive/实际文件名.html

// ====== 环境变量读取 ======
function getEnv(env) {
    return {
        token: env.GITHUB_TOKEN,
        repo: env.GITHUB_REPO
    };
}

// ====== Base64 解码 ======
function decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

// ====== GitHub API 代理（只读） ======
async function githubRequest(env, apiPath) {
    const { repo, token } = getEnv(env);
    const url = `https://api.github.com/repos/${repo}/contents/${apiPath}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'html-archive-go-redirect'
    };
    const res = await fetch(url, { headers });
    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    return { status: res.status, data };
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const shortcode = path.replace('/go/', '');

    if (!shortcode) {
        return new Response('Missing shortcode', { status: 400 });
    }

    const { status, data } = await githubRequest(env, 'data/index.json');
    if (status !== 200) {
        return new Response('Failed to load index', { status: 500 });
    }

    try {
        const content = decodeBase64(data.content);
        const articles = JSON.parse(content);
        const article = articles.find(a => a.shortcode === shortcode);
        if (!article) {
            return new Response('Article not found', { status: 404 });
        }

        return new Response(null, {
            status: 302,
            headers: { 'Location': `/archive/${article.filename}` }
        });
    } catch (e) {
        return new Response('Parse error', { status: 500 });
    }
}
