/* -------------------------------------------------------------
 * 黑膠狂想曲：圖書館特藏危機 - 主持人夜行紀錄系統主邏輯
 * 核心功能：狀態管理、LocalStorage 暫存、自動計算規則引擎、事件處理
 * ------------------------------------------------------------- */

// --- 01-12 號任務卡資料庫 (僅限館長指派) ---
const TASK_CARDS = {
    '01': { id: '01', name: '電影播映', desc: '進入多功能室。', reward: 1, type: 'area', target: 'multi' },
    '02': { id: '02', name: '說故事時間', desc: '待在全館人數最多的房間。', reward: 3, type: 'most_crowded' },
    '03': { id: '03', name: '木地板共讀空間', desc: '進入兒童閱覽室。', reward: 1, type: 'area', target: 'children' },
    '04': { id: '04', name: '玩具體驗', desc: '進入兒童閱覽室，且該區當晚未發生失竊。', reward: 2, type: 'area_no_theft', target: 'children' },
    '05': { id: '05', name: '三重黑膠產業', desc: '同時與一名「小偷」和一名「館員」處於同一個區域。', reward: 2, type: 'with_roles', roles: ['thiefA', 'thiefB', 'librarianA', 'librarianB'] },
    '06': { id: '06', name: '體驗室使用', desc: '同時與一名「讀者」和一名「館員」處於同一個區域。', reward: 3, type: 'with_roles', roles: ['readerA', 'readerB', 'librarianA', 'librarianB'] },
    '07': { id: '07', name: '體驗室', desc: '進入黑膠唱片展示區。', reward: 1, type: 'area', target: 'display' },
    '08': { id: '08', name: '黑膠體驗座位', desc: '和至少一名「館員」處於同一個區域。', reward: 1, type: 'with_roles', roles: ['librarianA', 'librarianB'] },
    '09': { id: '09', name: '黑膠使用登記', desc: '和至少一名「讀者」處於同一個區域。', reward: 1, type: 'with_roles', roles: ['readerA', 'readerB'] },
    '10': { id: '10', name: '黑膠借閱限制', desc: '同時與一名「小偷」和一名「讀者」處於同一個區域。', reward: 3, type: 'with_roles', roles: ['thiefA', 'thiefB', 'readerA', 'readerB'] },
    '11': { id: '11', name: '33 ⅓的意義', desc: '進入黑膠唱片展示區，且該區當晚未發生失竊。', reward: 2, type: 'area_no_theft', target: 'display' },
    '12': { id: '12', name: '黑膠聆賞準則', desc: '和至少一名「小偷」處於同一個區域。', reward: 1, type: 'with_roles', roles: ['thiefA', 'thiefB'] }
};

// --- 預設遊戲狀態結構 ---
const DEFAULT_STATE = {
    playerCount: 9, // 預設 9 人局
    players: {
        director: { id: '', name: '館長', faction: 'library', suspended: false },
        librarianA: { id: '', name: '館員A', faction: 'library', suspended: false },
        librarianB: { id: '', name: '館員B', faction: 'library', suspended: false },
        readerA: { id: '', name: '讀者A', faction: 'library', suspended: false },
        readerB: { id: '', name: '讀者B', faction: 'library', suspended: false },
        police: { id: '', name: '警察', faction: 'library', suspended: false },
        thiefA: { id: '', name: '小偷A', faction: 'thief', suspended: false },
        thiefB: { id: '', name: '小偷B', faction: 'thief', suspended: false },
        kidnapper: { id: '', name: '綁匪', faction: 'thief', suspended: false }
    },
    records: {
        display: 4,     // 9人局預設 4
        multi: 3,       // 9人局預設 3
        children: 3     // 9人局預設 3
    },
    // 全域積分倉庫
    scores: {
        warehouse: 0,   // 館藏倉庫 (館方得分區)
        bag: 0          // 贓物袋 (壞人得分區)
    },
    // 儲存 1-8 夜的詳細行動與結算
    nights: Array.from({ length: 8 }, (_, i) => ({
        nightNum: i + 1,
        actions: {
            director: { area: '', action: '', dayMoveInArea: '', taskCardId: '', abandonTask: false },
            librarianA: { area: '', action: '' },
            librarianB: { area: '', action: '' },
            readerA: { area: '', action: '' },
            readerB: { area: '', action: '' },
            police: { area: '', action: '', investigateTarget: '' },
            thiefA: { area: '', action: '' },
            thiefB: { area: '', action: '' },
            kidnapper: { area: '', action: '', kidnapTarget: '' },
        },
        voteOut: '', // 該夜投票被投出停權的玩家
        manualAdjustments: {
            display: 0,
            multi: 0,
            children: 0
        },
        // 當夜結算與公告資訊
        announcements: [],
        taskResults: {}
    })),
    // 結算與特殊勝利設定
    endGame: {
        winCondSuspendAllBad: false,
        winCondLibraryScoreReach: false,
        winCondKidnapDirector: false,
        winCondBadScoreReach: false,
        libraryScoreTarget: 8, // 9人局預設 8
        badScoreTarget: 6     // 9人局預設 6
    },
    currentNight: 1
};

const ROLE_ORDER = ['director', 'librarianA', 'librarianB', 'readerA', 'readerB', 'thiefA', 'thiefB', 'kidnapper', 'police'];

let gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));

// --- DOM 元素引用 ---
const DOM = {
    // 導航
    navButtons: document.querySelectorAll('.nav-btn'),
    sections: document.querySelectorAll('.content-section'),
    sectionTitle: document.getElementById('current-section-title'),
    sectionSubtitle: document.getElementById('current-section-subtitle'),
    
    // 快速狀態
    quickDisplayCount: document.getElementById('quick-display-count'),
    quickMultiCount: document.getElementById('quick-multi-count'),
    quickChildrenCount: document.getElementById('quick-children-count'),
    quickWarehouseCount: document.getElementById('quick-warehouse-count'),
    quickBagCount: document.getElementById('quick-bag-count'),
    
    // 設定區
    initDisplay: document.getElementById('init-display'),
    initMulti: document.getElementById('init-multi'),
    initChildren: document.getElementById('init-children'),
    startGameBtn: document.getElementById('start-game-btn'),
    resetGameBtn: document.getElementById('reset-game-btn'),
    
    // 夜晚行動面板
    nightTabsList: document.getElementById('night-tabs-list'),
    nightTitleIndicator: document.getElementById('night-title-indicator'),
    activePlayersCount: document.getElementById('active-players-count'),
    rolesLogList: document.getElementById('roles-log-list'),
    
    // 實時計算場地地圖
    liveDisplayCount: document.getElementById('live-display-count'),
    liveDisplayPeople: document.getElementById('live-display-people'),
    liveDisplayDetails: document.getElementById('live-display-details'),
    liveMultiCount: document.getElementById('live-multi-count'),
    liveMultiPeople: document.getElementById('live-multi-people'),
    liveMultiDetails: document.getElementById('live-multi-details'),
    liveChildrenCount: document.getElementById('live-children-count'),
    liveChildrenPeople: document.getElementById('live-children-people'),
    liveChildrenDetails: document.getElementById('live-children-details'),
    
    // 投票停權
    nightVoteOut: document.getElementById('night-vote-out'),
    voteHistoryTipsList: document.getElementById('vote-history-tips-list'),
    
    // 遊戲結算
    winCondSuspendAllBad: document.getElementById('win-cond-suspend-all-bad'),
    winCondLibraryScoreReach: document.getElementById('win-cond-library-score-reach'),
    winCondKidnapDirector: document.getElementById('win-cond-kidnap-director'),
    winCondBadScoreReach: document.getElementById('win-cond-bad-score-reach'),
    libraryScoreTarget: document.getElementById('library-score-target'),
    badScoreTarget: document.getElementById('bad-score-target'),
    
    winnerTeamName: document.getElementById('winner-team-name'),
    winnerReason: document.getElementById('winner-reason'),
    finalLibraryRecordsCount: document.getElementById('final-library-records-count'),
    finalBadRecordsCount: document.getElementById('final-bad-records-count'),
    finalLibraryBar: document.getElementById('final-library-bar'),
    finalBadBar: document.getElementById('final-bad-bar'),
    exportHistoryBtn: document.getElementById('export-history-btn'),
    summaryDirectorId: document.getElementById('summary-director-id'),
    
    // 匯出彈窗
    exportModal: document.getElementById('exportModal'),
    exportTextArea: document.getElementById('export-text-area'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    copyTextBtn: document.getElementById('copy-text-btn'),
    

    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// --- 初始化載入與 LocalStorage 管理 ---
function init() {
    loadGameState();
    setupNavigation();

    setupSettingsSection();
    setupNightDashboard();
    setupSummarySection();
    setupGlobalEvents();
    
    // 初始化自適應角色顯示與初始值
    updatePlayerSetupVisibility();
    renderPlayerIdButtons();
    
    calculateAllNights();
    renderCurrentNight();
    updateQuickStats();
    
    showToast('系統載入成功！歡迎使用《黑膠狂想曲：圖書館特藏危機》紀錄儀。', 'success');
}

function saveGameState() {
    localStorage.setItem('library_gm_tracker_state', JSON.stringify(gameState));
}

function loadGameState() {
    const saved = localStorage.getItem('library_gm_tracker_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            gameState = { ...DEFAULT_STATE, ...parsed };
            gameState.playerCount = parsed.playerCount !== undefined ? parsed.playerCount : 9;
            gameState.players = { ...DEFAULT_STATE.players, ...parsed.players };
            gameState.records = { ...DEFAULT_STATE.records, ...parsed.records };
            gameState.scores = { ...DEFAULT_STATE.scores, ...parsed.scores };
            gameState.endGame = { ...DEFAULT_STATE.endGame, ...parsed.endGame };
            if (parsed.nights) {
                gameState.nights = parsed.nights.map((n, i) => {
                    const defaultNight = DEFAULT_STATE.nights[i];
                    const mergedActions = {};
                    Object.keys(defaultNight.actions).forEach(role => {
                        mergedActions[role] = {
                            ...defaultNight.actions[role],
                            ...(n.actions ? n.actions[role] : {})
                        };
                    });
                    return {
                        ...defaultNight,
                        ...n,
                        actions: mergedActions,
                        manualAdjustments: {
                            ...defaultNight.manualAdjustments,
                            ...(n.manualAdjustments || {})
                        },
                        announcements: n.announcements || [],
                        taskResults: n.taskResults || {}
                    };
                });
            }
        } catch (e) {
            console.error('Error loading game state:', e);
            gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
}

// --- 導航與濾鏡控制 ---
function setupNavigation() {
    DOM.navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            DOM.navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            DOM.sections.forEach(sec => sec.classList.remove('active'));
            const targetSec = document.getElementById(targetId);
            targetSec.classList.add('active');
            
            const mainTitle = btn.querySelector('span').textContent;
            DOM.sectionTitle.textContent = mainTitle;
            
            if (targetId === 'setup-section') {
                DOM.sectionSubtitle.textContent = '請配置本場遊戲的玩家號碼與初始唱片數';
            } else if (targetId === 'dashboard-section') {
                DOM.sectionSubtitle.textContent = '請點選上方分頁，逐夜記錄玩家的行動與結算';
                renderCurrentNight();
            } else if (targetId === 'summary-section') {
                DOM.sectionSubtitle.textContent = '查看遊戲當前的勝負結算與完整隊伍統計';
                renderSummary();
            } else if (targetId === 'rules-section') {
                DOM.sectionSubtitle.textContent = '快速查詢《黑膠狂想曲：圖書館特藏危機》的角色技能與限制注意事項';
            }
        });
    });
}


