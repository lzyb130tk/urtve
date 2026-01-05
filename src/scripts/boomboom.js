/**
 * ============================================
 * 心跳信号 (Boomboom) - CHAR手机界面 JavaScript
 * 功能：查看CHAR的手机内容，包括状态、记忆、消费、心跳信号、聊天记录等
 * ============================================
 */

(function() {
    'use strict';

    // ============ 常量定义 ============
    const BOOMBOOM_EASTER_KEY = 'boomboom_pending_prompt'; // 彩蛋注入Key
    const EASTER_EGG_PROBABILITY = 0.20; // 20%触发概率

    // ============ 缓存数据 ============
    let cachedPhoneData = null;
    let isLoading = false;

    // ============ XML 标签定义 ============
    const XML_TAGS = {
        STATUS: 'phone_status',
        MEMORIES: 'retina_memories',
        URGENT_MEMO: 'urgent_memo',
        RECEIPTS: 'wallet_receipts',
        HEARTBEAT: 'heartbeat_thoughts',
        CHATS: 'secure_chats',
        SEARCHES: 'recent_searches'
    };

    // ============ 工具函数 ============

    /**
     * 获取当前时间的格式化字符串
     */
    function getCurrentTimeStr() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * 获取当前联系人ID
     */
    function getCurrentContactId() {
        if (window.currentOpenContact && window.currentOpenContact.id) {
            return window.currentOpenContact.id;
        }
        return null;
    }

    /**
     * 显示错误提示
     */
    function showError(message) {
        let toast = document.getElementById('bb-error-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'bb-error-toast';
            toast.className = 'bb-error-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /**
     * 显示/隐藏加载界面
     */
    function toggleLoading(show) {
        const loadingOverlay = document.getElementById('bb-loading-overlay');
        if (loadingOverlay) {
            if (show) {
                loadingOverlay.classList.add('active');
            } else {
                loadingOverlay.classList.remove('active');
            }
        }
    }

    // ============ 数据获取 ============

    /**
     * 获取最近N条聊天记录
     */
    function getChatHistory(count = 50) {
        const contact = window.currentOpenContact;
        if (!contact || !contact.history) return [];
        return contact.history.slice(-count);
    }

    /**
     * 获取世界书内容
     */
    async function getWorldBookContent() {
        try {
            const contact = window.currentOpenContact;
            if (!contact) return '';

            const worldbookData = await window.dbHelper.loadData('worldBooks', 'allWorldBooks');
            const allBooks = (worldbookData && Array.isArray(worldbookData.value)) ? worldbookData.value : [];
            
            if (contact.linkedWorldBookIds && contact.linkedWorldBookIds.length > 0) {
                const linkedBooks = allBooks.filter(b => contact.linkedWorldBookIds.includes(b.id));
                return linkedBooks.map(b => b.content).join('\n\n');
            }
            return '';
        } catch (e) {
            console.error('[Boomboom] 加载世界书失败:', e);
            return '';
        }
    }

    /**
     * 获取人设信息
     */
    function getPersonaInfo() {
        const contact = window.currentOpenContact;
        if (!contact) return { ai: {}, user: {} };
        
        return {
            ai: {
                name: contact.ai?.name || 'AI',
                persona: contact.ai?.persona || ''
            },
            user: {
                name: contact.user?.name || '用户',
                persona: contact.user?.persona || ''
            }
        };
    }

    // ============ API 调用 ============

    /**
     * 构建发送给AI的Prompt
     */
    async function buildPrompt() {
        const contact = window.currentOpenContact;
        if (!contact) throw new Error('没有打开的联系人');

        const persona = getPersonaInfo();
        const worldBook = await getWorldBookContent();
        const chatHistory = getChatHistory(50);
        
        // 格式化聊天记录
        const formattedHistory = chatHistory.map(msg => {
            if (msg.sender === 'ai') {
                return `${persona.ai.name}: ${msg.text || msg.transcript || '[媒体消息]'}`;
            } else if (msg.sender === 'user') {
                return `${persona.user.name}: ${msg.text || msg.transcript || '[媒体消息]'}`;
            }
            return '';
        }).filter(Boolean).join('\n');

        const currentTime = getCurrentTimeStr();
        const currentDate = new Date().toLocaleDateString('zh-CN');

        return `你现在需要扮演一个角色，生成该角色的"私人手机"内容。用户正在"偷看"你的手机。

【你的角色设定】
姓名：${persona.ai.name}
人设：${persona.ai.persona || '一个有深度的角色'}

【用户设定】
姓名：${persona.user.name}
人设：${persona.user.persona || ''}

${worldBook ? '【世界观/背景】\n' + worldBook + '\n' : ''}

【最近的聊天记录】
${formattedHistory || '暂无'}

---

【输出要求】
请严格按照以下XML格式输出手机内容，不要输出任何其他格式的内容：

<${XML_TAGS.STATUS}>
生成3行状态监控信息，要符合角色设定，可以包含：
- 对用户的监控/关心记录
- 心情分析
- 待办事项提醒
每行以 > 开头
</${XML_TAGS.STATUS}>

<${XML_TAGS.MEMORIES}>
生成3条"视网膜记忆"，是角色今天关注/记录的事件，JSON数组格式：
[{"time":"时:分 AM/PM","title":"标题","desc":"简短描述"}]
</${XML_TAGS.MEMORIES}>

<${XML_TAGS.URGENT_MEMO}>
生成一条紧急备忘，是角色内心深处关于用户的想法或计划，要隐秘且深情
</${XML_TAGS.URGENT_MEMO}>

<${XML_TAGS.RECEIPTS}>
生成3-4条消费记录，JSON数组格式，要符合角色身份，可以有SECRET标签：
[{"store":"商店名","amount":"金额","items":[{"name":"物品","qty":1}],"note":"备注","tag":"SECRET/HIDDEN/无"}]
</${XML_TAGS.RECEIPTS}>

<${XML_TAGS.HEARTBEAT}>
生成4条"心跳信号"，是角色对用户**最隐秘、最真实的情感渴望**，JSON数组格式：
[{"mood":"DESIRE/RESTRAINED/GRIEF/FUTURE","moodLabel":"情绪标签","color":"#颜色","bgText":"英文背景大字","content":"内心独白内容"}]

【重要提示】这是角色内心最深处的独白，可以包含：
- 对用户的**亲密渴望**（亲吻、拥抱、肌肤之亲等）
- 带有**欲望色彩**的想法（只要不违法，可以露骨一些）
- 角色真实的**占有欲、嫉妒、保护欲**
- 对未来亲密关系的**期待和幻想**
请大胆表达，这是角色的私人日记，没有人会看到。情侣之间的亲密想法是正常的！
</${XML_TAGS.HEARTBEAT}>

<${XML_TAGS.CHATS}>
生成**3个**聊天对话，JSON数组格式，每个对话包含**3-5条消息**：
[{"id":"唯一ID","initial":"首字母/符号","name":"联系人名","preview":"最后一条消息预览","time":"时间","messages":[{"side":"left/right","text":"消息内容"}]}]

**强制要求**：
1. 必须有3个联系人
2. 每个联系人必须有3-5条 messages
3. 其中**必须有一个**是关于${persona.user.name}的，且：
   - preview 显示为 "[草稿] xxx"
   - messages 中必须**包含这条草稿内容**作为最后一条 right 消息
   - 草稿内容可以是写了又删、欲言又止的甜蜜话语
4. 消息内容要符合角色性格，可以有各种内容
</${XML_TAGS.CHATS}>

<${XML_TAGS.SEARCHES}>
生成3条搜索历史，JSON数组格式：
[{"query":"搜索内容","source":"来源","icon":"arrow-up-right/lock/其他","locked":false}]
</${XML_TAGS.SEARCHES}>

---
当前时间：${currentTime}
当前日期：${currentDate}
请确保所有内容都符合角色设定，展现角色对用户深藏的情感。`;
    }

    /**
     * 调用AI API获取手机内容
     */
    async function fetchPhoneContent() {
        if (isLoading) return null;
        
        isLoading = true;
        toggleLoading(true);

        try {
            // 获取 API 配置
            const settingsData = await window.dbHelper.loadData('settingsStore', 'apiSettings');
            if (!settingsData || !settingsData.value || !settingsData.value.url) {
                throw new Error('API 未配置');
            }

            const { url, key, model } = settingsData.value;
            let completionsUrl = url.endsWith('/') ? url.slice(0, -1) : url;
            completionsUrl += '/chat/completions';

            const prompt = await buildPrompt();

            const response = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: '生成我的手机内容。' }
                    ],
                    temperature: 0.9,
                    max_tokens: 3000
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const responseData = await response.json();
            const content = responseData.choices[0].message.content;

            // 解析XML内容
            const phoneData = parseXMLContent(content);
            cachedPhoneData = phoneData;

            // 触发彩蛋检测
            checkEasterEgg(phoneData);

            return phoneData;

        } catch (error) {
            console.error('[Boomboom] 获取手机内容失败:', error);
            showError('手机解锁失败，请重试');
            return null;
        } finally {
            isLoading = false;
            toggleLoading(false);
        }
    }

    // ============ XML 解析 ============

    /**
     * 使用正则表达式解析XML内容
     */
    function parseXMLContent(content) {
        const result = {};

        for (const [key, tag] of Object.entries(XML_TAGS)) {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
            const match = content.match(regex);
            if (match && match[1]) {
                let value = match[1].trim();
                
                // 尝试解析JSON
                if (value.startsWith('[') || value.startsWith('{')) {
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        // 保持原始字符串
                        console.warn(`[Boomboom] JSON解析失败 for ${tag}:`, e);
                    }
                }
                
                result[key] = value;
            }
        }

        return result;
    }

    // ============ 彩蛋机制 ============

    /**
     * 20%概率触发彩蛋
     */
    function checkEasterEgg(phoneData) {
        // [BugFix] 使用当前联系人ID作为Key的一部分，防止跨角色污染 (A的彩蛋在B那里触发)
        const contactId = getCurrentContactId();
        if (!contactId) return;
        
        const storageKey = `${BOOMBOOM_EASTER_KEY}_${contactId}`;

        // 检查是否已有待处理的彩蛋
        if (localStorage.getItem(storageKey)) {
            console.log(`[Boomboom] 联系人(${contactId})已有待处理的彩蛋，跳过`);
            return;
        }

        // 20%概率触发
        if (Math.random() > EASTER_EGG_PROBABILITY) {
            console.log('[Boomboom] 彩蛋未触发');
            return;
        }

        console.log('[Boomboom] 🎉 彩蛋触发！');

        // 组装彩蛋内容
        const persona = getPersonaInfo();
        let phoneContentSummary = '';

        // 提取部分手机内容作为摘要
        if (phoneData.URGENT_MEMO) {
            phoneContentSummary += `[紧急备忘] ${phoneData.URGENT_MEMO}\n`;
        }
        if (phoneData.HEARTBEAT && Array.isArray(phoneData.HEARTBEAT) && phoneData.HEARTBEAT.length > 0) {
            const randomThought = phoneData.HEARTBEAT[Math.floor(Math.random() * phoneData.HEARTBEAT.length)];
            phoneContentSummary += `[内心独白] ${randomThought.content || randomThought}\n`;
        }
        if (phoneData.RECEIPTS && Array.isArray(phoneData.RECEIPTS) && phoneData.RECEIPTS.length > 0) {
            const secretReceipt = phoneData.RECEIPTS.find(r => r.tag === 'SECRET' || r.tag === 'HIDDEN');
            if (secretReceipt) {
                phoneContentSummary += `[隐秘消费] ${secretReceipt.store}: ${secretReceipt.amount}\n`;
            }
        }

        // 存入 localStorage (带ID)
        const injectionText = `[系统提示：${persona.user.name}刚刚偷偷查看了你的手机！手机上显示的内容包括：\n${phoneContentSummary}\n请在接下来的回复中，根据你的性格自然地做出反应——可以是尴尬、害羞、生气、或者故作镇定。这是一次性的提示，仅在下次回复时生效。]`;
        
        localStorage.setItem(storageKey, injectionText);
        console.log('[Boomboom] 彩蛋内容已存储:', injectionText);
    }

    // ============ DOM 渲染 ============

    /**
     * 更新状态区域
     */
    function renderStatus(data) {
        const container = document.getElementById('bb-status-content');
        if (!container || !data) return;

        if (typeof data === 'string') {
            container.innerHTML = data.split('\n').map(line => 
                line.trim() ? `${line}<br>` : ''
            ).join('');
        } else {
            container.innerHTML = '> 数据加载中...';
        }
    }

    /**
     * 更新视网膜记忆区域
     */
    function renderMemories(data) {
        const container = document.getElementById('bb-retina-container');
        if (!container) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="bb-retina-item"><div class="bb-retina-overlay"><div class="bb-retina-desc">暂无记忆</div></div></div>';
            return;
        }

        container.innerHTML = data.map((item, index) => `
            <div class="bb-retina-item" onclick="Boomboom.showToast('正在调取记忆...')">
                <div class="bb-retina-bg" style="background: linear-gradient(${135 + index * 30}deg, #333 0%, #111 100%)"></div>
                <div class="bb-retina-overlay">
                    <div class="bb-retina-time">${item.time || ''}</div>
                    <div class="bb-retina-desc">${item.title || ''}<br>${item.desc || ''}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 更新紧急备忘
     */
    function renderUrgentMemo(data) {
        const container = document.getElementById('bb-urgent-memo');
        if (!container) return;

        container.innerHTML = typeof data === 'string' ? data : '暂无备忘';
    }

    /**
     * 更新消费记录
     */
    function renderReceipts(data) {
        const container = document.getElementById('bb-receipt-list');
        if (!container) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="bb-receipt-card"><div class="bb-receipt-header">暂无消费记录</div></div>';
            return;
        }

        container.innerHTML = data.map(receipt => {
            const tagHtml = receipt.tag && receipt.tag !== '无' 
                ? `<div class="bb-receipt-tag">${receipt.tag}</div>` 
                : '';
            
            const itemsHtml = (receipt.items || []).map(item => `
                <div class="bb-receipt-row">
                    <span>ITEM: ${item.name}</span>
                    <span>QTY: ${item.qty || 1}</span>
                </div>
            `).join('');

            return `
                <div class="bb-receipt-card ${receipt.tag ? 'type-' + receipt.tag.toLowerCase() : ''}">
                    ${tagHtml}
                    <div class="bb-receipt-header">
                        <span>${receipt.store || '未知商店'}</span>
                        <span>${receipt.amount || ''}</span>
                    </div>
                    ${itemsHtml}
                    ${receipt.note ? `<div class="bb-receipt-note">备注：${receipt.note}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * 更新心跳信号
     */
    function renderHeartbeat(data) {
        const container = document.getElementById('bb-heartbeat-list');
        if (!container) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="bb-mood-card"><div class="bb-mood-content">暂无心跳信号</div></div>';
            return;
        }

        container.innerHTML = data.map(thought => `
            <div class="bb-mood-card" style="border-color: ${thought.color || '#555'};">
                <div class="bb-mood-bg-text">${thought.bgText || thought.mood || ''}</div>
                <div style="color: ${thought.color || '#999'}; font-size: 12px; margin-bottom: 10px; font-family: var(--bb-font-mono);">MOOD: ${thought.moodLabel || thought.mood || 'UNKNOWN'}</div>
                <div class="bb-mood-content">
                    "${thought.content || ''}"
                </div>
            </div>
        `).join('');
    }

    /**
     * 更新搜索历史
     */
    function renderSearches(data) {
        const container = document.getElementById('bb-search-list');
        if (!container) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="bb-void-card">暂无搜索记录</div>';
            return;
        }

        container.innerHTML = data.map(search => `
            <div class="bb-void-card" onclick="Boomboom.showToast('正在检索...')">
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-size:15px; font-weight:bold;">${search.query || ''}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${search.locked ? '#8e44ad' : '#555'}" stroke-width="2">
                        ${search.locked 
                            ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
                            : '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>'}
                    </svg>
                </div>
                <div style="font-size:12px; color:${search.locked ? '#8e44ad' : '#666'}; margin-top:6px;">
                    ${search.locked ? '[Privileged Access Required]' : `Source: ${search.source || '未知'}`}
                </div>
            </div>
        `).join('');
    }

    /**
     * 更新聊天列表
     */
    function renderChats(data) {
        const container = document.getElementById('bb-chat-list');
        if (!container) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="bb-chat-row"><div class="bb-chat-body"><div class="bb-chat-name">暂无聊天</div></div></div>';
            return;
        }

        // 存储聊天数据供后续使用
        window._bbChatData = {};
        data.forEach(chat => {
            window._bbChatData[chat.id] = chat;
        });

        container.innerHTML = data.map(chat => `
            <div class="bb-chat-row" onclick="Boomboom.openChat('${chat.id}')">
                <div class="bb-chat-initial">${chat.initial || chat.name?.charAt(0) || '?'}</div>
                <div class="bb-chat-body">
                    <div class="bb-chat-name">${chat.name || '未知'}</div>
                    <div class="bb-chat-preview" ${chat.preview?.includes('[草稿]') ? 'style="color: var(--bb-accent-mystic);"' : ''}>${chat.preview || ''}</div>
                </div>
                <div style="font-size: 10px; color: #555;">${chat.time || ''}</div>
            </div>
        `).join('');
    }

    /**
     * 渲染所有内容
     */
    function renderAllContent(data) {
        if (!data) return;

        renderStatus(data.STATUS);
        renderMemories(data.MEMORIES);
        renderUrgentMemo(data.URGENT_MEMO);
        renderReceipts(data.RECEIPTS);
        renderHeartbeat(data.HEARTBEAT);
        renderSearches(data.SEARCHES);
        renderChats(data.CHATS);

        // 更新时间显示
        const dateEl = document.getElementById('bb-hero-date');
        if (dateEl) {
            const persona = getPersonaInfo();
            dateEl.textContent = `${persona.ai.name}'s Phone // ${getCurrentTimeStr()}`;
        }
    }

    // ============ 界面控制 ============

    /**
     * 切换视图
     */
    function switchView(viewId, title, navElement) {
        const pageTitle = document.getElementById('bb-page-title');
        if (pageTitle) pageTitle.textContent = title;

        document.querySelectorAll('.bb-nav-icon').forEach(btn => btn.classList.remove('active'));
        if (navElement) navElement.classList.add('active');

        document.querySelectorAll('.bb-view-section').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById('bb-view-' + viewId);
        if (targetView) targetView.classList.add('active');
    }

    /**
     * 过滤消费记录
     */
    function filterReceipts(type, tabElement) {
        document.querySelectorAll('.bb-tab-item').forEach(t => t.classList.remove('active'));
        if (tabElement) tabElement.classList.add('active');

        const items = document.querySelectorAll('.bb-receipt-card');
        items.forEach(item => {
            if (type === 'all' || item.classList.contains('type-' + type)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * 打开Overlay
     */
    function openOverlay(id) {
        const overlay = document.getElementById('bb-overlay-' + id);
        if (overlay) overlay.classList.add('active');
    }

    /**
     * 关闭Overlay
     */
    function closeOverlay(id) {
        const overlay = document.getElementById('bb-overlay-' + id);
        if (overlay) overlay.classList.remove('active');
    }

    /**
     * 打开聊天详情
     */
    function openChat(chatId) {
        const chatData = window._bbChatData?.[chatId];
        if (!chatData) return;

        const titleEl = document.getElementById('bb-chat-title');
        const containerEl = document.getElementById('bb-chat-container');

        if (titleEl) titleEl.textContent = chatData.name || 'Chat';
        
        if (containerEl && chatData.messages) {
            containerEl.innerHTML = chatData.messages.map(msg => `
                <div class="bb-bubble ${msg.side}">${msg.text || ''}</div>
            `).join('');
        }

        openOverlay('chat');
    }

    /**
     * 显示Toast提示
     */
    function showToast(text) {
        // 简单的alert提示，可以替换为更优雅的toast
        console.log('[Boomboom] Toast:', text);
    }

    // ============ 主界面控制 ============

    /**
     * 打开Boomboom界面
     */
    async function openBoomboomScreen() {
        const screen = document.getElementById('boomboom-screen');
        if (!screen) return;

        screen.classList.add('active');
        
        // 重置到首页
        switchView('home', 'Dashboard', document.querySelector('.bb-nav-icon'));

        // 获取并渲染数据
        const data = await fetchPhoneContent();
        if (data) {
            renderAllContent(data);
        }
    }

    /**
     * 关闭Boomboom界面
     */
    function closeBoomboomScreen() {
        const screen = document.getElementById('boomboom-screen');
        if (screen) {
            screen.classList.remove('active');
        }
        // 关闭所有overlay
        closeOverlay('heartbeat');
        closeOverlay('chat');
    }

    // ============ 初始化事件绑定 ============

    function initBoomboomEvents() {
        // 返回按钮
        const backBtn = document.getElementById('bb-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', closeBoomboomScreen);
        }

        // 导航按钮
        document.querySelectorAll('.bb-nav-icon').forEach(nav => {
            nav.addEventListener('click', function() {
                const view = this.dataset.view;
                const title = this.dataset.title;
                if (view && title) {
                    switchView(view, title, this);
                }
            });
        });

        // 心跳触发器
        const heartbeatTrigger = document.getElementById('bb-heartbeat-trigger');
        if (heartbeatTrigger) {
            heartbeatTrigger.addEventListener('click', () => openOverlay('heartbeat'));
        }

        // Overlay关闭按钮
        document.querySelectorAll('.bb-overlay-close').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation(); // 阻止事件冒泡
                e.preventDefault();
                const overlay = this.closest('.bb-overlay');
                if (overlay) overlay.classList.remove('active');
            });
        });

        // Tab过滤
        document.querySelectorAll('.bb-tab-item').forEach(tab => {
            tab.addEventListener('click', function() {
                const type = this.dataset.type;
                if (type) filterReceipts(type, this);
            });
        });
    }

    // ============ 暴露全局接口 ============
    window.openBoomboomScreen = openBoomboomScreen;
    window.closeBoomboomScreen = closeBoomboomScreen;
    
    window.Boomboom = {
        open: openBoomboomScreen,
        close: closeBoomboomScreen,
        switchView: switchView,
        filterReceipts: filterReceipts,
        openOverlay: openOverlay,
        closeOverlay: closeOverlay,
        openChat: openChat,
        showToast: showToast,
        refresh: async function() {
            const data = await fetchPhoneContent();
            if (data) renderAllContent(data);
        }
    };

    // ============ DOM Ready 初始化 ============
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBoomboomEvents);
    } else {
        initBoomboomEvents();
    }

})();
