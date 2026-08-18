// ==================== 1. 全局配置与状态 ====================
// 记得将此处的网址替换为你部署在 Render 上的真实后端域名！
const BACKEND_URL = "https://your-render-service.onrender.com"; 

const BOARD_SIZE = 15;
let board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
let currentPlayer = 'black'; 
let isGameOver = false;
let mode = 'pve';
let socket = null;
let myRole = null; 

let boardEl;
let statusEl;

// ==================== 2. 动态注入 CSS 样式 ====================
const style = document.createElement('style');
style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; flex-direction: column; align-items: center; background: #f4f6f8; padding: 20px; }
    h1 { margin-bottom: 15px; color: #1a1a1a; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px; background: #fff; padding: 12px 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); align-items: center; }
    button, input, select { padding: 8px 12px; font-size: 14px; border: 1px solid #d9d9d9; border-radius: 6px; outline: none; }
    button { background: #1677ff; color: white; border: none; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #4096ff; }
    #status { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #1f2937; }
    .board-container { padding: 15px; background: #eab275; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    #board { display: grid; grid-template-columns: repeat(15, 32px); grid-template-rows: repeat(15, 32px); position: relative; }
    .intersection { width: 32px; height: 32px; position: relative; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .intersection::before, .intersection::after { content: ""; position: absolute; background: #734516; z-index: 1; }
    .intersection::before { left: 0; right: 0; top: 50%; height: 1px; transform: translateY(-50%); }
    .intersection::after { top: 0; bottom: 0; left: 50%; width: 1px; transform: translateX(-50%); }
    .intersection.top-row::after { top: 50%; }
    .intersection.bottom-row::after { bottom: 50%; }
    .intersection.left-col::before { left: 50%; }
    .intersection.right-col::before { right: 50%; }
    .piece { width: 28px; height: 28px; border-radius: 50%; z-index: 2; position: absolute; }
    .black { background: radial-gradient(circle at 30% 30%, #666, #000); box-shadow: 2px 2px 4px rgba(0,0,0,0.4); }
    .white { background: radial-gradient(circle at 30% 30%, #fff, #e0e0e0); box-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
`;
document.head.appendChild(style);

// ==================== 3. 动态构建 DOM 结构 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 自动加载 Socket.IO SDK 脚本
    const socketScript = document.createElement('script');
    socketScript.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    document.head.appendChild(socketScript);

    // 构建页面核心元素
    document.body.innerHTML = `
        <h1>高级五子棋平台</h1>
        <div class="controls">
            <select id="gameMode">
                <option value="pve">单人模式 (人机对战)</option>
                <option value="pvp_local">本地双人</option>
                <option value="pvp_online">在线联机</option>
            </select>
            <div id="onlineConfig" style="display: none;">
                <input type="text" id="roomId" placeholder="输入或生成房间号">
                <button id="btnRandomRoom">生成随机房间</button>
                <button id="btnJoinRoom">进入/创建房间</button>
            </div>
            <button id="btnReset">重新开始</button>
        </div>
        <div id="status">当前回合：黑棋</div>
        <div class="board-container">
            <div id="board"></div>
        </div>
    `;

    // 获取 DOM 引用与事件绑定
    boardEl = document.getElementById('board');
    statusEl = document.getElementById('status');

    document.getElementById('gameMode').addEventListener('change', switchMode);
    document.getElementById('btnRandomRoom').addEventListener('click', createRandomRoom);
    document.getElementById('btnJoinRoom').addEventListener('click', joinRoom);
    document.getElementById('btnReset').addEventListener('click', resetGame);

    initBoard();
});

// ==================== 4. 棋盘与游戏控制逻辑 ====================
function initBoard() {
    if (!boardEl) return;
    boardEl.innerHTML = '';
    board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    isGameOver = false;
    currentPlayer = 'black';
    updateStatus("当前回合：黑棋");

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const node = document.createElement('div');
            node.className = 'intersection';
            if (r === 0) node.classList.add('top-row');
            if (r === BOARD_SIZE - 1) node.classList.add('bottom-row');
            if (c === 0) node.classList.add('left-col');
            if (c === BOARD_SIZE - 1) node.classList.add('right-col');

            node.addEventListener('click', () => handleCellClick(r, c));
            boardEl.appendChild(node);
        }
    }
}

function handleCellClick(r, c) {
    if (isGameOver || board[r][c]) return;

    if (mode === 'pvp_online') {
        if (!socket || currentPlayer !== myRole) return;
        socket.emit('makeMove', { row: r, col: c, player: myRole });
        return;
    }

    executeMove(r, c, currentPlayer);

    if (mode === 'pve' && currentPlayer === 'white' && !isGameOver) {
        setTimeout(makeAIMove, 200);
    }
}

function executeMove(r, c, player) {
    board[r][c] = player;
    const index = r * BOARD_SIZE + c;
    const node = boardEl.children[index];
    const piece = document.createElement('div');
    piece.className = `piece ${player}`;
    node.appendChild(piece);

    if (checkWin(r, c, player)) {
        endGame(`${player === 'black' ? '黑棋' : '白棋'} 获得胜利！`);
        return;
    }

    currentPlayer = player === 'black' ? 'white' : 'black';
    if (mode !== 'pvp_online') {
        updateStatus(`当前回合：${currentPlayer === 'black' ? '黑棋' : '白棋'}`);
    }
}

// ==================== 5. 局势评估与高强度 AI ====================
function makeAIMove() {
    if (isGameOver) return;
    let bestScore = -Infinity;
    let bestMove = null;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!board[r][c]) {
                let attackScore = evaluatePoint(r, c, 'white');
                let defenseScore = evaluatePoint(r, c, 'black');
                let totalScore = attackScore + defenseScore * 1.2;

                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMove = { r, c };
                }
            }
        }
    }

    if (bestMove) {
        executeMove(bestMove.r, bestMove.c, 'white');
    }
}

function evaluatePoint(r, c, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    let totalVal = 0;

    directions.forEach(([dr, dc]) => {
        let count = 1;
        let openEnds = 0;

        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
            count++; nr += dr; nc += dc;
        }
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && !board[nr][nc]) openEnds++;

        nr = r - dr; nc = c - dc;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
            count++; nr -= dr; nc -= dc;
        }
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && !board[nr][nc]) openEnds++;

        if (count >= 5) totalVal += 100000;
        else if (count === 4 && openEnds === 2) totalVal += 10000;
        else if (count === 4 && openEnds === 1) totalVal += 1000;
        else if (count === 3 && openEnds === 2) totalVal += 1000;
        else if (count === 3 && openEnds === 1) totalVal += 100;
        else if (count === 2 && openEnds === 2) totalVal += 100;
    });

    return totalVal;
}

function checkWin(r, c, player) {
    const directions = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
    return directions.some(dir => {
        let count = 1;
        dir.forEach(([dr, dc]) => {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                count++; nr += dr; nc += dc;
            }
        });
        return count >= 5;
    });
}

// ==================== 6. 在线联机与房间逻辑 ====================
function createRandomRoom() {
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('roomId').value = randomCode;
}

function switchMode() {
    mode = document.getElementById('gameMode').value;
    document.getElementById('onlineConfig').style.display = mode === 'pvp_online' ? 'block' : 'none';
    initBoard();
}

function joinRoom() {
    const roomId = document.getElementById('roomId').value.trim();
    if (!roomId) return alert("请输入或生成房间号！");

    if (typeof io === 'undefined') {
        return alert("通信服务加载中，请稍后再试...");
    }

    if (!socket) {
        socket = io(BACKEND_URL);
        setupSocketEvents();
    }
    
    initBoard();
    socket.emit('autoJoinRoom', { roomId });
    updateStatus(`正在连接房间 ${roomId}...`);
}

function setupSocketEvents() {
    socket.on('initRole', (data) => {
        myRole = data.role;
        updateStatus(`进入成功！你的身份是：${myRole === 'black' ? '黑棋（先手）' : '白棋（后手）'}`);
    });

    socket.on('waitingForOpponent', () => updateStatus("房间创建成功，等待对手加入..."));

    socket.on('gameStart', () => {
        isGameOver = false;
        currentPlayer = 'black';
        updateStatus(`游戏开始！当前回合：${currentPlayer === myRole ? '【你的回合】' : '【对方回合】'}`);
    });

    socket.on('moveMade', (data) => {
        executeMove(data.row, data.col, data.player);
        if (!isGameOver) {
            updateStatus(`当前回合：${currentPlayer === myRole ? '【你的回合】' : '【对方回合】'}`);
        }
    });

    socket.on('opponentLeft', () => endGame("对方已断开连接，游戏结束。"));
    socket.on('errorMsg', (msg) => alert(msg));
}

function updateStatus(msg) { if (statusEl) statusEl.innerText = msg; }
function endGame(msg) { isGameOver = true; updateStatus(msg); }
function resetGame() { initBoard(); }
