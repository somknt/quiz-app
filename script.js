const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL_SIZE = 36;

const PREVIEW_SIZE = 120;
const PREVIEW_CELL = 24;

const BASE_DROP_MS = 900;
const MIN_DROP_MS = 120;
const SOFT_DROP_MS = 45;
const LEVEL_STEP_LINES = 10;
const DROP_ACCELERATION_PER_LEVEL = 75;

const NORMAL_CLEAR_POINTS = [0, 100, 300, 500, 800];
const TSPIN_CLEAR_POINTS = [400, 800, 1200, 1600];
const TSPIN_MINI_POINTS = [100, 200, 400];
const COMBO_BONUS_STEP = 50;
const BACK_TO_BACK_BONUS = 200;

const CLEAR_FLASH_MS = 240;
const SKILL_TEXT_MS = 900;
const SCORE_MILESTONE_STEP = 1500;
const SCORE_POP_MS = 320;

const SRS_KICKS_JLSTZ_CW = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
};

const SRS_KICKS_I_CW = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
};

const PIECES = {
  I: {
    color: '#00c7ff',
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  O: {
    color: '#ffd93d',
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  T: {
    color: '#b46bff',
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  S: {
    color: '#4be37a',
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  Z: {
    color: '#ff5f5f',
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
  J: {
    color: '#4d78ff',
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  L: {
    color: '#ff9a3d',
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
};

const boardCanvas = document.getElementById('game-board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const comboEl = document.getElementById('combo');
const b2bEl = document.getElementById('b2b');
const lastMoveEl = document.getElementById('last-move');

const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlaySubtitleEl = document.getElementById('overlay-subtitle');

const gameState = {
  board: [],
  currentPiece: null,
  nextQueue: [],
  holdPieceType: null,
  canHold: true,
  score: 0,
  level: 1,
  lines: 0,
  combo: -1,
  backToBack: 0,
  lastMoveText: '-',
  dropIntervalMs: BASE_DROP_MS,
  dropAccumulatorMs: 0,
  isSoftDropping: false,
  isPaused: false,
  isGameOver: false,
  lastTimestampMs: 0,
  nowMs: 0,
  nextMilestoneScore: SCORE_MILESTONE_STEP,
  scorePopUntilMs: 0,
  lineFlashEffects: [],
  skillTextEffects: [],
  boardFlashEffects: [],
  ringEffects: [],
};

function createEmptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
}

function deepCopyMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function shuffleArray(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillBagIfNeeded() {
  if (gameState.nextQueue.length >= 7) {
    return;
  }
  const bag = shuffleArray(Object.keys(PIECES));
  gameState.nextQueue.push(...bag);
}

function takeNextType() {
  refillBagIfNeeded();
  const nextType = gameState.nextQueue.shift();
  refillBagIfNeeded();
  return nextType;
}

function createPiece(type) {
  const { matrix, color } = PIECES[type];
  const pieceMatrix = deepCopyMatrix(matrix);
  return {
    type,
    color,
    matrix: pieceMatrix,
    x: Math.floor((BOARD_WIDTH - pieceMatrix[0].length) / 2),
    y: type === 'I' ? -1 : 0,
    rotation: 0,
    lastMoveWasRotate: false,
    lastRotationKickIndex: -1,
  };
}

function collides(piece, board, offsetX = 0, offsetY = 0, candidateMatrix = piece.matrix) {
  for (let y = 0; y < candidateMatrix.length; y += 1) {
    for (let x = 0; x < candidateMatrix[y].length; x += 1) {
      if (!candidateMatrix[y][x]) {
        continue;
      }

      const boardX = piece.x + x + offsetX;
      const boardY = piece.y + y + offsetY;

      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
        return true;
      }

      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function rotateMatrixClockwise(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      rotated[x][rows - 1 - y] = matrix[y][x];
    }
  }

  return rotated;
}

function movePiece(deltaX, deltaY) {
  const { currentPiece, board } = gameState;
  if (!currentPiece || collides(currentPiece, board, deltaX, deltaY)) {
    return false;
  }

  currentPiece.x += deltaX;
  currentPiece.y += deltaY;
  currentPiece.lastMoveWasRotate = false;
  return true;
}

function getSrsKickCandidates(pieceType, fromRotation, toRotation) {
  if (pieceType === 'O') {
    return [[0, 0]];
  }

  const key = `${fromRotation}>${toRotation}`;
  const source = pieceType === 'I' ? SRS_KICKS_I_CW[key] : SRS_KICKS_JLSTZ_CW[key];

  // SRS定義は上方向が+Yなので、キャンバス座標系(下方向が+Y)に反転する。
  return source.map(([x, y]) => [x, -y]);
}

function rotatePieceClockwise() {
  const { currentPiece, board } = gameState;
  if (!currentPiece) {
    return;
  }

  const rotated = rotateMatrixClockwise(currentPiece.matrix);
  const fromRotation = currentPiece.rotation;
  const toRotation = (fromRotation + 1) % 4;
  const kicks = getSrsKickCandidates(currentPiece.type, fromRotation, toRotation);

  for (let i = 0; i < kicks.length; i += 1) {
    const [kickX, kickY] = kicks[i];

    if (!collides(currentPiece, board, kickX, kickY, rotated)) {
      currentPiece.matrix = rotated;
      currentPiece.x += kickX;
      currentPiece.y += kickY;
      currentPiece.rotation = toRotation;
      currentPiece.lastMoveWasRotate = true;
      currentPiece.lastRotationKickIndex = i;
      return;
    }
  }
}

function mergePieceToBoard() {
  const { currentPiece, board } = gameState;

  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const boardX = currentPiece.x + x;
      const boardY = currentPiece.y + y;
      if (boardY >= 0) {
        board[boardY][boardX] = currentPiece.color;
      }
    });
  });
}

function clearFilledLines() {
  const { board } = gameState;
  const clearedRows = [];

  for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
    if (board[y].every((cell) => cell !== null)) {
      clearedRows.push(y);
      board.splice(y, 1);
      board.unshift(Array(BOARD_WIDTH).fill(null));
      y += 1;
    }
  }

  return {
    count: clearedRows.length,
    rows: clearedRows,
  };
}

function isCellBlocked(x, y) {
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
    return true;
  }
  return gameState.board[y][x] !== null;
}

function getTSpinFrontCorners(piece) {
  const centerX = piece.x + 1;
  const centerY = piece.y + 1;

  if (piece.rotation === 0) {
    return [[centerX - 1, centerY - 1], [centerX + 1, centerY - 1]];
  }
  if (piece.rotation === 1) {
    return [[centerX + 1, centerY - 1], [centerX + 1, centerY + 1]];
  }
  if (piece.rotation === 2) {
    return [[centerX - 1, centerY + 1], [centerX + 1, centerY + 1]];
  }
  return [[centerX - 1, centerY - 1], [centerX - 1, centerY + 1]];
}

function detectTSpinType(piece, clearedLines) {
  if (!piece || piece.type !== 'T' || !piece.lastMoveWasRotate) {
    return 'none';
  }

  const centerX = piece.x + 1;
  const centerY = piece.y + 1;
  const allCorners = [
    [centerX - 1, centerY - 1],
    [centerX + 1, centerY - 1],
    [centerX - 1, centerY + 1],
    [centerX + 1, centerY + 1],
  ];

  let blockedCorners = 0;
  for (const [x, y] of allCorners) {
    if (isCellBlocked(x, y)) {
      blockedCorners += 1;
    }
  }

  if (blockedCorners < 3) {
    return 'none';
  }

  const frontCorners = getTSpinFrontCorners(piece);
  let blockedFrontCorners = 0;
  for (const [x, y] of frontCorners) {
    if (isCellBlocked(x, y)) {
      blockedFrontCorners += 1;
    }
  }

  if (blockedFrontCorners === 2) {
    return 'tspin';
  }

  // SRSの最終キック(インデックス4)を使った場合はフル扱いになるケースがある。
  if (clearedLines > 0 && piece.lastRotationKickIndex === 4) {
    return 'tspin';
  }

  return 'mini';
}

function triggerLineFlash(rows, options = {}) {
  if (!rows.length) {
    return;
  }

  const {
    colorRgb = '186, 227, 255',
    maxAlpha = 0.55,
    durationMs = CLEAR_FLASH_MS,
  } = options;

  for (const row of rows) {
    gameState.lineFlashEffects.push({
      row,
      startedAtMs: gameState.nowMs,
      colorRgb,
      maxAlpha,
      durationMs,
    });
  }
}

function triggerSkillText(text, color = '#9ad1ff', options = {}) {
  const {
    durationMs = SKILL_TEXT_MS,
    font = '700 24px Segoe UI',
    startY = 120,
    rise = 35,
  } = options;

  gameState.skillTextEffects.push({
    text,
    color,
    startedAtMs: gameState.nowMs,
    durationMs,
    font,
    startY,
    rise,
  });
}

function triggerBoardFlash(colorRgb, maxAlpha = 0.5, durationMs = 260) {
  gameState.boardFlashEffects.push({
    colorRgb,
    maxAlpha,
    durationMs,
    startedAtMs: gameState.nowMs,
  });
}

function triggerRingBurst(colorRgb, count = 2, sizeMultiplier = 1) {
  for (let i = 0; i < count; i += 1) {
    gameState.ringEffects.push({
      colorRgb,
      startedAtMs: gameState.nowMs + i * 45,
      durationMs: 560 + i * 70,
      startRadius: 20 + i * 8,
      maxRadius: (130 + i * 55) * sizeMultiplier,
      maxAlpha: 0.75 - i * 0.12,
      lineWidth: 3 + i * 0.6,
    });
  }
}

function pulseScoreDisplay() {
  scoreEl.classList.remove('score-pop');
  // Reflowして同じクラスを連続適用できるようにする。
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pop');
  gameState.scorePopUntilMs = gameState.nowMs + SCORE_POP_MS;
}

function triggerMilestoneEffects(milestoneScore) {
  triggerBoardFlash('255, 216, 108', 0.65, 380);
  triggerRingBurst('255, 216, 108', 3, 1.2);
  triggerSkillText(`SCORE ${milestoneScore.toLocaleString()}!`, '#ffe37a', {
    durationMs: 1200,
    font: '800 30px Segoe UI',
    startY: 170,
    rise: 55,
  });
}

function checkScoreMilestones(previousScore, currentScore) {
  if (currentScore < gameState.nextMilestoneScore) {
    return;
  }

  while (currentScore >= gameState.nextMilestoneScore) {
    if (previousScore < gameState.nextMilestoneScore) {
      triggerMilestoneEffects(gameState.nextMilestoneScore);
    }
    gameState.nextMilestoneScore += SCORE_MILESTONE_STEP;
  }
}

function triggerSpecialClearEffects(clearName) {
  if (clearName.startsWith('T-Spin')) {
    triggerBoardFlash('236, 145, 255', 0.62, 340);
    triggerRingBurst('236, 145, 255', 3, 1.15);
    triggerSkillText('SPIN SKILL!', '#ffb8ff', {
      durationMs: 1000,
      font: '800 28px Segoe UI',
      startY: 210,
      rise: 48,
    });
    return;
  }

  if (clearName === 'Tetris') {
    triggerBoardFlash('115, 226, 255', 0.62, 340);
    triggerRingBurst('115, 226, 255', 3, 1.15);
    triggerSkillText('TETRIS POWER!', '#b7f1ff', {
      durationMs: 1000,
      font: '800 28px Segoe UI',
      startY: 210,
      rise: 48,
    });
  }
}

function describeClearMove(spinType, clearedLines) {
  if (spinType === 'tspin' && clearedLines > 0) {
    const names = ['Single', 'Double', 'Triple'];
    return `T-Spin ${names[clearedLines - 1] || 'Clear'}`;
  }

  if (spinType === 'mini' && clearedLines > 0) {
    const names = ['Single', 'Double'];
    return `T-Spin Mini ${names[clearedLines - 1] || 'Clear'}`;
  }

  if (spinType === 'tspin' && clearedLines === 0) {
    return 'T-Spin';
  }

  if (spinType === 'mini' && clearedLines === 0) {
    return 'T-Spin Mini';
  }

  if (clearedLines === 4) {
    return 'Tetris';
  }

  if (clearedLines > 0) {
    return `Line Clear x${clearedLines}`;
  }

  return 'Drop';
}

function updateProgress(clearedLines, spinType) {
  const previousScore = gameState.score;
  let awarded = 0;
  let skillLabel = '';

  const isDifficultClear =
    clearedLines > 0 &&
    (clearedLines === 4 || spinType === 'tspin' || spinType === 'mini');

  if (clearedLines > 0) {
    if (spinType === 'tspin') {
      awarded += TSPIN_CLEAR_POINTS[Math.min(clearedLines, TSPIN_CLEAR_POINTS.length - 1)];
    } else if (spinType === 'mini') {
      awarded += TSPIN_MINI_POINTS[Math.min(clearedLines, TSPIN_MINI_POINTS.length - 1)];
    } else {
      awarded += NORMAL_CLEAR_POINTS[clearedLines];
    }

    gameState.combo += 1;

    if (gameState.combo > 0) {
      const comboBonus = gameState.combo * COMBO_BONUS_STEP;
      awarded += comboBonus;
      skillLabel += `Combo x${gameState.combo + 1} `;
    }

    if (isDifficultClear) {
      if (gameState.backToBack > 0) {
        awarded += BACK_TO_BACK_BONUS;
        skillLabel += 'B2B Bonus ';
      }
      gameState.backToBack += 1;
    } else {
      gameState.backToBack = 0;
    }

    gameState.lines += clearedLines;
    gameState.level = Math.floor(gameState.lines / LEVEL_STEP_LINES) + 1;

    const accelerated = BASE_DROP_MS - (gameState.level - 1) * DROP_ACCELERATION_PER_LEVEL;
    gameState.dropIntervalMs = Math.max(MIN_DROP_MS, accelerated);
  } else {
    if (spinType === 'tspin') {
      awarded += TSPIN_CLEAR_POINTS[0];
    } else if (spinType === 'mini') {
      awarded += TSPIN_MINI_POINTS[0];
    }
    gameState.combo = -1;
  }

  gameState.score += awarded;

  const clearName = describeClearMove(spinType, clearedLines);
  gameState.lastMoveText = clearName;

  if (awarded > 0 && (clearedLines > 0 || spinType !== 'none')) {
    const baseText = `${clearName} +${awarded}`;
    const effectColor = spinType !== 'none' ? '#f5a1ff' : '#9ad1ff';
    triggerSkillText(skillLabel ? `${baseText} (${skillLabel.trim()})` : baseText, effectColor);
  }

  if (awarded > 0) {
    pulseScoreDisplay();
    checkScoreMilestones(previousScore, gameState.score);
  }

  if (clearedLines > 0) {
    triggerSpecialClearEffects(clearName);
  }
}

function setOverlay(visible, title = '', subtitle = '') {
  overlayEl.classList.toggle('hidden', !visible);
  overlayTitleEl.textContent = title;
  overlaySubtitleEl.textContent = subtitle;
}

function setGameOver() {
  gameState.isGameOver = true;
  setOverlay(true, 'GAME OVER', 'R キーでリスタート');
}

function spawnNewPiece(type = takeNextType()) {
  gameState.currentPiece = createPiece(type);
  gameState.canHold = true;

  if (collides(gameState.currentPiece, gameState.board)) {
    setGameOver();
  }
}

function lockCurrentPieceAndContinue() {
  const lockedPiece = gameState.currentPiece;
  mergePieceToBoard();

  const spinTypeBeforeClear = detectTSpinType(lockedPiece, 0);
  const clearResult = clearFilledLines();
  const spinType =
    spinTypeBeforeClear === 'none'
      ? 'none'
      : detectTSpinType(lockedPiece, clearResult.count);

  if (spinType === 'tspin') {
    triggerLineFlash(clearResult.rows, {
      colorRgb: '236, 145, 255',
      maxAlpha: 0.78,
      durationMs: 360,
    });
  } else if (spinType === 'mini') {
    triggerLineFlash(clearResult.rows, {
      colorRgb: '215, 173, 255',
      maxAlpha: 0.68,
      durationMs: 320,
    });
  } else if (clearResult.count === 4) {
    triggerLineFlash(clearResult.rows, {
      colorRgb: '115, 226, 255',
      maxAlpha: 0.78,
      durationMs: 360,
    });
  } else {
    triggerLineFlash(clearResult.rows);
  }
  updateProgress(clearResult.count, spinType);
  spawnNewPiece();
}

function stepDown() {
  if (!movePiece(0, 1)) {
    lockCurrentPieceAndContinue();
  }
}

function hardDrop() {
  while (movePiece(0, 1)) {
    // 一番下まで落とし切る。
  }
  lockCurrentPieceAndContinue();
}

function holdPiece() {
  if (!gameState.canHold || gameState.isPaused || gameState.isGameOver) {
    return;
  }

  const currentType = gameState.currentPiece.type;

  if (gameState.holdPieceType === null) {
    gameState.holdPieceType = currentType;
    gameState.currentPiece = createPiece(takeNextType());
  } else {
    const swappedType = gameState.holdPieceType;
    gameState.holdPieceType = currentType;
    gameState.currentPiece = createPiece(swappedType);
  }

  gameState.canHold = false;

  if (collides(gameState.currentPiece, gameState.board)) {
    setGameOver();
  }
}

function togglePause() {
  if (gameState.isGameOver) {
    return;
  }

  gameState.isPaused = !gameState.isPaused;

  if (gameState.isPaused) {
    setOverlay(true, 'PAUSED', 'P キーで再開');
  } else {
    setOverlay(false);
    gameState.dropAccumulatorMs = 0;
  }
}

function restartGame() {
  gameState.board = createEmptyBoard();
  gameState.currentPiece = null;
  gameState.nextQueue = [];
  gameState.holdPieceType = null;
  gameState.canHold = true;
  gameState.score = 0;
  gameState.level = 1;
  gameState.lines = 0;
  gameState.combo = -1;
  gameState.backToBack = 0;
  gameState.lastMoveText = '-';
  gameState.dropIntervalMs = BASE_DROP_MS;
  gameState.dropAccumulatorMs = 0;
  gameState.isSoftDropping = false;
  gameState.isPaused = false;
  gameState.isGameOver = false;
  gameState.lastTimestampMs = 0;
  gameState.nowMs = 0;
  gameState.nextMilestoneScore = SCORE_MILESTONE_STEP;
  gameState.scorePopUntilMs = 0;
  gameState.lineFlashEffects = [];
  gameState.skillTextEffects = [];
  gameState.boardFlashEffects = [];
  gameState.ringEffects = [];
  scoreEl.classList.remove('score-pop');

  setOverlay(false);
  refillBagIfNeeded();
  spawnNewPiece();
  updateStatusPanel();
}

function updateStatusPanel() {
  scoreEl.textContent = gameState.score.toLocaleString();
  levelEl.textContent = gameState.level.toLocaleString();
  linesEl.textContent = gameState.lines.toLocaleString();
  comboEl.textContent = gameState.combo > 0 ? `x${gameState.combo + 1}` : '0';
  b2bEl.textContent = String(gameState.backToBack > 1 ? gameState.backToBack - 1 : 0);
  lastMoveEl.textContent = gameState.lastMoveText;

  if (gameState.nowMs > gameState.scorePopUntilMs) {
    scoreEl.classList.remove('score-pop');
  }
}

function drawCell(ctx, x, y, size, fillColor, isEmpty = false) {
  const px = x * size;
  const py = y * size;

  if (isEmpty) {
    ctx.fillStyle = '#0f1620';
    ctx.fillRect(px, py, size, size);
    ctx.strokeStyle = '#223142';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    return;
  }

  // セル間に余白を作って、ベタ塗り感を減らす。
  const inset = Math.max(2, Math.floor(size * 0.09));
  const innerX = px + inset;
  const innerY = py + inset;
  const innerW = size - inset * 2;
  const innerH = size - inset * 2;

  // 外側の境界
  ctx.fillStyle = 'rgba(8, 12, 18, 0.65)';
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

  // メイン本体
  ctx.fillStyle = fillColor;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // 上側ハイライト
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.fillRect(innerX, innerY, innerW, Math.max(2, Math.floor(innerH * 0.24)));

  // 下側シャドウ
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(innerX, innerY + innerH - Math.max(2, Math.floor(innerH * 0.2)), innerW, Math.max(2, Math.floor(innerH * 0.2)));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  gameState.board.forEach((row, y) => {
    row.forEach((cell, x) => {
      drawCell(boardCtx, x, y, CELL_SIZE, cell || '#111922', !cell);
    });
  });

  const piece = gameState.currentPiece;
  if (piece) {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }
        const drawX = piece.x + x;
        const drawY = piece.y + y;

        if (drawY >= 0) {
          drawCell(boardCtx, drawX, drawY, CELL_SIZE, piece.color);
        }
      });
    });
  }

  drawLineFlashEffects();
  drawBoardFlashEffects();
  drawRingEffects();
  drawSkillTextEffects();
}