// 動態渲染玩家身份圓形選擇按鈕
function renderPlayerIdButtons() {
    const roles = ['director', 'librarianA', 'librarianB', 'readerA', 'readerB', 'police', 'thiefA', 'thiefB', 'kidnapper'];
    const activeCount = parseInt(gameState.playerCount) || 9;
    
    roles.forEach(roleKey => {
        const container = document.getElementById(`p-btn-group-${roleKey}`);
        if (!container) return;
        
        container.innerHTML = '';
        
        // 創建 "未設定" 按鈕
        const unassignedBtn = document.createElement('button');
        unassignedBtn.className = `id-circle-btn unassigned ${!gameState.players[roleKey].id ? 'active' : ''}`;
        unassignedBtn.textContent = '未設定';
        unassignedBtn.addEventListener('click', () => {
            gameState.players[roleKey].id = '';
            saveGameState();
            renderPlayerIdButtons();
            updateQuickStats();
        });
        container.appendChild(unassignedBtn);
        
        // 創建 1 到 activeCount 的圓形按鈕
        for (let i = 1; i <= activeCount; i++) {
            const valStr = i.toString();
            const btn = document.createElement('button');
            btn.className = `id-circle-btn ${gameState.players[roleKey].id === valStr ? 'active' : ''}`;
            btn.textContent = valStr;
            btn.addEventListener('click', () => {
                // 檢查是否有點到重複的號碼，若是則予以警告提示
                let conflictingRoleKey = null;
                Object.keys(gameState.players).forEach(otherKey => {
                    if (otherKey !== roleKey && gameState.players[otherKey].id === valStr) {
                        conflictingRoleKey = otherKey;
                    }
                });
                
                if (conflictingRoleKey) {
                    const conflictingPlayerName = gameState.players[conflictingRoleKey].name;
                    showToast(`號碼 ${valStr} 已被【${conflictingPlayerName}】使用！`, 'warning');
                }
                
                gameState.players[roleKey].id = valStr;
                saveGameState();
                renderPlayerIdButtons();
                updateQuickStats();
            });
            container.appendChild(btn);
        }
    });
}

// 自動清除先前夜晚行動數據
function clearNightActions() {
    // 重設得分
    gameState.scores.warehouse = 0;
    gameState.scores.bag = 0;
    
    // 重設為第1夜
    gameState.currentNight = 1;
    
    // 重設夜晚行動
    gameState.nights = Array.from({ length: 8 }, (_, i) => ({
        nightNum: i + 1,
        actions: {
            director: { area: '', action: '', dayMoveInArea: '', taskCardId: '', abandonTask: false },
            librarianA: { area: '', action: '' },
            librarianB: { area: '', action: '' },
            readerA: { area: '', action: '' },
            readerB: { area: '', action: '' },
            police: { area: '', action: '', investigateTarget: '' },
            thiefA: { area: '', action: '' },
            thiefB: { area: '', action: '' },
            kidnapper: { area: '', action: '', kidnapTarget: '' },
        },
        voteOut: '',
        manualAdjustments: {
            display: 0,
            multi: 0,
            children: 0
        },
        announcements: [],
        taskResults: {}
    }));
    
    // 重置勝負條件
    gameState.endGame.winCondSuspendAllBad = false;
    gameState.endGame.winCondLibraryScoreReach = false;
    gameState.endGame.winCondKidnapDirector = false;
    gameState.endGame.winCondBadScoreReach = false;
    
    saveGameState();
    calculateAllNights();
    renderCurrentNight();
    updateQuickStats();
}

// --- 設定區邏輯 ---
function setupSettingsSection() {
    renderPlayerIdButtons();
    
    DOM.initDisplay.value = gameState.records.display;
    DOM.initMulti.value = gameState.records.multi;
    DOM.initChildren.value = gameState.records.children;
    
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            let val = parseInt(input.value) || 0;
            
            if (btn.classList.contains('minus-btn')) {
                val = Math.max(0, val - 1);
            } else {
                val = Math.min(10, val + 1);
            }
            
            input.value = val;
            
            if (targetId === 'init-display') gameState.records.display = val;
            if (targetId === 'init-multi') gameState.records.multi = val;
            if (targetId === 'init-children') gameState.records.children = val;
            
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    });
    
    // 綁定人數選擇器
    const playerCountSelect = document.getElementById('game-player-count');
    if (playerCountSelect) {
        playerCountSelect.value = gameState.playerCount || 9;
        playerCountSelect.addEventListener('change', () => {
            gameState.playerCount = parseInt(playerCountSelect.value) || 9;
            applyPlayerCountDefaults();
            updatePlayerSetupVisibility();
            
            // 當人數切換時，自動重新刷新渲染對應的圓形按鈕數 (例如6人局只有1-6)
            renderPlayerIdButtons();
            
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
            showToast(`已切換為 ${gameState.playerCount} 人局，並載入預設初始值！`, 'info');
        });
    }

    DOM.startGameBtn.addEventListener('click', () => {
        // 確認開始新對局時，自動清除所有先前夜晚行動資料
        clearNightActions();
        
        document.getElementById('nav-dashboard').click();
        showToast('配置確認！已清除舊記錄並開始夜晚行動紀錄。', 'success');
    });
}

// 根據玩家人數自適應更新設定區角色輸入框的顯示與隱藏
function updatePlayerSetupVisibility() {
    const count = parseInt(gameState.playerCount) || 9;
    
    const show = (roleKey) => {
        const el = document.getElementById(`setup-group-${roleKey}`);
        if (el) el.style.display = 'flex';
    };
    const hide = (roleKey) => {
        const el = document.getElementById(`setup-group-${roleKey}`);
        if (el) el.style.display = 'none';
    };
    
    // 預設全部顯示
    show('director');
    show('librarianA');
    show('librarianB');
    show('readerA');
    show('readerB');
    show('police');
    show('thiefA');
    show('thiefB');
    show('kidnapper');
    
    if (count === 6) {
        hide('librarianB');
        hide('readerB');
        hide('thiefB');
    } else if (count === 7) {
        hide('librarianB');
        hide('thiefB');
    } else if (count === 8) {
        hide('readerB');
    }
}

// 根據玩家人數自動套用初始唱片與獲勝門檻預設值
function applyPlayerCountDefaults() {
    const count = parseInt(gameState.playerCount) || 9;
    if (count <= 7) {
        gameState.records.display = 3;
        gameState.records.children = 2;
        gameState.records.multi = 3;
        gameState.endGame.libraryScoreTarget = 6;
        gameState.endGame.badScoreTarget = 4;
    } else {
        gameState.records.display = 4;
        gameState.records.children = 3;
        gameState.records.multi = 3;
        gameState.endGame.libraryScoreTarget = 8;
        gameState.endGame.badScoreTarget = 6;
    }
    
    // 更新設定區的 Stepper Input
    if (DOM.initDisplay) DOM.initDisplay.value = gameState.records.display;
    if (DOM.initChildren) DOM.initChildren.value = gameState.records.children;
    if (DOM.initMulti) DOM.initMulti.value = gameState.records.multi;
    
    if (DOM.libraryScoreTarget) DOM.libraryScoreTarget.value = gameState.endGame.libraryScoreTarget;
    if (DOM.badScoreTarget) DOM.badScoreTarget.value = gameState.endGame.badScoreTarget;
}

function setupGlobalEvents() {
    DOM.resetGameBtn.addEventListener('click', () => {
        if (confirm('⚠️ 確定要重設所有遊戲記錄與玩家配置嗎？此動作無法復原。')) {
            localStorage.removeItem('library_gm_tracker_state');
            gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
            saveGameState();
            
            DOM.initDisplay.value = gameState.records.display;
            DOM.initMulti.value = gameState.records.multi;
            DOM.initChildren.value = gameState.records.children;
            
            // 重新渲染圓形號碼按鈕為初始無設定狀態
            renderPlayerIdButtons();
            
            document.getElementById('nav-setup').click();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
            
            showToast('所有資料已成功重置！', 'danger');
        }
    });
}

// --- 夜晚行動紀錄面板 (Dashboard) ---
function setupNightDashboard() {
    DOM.nightTabsList.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nightNum = parseInt(btn.getAttribute('data-night'));
            gameState.currentNight = nightNum;
            
            DOM.nightTabsList.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            saveGameState();
            renderCurrentNight();
        });
    });
    
    document.querySelectorAll('.manual-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const area = btn.getAttribute('data-area');
            const isInc = btn.classList.contains('inc');
            const nightIndex = gameState.currentNight - 1;
            
            if (isInc) {
                gameState.nights[nightIndex].manualAdjustments[area]++;
            } else {
                gameState.nights[nightIndex].manualAdjustments[area]--;
            }
            
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
            
            showToast(`已手動修正該區域唱片數`, 'info');
        });
    });
    
    DOM.nightVoteOut.addEventListener('change', () => {
        const nightIndex = gameState.currentNight - 1;
        gameState.nights[nightIndex].voteOut = DOM.nightVoteOut.value;
        
        saveGameState();
        calculateAllNights();
        renderCurrentNight();
    });
}

