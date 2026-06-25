// _worker.js - Docker Registry Proxy with Authentication (修复版)

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

// Token缓存
const tokenCache = new Map();

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
    const routes = {
        "quay": "quay.io",
        "gcr": "gcr.io",
        "k8s-gcr": "k8s.gcr.io",
        "k8s": "registry.k8s.io",
        "ghcr": "ghcr.io",
        "cloudsmith": "docker.cloudsmith.io",
        "nvcr": "nvcr.io",
        "test": "registry-1.docker.io",
    };
    if (host in routes) return [routes[host], false];
    else return [hub_host, true];
}

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
}

function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

function newUrl(urlStr, base) {
    try {
        return new URL(urlStr, base);
    } catch (err) {
        console.error(err);
        return null
    }
}

async function nginx() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
    <title>Welcome to nginx!</title>
    <style>
        body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
    </style>
    </head>
    <body>
    <h1>Welcome to nginx!</h1>
    <p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>
    <p>For online documentation and support please refer to <a href="http://nginx.org/">nginx.org</a>.<br/>
    Commercial support is available at <a href="http://nginx.com/">nginx.com</a>.</p>
    <p><em>Thank you for using nginx.</em></p>
    </body>
    </html>
    `
}

async function searchInterface() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Docker Hub 镜像搜索</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
        :root {
            --github-color: rgb(27,86,198);
            --github-bg-color: #ffffff;
            --primary-color: #0066ff;
            --primary-dark: #0052cc;
            --gradient-start: #1a90ff;
            --gradient-end: #003eb3;
            --text-color: #ffffff;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, var(--gradient-start) 0%, var(--gradient-end) 100%);
            padding: 20px;
            color: var(--text-color);
        }
        .container {
            text-align: center;
            width: 100%;
            max-width: 800px;
            padding: 20px;
            margin: 0 auto;
            animation: fadeIn 0.8s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .github-corner {
            position: fixed;
            top: 0;
            right: 0;
            z-index: 999;
        }
        .github-corner svg {
            fill: var(--github-bg-color);
            color: var(--github-color);
            position: absolute;
            top: 0;
            border: 0;
            right: 0;
            width: 80px;
            height: 80px;
        }
        .title {
            color: var(--text-color);
            font-size: 2.3em;
            margin-bottom: 10px;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            font-weight: 700;
        }
        .subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 1.1em;
            margin-bottom: 25px;
        }
        .search-container {
            display: flex;
            align-items: stretch;
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            height: 55px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            border-radius: 12px;
            overflow: hidden;
        }
        #search-input {
            flex: 1;
            padding: 0 20px;
            font-size: 16px;
            border: none;
            outline: none;
            height: 100%;
        }
        #search-button {
            width: 60px;
            background-color: var(--primary-color);
            border: none;
            cursor: pointer;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #search-button:hover { background-color: var(--primary-dark); }
        .tips {
            color: rgba(255, 255, 255, 0.8);
            margin-top: 20px;
            font-size: 0.9em;
        }
        @media (max-width: 480px) {
            .github-corner svg { width: 60px; height: 60px; }
            .title { font-size: 1.7em; }
        }
        </style>
    </head>
    <body>
        <a href="https://github.com/cmliu/CF-Workers-docker.io" target="_blank" class="github-corner">
            <svg viewBox="0 0 250 250" aria-hidden="true">
                <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path>
                <path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" class="octo-arm"></path>
                <path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path>
            </svg>
        </a>
        <div class="container">
            <h1 class="title">Docker Hub 镜像搜索</h1>
            <p class="subtitle">快速查找、下载和部署 Docker 容器镜像</p>
            <div class="search-container">
                <input type="text" id="search-input" placeholder="输入关键词搜索镜像，如: nginx, mysql, redis...">
                <button id="search-button" title="搜索">
                    <svg width="20" height="20" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M13 5l7 7-7 7M5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
            <p class="tips">基于 Cloudflare Workers / Pages 构建，利用全球边缘网络实现毫秒级响应。</p>
        </div>
        <script>
        function performSearch() {
            const query = document.getElementById('search-input').value;
            if (query) {
                window.location.href = '/search?q=' + encodeURIComponent(query);
            }
        }
        document.getElementById('search-button').addEventListener('click', performSearch);
        document.getElementById('search-input').addEventListener('keypress', function(event) {
            if (event.key === 'Enter') { performSearch(); }
        });
        window.addEventListener('load', function() {
            document.getElementById('search-input').focus();
        });
        </script>
    </body>
    </html>
    `;
}