function drawLineFlashEffects() {
  gameState.lineFlashEffects = gameState.lineFlashEffects.filter((effect) => {
    const elapsed = gameState.nowMs - effect.startedAtMs;
    if (elapsed >= effect.durationMs) {
      return false;
    }

    const alpha = effect.maxAlpha * (1 - elapsed / effect.durationMs);
    boardCtx.fillStyle = `rgba(${effect.colorRgb}, ${alpha})`;
    boardCtx.fillRect(0, effect.row * CELL_SIZE, BOARD_WIDTH * CELL_SIZE, CELL_SIZE);
    return true;
  });
}

function drawBoardFlashEffects() {
  gameState.boardFlashEffects = gameState.boardFlashEffects.filter((effect) => {
    const elapsed = gameState.nowMs - effect.startedAtMs;
    if (elapsed >= effect.durationMs) {
      return false;
    }

    const alpha = effect.maxAlpha * (1 - elapsed / effect.durationMs);
    boardCtx.fillStyle = `rgba(${effect.colorRgb}, ${alpha})`;
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    return true;
  });
}

function drawRingEffects() {
  gameState.ringEffects = gameState.ringEffects.filter((effect) => {
    const elapsed = gameState.nowMs - effect.startedAtMs;
    if (elapsed < 0) {
      return true;
    }
    if (elapsed >= effect.durationMs) {
      return false;
    }

    const progress = elapsed / effect.durationMs;
    const radius = effect.startRadius + (effect.maxRadius - effect.startRadius) * progress;
    const alpha = effect.maxAlpha * (1 - progress);

    boardCtx.save();
    boardCtx.strokeStyle = `rgba(${effect.colorRgb}, ${alpha})`;
    boardCtx.lineWidth = effect.lineWidth;
    boardCtx.beginPath();
    boardCtx.arc(boardCanvas.width / 2, boardCanvas.height / 2, radius, 0, Math.PI * 2);
    boardCtx.stroke();
    boardCtx.restore();
    return true;
  });
}

