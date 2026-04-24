// ============================================
//  远程字卡模块 (YY_RemoteCards) v2
//  - 远程JSON加载字卡
//  - 15%概率蹦emoji
//  - 回信：日常句为主 + 偶尔神谕句，3-5句
//  - 回信翻牌：2张塔罗（预定/点击随机两种模式）
//  - 塔罗牌带图片，点击切换释义
//  - 牌面保存在信件中
//  - 每日寄语从神谕池抽一句
//  - 每日心情/状态随机
// ============================================

(function() {
    'use strict';

    // ★★★ 把这个URL改成你的字卡JSON部署地址 ★★★
    const CARDS_URL = 'https://rolljuvia.github.io/zika-345678i9o0p1e4dwqaushnji92081/cards.json';

    const EMOJI_CHANCE = 0.15;

    let remoteCards = null;

    // ========== 加载远程字卡 ==========
    async function loadRemoteCards() {
        if (!CARDS_URL) return false;
        try {
            const resp = await fetch(CARDS_URL, { cache: 'no-cache' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            remoteCards = await resp.json();

            // 用远程字卡覆盖本地
            if (remoteCards.chat) {
                customReplies.length = 0;
                customReplies.push(...remoteCards.chat);
                window._customReplies = customReplies;
            }

            // 加载分组到原版 customReplyGroups
            if (remoteCards.chat_groups) {
                const groups = [];
                const allGroupItems = [];
                for (const [groupName, items] of Object.entries(remoteCards.chat_groups)) {
                    groups.push({ name: groupName, items: items, disabled: false });
                    allGroupItems.push(...items);
                }
                window.customReplyGroups = groups;
                // 分组里的字卡也要在总池里，否则原版过滤逻辑会跳过它们
                const existingSet = new Set(customReplies);
                allGroupItems.forEach(item => {
                    if (!existingSet.has(item)) {
                        customReplies.push(item);
                        existingSet.add(item);
                    }
                });
                window._customReplies = customReplies;
            }

            if (remoteCards.emoji) window._remoteEmojis = remoteCards.emoji;
            if (remoteCards.statuses) window._remoteStatuses = remoteCards.statuses;
            if (remoteCards.moods) window._remoteMoods = remoteCards.moods;
            if (remoteCards.oracle_motto) window._remoteMottos = remoteCards.oracle_motto;

            // 拍一拍
            if (remoteCards.pokes && typeof customPokes !== 'undefined') {
                customPokes.length = 0;
                customPokes.push(...remoteCards.pokes);
            }

            // 状态（公告页用）
            if (remoteCards.statuses && typeof customStatuses !== 'undefined') {
                customStatuses.length = 0;
                customStatuses.push(...remoteCards.statuses);
            }

            // 每日寄语（从神谕池）
            if (remoteCards.oracle_motto && typeof customMottos !== 'undefined') {
                customMottos.length = 0;
                customMottos.push(...remoteCards.oracle_motto);
            }

            console.log('[RemoteCards] 加载成功');
            return true;
        } catch (e) {
            console.warn('[RemoteCards] 加载失败:', e);
            return false;
        }
    }

    // ========== emoji ==========
    function getRandomEmoji() {
        const pool = window._remoteEmojis || ["❤️","😊","✨","🌙","💕","😴","🥺","💫"];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ========== 回信生成：日常为主 + 偶尔神谕 ==========
    function generateLetterReply() {
        if (!remoteCards || !remoteCards.letter) return null;
        const daily = remoteCards.letter.daily || [];
        const oracle = remoteCards.letter.oracle || [];
        if (daily.length === 0) return null;

        const count = 1 + Math.floor(Math.random() * 3); // 1-3句
        const sentences = [];
        const used = new Set();
        let oracleUsed = false;

        for (let i = 0; i < count; i++) {
            // 神谕最多出1句，概率25%，不在第一句和最后一句
            const useOracle = !oracleUsed && oracle.length > 0 && i > 0 && i < count - 1 && Math.random() < 0.25;
            const pool = useOracle ? oracle : daily;

            let text;
            let attempts = 0;
            do {
                text = pool[Math.floor(Math.random() * pool.length)];
                attempts++;
            } while (used.has(text) && attempts < 10);

            if (useOracle) oracleUsed = true;
            used.add(text);
            sentences.push(text);
        }

        return sentences.join('。') + '。';
    }

    // ========== 塔罗翻牌 UI ==========
    function createCardFlipUI(container, onComplete, preCards) {
        const tarotCards = (typeof ALL_78_TAROT_CARDS !== 'undefined') ? ALL_78_TAROT_CARDS :
                          (window._CONSTANTS && window._CONSTANTS.TAROT_CARDS) || [];
        if (tarotCards.length === 0) { if (onComplete) onComplete(); return; }

        const isPreSelected = preCards && preCards.tarot && preCards.tarot.length > 0;
        const cardCount = 2;

        // 牌阵标签
        const labels = ['他看到信时的感受', '他想对你说的'];

        const flipContainer = document.createElement('div');
        flipContainer.className = 'yy-card-flip-container';
        flipContainer.innerHTML = `
            <div class="yy-flip-title">✦ 来自远方的回音 ✦</div>
            <div class="yy-flip-subtitle">${isPreSelected ? '翻开牌面，揭示信中的讯息' : '翻开牌面，感受此刻的连接'}</div>
            <div class="yy-flip-cards"></div>
            <div class="yy-flip-done" style="display:none;">
                <button class="yy-flip-done-btn">${isPreSelected ? '返回信件' : '关闭'}</button>
            </div>
        `;

        const cardsArea = flipContainer.querySelector('.yy-flip-cards');
        const doneArea = flipContainer.querySelector('.yy-flip-done');
        let flippedCount = 0;
        const usedIndices = new Set();

        for (let idx = 0; idx < cardCount; idx++) {
            const cardEl = document.createElement('div');
            cardEl.className = 'yy-flip-card';
            // 状态：0=背面, 1=显示图片, 2=显示释义
            let state = 0;
            let cardData = null;
            let isReversed = false;

            cardEl.innerHTML = `
                <div class="yy-flip-card-inner">
                    <div class="yy-flip-card-back">
                        <div class="yy-card-label">${labels[idx]}</div>
                        <div class="yy-card-symbol">✦</div>
                        <div class="yy-card-hint">点击翻牌</div>
                    </div>
                    <div class="yy-flip-card-front">
                        <div class="yy-card-img-area"></div>
                        <div class="yy-card-info-area" style="display:none;">
                            <div class="yy-card-type">${labels[idx]}</div>
                            <div class="yy-card-name"></div>
                            <div class="yy-card-detail"></div>
                        </div>
                        <div class="yy-card-tap-hint"></div>
                    </div>
                </div>
            `;

            cardEl.addEventListener('click', function() {
                if (state === 0) {
                    // 翻牌 → 显示图片
                    state = 1;
                    cardEl.classList.add('flipped');

                    if (isPreSelected && preCards.tarot[idx]) {
                        cardData = preCards.tarot[idx].data;
                        isReversed = preCards.tarot[idx].isReversed;
                    } else {
                        // 点击瞬间随机
                        let pick;
                        let attempts = 0;
                        do {
                            pick = Math.floor(Math.random() * tarotCards.length);
                            attempts++;
                        } while (usedIndices.has(pick) && attempts < 20);
                        usedIndices.add(pick);
                        cardData = tarotCards[pick];
                        isReversed = Math.random() < 0.5;
                    }

                    const imgArea = cardEl.querySelector('.yy-card-img-area');
                    const tapHint = cardEl.querySelector('.yy-card-tap-hint');
                    if (cardData.img) {
                        imgArea.innerHTML = `<img src="${cardData.img}" class="yy-tarot-img ${isReversed ? 'reversed' : ''}" alt="${cardData.name}">`;
                    } else {
                        imgArea.innerHTML = `<div class="yy-tarot-icon ${isReversed ? 'reversed' : ''}"><i class="fas ${cardData.icon || 'fa-star'}" style="font-size:42px;color:var(--accent-color,#c5a47e);"></i></div>`;
                    }
                    imgArea.innerHTML += `<div class="yy-card-name-overlay">${cardData.name}</div>`;
                    tapHint.textContent = '点击查看释义';

                    flippedCount++;
                    if (flippedCount === cardCount) {
                        doneArea.style.display = 'block';
                    }
                } else if (state === 1) {
                    // 图片 → 释义
                    state = 2;
                    const imgArea = cardEl.querySelector('.yy-card-img-area');
                    const infoArea = cardEl.querySelector('.yy-card-info-area');
                    const tapHint = cardEl.querySelector('.yy-card-tap-hint');
                    imgArea.style.display = 'none';
                    infoArea.style.display = 'flex';
                    tapHint.textContent = '点击查看图片';

                    const nameEl = cardEl.querySelector('.yy-card-name');
                    const detailEl = cardEl.querySelector('.yy-card-detail');
                    const orientation = isReversed ? '逆位' : '正位';
                    nameEl.textContent = cardData.name;
                    const meaning = isReversed ? (cardData.reversed || cardData.meaning || '') : (cardData.upright || cardData.meaning || '');
                    detailEl.innerHTML = `<span class="yy-card-orientation ${isReversed ? 'reversed' : ''}">${orientation}</span><br>「${cardData.keyword}」<br><span class="yy-card-meaning">${meaning}</span>`;
                } else {
                    // 释义 → 图片
                    state = 1;
                    const imgArea = cardEl.querySelector('.yy-card-img-area');
                    const infoArea = cardEl.querySelector('.yy-card-info-area');
                    const tapHint = cardEl.querySelector('.yy-card-tap-hint');
                    imgArea.style.display = '';
                    infoArea.style.display = 'none';
                    tapHint.textContent = '点击查看释义';
                }
            });

            cardsArea.appendChild(cardEl);
        }

        const doneBtn = flipContainer.querySelector('.yy-flip-done-btn');
        doneBtn.addEventListener('click', function() {
            flipContainer.remove();
            if (onComplete) onComplete();
        });

        container.appendChild(flipContainer);
    }

    // ========== 每日心情 ==========
    function updateDailyMood() {
        const today = new Date().toDateString();
        if (localStorage.getItem('yy_last_mood_date') !== today) {
            const moods = window._remoteMoods || ["还不错","平静","一般","放松","有点累","心情不错","还行","安静","满足","自在"];
            localStorage.setItem('yy_daily_mood', moods[Math.floor(Math.random() * moods.length)]);
            localStorage.setItem('yy_last_mood_date', today);
        }
        return localStorage.getItem('yy_daily_mood') || '还行';
    }

    function getRandomStatus() {
        const s = window._remoteStatuses || ["一切都好","在忙","休息中","还好","一切如常"];
        return s[Math.floor(Math.random() * s.length)];
    }

    // ========== 覆写回信生成 ==========
    function overrideEnvelopeReply() {
        window._originalGenerateEnvelopeReplyText = window.generateEnvelopeReplyText;
        window.generateEnvelopeReplyText = function() {
            const remote = generateLetterReply();
            if (remote) return remote;
            if (window._originalGenerateEnvelopeReplyText) return window._originalGenerateEnvelopeReplyText();
            return '收到你的信了。我一直都在。';
        };
    }

    // ========== YES/NO 功能 ==========
    let yyYesNoMode = false;

    function yyHideTyping() {
        try {
            if (window._typingIndicatorAutoHideTimer) {
                clearTimeout(window._typingIndicatorAutoHideTimer);
                window._typingIndicatorAutoHideTimer = null;
            }
        } catch(e) {}
        var tiW = document.getElementById('typing-indicator-wrapper');
        if (tiW) {
            var tiInner = tiW.querySelector('.typing-indicator');
            if (tiInner) {
                tiInner.classList.add('hiding');
                setTimeout(function() {
                    tiW.style.display = 'none';
                    if (tiInner) tiInner.classList.remove('hiding');
                }, 240);
            } else {
                tiW.style.display = 'none';
            }
        }
    }

    function initYesNoButton() {
        const waitInput = setInterval(() => {
            const inputArea = document.querySelector('.input-area');
            if (!inputArea) return;
            clearInterval(waitInput);

            if (document.getElementById('yy-yesno-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'yy-yesno-btn';
            btn.textContent = '?';
            btn.title = 'YES/NO 模式';
            btn.className = 'input-btn collapse-hideable';
            btn.style.cssText = 'width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border-color,#ddd);background:transparent;color:var(--text-secondary,#999);font-size:16px;font-weight:700;cursor:pointer;flex-shrink:0;transition:all 0.3s;';
            btn.addEventListener('click', function() {
                yyYesNoMode = !yyYesNoMode;
                if (yyYesNoMode) {
                    btn.style.background = 'var(--accent-color,#c5a47e)';
                    btn.style.color = '#fff';
                    btn.style.borderColor = 'var(--accent-color,#c5a47e)';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-secondary,#999)';
                    btn.style.borderColor = 'var(--border-color,#ddd)';
                }
            });

            const textarea = document.getElementById('message-input');
            if (textarea) {
                inputArea.insertBefore(btn, textarea);
            }
        }, 500);
    }


    // ========== 覆写 simulateReply 加emoji蹦出 ==========
    function enhanceSimulateReply() {
        const orig = window.simulateReply;
        if (!orig) return;

        window.simulateReply = function() {
            // YES/NO模式：走原版流程显示typing，但回复内容替换为YES/NO
            if (yyYesNoMode) {
                const name = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
                // 概率：YES 40%, NO 40%, SIGNAL LOST 20%
                const roll = Math.random();
                let reply;
                if (roll < 0.4) {
                    reply = '✦ 𝒀𝑬𝑺 ✦';
                } else if (roll < 0.8) {
                    reply = '✧ 𝑵𝑶 ✧';
                } else {
                    reply = '░▒▓ 𝑺𝑰𝑮𝑵𝑨𝑳 𝑳𝑶𝑺𝑻 ▓▒░';
                }

                // 用原版的延迟范围
                const delayMin = (typeof settings !== 'undefined' && settings.replyDelayMin) || 1500;
                const delayMax = (typeof settings !== 'undefined' && settings.replyDelayMax) || 4000;
                const delay = delayMin + Math.random() * (delayMax - delayMin);

                setTimeout(() => {
                    yyHideTyping();
                    if (typeof addMessage === 'function') {
                        addMessage({
                            id: Date.now() + 9999,
                            sender: name,
                            text: reply,
                            timestamp: new Date(),
                            status: 'received',
                            favorited: false,
                            note: null,
                            type: 'normal'
                        });
                        if (typeof playSound === 'function') playSound('message');
                    }
                }, delay);

                // 关闭模式
                yyYesNoMode = false;
                const btn = document.getElementById('yy-yesno-btn');
                if (btn) {
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-secondary,#999)';
                    btn.style.borderColor = 'var(--border-color,#ddd)';
                }
                return;
            }

            orig();
            // emoji蹦出
            if (Math.random() < EMOJI_CHANCE) {
                const name = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
                setTimeout(() => {
                    if (typeof addMessage === 'function') {
                        addMessage({
                            id: Date.now() + 888,
                            sender: name,
                            text: getRandomEmoji(),
                            timestamp: new Date(),
                            status: 'received',
                            favorited: false,
                            note: null,
                            type: 'normal'
                        });
                        if (typeof playSound === 'function') playSound('message');
                    }
                }, 2000 + Math.random() * 1500);
            }
        };
    }

    // ========== 注入CSS ==========
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .yy-card-flip-container {
                position: fixed; inset: 0; z-index: 99999;
                background: rgba(6,6,14,0.92);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                font-family: 'Noto Serif SC', serif; padding: 24px;
                animation: yyFadeIn 0.4s ease;
            }
            @keyframes yyFadeIn { from{opacity:0} to{opacity:1} }
            .yy-flip-title { font-size:18px; color:#e5e5e5; letter-spacing:4px; margin-bottom:8px; }
            .yy-flip-subtitle { font-size:12px; color:#666; letter-spacing:2px; margin-bottom:32px; }
            .yy-flip-cards { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
            .yy-flip-card {
                width: 140px; height: 220px; perspective: 800px; cursor: pointer;
            }
            .yy-flip-card-inner {
                position:relative; width:100%; height:100%;
                transition: transform 0.6s cubic-bezier(0.25,0.8,0.25,1);
                transform-style: preserve-3d;
            }
            .yy-flip-card.flipped .yy-flip-card-inner { transform: rotateY(180deg); }
            .yy-flip-card-back, .yy-flip-card-front {
                position:absolute; inset:0; backface-visibility:hidden;
                border-radius:12px; display:flex; flex-direction:column;
                align-items:center; justify-content:center; padding:12px; text-align:center;
            }
            .yy-flip-card-back {
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border: 1px solid rgba(255,255,255,0.1);
            }
            .yy-card-label { font-size:10px; color:#888; letter-spacing:2px; margin-bottom:8px; }
            .yy-card-symbol { font-size:28px; color:rgba(197,164,126,0.6); margin-bottom:8px; }
            .yy-card-hint { font-size:10px; color:#555; animation: yyPulse 2s ease-in-out infinite; }
            @keyframes yyPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
            .yy-flip-card-front {
                background: linear-gradient(145deg, #f5f0e8, #ebe4d8);
                border: 1px solid rgba(197,164,126,0.3);
                transform: rotateY(180deg); color: #2a2a2a;
                overflow: hidden; justify-content: flex-start; padding: 0;
            }
            .yy-card-img-area {
                width:100%; flex:1; display:flex; align-items:center; justify-content:center;
                position:relative; overflow:hidden;
            }
            .yy-tarot-img {
                width:100%; height:100%; object-fit:cover;
            }
            .yy-tarot-img.reversed { transform: rotate(180deg); }
            .yy-tarot-icon { padding:20px; }
            .yy-tarot-icon.reversed { transform: rotate(180deg); }
            .yy-card-name-overlay {
                position:absolute; bottom:0; left:0; right:0;
                background:linear-gradient(transparent, rgba(0,0,0,0.7));
                color:#fff; font-size:13px; padding:8px 6px 6px; text-align:center;
                letter-spacing:1px;
            }
            .yy-card-info-area {
                width:100%; flex:1; flex-direction:column;
                align-items:center; justify-content:center; padding:12px; text-align:center;
            }
            .yy-card-type { font-size:9px; color:#999; letter-spacing:2px; margin-bottom:6px; }
            .yy-card-name { font-size:15px; font-weight:600; margin-bottom:6px; color:#1a1a1a; }
            .yy-card-detail { font-size:10px; color:#666; line-height:1.6; }
            .yy-card-orientation {
                display:inline-block; padding:1px 8px; border-radius:8px; font-size:10px;
                background:rgba(74,158,106,0.15); color:#4a9e6a; margin-bottom:4px;
            }
            .yy-card-orientation.reversed { background:rgba(200,100,100,0.15); color:#c86464; }
            .yy-card-meaning { font-size:9px; color:#888; }
            .yy-card-tap-hint {
                font-size:9px; color:#aaa; padding:6px; letter-spacing:1px;
                animation: yyPulse 2s ease-in-out infinite;
            }
            .yy-flip-done { margin-top:24px; }
            .yy-flip-done-btn {
                padding:10px 32px; border-radius:20px;
                border:1px solid rgba(197,164,126,0.4); background:transparent;
                color:#c5a47e; font-family:'Noto Serif SC',serif; font-size:13px;
                cursor:pointer; letter-spacing:2px; transition:all 0.3s;
            }
            .yy-flip-done-btn:active { background:rgba(197,164,126,0.15); }
        `;
        document.head.appendChild(style);
    }

    // ========== 初始化 ==========
    async function init() {
        injectStyles();
        await loadRemoteCards();
        updateDailyMood();
        injectDailyStatus();

        // 立刻覆写回信生成（不等simulateReply）
        overrideEnvelopeReply();

        const wait = setInterval(() => {
            if (typeof window.simulateReply === 'function') {
                clearInterval(wait);
                enhanceSimulateReply();
                initReplyDelaySettings();
                initAutoSendSettings();
                initYesNoButton();
                console.log('[RemoteCards] 初始化完成');
            }
        }, 500);
    }

    // ========== 回信延迟设置 ==========
    function initReplyDelaySettings() {
        const minInput = document.getElementById('yy-reply-delay-min');
        const maxInput = document.getElementById('yy-reply-delay-max');
        if (!minInput || !maxInput) return;

        minInput.value = localStorage.getItem('yy_reply_min_minutes') || '30';
        maxInput.value = localStorage.getItem('yy_reply_max_minutes') || '120';

        minInput.addEventListener('change', function() {
            let v = parseInt(minInput.value) || 1;
            if (v < 1) v = 1;
            minInput.value = v;
            localStorage.setItem('yy_reply_min_minutes', v);
        });
        maxInput.addEventListener('change', function() {
            let v = parseInt(maxInput.value) || 30;
            if (v < 1) v = 1;
            maxInput.value = v;
            localStorage.setItem('yy_reply_max_minutes', v);
        });
    }

    // ========== 主动消息间隔设置 ==========
    function initAutoSendSettings() {
        const autoMin = document.getElementById('yy-autosend-min');
        const autoMax = document.getElementById('yy-autosend-max');
        if (!autoMin || !autoMax) return;

        autoMin.value = localStorage.getItem('yy_autosend_min_minutes') || '5';
        autoMax.value = localStorage.getItem('yy_autosend_max_minutes') || '120';

        autoMin.addEventListener('change', function() {
            let v = parseInt(autoMin.value) || 1;
            if (v < 1) v = 1;
            autoMin.value = v;
            localStorage.setItem('yy_autosend_min_minutes', v);
        });
        autoMax.addEventListener('change', function() {
            let v = parseInt(autoMax.value) || 5;
            if (v < 1) v = 1;
            autoMax.value = v;
            localStorage.setItem('yy_autosend_max_minutes', v);
        });
    }

    // ========== 公告页状态注入 ==========
    function injectDailyStatus() {
        const status = getRandomStatus();

        function doInject() {
            // ① 号位：神谕句
            const moodNameEl = document.getElementById('dg-partner-mood');
            const sectionLabel = document.getElementById('dg-section-label-partner');
            const moodNoteEl = document.getElementById('dg-partner-mood-note');
            
            if (moodNameEl && window._remoteMottos && window._remoteMottos.length > 0) {
                const today = new Date().toDateString();
                let seed = 0;
                for (let i = 0; i < today.length; i++) seed += today.charCodeAt(i);
                const motto = window._remoteMottos[seed % window._remoteMottos.length];
                moodNameEl.textContent = motto;
                if (moodNoteEl) moodNoteEl.textContent = '';
            }
            if (sectionLabel) {
                sectionLabel.textContent = '✦ 今日谕示';
            }

            // ② 号位：读取心晴手帐里梦角当天的心情，显示 emoji + 日记
            const partnerMoodContainer = document.getElementById('dg-mood-display');
            if (partnerMoodContainer && window.moodData) {
                const today = new Date();
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                const dateStr = y + '-' + m + '-' + d;
                const dayData = window.moodData[dateStr];
                if (dayData && dayData.partner) {
                    // 找到心情 emoji
                    const MOOD_MAP = {
                        'happy': '😆', 'excited': '🥰', 'peace': '☺️', 'sad': '😕',
                        'tired': '😞', 'angry': '😠', 'love': '🥰', 'busy': '😵‍💫',
                        'sleepy': '😴', 'lonely': '🥹', 'cool': '😎', 'cute': '🥺'
                    };
                    const emoji = MOOD_MAP[dayData.partner] || '☺️';
                    const note = dayData.partnerNote || '今天没什么特别的';
                    partnerMoodContainer.innerHTML = '<span style="font-size:20px;margin-right:6px;">' + emoji + '</span> ' + note;
                }
            }

            // ④ 号位：状态（从远程状态池抽）
            const statusEl = document.getElementById('dg-status');
            if (statusEl && window._remoteStatuses && window._remoteStatuses.length > 0) {
                statusEl.textContent = status;
            }

            // ⑤ 号位：底部寄语
            const noteEl = document.getElementById('dg-note-text');
            if (noteEl && window._remoteMottos && window._remoteMottos.length > 0) {
                const today = new Date().toDateString();
                let seed2 = 7;
                for (let i = 0; i < today.length; i++) seed2 += today.charCodeAt(i) * 3;
                const picked = window._remoteMottos[seed2 % window._remoteMottos.length];
                noteEl.textContent = picked + ' ✦';
            }
        }

        // 监听公告页元素变化，原版代码写入后立刻覆盖
        const observer = new MutationObserver(() => {
            doInject();
        });

        // 等公告页元素出现后开始监听
        const startObserving = () => {
            const target = document.getElementById('dg-partner-mood');
            if (target) {
                // 先执行一次
                doInject();
                // 监听后续变化（原版代码可能延迟渲染）
                observer.observe(target, { childList: true, characterData: true, subtree: true });
                // 也监听标题
                const label = document.getElementById('dg-section-label-partner');
                if (label) observer.observe(label, { childList: true, characterData: true, subtree: true });
                // 60秒后停止监听，避免无限循环
                setTimeout(() => observer.disconnect(), 60000);
            } else {
                setTimeout(startObserving, 500);
            }
        };
        startObserving();
    }

    window.YY_RemoteCards = {
        loadRemoteCards, createCardFlipUI, generateLetterReply,
        updateDailyMood, getRandomStatus, getRandomEmoji
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
