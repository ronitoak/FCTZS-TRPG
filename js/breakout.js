// クラシックなブロック崩し。ログイン・API 非依存。ハイスコアのみ localStorage。
"use strict";

(() => {
  const HIGH_SCORE_KEY = "fctzs-breakout-highscore";
  const CANVAS_W = 480;
  const CANVAS_H = 640;
  const PADDLE_W = 80;
  const PADDLE_H = 12;
  const PADDLE_SPEED = 7;
  const BALL_R = 6;
  const BALL_SPEED = 4.2;
  const INITIAL_LIVES = 3;
  const BRICK_ROWS = 6;
  const BRICK_COLS = 10;
  const BRICK_TOP = 60;
  const BRICK_GAP = 3;
  const BRICK_COLORS = ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2980b9", "#8e44ad"];

  const canvas = document.getElementById("breakout-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  const keys = { left: false, right: false };
  let pointerX = null;

  const paddle = {
    w: PADDLE_W,
    h: PADDLE_H,
    x: (CANVAS_W - PADDLE_W) / 2,
    y: CANVAS_H - 40
  };

  const ball = {
    x: CANVAS_W / 2,
    y: CANVAS_H - 60,
    r: BALL_R,
    vx: 0,
    vy: 0,
    stuck: true
  };

  /** @type {{ x: number, y: number, w: number, h: number, alive: boolean, color: string, points: number }[]} */
  let bricks = [];

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
    const brickW = (CANVAS_W - totalGapX) / BRICK_COLS;
    const brickH = 18;
    bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        bricks.push({
          x: BRICK_GAP + col * (brickW + BRICK_GAP),
          y: BRICK_TOP + row * (brickH + BRICK_GAP),
          w: brickW,
          h: brickH,
          alive: true,
          color: BRICK_COLORS[row % BRICK_COLORS.length],
          points: (BRICK_ROWS - row) * 10
        });
      }
    }
  }

  function resetBall() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
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

  function startGame() {
    if (state === "playing") return;
    if (state === "won" || state === "lost") {
      resetGame();
    }
    if (state === "ready" || state === "paused") {
      state = "playing";
      if (ball.stuck) launchBall();
      loop();
    }
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    draw();
  }

  function togglePause() {
    if (state === "playing") pauseGame();
    else if (state === "paused" || state === "ready") startGame();
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
      ball.y = paddle.y - ball.r - 2;
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
    const overlapLeft = (ball.x + ball.r) - brick.x;
    const overlapRight = (brick.x + brick.w) - (ball.x - ball.r);
    const overlapTop = (ball.y + ball.r) - brick.y;
    const overlapBottom = (brick.y + brick.h) - (ball.y - ball.r);
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

    if (ball.x - ball.r <= 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.r >= CANVAS_W) {
      ball.x = CANVAS_W - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
    }

    if (
      ball.vy > 0 &&
      circleRectCollision(ball.x, ball.y, ball.r, paddle.x, paddle.y, paddle.w, paddle.h)
    ) {
      const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const clamped = Math.max(-1, Math.min(1, hit));
      const angle = (-Math.PI / 2) + clamped * (Math.PI / 3);
      const speed = Math.hypot(ball.vx, ball.vy) || BALL_SPEED;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = paddle.y - ball.r - 1;
    }

    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (!circleRectCollision(ball.x, ball.y, ball.r, brick.x, brick.y, brick.w, brick.h)) continue;
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

    if (ball.y - ball.r > CANVAS_H) {
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

  function drawOverlay(text) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
    ctx.font = "16px sans-serif";
    ctx.fillText("スペースまたは「開始」で続行", CANVAS_W / 2, CANVAS_H / 2 + 36);
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (const brick of bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
    }

    ctx.fillStyle = "#ecf0f1";
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    if (state === "ready") drawOverlay("READY");
    else if (state === "paused") drawOverlay("PAUSED");
    else if (state === "won") drawOverlay("CLEAR!");
    else if (state === "lost") drawOverlay("GAME OVER");
  }

  function loop() {
    if (state !== "playing") {
      draw();
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
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    resetGame();
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
})();