function drawSkillTextEffects() {
  gameState.skillTextEffects = gameState.skillTextEffects.filter((effect) => {
    const elapsed = gameState.nowMs - effect.startedAtMs;
    if (elapsed >= effect.durationMs) {
      return false;
    }
    if (elapsed < 0) {
      return true;
    }

    const progress = elapsed / effect.durationMs;
    const y = effect.startY - progress * effect.rise;
    const alpha = 1 - progress;

    boardCtx.save();
    boardCtx.globalAlpha = alpha;
    boardCtx.fillStyle = effect.color;
    boardCtx.font = effect.font;
    boardCtx.textAlign = 'center';
    boardCtx.fillText(effect.text, boardCanvas.width / 2, y);
    boardCtx.restore();
    return true;
  });
}

function drawMiniPreview(ctx, pieceType) {
  ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  ctx.fillStyle = '#121a23';
  ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

  if (!pieceType) {
    return;
  }

  const { matrix, color } = PIECES[pieceType];
  const width = matrix[0].length * PREVIEW_CELL;
  const height = matrix.length * PREVIEW_CELL;
  const offsetX = Math.floor((PREVIEW_SIZE - width) / 2 / PREVIEW_CELL);
  const offsetY = Math.floor((PREVIEW_SIZE - height) / 2 / PREVIEW_CELL);

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(ctx, offsetX + x, offsetY + y, PREVIEW_CELL, color);
      }
    });
  });
}

