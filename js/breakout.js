// クラシックなブロック崩し（ピクセル／モノクロ見た目）。ログイン・API 非依存。
"use strict";

(() => {
  const HIGH_SCORE_KEY = "fctzs-breakout-highscore";
  // 低解像度で描き、CSS でドット拡大する
  const CANVAS_W = 240;
  const CANVAS_H = 320;
  const PADDLE_W = 40;
  const PADDLE_H = 4;
  const PADDLE_SPEED = 3.5;
  const BALL_SIZE = 4;
  const BALL_SPEED = 2.1;
  const INITIAL_LIVES = 3;
  const BRICK_ROWS = 6;
  const BRICK_COLS = 10;
  const BRICK_TOP = 28;
  const BRICK_GAP = 2;
  // 上段ほど明るく、モノクロ階調のみ
  const BRICK_SHADES = ["#f0f0f0", "#c8c8c8", "#a0a0a0", "#787878", "#505050", "#383838"];
  const COL = {
    bg: "#0a0a0a",
    fg: "#f0f0f0",
    mid: "#808080",
    dim: "#404040",
    overlay: "rgba(0, 0, 0, 0.72)"
  };

  const canvas = document.getElementById("breakout-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const scoreEl = document.getElementById("breakout-score");
  const highEl = document.getElementById("breakout-highscore");
  const livesEl = document.getElementById("breakout-lives");
  const startBtn = document.getElementById("breakout-start-btn");
  const pauseBtn = document.getElementById("breakout-pause-btn");
  const restartBtn = document.getElementById("breakout-restart-btn");

  /** @type {"ready"|"playing"|"paused"|"won"|"lost"} */
  let state = "ready";
  let score = 0;
  let lives = INITIAL_LIVES;
  let highScore = loadHighScore();
  let rafId = 0;
  let overlayBlink = 0;

  const keys = { left: false, right: false };
  let pointerX = null;

  const paddle = {
    w: PADDLE_W,
    h: PADDLE_H,
    x: (CANVAS_W - PADDLE_W) / 2,
    y: CANVAS_H - 20
  };

  const ball = {
    x: CANVAS_W / 2,
    y: CANVAS_H - 30,
    r: BALL_SIZE / 2,
    size: BALL_SIZE,
    vx: 0,
    vy: 0,
    stuck: true
  };

  /** @type {{ x: number, y: number, w: number, h: number, alive: boolean, shade: string, points: number }[]} */
  let bricks = [];

  function snap(n) {
    return Math.round(n);
  }

  function loadHighScore() {
    const n = Number(localStorage.getItem(HIGH_SCORE_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function saveHighScore() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (highEl) highEl.textContent = String(highScore);
    if (livesEl) livesEl.textContent = String(lives);
  }

  function buildBricks() {
    const totalGapX = BRICK_GAP * (BRICK_COLS + 1);
    const brickW = Math.floor((CANVAS_W - totalGapX) / BRICK_COLS);
    const brickH = 8;
    const offsetX = Math.floor((CANVAS_W - (brickW * BRICK_COLS + BRICK_GAP * (BRICK_COLS - 1))) / 2);
    bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        bricks.push({
          x: offsetX + col * (brickW + BRICK_GAP),
          y: BRICK_TOP + row * (brickH + BRICK_GAP),
          w: brickW,
          h: brickH,
          alive: true,
          shade: BRICK_SHADES[row % BRICK_SHADES.length],
          points: (BRICK_ROWS - row) * 10
        });
      }
    }
  }

  function resetBall() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.size - 1;
    ball.vx = 0;
    ball.vy = 0;
    ball.stuck = true;
  }

  function launchBall() {
    if (!ball.stuck) return;
    const angle = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3);
    ball.vx = Math.cos(angle) * BALL_SPEED;
    ball.vy = Math.sin(angle) * BALL_SPEED;
    ball.stuck = false;
  }

  function resetGame() {
    score = 0;
    lives = INITIAL_LIVES;
    buildBricks();
    paddle.x = (CANVAS_W - paddle.w) / 2;
    resetBall();
    state = "ready";
    updateHud();
    draw();
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function startIdleLoop() {
    stopLoop();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    if (state === "playing") return;
    if (state === "won" || state === "lost") {
      resetGame();
    }
    if (state === "ready" || state === "paused") {
      state = "playing";
      if (ball.stuck) launchBall();
      stopLoop();
      loop();
    }
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    startIdleLoop();
  }

  function movePaddle() {
    if (pointerX != null) {
      paddle.x = pointerX - paddle.w / 2;
    } else {
      if (keys.left) paddle.x -= PADDLE_SPEED;
      if (keys.right) paddle.x += PADDLE_SPEED;
    }
    paddle.x = Math.max(0, Math.min(CANVAS_W - paddle.w, paddle.x));
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.size - 1;
    }
  }

  function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
    const nearestX = Math.max(rx, Math.min(cx, rx + rw));
    const nearestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= r * r;
  }

  function bounceOffBrick(brick) {
    const half = ball.size / 2;
    const overlapLeft = (ball.x + half) - brick.x;
    const overlapRight = (brick.x + brick.w) - (ball.x - half);
    const overlapTop = (ball.y + half) - brick.y;
    const overlapBottom = (brick.y + brick.h) - (ball.y - half);
    const minOverlapX = Math.min(overlapLeft, overlapRight);
    const minOverlapY = Math.min(overlapTop, overlapBottom);
    if (minOverlapX < minOverlapY) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
  }

  function update() {
    movePaddle();
    if (ball.stuck || state !== "playing") return;

    ball.x += ball.vx;
    ball.y += ball.vy;
    const half = ball.size / 2;

    if (ball.x - half <= 0) {
      ball.x = half;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + half >= CANVAS_W) {
      ball.x = CANVAS_W - half;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - half <= 0) {
      ball.y = half;
      ball.vy = Math.abs(ball.vy);
    }

    if (
      ball.vy > 0 &&
      circleRectCollision(ball.x, ball.y, half, paddle.x, paddle.y, paddle.w, paddle.h)
    ) {
      const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const clamped = Math.max(-1, Math.min(1, hit));
      const angle = (-Math.PI / 2) + clamped * (Math.PI / 3);
      const speed = Math.hypot(ball.vx, ball.vy) || BALL_SPEED;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = paddle.y - half - 1;
    }

    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (!circleRectCollision(ball.x, ball.y, half, brick.x, brick.y, brick.w, brick.h)) continue;
      brick.alive = false;
      score += brick.points;
      bounceOffBrick(brick);
      saveHighScore();
      updateHud();
      break;
    }

    if (bricks.every((b) => !b.alive)) {
      state = "won";
      saveHighScore();
      updateHud();
      return;
    }

    if (ball.y - half > CANVAS_H) {
      lives -= 1;
      updateHud();
      if (lives <= 0) {
        state = "lost";
        saveHighScore();
        return;
      }
      resetBall();
    }
  }

  function fillPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), Math.max(1, snap(w)), Math.max(1, snap(h)));
  }

  function drawScanlines() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    for (let y = 0; y < CANVAS_H; y += 2) {
      ctx.fillRect(0, y, CANVAS_W, 1);
    }
  }

  function drawPixelText(text, x, y, size) {
    ctx.fillStyle = COL.fg;
    ctx.font = `bold ${size}px "Courier New", Courier, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = false;
    ctx.fillText(text, snap(x), snap(y));
  }

  function drawOverlay(main, sub) {
    ctx.fillStyle = COL.overlay;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // 点滅でレトロ感
    const show = Math.floor(overlayBlink / 30) % 2 === 0;
    if (show) {
      drawPixelText(main, CANVAS_W / 2, CANVAS_H / 2 - 6, 14);
      if (sub) {
        ctx.fillStyle = COL.mid;
        ctx.font = `10px "Courier New", Courier, monospace`;
        ctx.fillText(sub, snap(CANVAS_W / 2), snap(CANVAS_H / 2 + 14));
      }
    }
  }

  function drawFrame() {
    // 1px 枠
    ctx.strokeStyle = COL.fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CANVAS_W - 1, CANVAS_H - 1);
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fillPixelRect(0, 0, CANVAS_W, CANVAS_H, COL.bg);

    for (const brick of bricks) {
      if (!brick.alive) continue;
      fillPixelRect(brick.x, brick.y, brick.w, brick.h, brick.shade);
      // ハイライト／影でドット感
      fillPixelRect(brick.x, brick.y, brick.w, 1, COL.fg);
      fillPixelRect(brick.x, brick.y + brick.h - 1, brick.w, 1, COL.dim);
    }

    // パドル（白＋下辺の影）
    fillPixelRect(paddle.x, paddle.y, paddle.w, paddle.h, COL.fg);
    fillPixelRect(paddle.x, paddle.y + paddle.h - 1, paddle.w, 1, COL.mid);

    // 正方形ボール
    const half = ball.size / 2;
    fillPixelRect(ball.x - half, ball.y - half, ball.size, ball.size, COL.fg);

    drawScanlines();
    drawFrame();

    if (state === "ready") drawOverlay("READY", "SPACE / START");
    else if (state === "paused") drawOverlay("PAUSED", "SPACE / START");
    else if (state === "won") drawOverlay("CLEAR", "SPACE / START");
    else if (state === "lost") drawOverlay("GAME OVER", "SPACE / START");
  }

  function loop() {
    overlayBlink += 1;
    if (state !== "playing") {
      draw();
      if (state === "ready" || state === "paused" || state === "won" || state === "lost") {
        rafId = requestAnimationFrame(loop);
      }
      return;
    }
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function isTypingTarget(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable;
  }

  function onKeyDown(e) {
    if (isTypingTarget(document.activeElement)) return;
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.left = true;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.right = true;
      e.preventDefault();
    } else if (e.code === "Space") {
      e.preventDefault();
      if (state === "ready" || state === "paused") startGame();
      else if (state === "playing") pauseGame();
      else if (state === "won" || state === "lost") {
        resetGame();
        startGame();
      } else if (ball.stuck && state === "playing") {
        launchBall();
      }
    }
  }

  function onKeyUp(e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  }

  function canvasLocalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  function onPointerMove(e) {
    pointerX = canvasLocalX(e.clientX);
    if (state === "ready" || state === "paused") movePaddle();
  }

  function onPointerDown(e) {
    pointerX = canvasLocalX(e.clientX);
    movePaddle();
    if (state === "ready") startGame();
    else if (ball.stuck && state === "playing") launchBall();
  }

  function onPointerUp() {
    pointerX = null;
  }

  startBtn?.addEventListener("click", () => {
    if (state === "won" || state === "lost") resetGame();
    startGame();
  });
  pauseBtn?.addEventListener("click", pauseGame);
  restartBtn?.addEventListener("click", () => {
    resetGame();
    startIdleLoop();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches[0]) {
      e.preventDefault();
      pointerX = canvasLocalX(e.touches[0].clientX);
      movePaddle();
    }
  }, { passive: false });

  resetGame();
  startIdleLoop();
})();
