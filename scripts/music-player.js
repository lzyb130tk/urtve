/**
 * 音乐播放器核心模块 - "一起听" 功能
 * 基于原型图 prototype/music.html 的 UI 设计实现
 */

const MusicPlayer = (function() {
    'use strict';

    // =============== 状态管理 ===============
    const state = {
        isPlaying: false,
        currentTrack: null,
        playlist: [],
        currentIndex: 0,
        volume: 0.8,
        shuffle: false,
        repeat: 'none', // 'none', 'one', 'all'
        listenTogetherActive: false,
        listenTogetherMessages: [],
        // 歌词相关
        showLyric: false,
        lyrics: [],  // [{time: 秒, text: 歌词}]
        currentLyricIndex: -1
    };

    // DOM 元素缓存
    let els = {};
    
    // Audio 实例
    let audio = null;
    
    // 进度条更新定时器
    let progressTimer = null;

    // =============== 初始化 ===============
    
    function init() {
        // 创建 Audio 元素
        audio = new Audio();
        audio.volume = state.volume;
        
        // 绑定音频事件
        audio.addEventListener('ended', handleTrackEnd);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', handleMetadataLoaded);
        audio.addEventListener('error', handlePlayError);
        audio.addEventListener('play', () => updatePlayState(true));
        audio.addEventListener('pause', () => updatePlayState(false));
        
        // 缓存 DOM 元素
        cacheElements();
        
        // 绑定 UI 事件
        bindEvents();
        
        console.log('[MusicPlayer] 初始化完成');
    }
    
    function cacheElements() {
        els = {
            // 播放器界面
            playerScreen: document.getElementById('music-player-screen'),
            playerBg: document.getElementById('music-player-bg'),
            
            // 封面和信息
            albumArt: document.getElementById('music-album-art'),
            trackTitle: document.getElementById('music-track-title'),
            trackArtist: document.getElementById('music-track-artist'),
            
            // 进度条
            progressBar: document.getElementById('music-progress-bar'),
            progressFill: document.getElementById('music-progress-fill'),
            progressKnob: document.getElementById('music-progress-knob'),
            currentTime: document.getElementById('music-current-time'),
            totalTime: document.getElementById('music-total-time'),
            
            // 控制按钮
            playBtn: document.getElementById('music-play-btn'),
            prevBtn: document.getElementById('music-prev-btn'),
            nextBtn: document.getElementById('music-next-btn'),
            shuffleBtn: document.getElementById('music-shuffle-btn'),
            playlistBtn: document.getElementById('music-playlist-btn'),
            
            // 浮动胶囊
            floatingCapsule: document.getElementById('music-floating-capsule'),
            capsuleArt: document.getElementById('music-capsule-art'),
            capsuleText: document.getElementById('music-capsule-text'),
            
            // 歌单面板
            playlistSheet: document.getElementById('music-playlist-sheet'),
            playlistContainer: document.getElementById('music-playlist-container'),
            
            // 搜索面板
            searchSheet: document.getElementById('music-search-sheet'),
            searchInput: document.getElementById('music-search-input'),
            searchResults: document.getElementById('music-search-results'),
            
            // 一起听聊天
            miniChatList: document.getElementById('music-mini-chat-list'),
            miniChatInput: document.getElementById('music-mini-chat-input'),
            
            // 歌词视图
            lyricView: document.getElementById('music-lyric-view'),
            lyricScroll: document.getElementById('music-lyric-scroll')
        };
    }
    
    function bindEvents() {
        // 如果元素不存在则跳过
        if (!els.playBtn) return;
        
        // 播放/暂停
        els.playBtn?.addEventListener('click', togglePlay);
        
        // 上一首/下一首
        els.prevBtn?.addEventListener('click', playPrev);
        els.nextBtn?.addEventListener('click', playNext);
        
        // 随机播放
        els.shuffleBtn?.addEventListener('click', toggleShuffle);
        
        // 打开歌单
        els.playlistBtn?.addEventListener('click', () => toggleSheet('playlist', true));
        
        // 进度条拖动
        els.progressBar?.addEventListener('click', seekTo);
        
        // 浮动胶囊点击
        els.floatingCapsule?.addEventListener('click', () => togglePlayerScreen(true));
        
        // 搜索输入
        els.searchInput?.addEventListener('input', debounce(handleSearch, 300));
        
        // 一起听聊天发送
        els.miniChatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage(e.target.value);
                e.target.value = '';
            }
        });
    }

    // =============== 播放控制 ===============
    
    /**
     * 播放指定歌曲
     * @param {Object} track 歌曲对象
     */
    async function play(track) {
        if (!track) return;
        
        state.currentTrack = track;
        state.isPlaying = false;
        
        // 重置歌词状态
        state.lyrics = [];
        state.currentLyricIndex = -1;
        if (state.showLyric) {
            loadLyrics(track.id);
        }
        
        // 更新UI（使用当前歌曲信息）
        updateTrackInfo();
        updatePlayState(false);
        
        // 获取播放地址
        try {
            const result = await NeteaseMusic.getSongUrl(track.id);
            
            if (!result || !result.url) {
                showToast('该歌曲暂不可播放（可能需要VIP）');
                console.warn('[MusicPlayer] 无法获取播放地址:', track.name);
                return;
            }
            
            console.log('[MusicPlayer] 开始播放:', track.name, result.url);
            
            // 设置音频源并播放
            audio.src = result.url;
            audio.play().then(() => {
                state.isPlaying = true;
                updatePlayState(true);
            }).catch(e => {
                if (e.name !== 'AbortError') {
                    console.error('[MusicPlayer] 播放失败:', e);
                    showToast('播放失败，请稍后重试');
                }
            });
            
        } catch (e) {
            console.error('[MusicPlayer] 获取播放地址失败:', e);
            showToast('播放失败，请检查网络');
        }
    }
    
    /**
     * 切换播放/暂停
     */
    function togglePlay() {
        if (!state.currentTrack) {
            // 没有当前歌曲，播放歌单第一首
            if (state.playlist.length > 0) {
                play(state.playlist[0]);
            }
            return;
        }
        
        if (state.isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
    }
    
    /**
     * 上一首
     */
    function playPrev() {
        if (state.playlist.length === 0) return;
        
        if (state.shuffle) {
            state.currentIndex = Math.floor(Math.random() * state.playlist.length);
        } else {
            state.currentIndex = (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
        }
        
        play(state.playlist[state.currentIndex]);
    }
    
    /**
     * 下一首
     */
    function playNext() {
        if (state.playlist.length === 0) return;
        
        if (state.shuffle) {
            state.currentIndex = Math.floor(Math.random() * state.playlist.length);
        } else {
            state.currentIndex = (state.currentIndex + 1) % state.playlist.length;
        }
        
        play(state.playlist[state.currentIndex]);
    }
    
    /**
     * 切换随机播放
     */
    function toggleShuffle() {
        state.shuffle = !state.shuffle;
        els.shuffleBtn?.classList.toggle('active', state.shuffle);
        showToast(state.shuffle ? '已开启随机播放' : '已关闭随机播放');
    }
    
    /**
     * 跳转到指定位置
     */
    function seekTo(e) {
        if (!audio.duration) return;
        
        const rect = els.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        audio.currentTime = percent * audio.duration;
    }
    
    /**
     * 歌曲结束处理
     */
    function handleTrackEnd() {
        if (state.repeat === 'one') {
            audio.currentTime = 0;
            audio.play();
        } else if (state.repeat === 'all' || state.currentIndex < state.playlist.length - 1) {
            playNext();
        } else {
            state.isPlaying = false;
            updatePlayState(false);
        }
    }
    
    /**
     * 播放错误处理
     */
    function handlePlayError(e) {
        console.error('[MusicPlayer] 播放错误:', e);
        showToast('播放出错，正在跳过...');
        setTimeout(playNext, 1000);
    }

    // =============== UI 更新 ===============
    
    /**
     * 更新播放状态UI
     */
    function updatePlayState(playing) {
        state.isPlaying = playing;
        
        // 更新播放按钮图标 - 直接使用SVG
        if (els.playBtn) {
            if (playing) {
                els.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
            } else {
                els.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            }
        }
        
        // 更新播放器界面状态
        els.playerScreen?.classList.toggle('playing', playing);
        
        // 更新浮动胶囊
        if (els.floatingCapsule) {
            els.floatingCapsule.classList.toggle('playing', playing);
            const bars = els.floatingCapsule.querySelectorAll('.bar');
            bars.forEach(bar => {
                bar.style.animationPlayState = playing ? 'running' : 'paused';
            });
        }
    }
    
    /**
     * 更新歌曲信息UI
     */
    function updateTrackInfo() {
        const track = state.currentTrack;
        if (!track) return;
        
        // 更新播放器界面
        if (els.trackTitle) els.trackTitle.textContent = track.name;
        if (els.trackArtist) els.trackArtist.textContent = track.artist;
        if (els.albumArt) {
            els.albumArt.style.backgroundImage = `url(${track.cover})`;
        }
        
        // 更新浮动胶囊
        if (els.capsuleText) els.capsuleText.textContent = track.name;
        if (els.capsuleArt) {
            els.capsuleArt.style.backgroundImage = `url(${track.cover})`;
        }
        
        // 更新背景色彩（根据封面提取主色调）
        updatePlayerBackground(track.cover);
    }
    
    /**
     * 更新进度条
     */
    function updateProgress() {
        if (!audio.duration) return;
        
        const percent = (audio.currentTime / audio.duration) * 100;
        
        if (els.progressFill) {
            els.progressFill.style.width = percent + '%';
        }
        
        if (els.currentTime) {
            els.currentTime.textContent = formatTime(audio.currentTime);
        }
        
        // 更新歌词高亮
        updateLyricHighlight(audio.currentTime);
    }
    
    /**
     * 元数据加载完成
     */
    function handleMetadataLoaded() {
        if (els.totalTime) {
            els.totalTime.textContent = formatTime(audio.duration);
        }
    }
    
    /**
     * 更新播放器背景（使用color-thief提取封面主色调）
     */
    function updatePlayerBackground(coverUrl) {
        if (!els.playerBg || !coverUrl) {
            // 使用默认渐变
            if (els.playerBg) {
                els.playerBg.style.background = 'linear-gradient(180deg, #4A304D 0%, #1A1A1D 100%)';
            }
            return;
        }
        
        // 创建临时图片来提取颜色
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = () => {
            try {
                // 使用 Color Thief 提取主色调
                if (typeof ColorThief !== 'undefined') {
                    const colorThief = new ColorThief();
                    
                    // 获取主色调
                    const dominantColor = colorThief.getColor(img);
                    
                    // 获取调色板（2个颜色）
                    const palette = colorThief.getPalette(img, 2);
                    
                    // 构建渐变色
                    const [r1, g1, b1] = dominantColor;
                    const [r2, g2, b2] = palette[1] || [r1 * 0.5, g1 * 0.5, b1 * 0.5];
                    
                    // 稍微调暗颜色，增加沉浸感
                    const darken = (r, g, b, factor = 0.7) => [
                        Math.floor(r * factor),
                        Math.floor(g * factor),
                        Math.floor(b * factor)
                    ];
                    
                    const [dr1, dg1, db1] = darken(r1, g1, b1, 0.8);
                    const [dr2, dg2, db2] = darken(r2, g2, b2, 0.4);
                    
                    els.playerBg.style.background = `linear-gradient(180deg, 
                        rgb(${dr1}, ${dg1}, ${db1}) 0%, 
                        rgb(${dr2}, ${dg2}, ${db2}) 100%)`;
                    
                    // 更新发光效果颜色
                    const glowEl = document.querySelector('.music-player-glow');
                    if (glowEl) {
                        glowEl.style.background = `radial-gradient(circle, 
                            rgba(${r1}, ${g1}, ${b1}, 0.4) 0%, 
                            transparent 70%)`;
                    }
                    
                    console.log('[MusicPlayer] 已提取封面主色调:', dominantColor);
                }
            } catch (e) {
                console.warn('[MusicPlayer] 提取颜色失败，使用默认背景:', e);
                els.playerBg.style.background = 'linear-gradient(180deg, #4A304D 0%, #1A1A1D 100%)';
            }
        };
        
        img.onerror = () => {
            console.warn('[MusicPlayer] 封面图片加载失败');
            els.playerBg.style.background = 'linear-gradient(180deg, #4A304D 0%, #1A1A1D 100%)';
        };
        
        // 加载图片
        img.src = coverUrl;
    }

    // =============== 界面切换 ===============
    
    /**
     * 切换播放器界面显示
     */
    function togglePlayerScreen(show) {
        if (!els.playerScreen) return;
        
        if (show) {
            els.playerScreen.classList.add('active');
            els.floatingCapsule?.classList.remove('visible');
        } else {
            els.playerScreen.classList.remove('active');
            // 延迟显示胶囊
            setTimeout(() => {
                if (state.currentTrack) {
                    els.floatingCapsule?.classList.add('visible');
                }
            }, 300);
        }
    }
    
    /**
     * 切换底部面板
     * @param {string} type 'playlist' | 'search'
     * @param {boolean} show 是否显示
     */
    function toggleSheet(type, show) {
        const sheet = type === 'playlist' ? els.playlistSheet : els.searchSheet;
        if (!sheet) return;
        
        if (show) {
            sheet.classList.add('open');
            if (type === 'playlist') {
                renderPlaylist();
            }
        } else {
            sheet.classList.remove('open');
        }
    }
    
    /**
     * 最小化播放器（显示浮动胶囊）
     */
    function minimize() {
        togglePlayerScreen(false);
    }

    // =============== 歌词功能 ===============
    
    /**
     * 切换歌词/封面视图
     */
    function toggleLyricView() {
        state.showLyric = !state.showLyric;
        
        if (els.albumArt) {
            els.albumArt.style.display = state.showLyric ? 'none' : 'block';
        }
        if (els.lyricView) {
            els.lyricView.style.display = state.showLyric ? 'block' : 'none';
        }
        
        // 如果切换到歌词视图且还没加载歌词，则加载
        if (state.showLyric && state.lyrics.length === 0 && state.currentTrack) {
            loadLyrics(state.currentTrack.id);
        }
    }
    
    /**
     * 加载歌词
     */
    async function loadLyrics(songId) {
        if (!songId) return;
        
        try {
            const result = await NeteaseMusic.getLyric(songId);
            if (result && result.lrc) {
                state.lyrics = parseLRC(result.lrc);
                renderLyrics();
            } else {
                showNoLyrics();
            }
        } catch (e) {
            console.error('[MusicPlayer] 加载歌词失败:', e);
            showNoLyrics();
        }
    }
    
    /**
     * 解析LRC歌词格式
     */
    function parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lyrics = [];
        
        // 匹配 [mm:ss.xx] 或 [mm:ss] 格式
        const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{0,3})\]/g;
        
        lines.forEach(line => {
            const matches = [...line.matchAll(timeRegex)];
            if (matches.length === 0) return;
            
            // 提取歌词文本（去掉时间标签）
            const text = line.replace(timeRegex, '').trim();
            if (!text) return;
            
            // 每个时间标签对应同一行歌词
            matches.forEach(match => {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const ms = parseInt(match[3] || '0');
                const time = minutes * 60 + seconds + ms / 1000;
                
                lyrics.push({ time, text });
            });
        });
        
        // 按时间排序
        return lyrics.sort((a, b) => a.time - b.time);
    }
    
    /**
     * 渲染歌词
     */
    function renderLyrics() {
        if (!els.lyricScroll) return;
        
        if (state.lyrics.length === 0) {
            showNoLyrics();
            return;
        }
        
        els.lyricScroll.innerHTML = state.lyrics.map((lyric, index) => 
            `<div class="music-lyric-line" data-index="${index}" data-time="${lyric.time}">${lyric.text}</div>`
        ).join('');
        
        // 绑定点击事件（点击歌词跳转到对应位置）
        els.lyricScroll.querySelectorAll('.music-lyric-line').forEach(el => {
            el.onclick = (e) => {
                // 阻止冒泡，避免触发容器的切换视图事件
                e.stopPropagation();
                
                const time = parseFloat(el.dataset.time);
                if (audio && !isNaN(time)) {
                    audio.currentTime = time;
                    // 可选：跳转后给予反馈
                    if (window.showToast) window.showToast('已跳转');
                }
            };
        });
    }
    
    /**
     * 无歌词状态
     */
    function showNoLyrics() {
        if (!els.lyricScroll) return;
        els.lyricScroll.innerHTML = `
            <div class="music-lyric-empty">
                <div class="music-lyric-empty-icon">🎵</div>
                <p>暂无歌词</p>
            </div>
        `;
    }
    
    /**
     * 更新当前歌词高亮（需要在进度更新时调用）
     */
    function updateLyricHighlight(currentTime) {
        if (!state.showLyric || state.lyrics.length === 0) return;
        
        // 找到当前时间对应的歌词索引
        let newIndex = -1;
        for (let i = state.lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= state.lyrics[i].time) {
                newIndex = i;
                break;
            }
        }
        
        // 索引没变则不更新
        if (newIndex === state.currentLyricIndex) return;
        
        state.currentLyricIndex = newIndex;
        
        // 更新高亮样式
        if (!els.lyricScroll) return;
        const lines = els.lyricScroll.querySelectorAll('.music-lyric-line');
        lines.forEach((line, index) => {
            line.classList.remove('active', 'passed');
            if (index === newIndex) {
                line.classList.add('active');
                // 滚动到当前歌词
                scrollToLyric(line);
            } else if (index < newIndex) {
                line.classList.add('passed');
            }
        });
    }
    
    /**
     * 滚动到当前歌词（居中显示）
     */
    function scrollToLyric(element) {
        if (!els.lyricScroll || !element) return;
        
        const containerRect = els.lyricScroll.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        const scrollTop = element.offsetTop - (containerRect.height / 2) + (elementRect.height / 2);
        
        els.lyricScroll.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
        });
    }

    // =============== 歌单管理 ===============
    
    /**
     * 保存歌单到当前联系人
     */
    async function savePlaylistToContact() {
        if (window.currentOpenContact && window.dbHelper) {
            try {
                // 更新当前内存中的对象，确保UI和其他逻辑一致
                window.currentOpenContact.playlist = state.playlist;
                
                // IndexDB 持久化流程：
                // 1. 读取所有联系人列表
                // 注意：根据 shop-ceramic.js 的用法，联系人列表存储在 'messageContacts' 仓库的 'allContacts' 键下
                const result = await window.dbHelper.loadData('messageContacts', 'allContacts');
                
                if (result && result.value && Array.isArray(result.value)) {
                    const allContacts = result.value;
                    const contactId = window.currentOpenContact.id;
                    
                    // 2. 在列表中找到当前联系人并更新
                    const index = allContacts.findIndex(c => c.id === contactId);
                    if (index !== -1) {
                        allContacts[index].playlist = state.playlist;
                        
                        // 3. 保存回数据库
                        await window.dbHelper.saveData('messageContacts', 'allContacts', allContacts);
                        console.log('[MusicPlayer] 歌单已同步保存到数据库', contactId);
                    } else {
                        console.warn('[MusicPlayer] 数据库中未找到当前联系人，无法保存歌单');
                    }
                }
            } catch (e) {
                console.error('[MusicPlayer] 保存歌单失败:', e);
                // 降级：如果数据库操作失败，至少内存中已更新，仅本次会话有效
            }
        }
    }

    /**
     * 添加歌曲到歌单
     */
    function addToPlaylist(track, addedBy = 'user') {
        if (!track) return;
        
        const exists = state.playlist.some(t => t.id === track.id);
        if (!exists) {
            // 记录是谁点的歌
            // 如果是 AI 点歌，传入的是 'ai' 或者 AI 的名字
            // 如果是用户，传入 'user'
            // 我们统一存储显示用的名字
            let addedByName = addedBy;
            if (addedBy === 'ai') {
                // 尝试多种路径获取名字：直接name > ai.name > 默认值
                addedByName = window.currentOpenContact?.name || window.currentOpenContact?.ai?.name || 'TA';
            } else if (addedBy === 'user') {
                addedByName = 'user'; // 特殊标记，不显示名字或显示“你”
            }

            track.addedBy = addedByName;
            track.addedAt = Date.now();
            
            state.playlist.push(track);
            renderPlaylist();
            
            // 持久化保存
            savePlaylistToContact();
            
            showToast(`已添加到播放列表${addedBy !== 'user' ? ' (由 ' + addedByName + ' 点歌)' : ''}`);
        } else {
            showToast('歌曲已在列表中');
        }
    }
    
    /**
     * 从歌单移除歌曲
     */
    function removeFromPlaylist(trackId) {
        const index = state.playlist.findIndex(t => t.id === trackId);
        if (index > -1) {
            state.playlist.splice(index, 1);
            renderPlaylist();
            
            // 持久化保存
            savePlaylistToContact();
            
            // 如果删除的是当前播放的歌曲
            if (state.currentTrack && state.currentTrack.id === trackId) {
                if (state.playlist.length > 0) {
                    playNext();
                } else {
                    audio.pause();
                    state.isPlaying = false;
                    state.currentTrack = null;
                    updatePlayState(false);
                    // 重置界面
                    if (els.trackTitle) els.trackTitle.textContent = '选择一首歌';
                    if (els.trackArtist) els.trackArtist.textContent = '搜索添加音乐';
                }
            }
        }
    }
    
    /**
     * 渲染歌单列表
     */
    function renderPlaylist() {
        if (els.playlistContainer && state.playlist.length > 0) {
            els.playlistContainer.innerHTML = state.playlist.map((track, index) => {
                const isPlaying = state.currentTrack && state.currentTrack.id === track.id;
                // 判断 Tag 显示内容
                let tagHtml = '';
                if (track.addedBy && track.addedBy !== 'user') {
                    tagHtml = `<span class="music-song-tag ai">${track.addedBy} 点歌</span>`;
                }

                return `
                    <div class="music-playlist-item ${isPlaying ? 'playing' : ''}" onclick="MusicPlayer.playAt(${index})">
                        <div class="music-song-idx">${isPlaying ? '<i data-lucide="bar-chart-2" class="music-playing-icon"></i>' : index + 1}</div>
                        <div class="music-song-details">
                            <div class="music-song-name">${track.name}</div>
                            <div class="music-song-meta">
                                ${tagHtml}
                                ${track.artist}
                            </div>
                        </div>
                        <button class="music-remove-btn" onclick="event.stopPropagation(); MusicPlayer.removeFromPlaylist(${track.id})">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                `;
            }).join('');
            
            lucide.createIcons();
        } else if (els.playlistContainer) {
            els.playlistContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无歌曲</div>';
        }
    }
    
    /**
     * 播放歌单中指定位置的歌曲
     */
    function playAt(index) {
        if (index >= 0 && index < state.playlist.length) {
            state.currentIndex = index;
            play(state.playlist[index]);
        }
    }

    // =============== 搜索功能 ===============
    
    /**
     * 处理搜索
     */
    async function handleSearch() {
        const query = els.searchInput?.value.trim();
        if (!query) {
            els.searchResults.innerHTML = '';
            return;
        }
        
        try {
            const results = await NeteaseMusic.searchSongs(query);
            renderSearchResults(results);
        } catch (e) {
            console.error('[MusicPlayer] 搜索失败:', e);
            els.searchResults.innerHTML = '<div class="music-error">搜索失败，请重试</div>';
        }
    }
    
    /**
     * 渲染搜索结果
     */
    function renderSearchResults(songs) {
        if (!els.searchResults) return;
        
        if (songs.length === 0) {
            els.searchResults.innerHTML = '<div class="music-empty-state">没有找到相关歌曲</div>';
            return;
        }
        
        els.searchResults.innerHTML = songs.map(song => `
            <div class="music-search-item" onclick="MusicPlayer.addAndPlay(${JSON.stringify(song).replace(/"/g, '&quot;')})">
                <div class="music-song-cover" style="background-image: url(${song.cover})"></div>
                <div class="music-song-details">
                    <div class="music-song-name">${song.name}</div>
                    <div class="music-song-meta">${song.artist} · ${NeteaseMusic.formatDuration(song.duration)}</div>
                </div>
                <button class="music-add-btn">
                    <i data-lucide="plus"></i>
                </button>
            </div>
        `).join('');
        
        lucide.createIcons();
    }
    
    /**
     * 添加并播放歌曲
     */
    function addAndPlay(track) {
        addToPlaylist(track);
        state.currentIndex = state.playlist.length - 1;
        play(track);
        toggleSheet('search', false);
    }

    // =============== 一起听功能 ===============
    
    /**
     * 开始一起听会话
     */

    function startListenTogether() {
        state.listenTogetherActive = true;
        state.listenTogetherMessages = [];
        state.sessionStartTime = Date.now();
        
        // 加载当前联系人的歌单
        if (window.currentOpenContact?.playlist && window.currentOpenContact.playlist.length > 0) {
            // 深度复制一份，避免引用问题
            state.playlist = JSON.parse(JSON.stringify(window.currentOpenContact.playlist));
            console.log('[MusicPlayer] 已加载联系人歌单:', state.playlist.length, '首');
        } else {
            // ✅ 如果该联系人没有歌单，必须清空，否则会显示上一位联系人的歌单
            state.playlist = [];
            console.log('[MusicPlayer] 该联系人暂无已保存歌单，已清空列表');
        }
        
        // 渲染歌单（确保加载后UI更新）
        renderPlaylist();
        
        togglePlayerScreen(true);
        if (els.playerScreen) {
            els.playerScreen.classList.add('listen-together-active');
        }
        
        // 发送开始消息给AI
        addChatMessage('system', '一起听会话已开始');
        
        // 开启沉默检测
        startSilenceDetection();
        
        // 如果当前有歌正在播放，立即触发一次AI反馈
        if (state.currentTrack) {
            setTimeout(() => {
                triggerAIFeedback('track_start', { track: state.currentTrack });
            }, 1000);
        }
        
        console.log('[MusicPlayer] 一起听会话开始');

        // 添加退出按钮（如果不存在）
        const chatHeader = document.querySelector('.music-mini-chat-header');
        if (chatHeader && !chatHeader.querySelector('.listen-exit-btn')) {
            const btn = document.createElement('button');
            btn.className = 'listen-exit-btn';
            btn.innerHTML = '<i data-lucide="x-circle"></i> 退出';
            btn.style.cssText = 'margin-left:auto; background:none; border:none; color:rgba(255,255,255,0.6); cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px;';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if(confirm('确认退出一起听模式吗？')) {
                    endListenTogether();
                }
            };
            chatHeader.appendChild(btn);
            lucide.createIcons();
        }
    }
    
    /**
     * 显示正在输入状态
     */
    function showTypingIndicator() {
        hideTypingIndicator(); // Ensure only one exists
        const chatList = document.querySelector('.music-mini-chat-list');
        if (!chatList) return;
        
        const aiName = window.currentOpenContact?.name || window.currentOpenContact?.ai?.name || 'TA';
        
        const typingDiv = document.createElement('div');
        typingDiv.id = 'music-typing-indicator-row';
        typingDiv.className = 'music-typing-indicator';
        typingDiv.innerHTML = `
            <span>${aiName} 正在打字</span>
            <div class="music-typing-dots">
                <span></span><span></span><span></span>
            </div>
        `;
        
        chatList.appendChild(typingDiv);
        chatList.scrollTop = chatList.scrollHeight;
    }

    /**
     * 隐藏正在输入状态
     */
    function hideTypingIndicator() {
        const existing = document.getElementById('music-typing-indicator-row');
        if (existing) existing.remove();
    }

    /**
     * 清理/格式化 AI 回复
     * 1. 将 <think>...</think> 转换为可折叠的详情块
     * 2. 标记 [点歌: xxx] 指令
     * 3. 处理截断或未闭合的 <think> 标签
     */
    function cleanAIResponse(text) {
        if (!text) return '';
        
        let processedText = text;

        // 预防性处理：如果包含 <think> 但不包含 </think>，手动补全闭合标签，防止正则失效
        if (processedText.includes('<think>') && !processedText.includes('</think>')) {
            processedText += '</think>\n(回复已被截断)';
        }

        // 1. 处理思考过程：转换为折叠详情
        // 使用非贪婪匹配，且兼容包含换行符的情况
        processedText = processedText.replace(/<think>([\s\S]*?)<\/think>/gi, (match, content) => {
            return `<details class="ai-think-process" style="margin-bottom:8px; border-left: 2px solid #666; padding-left: 8px; font-size: 0.85em; opacity: 0.8;">
                <summary style="cursor:pointer; color:#aaa; font-size:0.8em;">思考过程 (点击展开)</summary>
                <div style="margin-top:4px; white-space: pre-wrap; color: #ccc;">${content.trim()}</div>
            </details>`;
        });

        // 2. 处理点歌指令：高亮显示而不是删除
        processedText = processedText.replace(/\[点歌:\s*(.*?)\]/g, (match, songName) => {
            return `<span class="ai-command-tag" style="display:inline-block; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.85em; color:#aaffaa; margin:0 4px;">点歌《${songName}》</span>`;
        });

        return processedText.trim();
    }

    /**
     * 发送聊天消息（调用真实AI API）
     */
    async function sendChatMessage(message) {
        if (!message.trim()) return;
        
        addChatMessage('user', message);
        
        const currentContact = window.currentOpenContact;
        if (!currentContact) {
            console.warn('[MusicPlayer] 未找到当前联系人，使用 Fallback');
            fallbackAIResponse(message);
            return;
        }
        
        try {
            // 从 dbHelper 获取 API 配置
            const settingsData = await window.dbHelper?.loadData('settingsStore', 'apiSettings');
            if (!settingsData?.value?.url) {
                console.warn('[MusicPlayer] 未配置 API URL，使用 Fallback');
                fallbackAIResponse(message);
                return;
            }
            
            console.log('[MusicPlayer] 正在调用 API...');
            showTypingIndicator(); // 显示正在输入
            
            const { url, key, model } = settingsData.value;
            let completionsUrl = url.endsWith('/') ? url.slice(0, -1) : url;
            completionsUrl += '/chat/completions';
            
            // 构建对话历史
            const recentMessages = state.listenTogetherMessages.slice(-10).map(m => {
                const name = m.type === 'ai' ? (currentContact.name || 'AI') : '用户';
                return `${name}: ${m.message}`;
            }).join('\n');
            
            // 当前歌曲信息
            const currentTrackInfo = state.currentTrack ? 
                `当前播放: 《${state.currentTrack.name}》- ${state.currentTrack.artist}` : 
                '暂无播放';
            
            // 获取歌词文本
            let lyricContext = '暂无歌词';
            if (state.lyrics && state.lyrics.length > 0) {
                 lyricContext = state.lyrics.map(l => l.text).filter(t => t).join('\n');
                 // 简单截断以防过长
                 if (lyricContext.length > 3000) lyricContext = lyricContext.slice(0, 3000) + '...';
            }
            
            const systemPrompt = `你正在"一起听"模式中与用户听歌聊天。

【你的角色设定】
姓名：${currentContact.name || 'AI'}
${currentContact.ai?.persona || '你是一个友好的AI助手'}

【重要规则】
1. **绝对禁止**使用小说、剧本格式（如不要用引号包裹整个句子）。
2. **绝对禁止**动作描写（如不要写 *低头看了看*、(笑了笑) 等内容）。
3. 就像面对面正常聊天一样，口语化，自然一点。
4. 不要复读用户的歌词，要有互动感。
5. **严禁编造歌词**。下文提供了【当前歌曲歌词】，请基于此进行对话。如果歌词是"暂无歌词"，则诚实告知。

【用户设定】
${currentContact.user?.persona || '普通用户'}

【一起听会话】
${currentTrackInfo}
播放列表: ${state.playlist.map(t => t.name).join(', ') || '空'}

【当前歌曲歌词】
${lyricContext}

【对话历史】
${recentMessages}

【核心指令】
1. 如果你想点歌或用户让你点歌，**必须**使用格式：[点歌: 歌曲名]
   错误示例：好的，我给你点首《晴天》
   正确示例：没问题，听听这个 [点歌: 晴天]
2. 当用户明确要求点歌时，你**必须**输出点歌指令。

【要求】
1. 保持你的角色人设，但必须符合【重要规则】。
2. 回复简短自然，不要长篇大论。
3. 围绕音乐、歌曲、心情等话题`;

            const response = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ],
                    temperature: 0.9,
                    max_tokens: 50000 
                })
            });
            
            hideTypingIndicator(); // 隐藏正在输入
            
            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }
            
            const result = await response.json();
            let aiMessage = result.choices?.[0]?.message?.content?.trim();
            
            console.log('[MusicPlayer] AI 原始回复 (Length: ' + (aiMessage?.length || 0) + '):', aiMessage);
            
            if (aiMessage) {
                // 1. 检查并提取点歌指令
                const recommendMatch = aiMessage.match(/\[点歌:\s*(.*?)\]/);
                let songToRecommend = null;
                
                if (recommendMatch) {
                    songToRecommend = recommendMatch[1];
                }
                
                // 2. 格式化消息（处理思维链和指令显示）
                const displayMessage = cleanAIResponse(aiMessage);
                
                // 3. 显示回复
                if (displayMessage) {
                    addChatMessage('ai', displayMessage);
                }
                
                // 4. 执行点歌逻辑
                if (songToRecommend) {
                    searchAndAddSong(songToRecommend);
                }
            } else {
                console.warn('[MusicPlayer] AI 返回内容为空');
            }
            
        } catch (e) {
            hideTypingIndicator();
            console.error('[MusicPlayer] AI对话调用失败:', e);
            fallbackAIResponse(message);
        }
    }
    
    /**
     * 搜索并添加歌曲（供AI使用）
     */
    async function searchAndAddSong(keyword, addedBy = 'ai') {
        if (!keyword) return;
        
        try {
            const aiName = window.currentOpenContact?.name || window.currentOpenContact?.ai?.name || 'TA';
            addChatMessage('system', `${addedBy === 'ai' ? aiName : addedBy} 正在搜索 "${keyword}"...`);
            
            const songs = await NeteaseMusic.searchSongs(keyword);
            
            if (songs && songs.length > 0) {
                const song = songs[0];
                
                // 添加到歌单
                addToPlaylist(song, 'ai');
                
                // ✅ 恢复成功提示
                addChatMessage('system', `${addedBy === 'ai' ? aiName : addedBy} 已添加歌曲 《${song.name}》`);

                // 如果当前没有播放，或者用户只有这一首歌，自动播放
                if (!state.isPlaying && state.playlist.length === 1) {
                    setTimeout(() => MusicPlayer.playAt(0), 1000);
                }
            } else {
                addChatMessage('system', `未找到关于 "${keyword}" 的歌曲`);
            }
        } catch (e) {
            console.error('[MusicPlayer] AI点歌失败:', e);
            addChatMessage('system', '搜索歌曲时出错了');
        }
    }
    
    function endListenTogether() {
        if (!state.listenTogetherActive) return;
        
        state.listenTogetherActive = false;
        
        // 停止沉默检测
        stopSilenceDetection();
        
        // 生成会话总结
        const summary = generateSessionSummary();
        
        // 停止播放并清空当前歌曲状态，确保胶囊不会再次显示（关键修复）
        if (audio) {
            audio.pause();
            audio.src = '';
            audio.currentTime = 0;
        }
        state.currentTrack = null;
        state.isPlaying = false;
        
        // 关闭播放器
        togglePlayerScreen(false);
        if (els.playerScreen) {
            els.playerScreen.classList.remove('listen-together-active');
        }
        if (els.floatingCapsule) {
            els.floatingCapsule.classList.remove('visible');
            els.floatingCapsule.style.display = 'none'; // 强制隐藏
        }
        
        // 更新 UI
        updateTrackInfo();
        
        console.log('[MusicPlayer] 一起听会话结束', summary);
        
        // 返回总结数据
        return summary;
    }
    
    /**
     * 生成会话总结
     */
    function generateSessionSummary() {
        return {
            duration: 0, // TODO: 实际计算时长
            songsPlayed: state.playlist.length,
            favoriteSong: state.playlist[0]?.name || '无',
            chatHighlights: state.listenTogetherMessages.slice(0, 3)
        };
    }
    
    /**
     * 添加聊天消息
     */
    function addChatMessage(type, message) {
        state.listenTogetherMessages.push({ type, message, time: Date.now() });
        
        // 获取角色名字（从当前打开的联系人获取）
        let senderName = '';
        if (type === 'ai') {
            senderName = window.currentOpenContact?.name || window.currentOpenContact?.ai?.name || 'AI';
        } else if (type === 'user') {
            senderName = window.currentOpenContact?.user?.name || '你';
        } else if (type === 'system') {
            senderName = '';
        }
        
        if (els.miniChatList) {
            const msgEl = document.createElement('div');
            msgEl.className = 'music-mini-msg';
            
            if (type === 'system') {
                msgEl.innerHTML = `<div style="opacity:0.5;font-size:12px;">${message}</div>`;
            } else {
                msgEl.innerHTML = `
                    <div class="music-msg-name">${senderName}:</div>
                    <div>${message}</div>
                `;
            }
            els.miniChatList.appendChild(msgEl);
            els.miniChatList.scrollTop = els.miniChatList.scrollHeight;
        }
    }
    
    
    /**
     * 构建一起听的音乐上下文（供AI参考）
     */
    function buildMusicContext() {
        return {
            isListeningTogether: true,
            currentTrack: state.currentTrack ? {
                name: state.currentTrack.name,
                artist: state.currentTrack.artist,
                album: state.currentTrack.album
            } : null,
            playlistLength: state.playlist.length,
            isPlaying: state.isPlaying,
            recentMessages: state.listenTogetherMessages.slice(-5).map(m => `${m.type}: ${m.message}`),
            sessionStartTime: state.sessionStartTime
        };
    }
    
    /**
     * 本地模拟AI回复（当主AI不可用时）
     */
    function fallbackAIResponse(userMessage) {
        const track = state.currentTrack;
        const trackName = track ? track.name : '这首歌';
        
        // 根据用户消息内容智能匹配回复
        let responses = [];
        const lowerMsg = userMessage.toLowerCase();
        
        if (lowerMsg.includes('喜欢') || lowerMsg.includes('好听')) {
            responses = [
                `我也觉得《${trackName}》超级好听！`,
                '是的呢，这首歌的旋律很美~',
                '我们的品味真像！'
            ];
        } else if (lowerMsg.includes('换') || lowerMsg.includes('下一首')) {
            responses = [
                '好的，要不我们听听别的？你想听什么风格的？',
                '换一首也行，你来点歌吧！',
                '没问题，你想听什么？'
            ];
        } else if (lowerMsg.includes('歌词') || lowerMsg.includes('意思')) {
            responses = [
                '这首歌的歌词确实很有意境...',
                '每次听都有不同的感受呢',
                '歌词写得真走心'
            ];
        } else if (lowerMsg.includes('心情') || lowerMsg.includes('感觉')) {
            responses = [
                '和你一起听歌让我很开心~',
                '这首歌让我感到很放松',
                '音乐真的能影响心情呢'
            ];
        } else {
            responses = [
                '嗯嗯~',
                '这首歌真的很棒',
                '我也这么觉得！',
                '继续听下去吧~',
                '你说得对呢'
            ];
        }
        
        setTimeout(() => {
            addChatMessage('ai', responses[Math.floor(Math.random() * responses.length)]);
        }, 800 + Math.random() * 1500);
    }
    
    /**
     * AI实时反馈系统（歌曲事件触发）
     * 调用真实API获取AI的实时反馈
     */
    async function triggerAIFeedback(eventType, data = {}) {
        if (!state.listenTogetherActive) return;
        
        const currentContact = window.currentOpenContact;
        if (!currentContact) {
            triggerFallbackFeedback(eventType, data);
            return;
        }
        
        // 构建事件提示
        let eventDescription = '';
        switch (eventType) {
            case 'track_start':
                eventDescription = `用户开始播放歌曲《${data.track?.name || '未知'}》- ${data.track?.artist || '未知歌手'}`;
                break;
            case 'track_chorus':
                eventDescription = `歌曲《${data.track?.name || '未知'}》正在播放高潮部分`;
                break;
            case 'user_skip':
                eventDescription = `用户跳过了歌曲《${data.track?.name || '未知'}》`;
                break;
            case 'long_silence':
                eventDescription = `你和用户一起听歌已经一段时间没有说话了`;
                break;
            default:
                return;
        }
        
        try {
            // 从 dbHelper 获取 API 配置
            const settingsData = await window.dbHelper?.loadData('settingsStore', 'apiSettings');
            if (!settingsData?.value?.url) {
                triggerFallbackFeedback(eventType, data);
                return;
            }
            
            const { url, key, model } = settingsData.value;
            let completionsUrl = url.endsWith('/') ? url.slice(0, -1) : url;
            completionsUrl += '/chat/completions';
            
            // 构建一起听对话历史
            const recentMessages = state.listenTogetherMessages.slice(-10).map(m => {
                const name = m.type === 'ai' ? (currentContact.name || 'AI') : '用户';
                return `${name}: ${m.message}`;
            }).join('\n');
            
            // 构建当前歌曲信息
            const currentTrackInfo = state.currentTrack ? 
                `当前播放: 《${state.currentTrack.name}》- ${state.currentTrack.artist}` : 
                '暂无播放';
            
            // 构建播放列表信息
            const playlistInfo = state.playlist.length > 0 ?
                `播放列表(${state.playlist.length}首): ${state.playlist.map(t => t.name).join(', ')}` :
                '播放列表为空';
            
            // 构建 System Prompt
            const systemPrompt = `你正在与用户一起听歌。

【你的角色设定】
姓名：${currentContact.name || 'AI'}
${currentContact.ai?.persona || '你是一个友好的AI助手，喜欢分享音乐感受'}

【用户设定】
${currentContact.user?.persona || '普通用户'}

【一起听会话信息】
${currentTrackInfo}
${playlistInfo}
播放状态: ${state.isPlaying ? '正在播放' : '暂停中'}

【对话历史】
${recentMessages || '暂无对话'}

【当前事件】
${eventDescription}

【要求】
1. 用符合你角色人设的语气回复
2. 回复要简短（1-2句话，不超过20个字）
3. 严禁像报幕员一样只说"xx开始了"，必须对歌曲风格、歌手或听歌感受进行点评
4. 保持自然和亲切的对话风格
5. 话语不需要用引号包裹，是正常的对话，所以也不要动作描述，是第一人称的发言！！！`;

            const response = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `(事件: ${eventDescription}) 请根据当前情况说一句话，不要报幕。` }
                    ],
                    temperature: 0.9,
                    max_tokens: 100
                })
            });
            
            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }
            
            const result = await response.json();
            let aiMessage = result.choices?.[0]?.message?.content?.trim();
            
            if (aiMessage) {
                // 清洗消息（移除思维链）
                aiMessage = cleanAIResponse(aiMessage);
                if (aiMessage) {
                    addChatMessage('ai', aiMessage);
                    console.log('[MusicPlayer] AI反馈:', aiMessage);
                }
            }
            
        } catch (e) {
            console.warn('[MusicPlayer] AI反馈API调用失败:', e);
            triggerFallbackFeedback(eventType, data);
        }
    }
    
    /**
     * 预设的AI反馈（降级方案）
     */
    function triggerFallbackFeedback(eventType, data) {
        const trackName = data.track?.name || '这首歌';
        let responses = [];
        let isSystemMsg = false;
        
        switch (eventType) {
            case 'track_start':
                // 改为系统提示，避免AI机械报幕
                addChatMessage('system', `正在播放 《${trackName}》`);
                return; 
            case 'track_chorus':
                responses = [
                    '这段副歌太好听了！',
                    '🎵',
                    '这个旋律我超喜欢'
                ];
                break;
            case 'user_skip':
                // 跳过歌曲也可以用系统提示，或者简单的AI反应
                addChatMessage('system', `已跳过 《${trackName}》`);
                return;
            case 'long_silence':
                responses = [
                    '这首歌挺特别的，你觉得呢？',
                    '好好听的旋律~',
                    '你平时喜欢听这种风格的歌吗？'
                ];
                break;
        }
        
        if (responses.length > 0) {
            setTimeout(() => {
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                addChatMessage('ai', randomResponse);
            }, 1000 + Math.random() * 2000);
        }
    }
    
    /**
     * 通知AI歌单变化
     */
    function notifyAIPlaylistChange(action, track) {
        if (action === 'add') {
            triggerFallbackFeedback('track_start', { track });
        }
    }
    
    /**
     * 开启长时间沉默检测
     */
    let silenceTimer = null;
    function startSilenceDetection() {
        clearInterval(silenceTimer);
        silenceTimer = setInterval(() => {
            if (!state.listenTogetherActive) return;
            
            // 检查最后一条消息的时间
            const lastMsg = state.listenTogetherMessages[state.listenTogetherMessages.length - 1];
            if (lastMsg && Date.now() - lastMsg.time > 60000) { // 60秒无消息
                triggerAIFeedback('long_silence', { track: state.currentTrack });
            }
        }, 30000); // 每30秒检查一次
    }
    
    function stopSilenceDetection() {
        clearInterval(silenceTimer);
        silenceTimer = null;
    }

    // =============== 工具函数 ===============
    
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    
    function showToast(message) {
        // 使用全局的toast函数（如果存在）
        if (window.showToast) {
            window.showToast(message);
        } else {
            console.log('[MusicPlayer]', message);
        }
    }

    // =============== 导出 ===============
    
    return {
        // 初始化
        init,
        
        // 播放控制
        play,
        togglePlay,
        playPrev,
        playNext,
        playAt,
        
        // 歌单管理
        addToPlaylist,
        removeFromPlaylist,
        addAndPlay,
        
        // 界面控制
        togglePlayerScreen,
        toggleSheet,
        minimize,
        toggleLyricView,
        
        // 一起听
        startListenTogether,
        endListenTogether,
        sendChatMessage,
        
        // 状态访问
        getState: () => ({ ...state }),
        getCurrentTrack: () => state.currentTrack,
        isPlaying: () => state.isPlaying
    };
})();

// 挂载到全局
window.MusicPlayer = MusicPlayer;

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保DOM已就绪
    setTimeout(() => MusicPlayer.init(), 100);
});