function drawAll() {
  drawBoard();
  drawMiniPreview(nextCtx, gameState.nextQueue[0] || null);
  drawMiniPreview(holdCtx, gameState.holdPieceType);
  updateStatusPanel();
}

function updateGame(timestampMs = 0) {
  if (!gameState.lastTimestampMs) {
    gameState.lastTimestampMs = timestampMs;
  }

  const deltaMs = timestampMs - gameState.lastTimestampMs;
  gameState.lastTimestampMs = timestampMs;
  gameState.nowMs = timestampMs;

  if (!gameState.isPaused && !gameState.isGameOver) {
    gameState.dropAccumulatorMs += deltaMs;

    const activeDropMs = gameState.isSoftDropping ? SOFT_DROP_MS : gameState.dropIntervalMs;
    if (gameState.dropAccumulatorMs >= activeDropMs) {
      gameState.dropAccumulatorMs = 0;
      stepDown();
    }
  }

  drawAll();
  requestAnimationFrame(updateGame);
}

function onKeyDown(event) {
  const key = event.key;
  const code = event.code;

  const shouldPrevent = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyC'].includes(code);
  if (shouldPrevent) {
    event.preventDefault();
  }

  if (key === 'r' || key === 'R') {
    restartGame();
    return;
  }

  if (key === 'p' || key === 'P') {
    togglePause();
    return;
  }

  if (gameState.isPaused || gameState.isGameOver) {
    return;
  }

  switch (code) {
    case 'ArrowLeft':
      movePiece(-1, 0);
      break;
    case 'ArrowRight':
      movePiece(1, 0);
      break;
    case 'ArrowDown':
      gameState.isSoftDropping = true;
      stepDown();
      break;
    case 'ArrowUp':
      rotatePieceClockwise();
      break;
    case 'Space':
      hardDrop();
      break;
    case 'KeyC':
      holdPiece();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  if (event.code === 'ArrowDown') {
    gameState.isSoftDropping = false;
  }
}

function initializeGame() {
  boardCanvas.width = BOARD_WIDTH * CELL_SIZE;
  boardCanvas.height = BOARD_HEIGHT * CELL_SIZE;

  nextCanvas.width = PREVIEW_SIZE;
  nextCanvas.height = PREVIEW_SIZE;
  holdCanvas.width = PREVIEW_SIZE;
  holdCanvas.height = PREVIEW_SIZE;

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  restartGame();
  requestAnimationFrame(updateGame);
}

initializeGame();
