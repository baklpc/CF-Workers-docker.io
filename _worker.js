// 在文件开头添加一个全局token缓存
const tokenCache = new Map();

// 获取token的函数
async function getDockerToken(repo, scope = 'pull') {
    const cacheKey = `${repo}:${scope}`;
    
    // 检查缓存（5分钟有效期）
    if (tokenCache.has(cacheKey)) {
        const cached = tokenCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5分钟
            return cached.token;
        }
        tokenCache.delete(cacheKey);
    }
    
    try {
        const tokenUrl = `${auth_url}/token?service=registry.docker.io&scope=repository:${repo}:${scope}`;
        const tokenRes = await fetch(tokenUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Docker-Client)',
                'Accept': 'application/json',
            }
        });
        
        if (!tokenRes.ok) {
            console.error(`Failed to get token: ${tokenRes.status}`);
            return null;
        }
        
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
            // 缓存token
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

// 修改主fetch函数中的请求处理
export default {
    async fetch(request, env, ctx) {
        const getReqHeader = (key) => request.headers.get(key);
        let url = new URL(request.url);
        const userAgent = (request.headers.get('User-Agent') || 'unknown').toLowerCase();
        
        // ... 前面的代码保持不变 ...
        
        // 检查是否是Docker Registry API请求（需要token认证）
        const needsAuth = url.pathname.startsWith('/v2/') && (
            url.pathname.includes('/manifests/') ||
            url.pathname.includes('/blobs/') ||
            url.pathname.includes('/tags/') ||
            url.pathname.endsWith('/tags/list') ||
            url.pathname.includes('/_catalog')
        );
        
        if (needsAuth) {
            // 提取repository名称
            let repo = '';
            const v2Match = url.pathname.match(/^\/v2\/([^/]+(?:\/[^/]+)?)/);
            if (v2Match) {
                repo = v2Match[1];
            }
            
            // 如果是library/前缀，可能需要特殊处理
            if (repo && !repo.startsWith('library/') && hub_host === 'registry-1.docker.io') {
                // 对于Docker Hub，如果repository没有library前缀，添加它
                // 但要注意，不是所有镜像都在library下
                // 这里保持原样，token请求时Docker会自动处理
            }
            
            if (repo) {
                // 获取token
                const token = await getDockerToken(repo, 'pull');
                
                // 构建请求参数
                let parameter = {
                    headers: {
                        'Host': hub_host,
                        'User-Agent': getReqHeader("User-Agent") || 'Mozilla/5.0 (compatible; Docker-Client)',
                        'Accept': getReqHeader("Accept") || 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
                        'Accept-Language': getReqHeader("Accept-Language") || '*',
                        'Accept-Encoding': getReqHeader("Accept-Encoding") || 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Cache-Control': 'max-age=0'
                    },
                    cacheTtl: 3600
                };
                
                // 添加Authorization头
                if (token) {
                    parameter.headers['Authorization'] = `Bearer ${token}`;
                }
                
                // 复制原始请求的其他头
                if (request.headers.has("X-Amz-Content-Sha256")) {
                    parameter.headers['X-Amz-Content-Sha256'] = getReqHeader("X-Amz-Content-Sha256");
                }
                
                // 如果是PUT请求（推送镜像），需要保留body
                if (request.method === 'PUT' || request.method === 'POST' || request.method === 'PATCH') {
                    parameter.body = request.body;
                }
                
                // 发起请求
                try {
                    const response = await fetch(new Request(url, request), parameter);
                    
                    // 处理响应
                    let response_headers = response.headers;
                    let new_response_headers = new Headers(response_headers);
                    
                    // 修改认证头
                    if (new_response_headers.get("Www-Authenticate")) {
                        const auth = new_response_headers.get("Www-Authenticate");
                        const re = new RegExp(auth_url, 'g');
                        new_response_headers.set("Www-Authenticate", auth.replace(re, `https://${url.hostname}`));
                    }
                    
                    // 处理重定向
                    if (new_response_headers.get("Location") && response.status === 307) {
                        const location = new_response_headers.get("Location");
                        console.info(`Redirecting to ${location}`);
                        // 处理重定向，可能也需要token
                        return handleRedirect(location, request, hub_host);
                    }
                    
                    return new Response(response.body, {
                        status: response.status,
                        headers: new_response_headers
                    });
                } catch (error) {
                    console.error('Request failed:', error);
                    return new Response(JSON.stringify({
                        error: 'Request failed',
                        detail: error.message
                    }), {
                        status: 500,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                }
            }
        }
        
        // 处理其他请求（如token请求本身）
        if (url.pathname.includes('/token')) {
            // 直接转发到auth.docker.io
            const tokenUrl = auth_url + url.pathname + url.search;
            const tokenResponse = await fetch(tokenUrl, {
                headers: {
                    'Host': 'auth.docker.io',
                    'User-Agent': getReqHeader("User-Agent") || 'Mozilla/5.0',
                    'Accept': getReqHeader("Accept") || 'application/json',
                    'Accept-Language': getReqHeader("Accept-Language") || '*',
                    'Accept-Encoding': getReqHeader("Accept-Encoding") || 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                }
            });
            
            // 缓存token响应
            const tokenData = await tokenResponse.json();
            if (tokenData.token) {
                const cacheKey = `token:${tokenData.scope || 'default'}`;
                tokenCache.set(cacheKey, {
                    token: tokenData.token,
                    timestamp: Date.now()
                });
            }
            
            return new Response(JSON.stringify(tokenData), {
                status: tokenResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'max-age=300'
                }
            });
        }
        
        // ... 其余代码保持不变 ...
    }
};

// 处理重定向的辅助函数
async function handleRedirect(location, originalRequest, baseHost) {
    try {
        const redirectUrl = new URL(location);
        // 如果是相对路径，补全
        if (!redirectUrl.hostname) {
            const fullUrl = new URL(location, `https://${baseHost}`);
            return fetch(fullUrl, originalRequest);
        }
        return fetch(location, originalRequest);
    } catch (error) {
        console.error('Redirect handling failed:', error);
        return new Response('Redirect failed', { status: 500 });
    }
}

// 清理过期token的定时任务（可选）
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of tokenCache) {
        if (now - value.timestamp > 300000) { // 5分钟
            tokenCache.delete(key);
        }
    }
}, 60000); // 每分钟清理一次