// 获取 Docker Token 并缓存 - 修复：正确处理 library/ 前缀
async function getDockerToken(repo, scope = 'pull') {
    if (!repo) return null;
    
    // 对于 Docker Hub，如果 repo 不包含 / 且不是以 library/ 开头，添加 library/ 前缀
    let normalizedRepo = repo;
    if (hub_host === 'registry-1.docker.io' && !repo.includes('/') && !repo.startsWith('library/')) {
        normalizedRepo = `library/${repo}`;
    }
    
    const cacheKey = `${normalizedRepo}:${scope}`;
    if (tokenCache.has(cacheKey)) {
        const cached = tokenCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5分钟缓存
            return cached.token;
        }
        tokenCache.delete(cacheKey);
    }
    
    try {
        const tokenUrl = `${auth_url}/token?service=registry.docker.io&scope=repository:${normalizedRepo}:${scope}`;
        console.log(`Getting token for: ${normalizedRepo}, URL: ${tokenUrl}`);
        
        const tokenRes = await fetch(tokenUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Docker-Client)',
                'Accept': 'application/json',
            }
        });
        
        if (!tokenRes.ok) {
            console.error(`Token request failed: ${tokenRes.status}`);
            const errorText = await tokenRes.text();
            console.error(`Token error: ${errorText}`);
            return null;
        }
        
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
            tokenCache.set(cacheKey, {
                token: tokenData.token,
                timestamp: Date.now()
            });
            return tokenData.token;
        }
        return null;
    } catch (error) {
        console.error('Error getting token:', error);
        return null;
    }
}

async function ADD(envadd) {
    var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');
    if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
    if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
    return addtext.split(',');
}

