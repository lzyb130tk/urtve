/**
 * 网易云音乐 API 服务模块
 * 通过后端代理调用网易云接口实现搜索、播放等功能
 */

const NeteaseMusic = (function() {
    'use strict';

    // =============== 配置 ===============
    // 后端代理服务地址（腾讯云国内服务器）
    const API_BASE = localStorage.getItem('netease_api_base') || 'http://121.4.83.241:3001';
    const STORAGE_KEY = 'netease_music_auth';
    
    // =============== 状态管理 ===============
    let _isLoggedIn = false;
    let _userInfo = null;
    let _cookie = null; // 用户登录Cookie
    let _userId = null; // 用于后端Cookie关联
    
    // =============== 初始化 ===============
    function init() {
        // 生成或恢复用户标识
        _userId = localStorage.getItem('netease_user_id');
        if (!_userId) {
            _userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('netease_user_id', _userId);
        }
        
        // 从本地存储恢复登录状态
        const savedAuth = localStorage.getItem(STORAGE_KEY);
        if (savedAuth) {
            try {
                const auth = JSON.parse(savedAuth);
                _userInfo = auth.userInfo;
                _cookie = auth.cookie;
                _isLoggedIn = true;
                console.log('[NeteaseMusic] 已恢复登录状态:', _userInfo?.nickname);
                
                // 验证后端登录状态
                checkLoginStatus();
            } catch (e) {
                console.warn('[NeteaseMusic] 恢复登录状态失败:', e);
                localStorage.removeItem(STORAGE_KEY);
            }
        }
    }
    
    /**
     * 设置后端API地址
     */
    function setApiBase(url) {
        localStorage.setItem('netease_api_base', url);
        console.log('[NeteaseMusic] API地址已更新:', url);
    }
    
    /**
     * 获取当前API地址
     */
    function getApiBase() {
        return API_BASE;
    }
    
    // =============== HTTP 请求封装 ===============
    
    // 请求超时时间（毫秒）- Vercel 冷启动可能需要更长时间
    const REQUEST_TIMEOUT = 30000; // 30秒
    const MAX_RETRIES = 2; // 最大重试次数
    
    /**
     * 带超时的 fetch 封装
     */
    async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时，请检查网络连接');
            }
            throw error;
        }
    }
    
    /**
     * 带重试的 fetch 封装
     */
    async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
        let lastError;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`[NeteaseMusic] 第 ${attempt} 次重试...`);
                    // 重试前等待一小段时间
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
                return await fetchWithTimeout(url, options);
            } catch (error) {
                lastError = error;
                console.warn(`[NeteaseMusic] 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, error.message);
                
                // 如果不是超时或网络错误，不重试
                if (!error.message.includes('超时') && !error.message.includes('Failed to fetch')) {
                    throw error;
                }
            }
        }
        
        throw lastError;
    }
    
    async function apiGet(path, params = {}) {
        const url = new URL(API_BASE + path);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });
        
        try {
            // console.log('[NeteaseMusic] 请求:', url.toString());
            // 使用带重试的 fetch
            const response = await fetchWithRetry(url.toString());
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            // console.error('[NeteaseMusic] API请求失败:', path, error);
            // 添加更多诊断信息
            if (error.message.includes('Failed to fetch') || error.message.includes('超时')) {
                console.error('[NeteaseMusic] 可能原因: 1. 后端服务冷启动中 2. 网络问题 3. CORS限制');
                console.error('[NeteaseMusic] 请尝试访问:', API_BASE + '/api/health');
            }
            throw error;
        }
    }
    
    async function apiPost(path, body = {}) {
        try {
            console.log('[NeteaseMusic] POST 请求:', API_BASE + path);
            // 使用带重试的 fetch
            const response = await fetchWithRetry(API_BASE + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[NeteaseMusic] API请求失败:', path, error);
            throw error;
        }
    }
    
    // =============== 登录相关 ===============
    
    function isLoggedIn() {
        return _isLoggedIn;
    }
    
    function getUserInfo() {
        return _userInfo;
    }
    
    /**
     * 检查后端登录状态
     */
    async function checkLoginStatus() {
        try {
            const result = await apiGet('/api/login/status', { 
                userId: _userId,
                cookie: _cookie
            });
            if (result.code === 200 && result.data?.isLoggedIn) {
                _isLoggedIn = true;
                if (result.data.profile) {
                    _userInfo = {
                        userId: result.data.profile.userId,
                        nickname: result.data.profile.nickname,
                        avatarUrl: result.data.profile.avatarUrl
                    };
                }
            } else {
                _isLoggedIn = false;
                _userInfo = null;
                _cookie = null;
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (e) {
            console.warn('[NeteaseMusic] 检查登录状态失败:', e);
        }
    }
    
    /**
     * 打开登录弹窗
     */
    function showLoginModal() {
        return new Promise((resolve, reject) => {
            const overlay = document.createElement('div');
            overlay.id = 'netease-login-overlay';
            overlay.innerHTML = `
                <div class="netease-login-modal">
                    <div class="netease-login-header">
                        <span>登录云音乐</span>
                        <button class="netease-login-close" onclick="NeteaseMusic.closeLoginModal()">✕</button>
                    </div>
                    <div class="netease-login-body">
                        <div class="netease-login-info">
                            <div class="netease-login-icon">授权</div>
                            <p>请输入您的云音乐账号信息</p>
                            <p class="netease-login-tip">您的密码仅用于获取登录凭证，不会被存储</p>
                        </div>
                        <div class="netease-login-form">
                            <input type="text" id="netease-phone" placeholder="手机号" />
                            <input type="password" id="netease-password" placeholder="密码" />
                            <button id="netease-login-btn" class="netease-login-submit">登录</button>
                        </div>
                        <div class="netease-login-alt">
                            <span>或者</span>
                            <button id="netease-qr-btn" class="netease-qr-login">扫码登录（推荐）</button>
                        </div>
                        <div id="netease-qr-container" style="display:none;">
                            <div class="netease-qr-wrapper" style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin-top:10px;">
                                <img id="netease-qr-img" src="" alt="二维码" style="width:180px; height:180px; display:block;" />
                                <p id="netease-qr-status" style="margin-top:10px; font-size:13px; color:#666;">使用云音乐APP扫码登录</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            // 手机号登录
            document.getElementById('netease-login-btn').onclick = async () => {
                const phone = document.getElementById('netease-phone').value.trim();
                const password = document.getElementById('netease-password').value;
                
                if (!phone || !password) {
                    showToast('请输入手机号和密码');
                    return;
                }
                
                const btn = document.getElementById('netease-login-btn');
                btn.textContent = '登录中...';
                btn.disabled = true;
                
                try {
                    const result = await loginWithPhone(phone, password);
                    if (result.success) {
                        closeLoginModal();
                        resolve(result);
                    } else {
                        showToast(result.message || '登录失败');
                        btn.textContent = '登录';
                        btn.disabled = false;
                    }
                } catch (e) {
                    showToast('登录出错: ' + e.message);
                    btn.textContent = '登录';
                    btn.disabled = false;
                }
            };
            
            // 二维码登录
            document.getElementById('netease-qr-btn').onclick = async () => {
                document.querySelector('.netease-login-form').style.display = 'none';
                document.querySelector('.netease-login-alt').style.display = 'none';
                document.getElementById('netease-qr-container').style.display = 'block';
                
                try {
                    await initQRLogin(resolve);
                } catch (e) {
                    showToast('二维码登录初始化失败');
                }
            };
            
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    closeLoginModal();
                    reject(new Error('用户取消登录'));
                }
            };
        });
    }
    
    function closeLoginModal() {
        const overlay = document.getElementById('netease-login-overlay');
        if (overlay) overlay.remove();
        if (_qrPollTimer) {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
        }
    }
    
    let _qrPollTimer = null;
    
    /**
     * 手机号密码登录
     */
    async function loginWithPhone(phone, password) {
        console.log('[NeteaseMusic] 尝试登录:', phone);
        
        try {
            const result = await apiPost('/api/login/cellphone', {
                phone,
                password,
                userId: _userId
            });
            
            if (result.code === 200) {
                _userInfo = {
                    userId: result.data.userId,
                    nickname: result.data.nickname,
                    avatarUrl: result.data.avatarUrl
                };
                _cookie = result.data.cookie;
                _isLoggedIn = true;
                
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    userInfo: _userInfo,
                    cookie: _cookie
                }));
                
                return { success: true, userInfo: _userInfo };
            } else {
                return { success: false, message: result.message };
            }
        } catch (e) {
            console.error('[NeteaseMusic] 登录失败:', e);
            return { success: false, message: '网络错误，请确保后端服务已启动' };
        }
    }
    
    /**
     * 二维码登录初始化
     */
    async function initQRLogin(resolve) {
        try {
            // 获取二维码Key
            const keyResult = await apiGet('/api/login/qr/key');
            if (keyResult.code !== 200) {
                throw new Error('获取二维码Key失败');
            }
            const key = keyResult.data.key;
            
            // 生成二维码
            const qrResult = await apiGet('/api/login/qr/create', { key });
            if (qrResult.code !== 200) {
                throw new Error('生成二维码失败');
            }
            
            const qrImg = document.getElementById('netease-qr-img');
            qrImg.src = qrResult.data.qrimg;
            
            // 轮询检查扫码状态
            _qrPollTimer = setInterval(async () => {
                try {
                    const checkResult = await apiGet('/api/login/qr/check', { 
                        key, 
                        userId: _userId 
                    });
                    
                    const statusEl = document.getElementById('netease-qr-status');
                    if (!statusEl) {
                        // 元素不存在（模态框已关闭），停止轮询
                        clearInterval(_qrPollTimer);
                        return;
                    }
                    
                    switch (checkResult.code) {
                        case 801:
                            statusEl.textContent = '等待扫码...';
                            break;
                        case 802:
                            statusEl.textContent = '扫码成功，请在APP上确认登录';
                            break;
                        case 803:
                            // 登录成功
                            clearInterval(_qrPollTimer);
                            _qrPollTimer = null;
                            
                            _userInfo = {
                                nickname: checkResult.data?.nickname || '用户',
                                avatarUrl: checkResult.data?.avatarUrl
                            };
                            _cookie = checkResult.data?.cookie;
                            _isLoggedIn = true;
                            
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                userInfo: _userInfo,
                                cookie: _cookie
                            }));
                            
                            closeLoginModal();
                            showToast('登录成功！');
                            resolve({ success: true, userInfo: _userInfo });
                            break;
                        case 800:
                            statusEl.textContent = '二维码已过期，请刷新';
                            clearInterval(_qrPollTimer);
                            break;
                    }
                } catch (e) {
                    console.warn('[NeteaseMusic] 检查扫码状态失败:', e);
                }
            }, 2000);
            
        } catch (e) {
            console.error('[NeteaseMusic] 二维码登录初始化失败:', e);
            showToast('二维码登录初始化失败，请确保后端服务已启动');
        }
    }
    
    /**
     * 退出登录
     */
    async function logout() {
        try {
            await apiPost('/api/logout', { userId: _userId });
        } catch (e) {
            console.warn('[NeteaseMusic] 退出登录请求失败:', e);
        }
        
        _isLoggedIn = false;
        _userInfo = null;
        _cookie = null;
        localStorage.removeItem(STORAGE_KEY);
        console.log('[NeteaseMusic] 已退出登录');
    }
    
    // =============== 音乐搜索 ===============
    
    /**
     * 搜索歌曲
     * @param {string} keywords 搜索关键词
     * @param {number} limit 返回数量
     */
    async function searchSongs(keywords, limit = 20) {
        console.log('[NeteaseMusic] 搜索:', keywords);
        
        try {
            const result = await apiGet('/api/search', { keywords, limit, cookie: _cookie });
            
            if (result.code === 200) {
                return result.data.songs || [];
            } else {
                console.warn('[NeteaseMusic] 搜索失败:', result.message);
                return [];
            }
        } catch (e) {
            console.error('[NeteaseMusic] 搜索请求失败:', e);
            // 降级到模拟数据
            return getFallbackSongs(keywords);
        }
    }
    
    /**
     * 获取歌曲播放URL
     * @param {number} songId 歌曲ID
     */
    async function getSongUrl(songId) {
        console.log('[NeteaseMusic] 获取播放地址:', songId);
        
        try {
            const result = await apiGet('/api/song/url', { 
                id: songId, 
                userId: _userId,
                cookie: _cookie
            });
            
            if (result.code === 200 && result.data?.url) {
                return {
                    url: result.data.url,
                    type: result.data.type || 'mp3'
                };
            } else {
                // 无法获取播放地址，使用示例音频
                console.warn('[NeteaseMusic] 无法获取播放地址，使用示例音频');
                return getFallbackUrl();
            }
        } catch (e) {
            console.error('[NeteaseMusic] 获取播放地址失败:', e);
            return getFallbackUrl();
        }
    }
    
    /**
     * 获取歌曲详情
     * @param {number|string} songIds 歌曲ID（多个用逗号分隔）
     */
    async function getSongDetail(songIds) {
        console.log('[NeteaseMusic] 获取歌曲详情:', songIds);
        
        try {
            const result = await apiGet('/api/song/detail', { ids: songIds, cookie: _cookie });
            
            if (result.code === 200) {
                return result.data.songs || [];
            }
            return [];
        } catch (e) {
            console.error('[NeteaseMusic] 获取歌曲详情失败:', e);
            return [];
        }
    }
    
    /**
     * 获取歌词
     * @param {number} songId 歌曲ID
     */
    async function getLyric(songId) {
        console.log('[NeteaseMusic] 获取歌词:', songId);
        
        try {
            const result = await apiGet('/api/lyric', { id: songId, cookie: _cookie });
            
            if (result.code === 200) {
                return {
                    lrc: result.data.lrc || '',
                    tlyric: result.data.tlyric || ''
                };
            }
            return { lrc: '', tlyric: '' };
        } catch (e) {
            console.error('[NeteaseMusic] 获取歌词失败:', e);
            return { lrc: '', tlyric: '' };
        }
    }
    
    // =============== 用户歌单 ===============
    
    async function getUserPlaylists() {
        if (!_isLoggedIn) {
            throw new Error('请先登录');
        }
        
        try {
            const result = await apiGet('/api/user/playlist', { userId: _userId, cookie: _cookie });
            
            if (result.code === 200) {
                return result.data.playlists || [];
            }
            return [];
        } catch (e) {
            console.error('[NeteaseMusic] 获取用户歌单失败:', e);
            return [];
        }
    }
    
    async function getPlaylistDetail(playlistId) {
        try {
            const result = await apiGet('/api/playlist/detail', { 
                id: playlistId, 
                userId: _userId,
                cookie: _cookie
            });
            
            if (result.code === 200) {
                return result.data;
            }
            return null;
        } catch (e) {
            console.error('[NeteaseMusic] 获取歌单详情失败:', e);
            return null;
        }
    }
    
    // =============== 降级方案（后端不可用时） ===============
    
    function getFallbackSongs(keywords) {
        const mockSongs = [
            { id: 1, name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, cover: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200' },
            { id: 2, name: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223, cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200' },
            { id: 3, name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', duration: 215, cover: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200' },
            { id: 4, name: '七里香', artist: '周杰伦', album: '七里香', duration: 299, cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200' },
            { id: 5, name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: 226, cover: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200' }
        ];
        
        if (!keywords) return mockSongs;
        return mockSongs.filter(s => s.name.includes(keywords) || s.artist.includes(keywords));
    }
    
    function getFallbackUrl() {
        // 使用更可靠的示例音频（来自网易云的公开音频）
        return {
            url: 'https://music.163.com/song/media/outer/url?id=1824020873.mp3',
            type: 'mp3'
        };
    }
    
    // =============== 工具函数 ===============
    
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'netease-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // =============== 导出 ===============
    
    init();
    
    return {
        // 配置
        setApiBase,
        getApiBase,
        
        // 登录相关
        isLoggedIn,
        getUserInfo,
        showLoginModal,
        closeLoginModal,
        logout,
        checkLoginStatus,
        
        // 音乐功能
        searchSongs,
        getSongUrl,
        getSongDetail,
        getLyric,
        
        // 歌单功能
        getUserPlaylists,
        getPlaylistDetail,
        
        // 工具
        formatDuration
    };
})();

// 挂载到全局
window.NeteaseMusic = NeteaseMusic;