// --- 核心計算與自動判定引擎 (升級警察被動被動偵測與主動抽查版) ---
function calculateAllNights() {
    gameState.scores.warehouse = 0;
    gameState.scores.bag = 0;
    gameState.endGame.winCondKidnapDirector = false;
    
    let kidnapperMistakes = 0;
    
    let prevRecords = {
        display: gameState.records.display,
        multi: gameState.records.multi,
        children: gameState.records.children
    };
    
    for (let n = 0; n < 8; n++) {
        const night = gameState.nights[n];
        night.announcements = [];
        night.taskResults = {};
        
        // A. 重設所有人當夜為未停權，並僅套用緊接在前一夜的一回合停權
        Object.keys(gameState.players).forEach(pKey => {
            gameState.players[pKey].suspended = false;
        });
        if (n > 0) {
            const votedPlayerKey = gameState.nights[n - 1].voteOut;
            if (votedPlayerKey && gameState.players[votedPlayerKey]) {
                gameState.players[votedPlayerKey].suspended = true;
            }
        }
        
        // B. 停權與未參賽角色夜晚資料強制清空
        const activeCount = parseInt(gameState.playerCount) || 9;
        Object.keys(night.actions).forEach(pKey => {
            const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                             (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                             (activeCount === 8 && (pKey === 'readerB'));
            
            if (isHidden || gameState.players[pKey].suspended) {
                night.actions[pKey].area = '';
                night.actions[pKey].action = '';
                if (night.actions[pKey].dayMoveInArea) night.actions[pKey].dayMoveInArea = '';
                if (night.actions[pKey].kidnapTarget) night.actions[pKey].kidnapTarget = '';
                if (night.actions[pKey].investigateTarget) night.actions[pKey].investigateTarget = '';
                if (night.actions[pKey].taskCardId) night.actions[pKey].taskCardId = '';
                if (night.actions[pKey].abandonTask) night.actions[pKey].abandonTask = false;
            }
        });
        
        // 計算技能次數 (綁匪=2次，警察=1次)
        let kidnapperUsedCount = 0;
        let policeUsedCount = 0;
        for (let prevN = 0; prevN < n; prevN++) {
            if (gameState.nights[prevN].actions.kidnapper.action === 'kidnap') kidnapperUsedCount++;
            if (gameState.nights[prevN].actions.police.action === 'investigate') policeUsedCount++;
        }
        
        night.kidnapperChargesLeft = Math.max(0, 2 - kidnapperUsedCount);
        night.policeChargesLeft = Math.max(0, 1 - policeUsedCount);
        
        if (night.kidnapperChargesLeft === 0) night.actions.kidnapper.action = '';
        if (night.policeChargesLeft === 0) night.actions.police.action = '';
        
        // C. 館長任務延續機制 (若上一夜未完成且未放棄，則本夜強制延續；若成功或放棄則不延續並清除歷史殘留)
        let isCarriedOver = false;
        if (n > 0) {
            const prevNight = gameState.nights[n - 1];
            const prevDirAct = prevNight.actions.director;
            const prevResult = prevNight.taskResults['director'];
            if (prevDirAct.taskCardId && (!prevResult || !prevResult.success) && !prevDirAct.abandonTask) {
                isCarriedOver = true;
            }
        }
        
        if (isCarriedOver) {
            night.actions.director.taskCardId = gameState.nights[n - 1].actions.director.taskCardId;
        } else {
            // 清除歷史殘留 stale carry-overs
            if (n > 0 && night.actions.director.taskCardId === gameState.nights[n - 1].actions.director.taskCardId) {
                const prevNight = gameState.nights[n - 1];
                const prevDirAct = prevNight.actions.director;
                const prevResult = prevNight.taskResults['director'];
                if (prevResult && (prevResult.success || prevDirAct.abandonTask)) {
                    night.actions.director.taskCardId = '';
                }
            }
        }

        // D. 館長任務自動判定 (決定白天唱片是否移入)
        const dirAct = night.actions.director;
        let directorTaskSuccess = false;
        
        const peopleCounts = { display: 0, multi: 0, children: 0 };
        Object.keys(night.actions).forEach(key => {
            const area = night.actions[key].area;
            if (area && peopleCounts[area] !== undefined) peopleCounts[area]++;
        });
        const maxPeople = Math.max(peopleCounts.display, peopleCounts.multi, peopleCounts.children);
        
        const zoneTheftAttempt = { display: 0, multi: 0, children: 0 };
        Object.keys(night.actions).forEach(key => {
            const act = night.actions[key];
            if (act.area && (key === 'thiefA' || key === 'thiefB') && act.action === 'steal') {
                zoneTheftAttempt[act.area]++;
            }
        });
        
        if (dirAct.taskCardId && dirAct.area && !dirAct.abandonTask) {
            const task = TASK_CARDS[dirAct.taskCardId];
            const pArea = dirAct.area;
            
            switch (task.type) {
                case 'area':
                    directorTaskSuccess = (pArea === task.target);
                    break;
                case 'most_crowded':
                    directorTaskSuccess = (maxPeople > 0 && peopleCounts[pArea] === maxPeople);
                    break;
                case 'area_no_theft':
                    const hasGuard = (night.actions.librarianA.area === pArea && night.actions.librarianA.action === 'guard') ||
                                     (night.actions.librarianB.area === pArea && night.actions.librarianB.action === 'guard');
                    const isTheftFailed = (zoneTheftAttempt[pArea] === 0 || hasGuard);
                    directorTaskSuccess = (pArea === task.target && isTheftFailed);
                    break;
                case 'with_roles':
                    const otherPlayersInZone = [];
                    Object.keys(night.actions).forEach(key => {
                        if (key !== 'director' && night.actions[key].area === pArea) {
                            otherPlayersInZone.push(key);
                        }
                    });
                    
                    if (task.id === '05') {
                        const hasThief = otherPlayersInZone.some(k => k === 'thiefA' || k === 'thiefB');
                        const hasLibrarian = otherPlayersInZone.some(k => k === 'librarianA' || k === 'librarianB');
                        directorTaskSuccess = (hasThief && hasLibrarian);
                    } else if (task.id === '06') {
                        const hasReader = otherPlayersInZone.some(k => k === 'readerA' || k === 'readerB');
                        const hasLibrarian = otherPlayersInZone.some(k => k === 'librarianA' || k === 'librarianB');
                        directorTaskSuccess = (hasReader && hasLibrarian);
                    } else if (task.id === '08') {
                        directorTaskSuccess = otherPlayersInZone.some(k => k === 'librarianA' || k === 'librarianB');
                    } else if (task.id === '09') {
                        directorTaskSuccess = otherPlayersInZone.some(k => k === 'readerA' || k === 'readerB');
                    } else if (task.id === '10') {
                        const hasThief = otherPlayersInZone.some(k => k === 'thiefA' || k === 'thiefB');
                        const hasReader = otherPlayersInZone.some(k => k === 'readerA' || k === 'readerB');
                        directorTaskSuccess = (hasThief && hasReader);
                    } else if (task.id === '12') {
                        directorTaskSuccess = otherPlayersInZone.some(k => k === 'thiefA' || k === 'thiefB');
                    }
                    break;
            }
            
            night.taskResults['director'] = {
                success: directorTaskSuccess,
                reward: directorTaskSuccess ? task.reward : 0
            };
            
            if (directorTaskSuccess) {
                gameState.scores.warehouse += task.reward;
            }
        }
        
        // D. 收集場地夜晚行動
        const startRecords = { ...prevRecords };
        const finalRecords = { ...startRecords };
        
        const areaStats = {
            display: { guards: 0, carriesOut: 0, steals: 0, dayMoves: 0, readerA_skill: false, readerB_skill: false, attemptedLibrarianCarries: [], attemptedThiefSteals: [], successfulSteals: 0, successfulCarries: 0 },
            multi: { guards: 0, carriesOut: 0, steals: 0, dayMoves: 0, readerA_skill: false, readerB_skill: false, attemptedLibrarianCarries: [], attemptedThiefSteals: [], successfulSteals: 0, successfulCarries: 0 },
            children: { guards: 0, carriesOut: 0, steals: 0, dayMoves: 0, readerA_skill: false, readerB_skill: false, attemptedLibrarianCarries: [], attemptedThiefSteals: [], successfulSteals: 0, successfulCarries: 0 }
        };
        
        // 白天移入邏輯 (館長任務卡成功才成功加進去，否則失敗不加，並在結算公告顯示；且總數不能超過10張)
        const dirDayArea = night.actions.director.dayMoveInArea;
        const totalStartRecords = startRecords.display + startRecords.multi + startRecords.children;
        if (dirDayArea && areaStats[dirDayArea]) {
            if (dirAct.taskCardId) {
                if (directorTaskSuccess) {
                    if (totalStartRecords >= 10) {
                        areaStats[dirDayArea].dayMoves = 0;
                        night.announcements.push(`⚠️ 館長任務成功，但由於三個存放區域唱片總數已達上限 (${totalStartRecords} 張)，白天唱片無法移入【${getAreaChineseName(dirDayArea)}】！(機會已浪費)`);
                    } else {
                        areaStats[dirDayArea].dayMoves = 1;
                        night.announcements.push(`📢 館長任務成功！白天唱片成功移入【${getAreaChineseName(dirDayArea)}】 (+1)`);
                    }
                } else {
                    areaStats[dirDayArea].dayMoves = 0;
                    if (dirAct.abandonTask) {
                        night.announcements.push(`⚠️ 館長今晚選擇放棄任務，白天唱片未能移入【${getAreaChineseName(dirDayArea)}】。`);
                    } else {
                        night.announcements.push(`⚠️ 館長任務失敗，白天唱片未能移入【${getAreaChineseName(dirDayArea)}】。`);
                    }
                }
            } else {
                areaStats[dirDayArea].dayMoves = 0;
                night.announcements.push(`⚠️ 館長未指派任務卡，白天唱片未能移入【${getAreaChineseName(dirDayArea)}】。`);
            }
        }
        
        // 遍歷當夜夜晚前往區域
        Object.keys(night.actions).forEach(pKey => {
            const act = night.actions[pKey];
            if (!act.area) return;
            
            const area = act.area;
            
            if (pKey === 'librarianA' || pKey === 'librarianB') {
                if (act.action === 'guard') {
                    areaStats[area].guards++;
                } else if (act.action === 'carry') {
                    areaStats[area].carriesOut++;
                    areaStats[area].attemptedLibrarianCarries.push(pKey);
                }
            }
            
            if (pKey === 'readerA' && act.action === 'use_skill') {
                areaStats[area].readerA_skill = true;
            }
            if (pKey === 'readerB' && act.action === 'use_skill') {
                areaStats[area].readerB_skill = true;
            }
            
            if ((pKey === 'thiefA' || pKey === 'thiefB') && act.action === 'steal') {
                areaStats[area].attemptedThiefSteals.push(pKey);
            }
        });
        
        // E. 讀者 A 技能容量限額與優先權分配算法（精確阻擋且至多 1 張唱片）
        const zones = ['display', 'multi', 'children'];
        night.zoneResolutions = night.zoneResolutions || {};

        zones.forEach(zone => {
            const stats = areaStats[zone];
            const hasGuard = hasGuardInZone(night, zone);
            
            // 1. 計算該區域當晚可移動唱片上限 (若發動讀者技能，可移動上限減1)
            const startCount = startRecords[zone];
            let movableLimit = startCount;
            if (stats.readerA_skill || stats.readerB_skill) {
                movableLimit = Math.max(0, startCount - 1);
            }
            
            // 2. 收集原始嘗試行動 (小偷在無守護時才能竊取)
            let attemptedSteals = [];
            if (!hasGuard) {
                attemptedSteals = [...stats.attemptedThiefSteals];
            }
            let attemptedCarries = [...stats.attemptedLibrarianCarries];
            
            // 3. 根據優先權分配成功額度 (優先權：讀者 > 館員 > 小偷，當區域內只有 1 張唱片發生資源搶奪時依此序判定)
            let successfulCarries = [];
            let successfulSteals = [];
            let blockedCarriesByLimit = [];
            let blockedStealsByLimit = [];
            
            // 先分配給館員搬運
            attemptedCarries.forEach(lib => {
                if (successfulCarries.length + successfulSteals.length < movableLimit) {
                    successfulCarries.push(lib);
                } else {
                    blockedCarriesByLimit.push(lib);
                }
            });
            
            // 再分配給小偷竊取
            attemptedSteals.forEach(thief => {
                if (successfulCarries.length + successfulSteals.length < movableLimit) {
                    successfulSteals.push(thief);
                } else {
                    blockedStealsByLimit.push(thief);
                }
            });
            
            // 4. 產生公告與警示訊息 (若發動了讀者技能)
            if (stats.readerA_skill || stats.readerB_skill) {
                let readerNames = '';
                if (stats.readerA_skill && stats.readerB_skill) {
                    readerNames = `讀者A (#${gameState.players.readerA.id || '未定'}) 與 讀者B (#${gameState.players.readerB.id || '未定'})`;
                } else if (stats.readerA_skill) {
                    readerNames = `讀者A (#${gameState.players.readerA.id || '未定'})`;
                } else {
                    readerNames = `讀者B (#${gameState.players.readerB.id || '未定'})`;
                }
                
                // 如果有原本可以成功，但因額度縮減而被擋掉的行動，優先宣佈守護了小偷，其次宣佈干擾了搬運
                if (blockedStealsByLimit.length > 0) {
                    const blockedThief = blockedStealsByLimit[0];
                    night.announcements.push(`📖 ${readerNames} [限制流出] 技能成功守護！阻擋了小偷 (${gameState.players[blockedThief].name}) 在【${getAreaChineseName(zone)}】的竊取！`);
                } else if (blockedCarriesByLimit.length > 0) {
                    const blockedLibrarian = blockedCarriesByLimit[0];
                    night.announcements.push(`⚠️ ${readerNames} [限制流出] 技能發動，干擾了館員 (${gameState.players[blockedLibrarian].name}) 在【${getAreaChineseName(zone)}】的搬運！搬運失敗！`);
                } else {
                    night.announcements.push(`📖 ${readerNames} 在【${getAreaChineseName(zone)}】發動限制移動技能，該區可移動唱片數減少 1 張。`);
                }
            }
            
            // 儲存此區域詳細的成功/限制結果，便於 liveMap 渲染
            night.zoneResolutions[zone] = {
                successfulCarries: [...successfulCarries],
                successfulSteals: [...successfulSteals],
                blockedCarriesByLimit: [...blockedCarriesByLimit],
                blockedStealsByLimit: [...blockedStealsByLimit]
            };
            
            stats.successfulSteals = successfulSteals.length;
            stats.successfulCarries = successfulCarries.length;
            
            let change = 0;
            change += stats.dayMoves;
            change -= stats.successfulCarries;
            change -= stats.successfulSteals;
            
            let tempFinal = Math.max(0, startRecords[zone] + change);
            tempFinal = Math.max(0, tempFinal + night.manualAdjustments[zone]);
            
            finalRecords[zone] = tempFinal;
            
            gameState.scores.warehouse += stats.successfulCarries;
            gameState.scores.bag += stats.successfulSteals;
        });
        
        // F. 警察技能判定 (被動區域壞人自動偵測 & 主動陣營查驗限一次)
        const policeAct = night.actions.police;
        
        // 1. 自動偵測被動技能：每回合自動顯示警察所在區域有沒有壞人陣營！
        if (policeAct.area) {
            const pArea = policeAct.area;
            // 壞人去向：thiefA, thiefB, kidnapper
            const thiefA_area = night.actions.thiefA.area;
            const thiefB_area = night.actions.thiefB.area;
            const kidnapper_area = night.actions.kidnapper.area;
            
            const hasBadGuy = (thiefA_area === pArea || thiefB_area === pArea || kidnapper_area === pArea);
            
            if (hasBadGuy) {
                night.announcements.push(`📢 警察自動偵測：昨晚在【${getAreaChineseName(pArea)}】偵測到壞人陣營的蹤跡！🚨`);
            } else {
                night.announcements.push(`📢 警察自動偵測：昨晚在【${getAreaChineseName(pArea)}】安全，未偵測到壞人活動痕跡。`);
            }
        }
        
        // 2. 主動抽查身分技能：整場限發動一次，顯示調查玩家身份
        if (policeAct.action === 'investigate' && policeAct.investigateTarget) {
            const targetKey = policeAct.investigateTarget;
            const targetPlayer = gameState.players[targetKey];
            
            if (targetPlayer) {
                const factionText = targetPlayer.faction === 'library' ? '館方陣營' : '壞人陣營';
                night.announcements.push(`🔍 警察主動查驗情報：玩家 [玩家 #${targetPlayer.id}] 的真實身份為【${factionText} — ${targetPlayer.name}】！`);
            }
        }
        
        // G. 綁匪綁架事件結算與代價判定
        const kidnapperAct = night.actions.kidnapper;
        if (kidnapperAct.action === 'kidnap' && kidnapperAct.kidnapTarget) {
            const targetKey = kidnapperAct.kidnapTarget;
            
            if (targetKey === 'director') {
                gameState.endGame.winCondKidnapDirector = true;
                night.announcements.push(`🚨 警報！綁匪成功綁架了館長！壞人陣營提前獲勝！`);
            } else {
                kidnapperMistakes++;
                if (kidnapperMistakes === 1) {
                    night.announcements.push(`📢 綁匪昨晚綁架行動失敗 (目標不是館長)！白天請主持人公示昨晚所有人所在位置！`);
                } else if (kidnapperMistakes >= 2) {
                    night.announcements.push(`🚨 綁匪第二次綁錯目標！綁匪身分已直接暴露！`);
                }
            }
        }
        
        // 檢查截止到當前夜晚，所有活躍的壞人是否都曾被停權過至少一次，若是則在該夜公告通知
        const activeBadRoles = activeCount >= 8 ? ['thiefA', 'thiefB', 'kidnapper'] : ['thiefA', 'kidnapper'];
        const suspendedRolesUpToNow = new Set();
        for (let prevN = 0; prevN <= n; prevN++) {
            const vote = gameState.nights[prevN].voteOut;
            if (vote) {
                suspendedRolesUpToNow.add(vote);
            }
        }
        const allBadGuysSuspendedUpToNow = activeBadRoles.every(r => suspendedRolesUpToNow.has(r));
        
        if (allBadGuysSuspendedUpToNow) {
            let firstTimeReached = true;
            if (n > 0) {
                const prevSuspendedRoles = new Set();
                for (let prevN = 0; prevN < n; prevN++) {
                    const vote = gameState.nights[prevN].voteOut;
                    if (vote) prevSuspendedRoles.add(vote);
                }
                const allBadGuysSuspendedPrev = activeBadRoles.every(r => prevSuspendedRoles.has(r));
                if (allBadGuysSuspendedPrev) {
                    firstTimeReached = false;
                }
            }
            
            if (firstTimeReached) {
                night.announcements.push(`🎉 捷報！壞人陣營所有角色皆已被投票停權過至少一次！館方陣營在此達成提前獲勝條件！🏆`);
            }
        }
        
        night.calculatedFinal = { ...finalRecords };
        prevRecords = { ...finalRecords };
    }
    
    // H. 自動判定提前獲勝條件 (基於得分庫與門檻)
    const libScore = gameState.scores.warehouse;
    const badScore = gameState.scores.bag;
    gameState.endGame.winCondLibraryScoreReach = (libScore >= gameState.endGame.libraryScoreTarget);
    gameState.endGame.winCondBadScoreReach = (badScore >= gameState.endGame.badScoreTarget);
    
    // 全域判定：壞人是否都曾被停權過至少一次
    const suspendedRolesHistory = new Set();
    for (let prevN = 0; prevN < 8; prevN++) {
        const vote = gameState.nights[prevN].voteOut;
        if (vote) {
            suspendedRolesHistory.add(vote);
        }
    }
    const allBadCount = parseInt(gameState.playerCount) || 9;
    const globalActiveBadRoles = allBadCount >= 8 ? ['thiefA', 'thiefB', 'kidnapper'] : ['thiefA', 'kidnapper'];
    const allBadGuysSuspendedAtLeastOnce = globalActiveBadRoles.every(r => suspendedRolesHistory.has(r));
    gameState.endGame.winCondSuspendAllBad = allBadGuysSuspendedAtLeastOnce;
}

// --- 渲染夜晚行動面板 ---
function renderCurrentNight() {
    const nightIndex = gameState.currentNight - 1;
    const night = gameState.nights[nightIndex];
    
    // 同步刷新 UI 中的夜晚頁籤 (Tabs) 狀態，確保重置時回到第一夜選中狀態
    if (DOM.nightTabsList) {
        DOM.nightTabsList.querySelectorAll('.tab-btn').forEach(btn => {
            const nightNum = parseInt(btn.getAttribute('data-night'));
            if (nightNum === gameState.currentNight) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    DOM.nightTitleIndicator.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="title-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        第 ${gameState.currentNight} 夜 行動登錄
    `;
    
    const activeCount = parseInt(gameState.playerCount) || 9;
    let suspendedCount = 0;
    Object.keys(gameState.players).forEach(pKey => {
        let isSuspended = false;
        if (nightIndex > 0 && gameState.nights[nightIndex - 1].voteOut === pKey) {
            isSuspended = true;
        }
        
        const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                         (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                         (activeCount === 8 && (pKey === 'readerB'));
                         
        if (isSuspended && !isHidden) suspendedCount++;
    });
    
    DOM.activePlayersCount.textContent = `${activeCount - suspendedCount} 位玩家正常活動${suspendedCount > 0 ? ` (${suspendedCount} 位已停權)` : ''}`;
    DOM.activePlayersCount.className = `badge ${suspendedCount === 0 ? 'badge-primary' : 'badge-warning'}`;
    
    renderRolesLogList(night, nightIndex);
    renderLiveMap(night, nightIndex);
    renderVoteSelector(night, nightIndex);
}

// 渲染角色行動登錄列表
function renderRolesLogList(night, nightIndex) {
    DOM.rolesLogList.innerHTML = '';
    
    ROLE_ORDER.forEach(pKey => {
        const player = gameState.players[pKey];
        const actionData = night.actions[pKey];
        
        // 根據玩家人數過濾隱藏的角色
        const activeCount = parseInt(gameState.playerCount) || 9;
        const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                         (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                         (activeCount === 8 && (pKey === 'readerB'));
                         
        if (isHidden) return;
        
        // 1 回合停權判定 (僅判定緊接著的上一夜)
        let isSuspended = false;
        if (nightIndex > 0 && gameState.nights[nightIndex - 1].voteOut === pKey) {
            isSuspended = true;
        }
        
        let isContinuousArea = false;
        let prevAreaName = '';
        if (nightIndex > 0 && pKey !== 'director' && actionData.area) {
            const prevAction = gameState.nights[nightIndex - 1].actions[pKey];
            if (prevAction && prevAction.area === actionData.area) {
                isContinuousArea = true;
                prevAreaName = getAreaChineseName(actionData.area);
            }
        }
        
        const row = document.createElement('div');
        row.className = `role-card-row ${isSuspended ? 'suspended' : ''} ${isContinuousArea ? 'warning-border' : ''}`;
        
        const factionBadge = player.faction === 'library' ? 
            `<span class="role-badge badge-library">館方</span>` : 
            `<span class="role-badge badge-thief">壞人</span>`;
            
        // 額外資訊展示 (讀者A、綁匪、警察剩餘次數計量器)
        let skillLabelHtml = '';
        if (!isSuspended) {
            if (pKey === 'readerA' || pKey === 'readerB') {
                skillLabelHtml = `<span class="skill-charge-counter" style="background: rgba(6, 182, 212, 0.08); border-color: rgba(6, 182, 212, 0.2); color: var(--color-library);">⚡ 限制移動: 不限次數</span>`;
            } else if (pKey === 'kidnapper') {
                const charges = night.kidnapperChargesLeft !== undefined ? night.kidnapperChargesLeft : 2;
                skillLabelHtml = `<span class="skill-charge-counter ${charges === 0 ? 'depleted' : ''}">⚡ 綁架次數剩餘: ${charges}次</span>`;
            } else if (pKey === 'police') {
                const charges = night.policeChargesLeft !== undefined ? night.policeChargesLeft : 1;
                skillLabelHtml = `<span class="skill-charge-counter ${charges === 0 ? 'depleted' : ''}">⚡ 主動查驗剩餘: ${charges}次</span>`;
            }
        }
            
        let headerHtml = `
            <div class="role-header">
                <div class="role-identity">
                    <span class="role-name">${player.name}</span>
                    ${factionBadge}
                    <span class="p-number-tag" title="玩家號碼"># ${player.id || '未定'}</span>
                    ${skillLabelHtml}
                </div>
                ${isContinuousArea ? `
                    <div class="continuous-warning" title="注意事項：不能連續兩晚待在同一個區域！">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <span>連宿警告 (${prevAreaName})</span>
                    </div>
                ` : ''}
            </div>
        `;
        
        let controlsHtml = '';
        if (!isSuspended) {
            let taskSelectorHtml = '';
            if (pKey === 'director') {
                let taskBadgeHtml = '';
                let taskDescHtml = '';
                
                if (actionData.taskCardId) {
                    const task = TASK_CARDS[actionData.taskCardId];
                    const res = night.taskResults['director'];
                    
                    if (res) {
                        if (res.success) {
                            taskBadgeHtml = `<span class="task-result-badge success">✅ 任務成功 (+${task.reward} 唱片)</span>`;
                            taskDescHtml = `<div class="task-card-desc success-border">${task.desc}</div>`;
                        } else {
                            if (actionData.abandonTask) {
                                taskBadgeHtml = `<span class="task-result-badge failed" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.3);">⚠️ 已放棄</span>`;
                            } else {
                                taskBadgeHtml = `<span class="task-result-badge failed">❌ 條件未達成 (將延續)</span>`;
                            }
                            taskDescHtml = `<div class="task-card-desc">${task.desc}</div>`;
                        }
                    }
                }
                
                let isCarriedOver = false;
                if (nightIndex > 0) {
                    const prevNight = gameState.nights[nightIndex - 1];
                    const prevDirAct = prevNight.actions.director;
                    const prevResult = prevNight.taskResults['director'];
                    if (prevDirAct.taskCardId && (!prevResult || !prevResult.success) && !prevDirAct.abandonTask) {
                        isCarriedOver = true;
                    }
                }
                
                let carryOverBadgeHtml = '';
                if (isCarriedOver) {
                    carryOverBadgeHtml = `<span class="task-result-badge warning" style="background: rgba(234, 179, 8, 0.15); color: var(--color-warning); border: 1px solid rgba(234, 179, 8, 0.3); margin-right: 0.3rem;">⚠️ 延續前夜</span>`;
                }
                
                taskSelectorHtml = `
                    <div class="task-selector-container">
                        <div class="task-select-header">
                            <span class="task-select-label">
                                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                館長任務卡指派
                            </span>
                            <div style="display: flex; gap: 0.25rem; align-items: center;">
                                ${carryOverBadgeHtml}
                                ${taskBadgeHtml}
                            </div>
                        </div>
                        <select class="task-select-input" data-role="director" data-type="assign-task" ${isCarriedOver ? 'disabled' : ''}>
                            <option value="">-- 無指派任務卡 --</option>
                            ${Object.keys(TASK_CARDS).map(tid => `
                                <option value="${tid}" ${actionData.taskCardId === tid ? 'selected' : ''}>
                                    卡片 ${tid}：${TASK_CARDS[tid].name} (+${TASK_CARDS[tid].reward} 唱片)
                                </option>
                            `).join('')}
                        </select>
                        ${taskDescHtml}
                        <!-- Abandon Task Checkbox -->
                        <div class="abandon-task-wrapper mt-2" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.5rem; background: rgba(234, 179, 8, 0.05); border: 1px solid rgba(234, 179, 8, 0.15); border-radius: 6px;">
                            <input type="checkbox" id="director-abandon-task-${nightIndex}" class="abandon-checkbox" data-role="director" data-type="abandon-task" ${actionData.abandonTask ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px;">
                            <label for="director-abandon-task-${nightIndex}" style="font-size: 0.75rem; color: var(--color-warning); font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;">
                                ⚠️ 夜晚放棄此任務
                            </label>
                        </div>
                    </div>
                `;
            }
            
            controlsHtml = `
                <div class="role-controls">
                    <!-- 夜晚前往區域 -->
                    <div class="area-select-buttons">
                        <button class="action-btn ${actionData.area === 'display' ? 'selected' : ''}" data-role="${pKey}" data-type="area" data-value="display">展示區</button>
                        <button class="action-btn ${actionData.area === 'multi' ? 'selected' : ''}" data-role="${pKey}" data-type="area" data-value="multi">多功能</button>
                        <button class="action-btn ${actionData.area === 'children' ? 'selected' : ''}" data-role="${pKey}" data-type="area" data-value="children">兒童區</button>
                        <button class="action-btn ${!actionData.area ? 'selected' : ''}" data-role="${pKey}" data-type="area" data-value="">未前往</button>
                    </div>
                    
                    <!-- 行動/技能 -->
                    <div class="action-select-buttons" id="actions-container-${pKey}">
                        ${renderRoleSpecificActions(pKey, actionData, night)}
                    </div>
                </div>
                ${taskSelectorHtml}
            `;
        }
        
        row.innerHTML = headerHtml + controlsHtml;
        DOM.rolesLogList.appendChild(row);
    });
    
    // 1. 綁定按鈕點擊監聽 (排除 SELECT)
    DOM.rolesLogList.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.tagName === 'SELECT') return;
            
            const role = btn.getAttribute('data-role');
            const type = btn.getAttribute('data-type');
            const value = btn.getAttribute('data-value');
            
            if (type === 'area') {
                gameState.nights[nightIndex].actions[role].area = value;
                if (!value) {
                    gameState.nights[nightIndex].actions[role].action = '';
                    if (gameState.nights[nightIndex].actions[role].dayMoveInArea) {
                        gameState.nights[nightIndex].actions[role].dayMoveInArea = '';
                    }
                    if (gameState.nights[nightIndex].actions[role].kidnapTarget) {
                        gameState.nights[nightIndex].actions[role].kidnapTarget = '';
                    }
                    if (gameState.nights[nightIndex].actions[role].investigateTarget) {
                        gameState.nights[nightIndex].actions[role].investigateTarget = '';
                    }
                }
            } else if (type === 'action') {
                const currentAction = gameState.nights[nightIndex].actions[role].action;
                gameState.nights[nightIndex].actions[role].action = (currentAction === value) ? '' : value;
            }
            
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    });
    
    // 2. 綁定館長白天移入下拉監聽
    const dayMoveSelect = DOM.rolesLogList.querySelector('select[data-type="day-move-in-area"]');
    if (dayMoveSelect) {
        dayMoveSelect.addEventListener('change', (e) => {
            gameState.nights[nightIndex].actions.director.dayMoveInArea = dayMoveSelect.value;
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    }
    
    // 3. 綁定館長任務卡指派下拉變更
    const taskSelect = DOM.rolesLogList.querySelector('select[data-type="assign-task"]');
    if (taskSelect) {
        taskSelect.addEventListener('change', (e) => {
            gameState.nights[nightIndex].actions.director.taskCardId = taskSelect.value;
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    }
    
    // 4. 綁定綁匪綁架目標選擇變更
    const kidnapSelect = DOM.rolesLogList.querySelector('.kidnap-target-select');
    if (kidnapSelect) {
        kidnapSelect.addEventListener('change', (e) => {
            gameState.nights[nightIndex].actions.kidnapper.kidnapTarget = kidnapSelect.value;
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    }
    
    // 5. 綁定警察查驗目標選擇變更
    const policeSelect = DOM.rolesLogList.querySelector('.police-target-select');
    if (policeSelect) {
        policeSelect.addEventListener('change', (e) => {
            gameState.nights[nightIndex].actions.police.investigateTarget = policeSelect.value;
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    }
    
    // 6. 綁定館長放棄任務核取方塊監聽
    const abandonCheckbox = DOM.rolesLogList.querySelector('.abandon-checkbox[data-role="director"]');
    if (abandonCheckbox) {
        abandonCheckbox.addEventListener('change', (e) => {
            gameState.nights[nightIndex].actions.director.abandonTask = abandonCheckbox.checked;
            saveGameState();
            calculateAllNights();
            renderCurrentNight();
            updateQuickStats();
        });
    }
}

// 渲染角色專屬控制項
function renderRoleSpecificActions(pKey, actionData, night) {
    if (pKey === 'director') {
        const dayArea = actionData.dayMoveInArea || '';
        return `
            <div class="flex-column w-100">
                <span class="task-select-label" style="font-size: 0.75rem; margin-bottom: 0.25rem; font-weight: 700;">☀️ 白天完成任務移入：</span>
                <select class="task-select-input w-100" data-role="director" data-type="day-move-in-area" style="text-align: left;">
                    <option value="">-- 白天未移入 --</option>
                    <option value="display" ${dayArea === 'display' ? 'selected' : ''}>➡️ 移入 黑膠展示區</option>
                    <option value="multi" ${dayArea === 'multi' ? 'selected' : ''}>➡️ 移入 多功能室</option>
                    <option value="children" ${dayArea === 'children' ? 'selected' : ''}>➡️ 移入 兒童閱覽區</option>
                </select>
            </div>
        `;
    }
    
    if (!actionData.area) {
        return `<span class="desc-tip text-muted">請先選擇前往區域</span>`;
    }
    
    switch (pKey) {
        case 'librarianA':
        case 'librarianB':
            return `
                <div class="action-select-buttons w-100">
                    <button class="action-btn ${actionData.action === 'guard' ? 'selected' : ''}" data-role="${pKey}" data-type="action" data-value="guard" title="守護當前區域的唱片不被小偷偷走">
                        🛡️ 守護
                    </button>
                    <button class="action-btn ${actionData.action === 'carry' ? 'selected' : ''}" data-role="${pKey}" data-type="action" data-value="carry" title="將當前區域的 1 張唱片搬入館藏倉庫">
                        📦 搬運倉庫
                    </button>
                </div>
            `;
            
        case 'readerA':
        case 'readerB':
            return `
                <button class="action-btn ${actionData.action === 'use_skill' ? 'selected' : ''}" 
                        data-role="${pKey}" data-type="action" data-value="use_skill" 
                        title="使本區域當晚可移動唱片數減少 1 張 (不限次數)">
                    📖 限制移動 (⚡不限次數)
                </button>
            `;
            
        case 'thiefA':
        case 'thiefB':
            return `
                <button class="action-btn ${actionData.action === 'steal' ? 'selected' : ''}" data-role="${pKey}" data-type="action" data-value="steal" title="竊取該區域1張唱片到贓物袋">
                    🕵️ 竊取唱片
                </button>
            `;
            
        case 'police':
            const hasPoliceCharges = night.policeChargesLeft > 0 || actionData.action === 'investigate';
            const isInvestigating = actionData.action === 'investigate';
            
            let targetSelectHtml = '';
            if (isInvestigating) {
                targetSelectHtml = `
                    <select class="police-target-select mt-2" data-role="police" data-type="investigate-target" style="text-align: left;">
                        <option value="">-- 選擇查驗目標 --</option>
                        ${Object.keys(gameState.players).map(k => {
                            if (k === 'police') return '';
                            const activeCount = parseInt(gameState.playerCount) || 9;
                            const isHidden = (activeCount === 6 && (k === 'librarianB' || k === 'readerB' || k === 'thiefB')) ||
                                             (activeCount === 7 && (k === 'librarianB' || k === 'thiefB')) ||
                                             (activeCount === 8 && (k === 'readerB'));
                            if (isHidden) return '';
                            const p = gameState.players[k];
                            return `<option value="${k}" ${actionData.investigateTarget === k ? 'selected' : ''}>${p.name} (玩家 #${p.id})</option>`;
                        }).join('')}
                    </select>
                `;
            }
            
            return `
                <div class="flex-column w-100">
                    <button class="action-btn ${isInvestigating ? 'selected' : ''}" 
                            data-role="police" data-type="action" data-value="investigate" 
                            ${!hasPoliceCharges ? 'disabled' : ''}
                            title="在夜晚主動直接抽查一名玩家的陣營與身份 (整場限發動一次)">
                        🔍 主動查驗 (⚡剩餘:${night.policeChargesLeft}次)
                    </button>
                    ${targetSelectHtml}
                </div>
            `;
            
        case 'kidnapper':
            const hasKidnapCharges = night.kidnapperChargesLeft > 0 || actionData.action === 'kidnap';
            const isKidnapping = actionData.action === 'kidnap';
            
            let kidnapTargetSelectHtml = '';
            if (isKidnapping) {
                kidnapTargetSelectHtml = `
                    <select class="kidnap-target-select mt-2" data-role="kidnapper" data-type="kidnap-target" style="text-align: left;">
                        <option value="">-- 選擇綁架目標 --</option>
                        ${Object.keys(gameState.players).map(k => {
                            if (k === 'kidnapper') return '';
                            const activeCount = parseInt(gameState.playerCount) || 9;
                            const isHidden = (activeCount === 6 && (k === 'librarianB' || k === 'readerB' || k === 'thiefB')) ||
                                             (activeCount === 7 && (k === 'librarianB' || k === 'thiefB')) ||
                                             (activeCount === 8 && (k === 'readerB'));
                            if (isHidden) return '';
                            const p = gameState.players[k];
                            return `<option value="${k}" ${actionData.kidnapTarget === k ? 'selected' : ''}>${p.name} (玩家 #${p.id})</option>`;
                        }).join('')}
                    </select>
                `;
            }
            
            return `
                <div class="flex-column w-100">
                    <button class="action-btn ${isKidnapping ? 'selected' : ''}" 
                            data-role="kidnapper" data-type="action" data-value="kidnap" 
                            ${!hasKidnapCharges ? 'disabled' : ''}
                            title="在當前前往的區域指定一名目標實施綁架行動 (每場限發動兩次)">
                        🚨 實施綁架 (⚡剩餘:${night.kidnapperChargesLeft}次)
                    </button>
                    ${kidnapTargetSelectHtml}
                </div>
            `;
            
        default:
            return `<span class="desc-tip text-muted">無夜間技能可用</span>`;
    }
}

// 渲染實時結算場地地圖與大屏公告
function renderLiveMap(night, nightIndex) {
    let startRecords = {
        display: gameState.records.display,
        multi: gameState.records.multi,
        children: gameState.records.children
    };
    
    if (nightIndex > 0) {
        startRecords = { ...gameState.nights[nightIndex - 1].calculatedFinal };
    }
    
    const zones = ['display', 'multi', 'children'];
    
    zones.forEach(zone => {
        const visitors = [];
        let peopleCount = 0;
        
        Object.keys(night.actions).forEach(pKey => {
            const activeCount = parseInt(gameState.playerCount) || 9;
            const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                             (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                             (activeCount === 8 && (pKey === 'readerB'));
            if (isHidden) return;
            
            const act = night.actions[pKey];
            
            const dirAct = night.actions.director;
            const res = night.taskResults['director'];
            const directorTaskSuccess = res ? res.success : false;
            
            if (pKey === 'director' && act.dayMoveInArea === zone && dirAct.taskCardId && directorTaskSuccess) {
                visitors.push({
                    name: '館長',
                    id: gameState.players.director.id,
                    text: '☀️白天移入',
                    cls: 'action-day-move'
                });
            }
            
            if (act.area === zone) {
                peopleCount++;
                const player = gameState.players[pKey];
                let actionText = '';
                let actionClass = '';
                
                const zoneRes = night.zoneResolutions ? night.zoneResolutions[zone] : null;
                const isSuccessfulCarry = zoneRes ? zoneRes.successfulCarries.includes(pKey) : true;
                const isSuccessfulSteal = zoneRes ? zoneRes.successfulSteals.includes(pKey) : true;
                
                if (act.action === 'guard') {
                    actionText = '守護';
                    actionClass = 'action-guard';
                } else if (act.action === 'carry') {
                    if (isSuccessfulCarry) {
                        actionText = '搬運➡️📦倉庫';
                        actionClass = 'action-carry';
                    } else {
                        actionText = '搬運(被限制)';
                        actionClass = 'action-steal';
                    }
                } else if (act.action === 'steal') {
                    const hasGuard = hasGuardInZone(night, zone);
                    if (hasGuard) {
                        actionText = '竊取(被阻擋)';
                        actionClass = 'action-steal';
                    } else if (!isSuccessfulSteal) {
                        actionText = '竊取(被限制)';
                        actionClass = 'action-steal';
                    } else {
                        actionText = '竊取';
                        actionClass = 'action-steal';
                    }
                } else if (act.action === 'use_skill' && (pKey === 'readerA' || pKey === 'readerB')) {
                    actionText = '限制流出';
                    actionClass = 'action-day-move';
                } else if (act.action === 'investigate' && pKey === 'police' && act.investigateTarget) {
                    const targetName = gameState.players[act.investigateTarget] ? gameState.players[act.investigateTarget].name : '未知';
                    actionText = `查驗➡️${targetName}`;
                    actionClass = 'action-guard';
                } else if (pKey === 'kidnapper' && act.action === 'kidnap' && act.kidnapTarget) {
                    const targetName = gameState.players[act.kidnapTarget] ? gameState.players[act.kidnapTarget].name : '未知';
                    actionText = `綁架➡️${targetName}`;
                    actionClass = 'action-steal';
                }
                
                visitors.push({
                    name: player.name,
                    id: player.id,
                    text: actionText,
                    cls: actionClass
                });
            }
        });
        
        const finalVal = night.calculatedFinal[zone];
        const countEl = DOM[`live${capitalize(zone)}Count`];
        const peopleEl = DOM[`live${capitalize(zone)}People`];
        const detailsEl = DOM[`live${capitalize(zone)}Details`];
        
        countEl.textContent = finalVal;
        peopleEl.textContent = peopleCount;
        
        const parentCard = countEl.closest('.area-live-card');
        const totalFinalRecords = night.calculatedFinal.display + night.calculatedFinal.multi + night.calculatedFinal.children;
        if (totalFinalRecords > 10) {
            parentCard.classList.add('warning-limit');
        } else {
            parentCard.classList.remove('warning-limit');
        }
        
        // 按號碼大小順序排列 (避免依行動順序猜出扮演角色)
        visitors.sort((a, b) => {
            const valA = parseInt(a.id) || 999;
            const valB = parseInt(b.id) || 999;
            if (valA !== valB) return valA - valB;
            return a.id.localeCompare(b.id);
        });
        
        detailsEl.innerHTML = '';
        if (visitors.length === 0) {
            detailsEl.innerHTML = `<span class="desc-tip text-muted">今晚此區域悄無一人...</span>`;
        } else {
            visitors.forEach(v => {
                const tag = document.createElement('span');
                tag.className = `visitor-tag ${v.cls}`;
                tag.innerHTML = `
                    <strong>${v.name} (#${v.id})</strong> 
                    ${v.text ? `<span style="font-size: 0.7rem; opacity: 0.9;">[${v.text}]</span>` : ''}
                `;
                detailsEl.appendChild(tag);
            });
        }
    });
    
    let alertBox = document.getElementById('night-announcement-alert');
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'night-announcement-alert';
        DOM.liveDisplayCount.closest('.card-body').prepend(alertBox);
    }
    
    alertBox.innerHTML = '';
    
    // 當夜結算早期勝利判定通知
    const finalLibScore = gameState.scores.warehouse;
    const finalBadScore = gameState.scores.bag;
    const winKidnap = gameState.endGame.winCondKidnapDirector;
    const winSuspendAllBad = gameState.endGame.winCondSuspendAllBad;
    const winLibScore = finalLibScore >= gameState.endGame.libraryScoreTarget;
    const winBadScore = finalBadScore >= gameState.endGame.badScoreTarget;

    if (winKidnap || winSuspendAllBad || winLibScore || winBadScore) {
        let winTeam = '';
        let winReason = '';
        let winStyle = '';
        
        if (winKidnap) {
            winTeam = '壞人陣營 提前獲勝！';
            winReason = '🏆 綁匪成功綁架館長，達成提前獲勝條件！';
            winStyle = 'background: rgba(249, 115, 22, 0.15); color: #f97316; border: 2px solid rgba(249, 115, 22, 0.5); box-shadow: 0 0 15px rgba(249, 115, 22, 0.35); text-shadow: 0 0 5px rgba(249, 115, 22, 0.5);';
        } else if (winSuspendAllBad) {
            winTeam = '館方陣營 提前獲勝！';
            winReason = '🏆 館方成功將壞人陣營所有角色皆已被投票停權過至少一次，達成提前獲勝條件！';
            winStyle = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 2px solid rgba(16, 185, 129, 0.5); box-shadow: 0 0 15px rgba(16, 185, 129, 0.35); text-shadow: 0 0 5px rgba(16, 185, 129, 0.5);';
        } else if (winLibScore) {
            winTeam = '館方陣營 提前獲勝！';
            winReason = `🏆 館方倉庫儲存唱片得分達到目標門檻 ${gameState.endGame.libraryScoreTarget} 張！`;
            winStyle = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 2px solid rgba(16, 185, 129, 0.5); box-shadow: 0 0 15px rgba(16, 185, 129, 0.35); text-shadow: 0 0 5px rgba(16, 185, 129, 0.5);';
        } else if (winBadScore) {
            winTeam = '壞人陣營 提前獲勝！';
            winReason = `🏆 壞人贓物袋累積唱片得分達到目標門檻 ${gameState.endGame.badScoreTarget} 張！`;
            winStyle = 'background: rgba(249, 115, 22, 0.15); color: #f97316; border: 2px solid rgba(249, 115, 22, 0.5); box-shadow: 0 0 15px rgba(249, 115, 22, 0.35); text-shadow: 0 0 5px rgba(249, 115, 22, 0.5);';
        }
        
        const winDiv = document.createElement('div');
        winDiv.className = 'alert mb-3 text-center';
        winDiv.style.cssText = winStyle + ' padding: 0.9rem 1.2rem; font-size: 0.95rem; font-weight: 800; border-radius: 8px;';
        winDiv.innerHTML = `
            <span style="font-size: 1.1rem; display: block; margin-bottom: 0.25rem;">🎉 早期獲勝判定：${winTeam}</span>
            <span style="font-size: 0.8rem; font-weight: 500; opacity: 0.9;">${winReason}</span>
        `;
        alertBox.appendChild(winDiv);
    }

    if (night.announcements && night.announcements.length > 0) {
        night.announcements.forEach(announce => {
            const isDanger = announce.includes('🚨');
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert ${isDanger ? 'alert-danger' : 'alert-warning'} mb-2`;
            alertDiv.style.padding = '0.65rem 1rem';
            alertDiv.style.fontSize = '0.8rem';
            alertDiv.style.fontWeight = '700';
            alertDiv.textContent = announce;
            alertBox.appendChild(alertDiv);
        });
    }
}

function hasGuardInZone(night, zone) {
    return (
        (night.actions.librarianA.area === zone && night.actions.librarianA.action === 'guard') ||
        (night.actions.librarianB.area === zone && night.actions.librarianB.action === 'guard')
    );
}

function renderVoteSelector(night, nightIndex) {
    DOM.nightVoteOut.innerHTML = '<option value="">-- 無玩家被停權 --</option>';
    
    const activeCount = parseInt(gameState.playerCount) || 9;
    Object.keys(gameState.players).forEach(pKey => {
        const player = gameState.players[pKey];
        
        // 排除未參賽角色
        const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                         (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                         (activeCount === 8 && (pKey === 'readerB'));
        if (isHidden) return;
        
        const opt = document.createElement('option');
        opt.value = pKey;
        opt.textContent = `${player.name} (玩家 #${player.id || ''})`;
        if (night.voteOut === pKey) {
            opt.selected = true;
        }
        DOM.nightVoteOut.appendChild(opt);
    });
    
    DOM.voteHistoryTipsList.innerHTML = '';
    
    // 渲染當前夜已被停權暫停行動的角色提示
    let anySuspended = false;
    if (nightIndex > 0) {
        const votedPlayerKey = gameState.nights[nightIndex - 1].voteOut;
        if (votedPlayerKey && gameState.players[votedPlayerKey]) {
            anySuspended = true;
            const player = gameState.players[votedPlayerKey];
            const tip = document.createElement('div');
            tip.className = 'suspended-status-tip';
            tip.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                <span><strong>${player.name}</strong> (#${player.id}) 於前一日白天被投出，在<strong>第 ${nightIndex + 1} 夜</strong>暫停行動一回合。</span>
            `;
            DOM.voteHistoryTipsList.appendChild(tip);
        }
    }
    
    if (!anySuspended) {
        DOM.voteHistoryTipsList.innerHTML = `<span class="desc-tip text-muted">本夜無任何玩家處於停權狀態。</span>`;
    }
}

// --- 遊戲結束與結算面板 ---
function setupSummarySection() {
    const checkBoxes = [
        DOM.winCondSuspendAllBad,
        DOM.winCondLibraryScoreReach,
        DOM.winCondKidnapDirector,
        DOM.winCondBadScoreReach
    ];
    
    checkBoxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const key = cb.id.replace(/-([a-z])/g, (g) => g[1].toUpperCase()).replace('winCond', '');
            const stateKey = key.charAt(0).toLowerCase() + key.slice(1);
            gameState.endGame[stateKey] = cb.checked;
            
            saveGameState();
            renderSummary();
        });
    });
    
    DOM.libraryScoreTarget.addEventListener('input', () => {
        gameState.endGame.libraryScoreTarget = parseInt(DOM.libraryScoreTarget.value) || 10;
        saveGameState();
        renderSummary();
    });
    
    DOM.badScoreTarget.addEventListener('input', () => {
        gameState.endGame.badScoreTarget = parseInt(DOM.badScoreTarget.value) || 10;
        saveGameState();
        renderSummary();
    });
    
    DOM.exportHistoryBtn.addEventListener('click', openExportModal);
    DOM.closeModalBtn.addEventListener('click', closeExportModal);
    DOM.copyTextBtn.addEventListener('click', copyExportText);
}

function renderSummary() {
    DOM.winCondSuspendAllBad.checked = gameState.endGame.winCondSuspendAllBad;
    DOM.winCondLibraryScoreReach.checked = gameState.endGame.winCondLibraryScoreReach;
    DOM.winCondKidnapDirector.checked = gameState.endGame.winCondKidnapDirector;
    DOM.winCondBadScoreReach.checked = gameState.endGame.winCondBadScoreReach;
    DOM.libraryScoreTarget.value = gameState.endGame.libraryScoreTarget;
    DOM.badScoreTarget.value = gameState.endGame.badScoreTarget;
    
    // 動態更新壞人停權勝利條件說明的角色列表
    const winCondSuspendLabel = document.querySelector('label[for="win-cond-suspend-all-bad"]');
    if (winCondSuspendLabel) {
        winCondSuspendLabel.innerHTML = `<strong>停權所有壞人：</strong> 壞人陣營所有角色皆已處於「停權」狀態。`;
    }
    
    DOM.summaryDirectorId.textContent = gameState.players.director.id || '未定';
    
    const finalLibScore = gameState.scores.warehouse;
    const finalBadScore = gameState.scores.bag;
    
    DOM.finalLibraryRecordsCount.textContent = `${finalLibScore} 張`;
    DOM.finalBadRecordsCount.textContent = `${finalBadScore} 張`;
    
    const libPercent = Math.min(100, (finalLibScore / 25) * 100);
    const badPercent = Math.min(100, (finalBadScore / 25) * 100);
    DOM.finalLibraryBar.style.width = `${libPercent}%`;
    DOM.finalBadBar.style.width = `${badPercent}%`;
    
    let winner = '進行中...';
    let reason = '尚未達到任何提前獲勝條件，將依據最終唱片分數判定。';
    let winnerColorClass = 'text-glow-yellow';
    
    if (gameState.endGame.winCondKidnapDirector) {
        winner = '壞人陣營 獲勝！';
        reason = '🏆 綁匪成功綁架館長，達成提前獲勝條件！';
        winnerColorClass = 'text-glow-orange';
    } 
    else if (gameState.endGame.winCondSuspendAllBad) {
        winner = '館方陣營 獲勝！';
        const activeCount = parseInt(gameState.playerCount) || 9;
        const badGuyNames = activeCount >= 8 ? '小偷A、小偷B、綁匪' : '小偷A、綁匪';
        reason = `🏆 館方成功將壞人陣營所有角色 (${badGuyNames}) 皆已被投票停權過至少一次，達成提前獲勝條件！`;
        winnerColorClass = 'text-glow-green';
    }
    else if (gameState.endGame.winCondLibraryScoreReach || finalLibScore >= gameState.endGame.libraryScoreTarget) {
        winner = '館方陣營 獲勝！';
        reason = `🏆 館方倉庫儲存唱片得分達到目標門檻 ${gameState.endGame.libraryScoreTarget} 張！`;
        winnerColorClass = 'text-glow-green';
    }
    else if (gameState.endGame.winCondBadScoreReach || finalBadScore >= gameState.endGame.badScoreTarget) {
        winner = '壞人陣營 獲勝！';
        reason = `🏆 壞人贓物袋累積唱片得分達到目標門檻 ${gameState.endGame.badScoreTarget} 張！`;
        winnerColorClass = 'text-glow-orange';
    }
    else {
        // 如果到了第八夜且有行動，自動結算勝負
        let hasEighthNightActions = false;
        const night8 = gameState.nights[7];
        Object.keys(night8.actions).forEach(k => {
            if (night8.actions[k].area) hasEighthNightActions = true;
        });

        if (hasEighthNightActions) {
            if (finalLibScore > finalBadScore) {
                winner = '館方陣營 獲勝！';
                reason = `🏆 遊戲到達第八夜，館方最終唱片得分 (${finalLibScore} 張) 多於壞人 (${finalBadScore} 張)，館方獲得最終勝利！`;
                winnerColorClass = 'text-glow-green';
            } else if (finalBadScore > finalLibScore) {
                winner = '壞人陣營 獲勝！';
                reason = `🏆 遊戲到達第八夜，壞人最終唱片得分 (${finalBadScore} 張) 多於館方 (${finalLibScore} 張)，壞人獲得最終勝利！`;
                winnerColorClass = 'text-glow-orange';
            } else {
                winner = '勢均力敵 (最終平手)';
                reason = `🏆 遊戲到達第八夜，雙方唱片得分相同 (${finalLibScore} 張)，最終以平手收場！`;
                winnerColorClass = 'text-glow-purple';
            }
        } else {
            if (finalLibScore > finalBadScore) {
                winner = '館方優勢中';
                reason = `兩方皆未提前獲勝。目前館藏倉庫得分 (${finalLibScore} 張) 多於壞人贓物袋 (${finalBadScore} 張)。`;
                winnerColorClass = 'text-glow-blue';
            } else if (finalBadScore > finalLibScore) {
                winner = '壞人優勢中';
                reason = `兩方皆未提前獲勝。目前壞人贓物袋 (${finalBadScore} 張) 多於館藏倉庫 (${finalLibScore} 張)。`;
                winnerColorClass = 'text-glow-orange';
            } else {
                winner = '勢均力敵 (平手)';
                reason = '當前館藏倉庫與壞人贓物袋得分數完全相同。';
                winnerColorClass = 'text-glow-purple';
            }
        }
    }
    
    DOM.winnerTeamName.textContent = winner;
    DOM.winnerTeamName.className = `announce-value ${winnerColorClass}`;
    DOM.winnerReason.textContent = reason;

    // 渲染白天任務與移入唱片紀錄至結算
    const taskContainer = document.getElementById('summary-daytime-tasks-list');
    if (taskContainer) {
        taskContainer.innerHTML = '';
        let anyTask = false;
        
        gameState.nights.forEach((night) => {
            const act = night.actions.director;
            const res = night.taskResults['director'];
            
            if (act.dayMoveInArea || act.taskCardId) {
                anyTask = true;
                const item = document.createElement('div');
                
                let successCls = 'none';
                let badgeText = '未移入';
                let badgeCls = 'badge-secondary';
                let detailsText = '';
                
                if (act.taskCardId) {
                    const task = TASK_CARDS[act.taskCardId];
                    if (res && res.success) {
                        successCls = 'success';
                        badgeText = '移入成功';
                        badgeCls = 'badge-success';
                        detailsText = `任務：${task.name} (+${task.reward}) ➡️ 成功移入【${getAreaChineseName(act.dayMoveInArea)}】(+1 唱片)`;
                    } else {
                        successCls = 'failed';
                        badgeText = '任務失敗';
                        badgeCls = 'badge-danger';
                        detailsText = `任務：${task.name} ➡️ 未能移入【${getAreaChineseName(act.dayMoveInArea)}】`;
                    }
                } else {
                    detailsText = `未指派任務卡 ➡️ 白天未能移入【${getAreaChineseName(act.dayMoveInArea)}】`;
                }
                
                item.className = `summary-list-item ${successCls}`;
                item.style.marginBottom = '0.35rem';
                item.innerHTML = `
                    <div class="item-desc" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="item-title" style="font-weight: 700; color: var(--text-primary);">第 ${night.nightNum} 夜</span>
                        <span style="color: var(--text-secondary);">${detailsText}</span>
                    </div>
                    <span class="badge ${badgeCls}" style="flex-shrink: 0;">${badgeText}</span>
                `;
                taskContainer.appendChild(item);
            }
        });
        
        if (!anyTask) {
            taskContainer.innerHTML = `<span class="desc-tip text-muted">暫無白天完成任務唱片移入紀錄。</span>`;
        }
    }

    // 渲染警察偵查與身分查驗紀錄至結算
    const policeContainer = document.getElementById('summary-police-investigations-list');
    if (policeContainer) {
        policeContainer.innerHTML = '';
        let anyInvestigate = false;
        
        gameState.nights.forEach((night) => {
            const policeAct = night.actions.police;
            
            if (policeAct.area) {
                anyInvestigate = true;
                const item = document.createElement('div');
                
                const pArea = policeAct.area;
                const thiefA_area = night.actions.thiefA.area;
                const thiefB_area = night.actions.thiefB.area;
                const kidnapper_area = night.actions.kidnapper.area;
                const hasBadGuy = (thiefA_area === pArea || thiefB_area === pArea || kidnapper_area === pArea);
                
                let activeText = '';
                if (policeAct.action === 'investigate' && policeAct.investigateTarget) {
                    const targetKey = policeAct.investigateTarget;
                    const targetPlayer = gameState.players[targetKey];
                    if (targetPlayer) {
                        const factionText = targetPlayer.faction === 'library' ? '館方陣營' : '壞人陣營';
                        activeText = ` ｜ 🔍 抽查 [玩家 #${targetPlayer.id}] 為【${factionText} — ${targetPlayer.name}】`;
                    }
                }
                
                let successCls = hasBadGuy ? 'failed' : 'success';
                let badgeText = hasBadGuy ? '🚨 偵測到壞人' : '🟢 安全';
                let badgeCls = hasBadGuy ? 'badge-danger' : 'badge-success';
                
                item.className = `summary-list-item ${successCls}`;
                item.style.marginBottom = '0.35rem';
                item.innerHTML = `
                    <div class="item-desc" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="item-title" style="font-weight: 700; color: var(--text-primary);">第 ${night.nightNum} 夜</span>
                        <span style="color: var(--text-secondary);">前往：【${getAreaChineseName(pArea)}】${activeText}</span>
                    </div>
                    <span class="badge ${badgeCls}" style="flex-shrink: 0;">${badgeText}</span>
                `;
                policeContainer.appendChild(item);
            }
        });
        
        if (!anyInvestigate) {
            policeContainer.innerHTML = `<span class="desc-tip text-muted">暫無警察偵訊與查驗紀錄。</span>`;
        }
    }
}

// --- 匯出完整軌跡 ---
function openExportModal() {
    let output = `《黑膠狂想曲：圖書館特藏危機》 - 主持人對局完整行動軌跡報告\n`;
    output += `================================================\n`;
    output += `【玩家身份配置】\n`;
    ROLE_ORDER.forEach(pKey => {
        const player = gameState.players[pKey];
        const activeCount = parseInt(gameState.playerCount) || 9;
        const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                         (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                         (activeCount === 8 && (pKey === 'readerB'));
        if (isHidden) return;
        output += `- ${player.name}：玩家號碼 #${player.id || '未配置'}\n`;
    });
    output += `\n【場地初始設定】\n`;
    output += `- 黑膠唱片展示區：${gameState.records.display} 張\n`;
    output += `- 多功能室：${gameState.records.multi} 張\n`;
    output += `- 兒童閱覽區：${gameState.records.children} 張\n`;
    output += `================================================\n\n`;
    
    gameState.nights.forEach((night, i) => {
        let hasAnyAction = false;
        Object.keys(night.actions).forEach(pKey => {
            if (night.actions[pKey].area || night.actions[pKey].dayMoveInArea) hasAnyAction = true;
        });
        
        if (!hasAnyAction && !night.voteOut) return;
        
        output += `【第 ${night.nightNum} 夜 行動與結算軌跡】\n`;
        output += `------------------------------------------------\n`;
        
        ROLE_ORDER.forEach(pKey => {
            const activeCount = parseInt(gameState.playerCount) || 9;
            const isHidden = (activeCount === 6 && (pKey === 'librarianB' || pKey === 'readerB' || pKey === 'thiefB')) ||
                             (activeCount === 7 && (pKey === 'librarianB' || pKey === 'thiefB')) ||
                             (activeCount === 8 && (pKey === 'readerB'));
            if (isHidden) return;
            
            const act = night.actions[pKey];
            const player = gameState.players[pKey];
            
            let isSuspended = false;
            for (let prevN = 0; prevN < i; prevN++) {
                if (gameState.nights[prevN].voteOut === pKey) {
                    isSuspended = true;
                    break;
                }
            }
            
            if (isSuspended) {
                output += `- ${player.name}：[已停權，無行動]\n`;
            } else {
                let actionDesc = '';
                
                if (pKey === 'director') {
                    if (act.dayMoveInArea) {
                        actionDesc += `白天擬移入唱片至 [${getAreaChineseName(act.dayMoveInArea)}]；`;
                    }
                    if (act.area) {
                        actionDesc += `夜晚前往 [${getAreaChineseName(act.area)}]`;
                    } else {
                        actionDesc += `夜晚 [未前往]`;
                    }
                    
                    if (act.taskCardId) {
                        const task = TASK_CARDS[act.taskCardId];
                        const res = night.taskResults['director'];
                        const successText = (res && res.success) ? `✅成功 (獎勵 +${task.reward} & 白天唱片移入成功)` : `❌失敗 (白天唱片未能移入)`;
                        actionDesc += ` | 指派任務卡 ${act.taskCardId}：${task.name} (${successText})`;
                    }
                } else if (act.area) {
                    let skillText = '前往';
                    
                    const zoneRes = night.zoneResolutions ? night.zoneResolutions[act.area] : null;
                    const isSuccessfulCarry = zoneRes ? zoneRes.successfulCarries.includes(pKey) : true;
                    const isSuccessfulSteal = zoneRes ? zoneRes.successfulSteals.includes(pKey) : true;
                    
                    if (act.action === 'guard') skillText = '前往並發動 [守護]';
                    else if (act.action === 'carry') {
                        skillText = isSuccessfulCarry ? '前往並成功 [搬運至 📦館藏倉庫]' : '前往並嘗試 [搬運] (因唱片數限制或讀者干擾而失敗)';
                    }
                    else if (act.action === 'steal') {
                        const hasGuard = hasGuardInZone(night, act.area);
                        if (hasGuard) {
                            skillText = '前往並嘗試 [竊取] (被館員守護阻擋)';
                        } else if (!isSuccessfulSteal) {
                            skillText = '前往並嘗試 [竊取] (因讀者限制移動或唱片數限制而失敗)';
                        } else {
                            skillText = '前往並成功 [竊取唱片]';
                        }
                    }
                    else if (act.action === 'use_skill' && (pKey === 'readerA' || pKey === 'readerB')) skillText = '前往並發動 [限制流出]';
                    else if (act.action === 'investigate' && pKey === 'police' && act.investigateTarget) {
                        const tName = gameState.players[act.investigateTarget] ? gameState.players[act.investigateTarget].name : '未知';
                        skillText = `前往並發動 [查驗 ${tName}]`;
                    }
                    else if (pKey === 'kidnapper' && act.action === 'kidnap' && act.kidnapTarget) {
                        const tName = gameState.players[act.kidnapTarget] ? gameState.players[act.kidnapTarget].name : '未知';
                        skillText = `前往並發動 [綁架 ${tName}]`;
                    }
                    
                    actionDesc = `${skillText} -> ${getAreaChineseName(act.area)}`;
                }
                
                if (actionDesc) {
                    output += `- ${player.name}：${actionDesc}\n`;
                }
            }
        });
        
        if (night.announcements && night.announcements.length > 0) {
            output += `\n- 白天GM公告與任務結算：\n`;
            night.announcements.forEach(ann => {
                output += `  * ${ann}\n`;
            });
        }
        
        output += `\n- 場地與得分結算：\n`;
        output += `  * 黑膠區：${night.calculatedFinal.display} 張唱片\n`;
        output += `  * 多功能：${night.calculatedFinal.multi} 張唱片\n`;
        output += `  * 兒童區：${night.calculatedFinal.children} 張唱片\n`;
        
        if (night.voteOut) {
            const votedPlayer = gameState.players[night.voteOut];
            output += `- 本日投票停權：投出 ${votedPlayer ? votedPlayer.name : night.voteOut}\n`;
        }
        output += `\n`;
    });
    
    output += `================================================\n`;
    output += `【最終對局結算】\n`;
    
    renderSummary();
    output += `- 勝出隊伍：${DOM.winnerTeamName.textContent}\n`;
    output += `- 獲勝緣由：${DOM.winnerReason.textContent}\n`;
    output += `- 📦 館藏倉庫最終得分：${DOM.finalLibraryRecordsCount.textContent}\n`;
    output += `- 💰 壞人贓物袋最終得分：${DOM.finalBadRecordsCount.textContent}\n`;
    output += `================================================\n`;
    
    DOM.exportTextArea.value = output;
    DOM.exportModal.classList.add('active');
}

function closeExportModal() {
    DOM.exportModal.classList.remove('active');
}

function copyExportText() {
    DOM.exportTextArea.select();
    document.execCommand('copy');
    showToast('對局報告已複製到剪貼簿！', 'success');
}

// --- 輔助函式 ---
function getAreaChineseName(areaKey) {
    if (areaKey === 'display') return '黑膠展示區';
    if (areaKey === 'multi') return '多功能室';
    if (areaKey === 'children') return '兒童閱覽區';
    return '未前往';
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateQuickStats() {
    const nightIndex = gameState.currentNight - 1;
    const records = gameState.nights[nightIndex].calculatedFinal || gameState.records;
    
    DOM.quickDisplayCount.textContent = records.display;
    DOM.quickMultiCount.textContent = records.multi;
    DOM.quickChildrenCount.textContent = records.children;
    
    DOM.quickWarehouseCount.textContent = gameState.scores.warehouse;
    DOM.quickBagCount.textContent = gameState.scores.bag;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '🚨';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

window.addEventListener('DOMContentLoaded', init);