export default {
    async fetch(request, env, ctx) {
        const getReqHeader = (key) => request.headers.get(key);
        let url = new URL(request.url);
        const userAgentHeader = request.headers.get('User-Agent');
        const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
        
        if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
        const workers_url = `https://${url.hostname}`;

        // 获取请求参数中的 ns
        const ns = url.searchParams.get('ns');
        const hostname = url.searchParams.get('hubhost') || url.hostname;
        const hostTop = hostname.split('.')[0];

        let checkHost;
        if (ns) {
            if (ns === 'docker.io') {
                hub_host = 'registry-1.docker.io';
            } else {
                hub_host = ns;
            }
        } else {
            checkHost = routeByHosts(hostTop);
            hub_host = checkHost[0];
        }

        const fakePage = checkHost ? checkHost[1] : false;
        console.log(`域名头部: ${hostTop} 反代地址: ${hub_host} searchInterface: ${fakePage}`);
        
        // 屏蔽爬虫
        if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
            return new Response(await nginx(), {
                headers: { 'Content-Type': 'text/html; charset=UTF-8' },
            });
        }
        
        // 处理浏览器访问和搜索
        const hubParams = ['/v1/search', '/v1/repositories'];
        if ((userAgent && userAgent.includes('mozilla')) || hubParams.some(param => url.pathname.includes(param))) {
            if (url.pathname == '/') {
                if (env.URL302) {
                    return Response.redirect(env.URL302, 302);
                } else if (env.URL) {
                    if (env.URL.toLowerCase() == 'nginx') {
                        return new Response(await nginx(), {
                            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
                        });
                    } else return fetch(new Request(env.URL, request));
                } else {
                    if (fakePage) return new Response(await searchInterface(), {
                        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
                    });
                }
            } else {
                if (url.pathname.startsWith('/v1/')) {
                    url.hostname = 'index.docker.io';
                } else if (fakePage) {
                    url.hostname = 'hub.docker.com';
                }
                if (url.searchParams.get('q')?.includes('library/') && url.searchParams.get('q') != 'library/') {
                    const search = url.searchParams.get('q');
                    url.searchParams.set('q', search.replace('library/', ''));
                }
                const newRequest = new Request(url, request);
                return fetch(newRequest);
            }
        }

        // 处理 token 请求
        if (url.pathname.includes('/token')) {
            let token_parameter = {
                headers: {
                    'Host': 'auth.docker.io',
                    'User-Agent': getReqHeader("User-Agent"),
                    'Accept': getReqHeader("Accept"),
                    'Accept-Language': getReqHeader("Accept-Language"),
                    'Accept-Encoding': getReqHeader("Accept-Encoding"),
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0'
                }
            };
            let token_url = auth_url + url.pathname + url.search;
            return fetch(new Request(token_url, request), token_parameter);
        }

        // 修改包含 %2F 和 %3A 的请求
        if (!/%2F/.test(url.search) && /%3A/.test(url.toString())) {
            let modifiedUrl = url.toString().replace(/%3A(?=.*?&)/, '%3Alibrary%2F');
            url = new URL(modifiedUrl);
            console.log(`handle_url: ${url}`);
        }

        // ========== 核心：处理需要认证的 Docker Registry V2 请求 ==========
        if (url.pathname.startsWith('/v2/')) {
            // 提取镜像仓库名
            let repo = '';
            const v2Match = url.pathname.match(/^\/v2\/([^/]+(?:\/[^/]+)?)/);
            if (v2Match) {
                repo = v2Match[1];
            }

            // 判断是否需要认证
            const needsAuth = url.pathname.includes('/manifests/') || 
                              url.pathname.includes('/blobs/') || 
                              url.pathname.includes('/tags/') || 
                              url.pathname.endsWith('/tags/list') ||
                              url.pathname.includes('/_catalog');

            if (needsAuth && repo) {
                // 获取 Token - 使用 normalizeRepo 处理
                const token = await getDockerToken(repo, 'pull');
                
                // 构建请求参数
                let parameter = {
                    headers: {
                        'Host': hub_host,
                        'User-Agent': getReqHeader("User-Agent") || 'docker-client',
                        'Accept': getReqHeader("Accept") || 'application/vnd.docker.distribution.manifest.v2+json',
                        'Accept-Language': getReqHeader("Accept-Language") || '*',
                        'Accept-Encoding': getReqHeader("Accept-Encoding") || 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Cache-Control': 'max-age=0',
                    },
                    cacheTtl: 3600
                };

                // 关键：添加 Authorization 头
                if (token) {
                    parameter.headers['Authorization'] = `Bearer ${token}`;
                    console.log(`Using token for ${repo}`);
                } else {
                    console.warn(`No token available for ${repo}`);
                }

                // 复制其他头部
                if (request.headers.has("Content-Type")) {
                    parameter.headers["Content-Type"] = getReqHeader("Content-Type");
                }
                if (request.headers.has("X-Amz-Content-Sha256")) {
                    parameter.headers['X-Amz-Content-Sha256'] = getReqHeader("X-Amz-Content-Sha256");
                }

                // 传递请求体
                if (request.method === 'PUT' || request.method === 'POST' || request.method === 'PATCH') {
                    parameter.body = request.body;
                }

                try {
                    // 构建目标 URL - 注意保留原始 pathname
                    const targetUrl = new URL(url.pathname + url.search, `https://${hub_host}`);
                    console.log(`Fetching: ${targetUrl.href}`);
                    
                    let original_response = await fetch(targetUrl.href, parameter);
                    let response_headers = original_response.headers;
                    let new_response_headers = new Headers(response_headers);
                    let status = original_response.status;

                    // 如果返回 401 或 403，可能是 token 问题，尝试重新获取
                    if ((status === 401 || status === 403) && token) {
                        console.log(`Auth failed with status ${status}, clearing cache and retrying...`);
                        // 清除缓存重试
                        const normalizedRepo = repo.includes('/') ? repo : `library/${repo}`;
                        tokenCache.delete(`${normalizedRepo}:pull`);
                        const newToken = await getDockerToken(repo, 'pull');
                        if (newToken) {
                            parameter.headers['Authorization'] = `Bearer ${newToken}`;
                            original_response = await fetch(targetUrl.href, parameter);
                            response_headers = original_response.headers;
                            new_response_headers = new Headers(response_headers);
                            status = original_response.status;
                        }
                    }

                    // 修改 Www-Authenticate 头
                    if (new_response_headers.get("Www-Authenticate")) {
                        let re = new RegExp(auth_url, 'g');
                        new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
                    }

                    // 处理重定向
                    if (new_response_headers.get("Location") && (status === 307 || status === 302)) {
                        const location = new_response_headers.get("Location");
                        console.info(`Redirecting to ${location}`);
                        try {
                            const redirectRes = await fetch(location, parameter);
                            return redirectRes;
                        } catch (err) {
                            console.error('Redirect failed:', err);
                        }
                    }

                    // 检查响应状态，如果是 404，可能镜像不存在
                    if (status === 404) {
                        console.warn(`Image ${repo} not found (404)`);
                    }

                    // 返回响应
                    return new Response(original_response.body, {
                        status: status,
                        headers: new_response_headers
                    });
                } catch (error) {
                    console.error('Authenticated request failed:', error);
                    return new Response(JSON.stringify({
                        error: 'Request failed',
                        detail: error.message
                    }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
        }

        // ========== 处理不需要认证的请求 ==========
        // 修改 /v2/ 请求路径 (library 补全逻辑)
        if (hub_host == 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
            url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
            console.log(`modified_url: ${url.pathname}`);
        }

        // 构造请求参数
        let parameter = {
            headers: {
                'Host': hub_host,
                'User-Agent': getReqHeader("User-Agent"),
                'Accept': getReqHeader("Accept"),
                'Accept-Language': getReqHeader("Accept-Language"),
                'Accept-Encoding': getReqHeader("Accept-Encoding"),
                'Connection': 'keep-alive',
                'Cache-Control': 'max-age=0'
            },
            cacheTtl: 3600
        };

        if (request.headers.has("Authorization")) {
            parameter.headers.Authorization = getReqHeader("Authorization");
        }
        if (request.headers.has("X-Amz-Content-Sha256")) {
            parameter.headers['X-Amz-Content-Sha256'] = getReqHeader("X-Amz-Content-Sha256");
        }

        let original_response = await fetch(new Request(url, request), parameter);
        let response_headers = original_response.headers;
        let new_response_headers = new Headers(response_headers);
        let status = original_response.status;

        if (new_response_headers.get("Www-Authenticate")) {
            let re = new RegExp(auth_url, 'g');
            new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
        }

        if (new_response_headers.get("Location")) {
            const location = new_response_headers.get("Location");
            console.info(`Found redirection location, redirecting to ${location}`);
            return httpHandler(request, location, hub_host);
        }

        return new Response(original_response.body, {
            status,
            headers: new_response_headers
        });
    }
};

function httpHandler(req, pathname, baseHost) {
    const reqHdrRaw = req.headers;
    if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT);
    }
    const reqHdrNew = new Headers(reqHdrRaw);
    reqHdrNew.delete("Authorization");
    const urlObj = newUrl(pathname, 'https://' + baseHost);
    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'follow',
        body: req.body
    };
    return proxy(urlObj, reqInit);
}

async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit);
    const resHdrOld = res.headers;
    const resHdrNew = new Headers(resHdrOld);
    const status = res.status;
    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.set('Cache-Control', 'max-age=1500');
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');
    return new Response(res.body, {
        status,
        headers: resHdrNew
    });
}
