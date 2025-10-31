import React, { useEffect, useRef, useState } from "react";

/**
 * SnowRider — Alps & Alaska
 * 단일 파일 React 게임 (캔버스)
 * - 스키, 스노우보드, 윙슈트, 낙하산, 썰매 모드 지원
 * - 레벨 기반(속도, 지형 난이도, 맵 길이, 장애물 밀도)
 * - PC(키보드) & 모바일(터치) 조작
 * - 에셋 없이 벡터 드로잉만 사용
 *
 * 조작법 (공통)
 * - 좌/우: 방향 전환
 * - 점프/부스트: Space/Up (지상에서는 점프, 공중 모드에서는 부스트)
 * - 일시정지: P
 */

const DISCIPLINES = [
  { key: "ski", label: "스키", color: "#38bdf8" },
  { key: "board", label: "스노보드", color: "#22c55e" },
  { key: "wingsuit", label: "윙슈트", color: "#f59e0b" },
  { key: "parachute", label: "낙하산", color: "#eab308" },
  { key: "sled", label: "썰매", color: "#ef4444" }
];

// 레벨 정의 (알프스 → 알래스카)
const LEVELS = [
  { name: "Lv1 알프스 초원 슬로프", length: 1200, baseSpeed: 2.2, slope: 0.9, bumps: 0.7, obstacles: 0.6 },
  { name: "Lv2 알프스 급사면", length: 1600, baseSpeed: 2.8, slope: 1.0, bumps: 1.0, obstacles: 0.9 },
  { name: "Lv3 알래스카 파우더", length: 2000, baseSpeed: 3.2, slope: 1.2, bumps: 1.2, obstacles: 1.1 },
  { name: "Lv4 알래스카 빙벽 협곡", length: 2300, baseSpeed: 3.6, slope: 1.4, bumps: 1.4, obstacles: 1.3 },
  { name: "Lv5 알래스카 스톰런 (보스)", length: 2600, baseSpeed: 4.0, slope: 1.6, bumps: 1.6, obstacles: 1.5 }
];

// 모바일 터치 버튼 레이아웃
const TouchButton = ({ label, onPress, className }) => (
  <button
    onTouchStart={(e) => { e.preventDefault(); onPress(true); }}
    onTouchEnd={(e) => { e.preventDefault(); onPress(false); }}
    onMouseDown={() => onPress(true)}
    onMouseUp={() => onPress(false)}
    className={`select-none rounded-2xl px-4 py-3 text-white/90 shadow-lg backdrop-blur bg-black/30 ${className}`}
  >
    {label}
  </button>
);

// 간단한 노이즈(지형) 생성
function perlinLike(x, seed=0) {
  // 빠른 의사난수 기반 스무딩
  const n = Math.sin(x * 0.0009 + seed) * 0.5 + Math.sin(x * 0.004 + seed*1.7) * 0.35 + Math.sin(x * 0.012 + seed*2.3) * 0.15;
  return n;
}

export default function SnowRider() {
  const canvasRef = useRef(null);
  const [discipline, setDiscipline] = useState(DISCIPLINES[1]);
  const [levelIdx, setLevelIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null); // {win:boolean, time:number, score:number}
  const [hud, setHud] = useState({ speed: 0, dist: 0, score: 0, health: 100 });

  // 입력 상태
  const inputRef = useRef({ left:false, right:false, up:false });

  // 게임 상태
  const stateRef = useRef({
    t: 0,
    x: 0, // 진행 거리
    y: 0, // 수직 위치(공중 모드)
    vy: 0,
    speed: 0,
    score: 0,
    health: 100,
    seed: Math.random()*1000,
    obstacles: [],
    rings: [], // 공중 모드용 링
    finished: false,
  });

  // 크기 조절
  useEffect(() => {
    const onResize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.min(window.innerWidth, 1200);
      const h = Math.min(window.innerHeight, 800);
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + "px";
      c.style.height = h + "px";
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 키보드 입력
  useEffect(() => {
    const d = inputRef.current;
    const onDown = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") d.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") d.right = true;
      if (e.code === "ArrowUp" || e.code === "Space" || e.code === "KeyW") d.up = true;
      if (e.code === "KeyP") setPaused(p => !p);
    };
    const onUp = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") d.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") d.right = false;
      if (e.code === "ArrowUp" || e.code === "Space" || e.code === "KeyW") d.up = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // 장애물/링 생성
  const initCourse = () => {
    const L = LEVELS[levelIdx];
    const obs = [];
    const rings = [];
    const density = L.obstacles * (discipline.key === "wingsuit" || discipline.key === "parachute" ? 0.8 : 1);
    for (let x=200; x<L.length; x+= 60 + Math.random()*120) {
      if (Math.random() < 0.35 * density) {
        obs.push({ x, size: 12 + Math.random()*24, type: Math.random()<0.5?"tree":"rock" });
      }
      if ((discipline.key === "wingsuit" || discipline.key === "parachute") && Math.random()<0.18) {
        rings.push({ x, y: 200 + Math.random()*220, r: 18 + Math.random()*10, passed: false });
      }
    }
    stateRef.current.obstacles = obs;
    stateRef.current.rings = rings;
  };

  // 렌더 & 업데이트 루프
  useEffect(() => {
    if (!running) return;
    setResult(null);
    stateRef.current = { t:0, x:0, y:180, vy:0, speed:0, score:0, health:100, seed:Math.random()*1000, obstacles:[], rings:[], finished:false };
    initCourse();

    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (paused) return render();
      update();
      render();
    };
    const update = () => {
      const L = LEVELS[levelIdx];
      const s = stateRef.current;
      const input = inputRef.current;
      s.t += 1/60;

      // 베이스 속도 & 제어
      const terrainBoost = (discipline.key === "ski" || discipline.key === "board" || discipline.key === "sled") ?
        (1 + Math.max(0, perlinLike(s.x, s.seed)) * 0.3 * L.slope) : 1;

      const target = L.baseSpeed * terrainBoost;
      s.speed += (target - s.speed) * 0.05; // 관성

      // 조종성
      let steer = 0;
      if (input.left) steer -= 1;
      if (input.right) steer += 1;

      // 모드별 물리
      if (discipline.key === "wingsuit" || discipline.key === "parachute") {
        // 공중: y중력 + 부력
        const gravity = discipline.key === "parachute" ? 0.15 : 0.30;
        const lift = input.up ? (discipline.key === "parachute" ? -0.35 : -0.55) : 0;
        s.vy += gravity + lift;
        s.vy = Math.min(s.vy, 3.2);
        s.y += s.vy + steer * 0.6; // 좌우는 약간의 수직 변화로 표현
        s.y = Math.max(40, Math.min(360, s.y));
      } else {
        // 지상: 점프
        const groundY = 260 + perlinLike(s.x*2, s.seed) * 40 * LEVELS[levelIdx].bumps;
        let py = groundY;
        if (s.y < groundY) { // 공중
          s.vy += 0.55;
          s.y += s.vy;
          if (s.y >= groundY) { s.y = groundY; s.vy = 0; }
        } else {
          s.y = groundY;
          if (input.up) { s.vy = -8.2; s.y += s.vy; }
        }
        s.speed += steer * 0.05; // 체중이동
        s.speed = Math.max(0.8, s.speed);
      }

      // 진행
      s.x += s.speed * (discipline.key === "wingsuit" ? 2.0 : discipline.key === "parachute" ? 1.4 : 1.6);

      // 충돌 & 점수
      const playerY = s.y;
      const px = s.x;
      for (const o of s.obstacles) {
        if (Math.abs(o.x - px) < 12 + o.size*0.5) {
          const oy = 260 + perlinLike(o.x*2, s.seed) * 40 * LEVELS[levelIdx].bumps;
          const dy = Math.abs(playerY - oy);
          if (dy < 22 + o.size*0.3) {
            s.health -= 18;
            o.x += 120; // 튕겨내기(한 번 피해 감소)
          }
        }
      }
      for (const r of s.rings) {
        if (!r.passed && Math.abs(r.x - px) < r.r && Math.abs(playerY - r.y) < r.r) {
          r.passed = true;
          s.score += 150;
        }
      }

      // 기본 점수: 속도 기반
      s.score += Math.floor(s.speed * 2);

      if (s.health <= 0) {
        s.finished = true;
        setRunning(false);
        setResult({ win:false, time: s.t, score: s.score });
      }
      if (s.x >= L.length) {
        s.finished = true;
        setRunning(false);
        setResult({ win:true, time: s.t, score: s.score + Math.floor(500 * (levelIdx+1)) });
      }

      setHud({ speed: s.speed, dist: s.x / L.length, score: s.score, health: s.health });
    };

    const render = () => {
      const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d");
      const w = c.clientWidth; const h = c.clientHeight;
      const s = stateRef.current; const L = LEVELS[levelIdx];

      // 하늘 그라디언트
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0, "#e0f2fe");
      g.addColorStop(1, "#f8fafc");
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

      // 산 배경 (간단한 실루엣)
      const drawMount = (baseY, amp, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x=0; x<=w; x+=4) {
          const worldX = s.x*0.3 + x;
          const y = baseY - Math.abs(Math.sin(worldX * 0.002 + 3) * amp);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      };
      drawMount(h*0.65, 60, "#cbd5e1");
      drawMount(h*0.75, 30, "#e2e8f0");

      // 눈 지형 (지상 모드)
      if (discipline.key !== "wingsuit" && discipline.key !== "parachute") {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x=0; x<=w; x+=2) {
          const worldX = s.x + x; // 카메라 이동
          const y = 260 + perlinLike(worldX*2, s.seed) * 40 * L.bumps;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
      }

      // 장애물
      for (const o of s.obstacles) {
        const screenX = o.x - s.x;
        if (screenX < -40 || screenX > w+40) continue;
        const baseY = 260 + perlinLike(o.x*2, s.seed) * 40 * L.bumps;
        if (o.type === "tree") {
          // 소나무
          ctx.fillStyle = "#14532d";
          for (let i=0;i<3;i++) {
            ctx.beginPath();
            ctx.moveTo(screenX, baseY - o.size - i*10);
            ctx.lineTo(screenX - (o.size*0.8 - i*4), baseY - i*10);
            ctx.lineTo(screenX + (o.size*0.8 - i*4), baseY - i*10);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = "#78350f";
          ctx.fillRect(screenX-2, baseY, 4, 10);
        } else {
          // 바위
          ctx.fillStyle = "#334155";
          ctx.beginPath();
          ctx.ellipse(screenX, baseY-6, o.size, o.size*0.6, 0, 0, Math.PI*2);
          ctx.fill();
        }
      }

      // 링 (공중 모드)
      for (const r of s.rings) {
        const screenX = r.x - s.x;
        if (screenX < -60 || screenX > w+60) continue;
        ctx.lineWidth = 5;
        ctx.strokeStyle = r.passed ? "#a3e635" : "#f59e0b";
        ctx.beginPath();
        ctx.arc(screenX, r.y, r.r, 0, Math.PI*2);
        ctx.stroke();
      }

      // 플레이어
      const px = w*0.35; // 카메라 고정형
      const py = s.y;
      ctx.save();
      ctx.translate(px, py);
      // 보드/스키/윙슈트 색상
      ctx.fillStyle = discipline.color;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;

      if (discipline.key === "ski") {
        // 스키어
        ctx.beginPath(); ctx.arc(0, -22, 8, 0, Math.PI*2); ctx.fill(); // 머리
        ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.stroke(); // 몸통
        ctx.beginPath(); ctx.moveTo(-12,6); ctx.lineTo(-2,8); ctx.moveTo(12,6); ctx.lineTo(2,8); ctx.stroke(); // 다리
        ctx.fillRect(-18,10,16,3); ctx.fillRect(2,10,16,3); // 스키판
      } else if (discipline.key === "board" || discipline.key === "sled") {
        // 보더/썰매
        ctx.beginPath(); ctx.arc(0, -16, 9, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
        const wBoard = discipline.key === "sled" ? 34 : 26;
        ctx.fillRect(-wBoard/2, 10, wBoard, 4);
      } else if (discipline.key === "wingsuit" || discipline.key === "parachute") {
        // 윙슈트/낙하산
        ctx.beginPath(); ctx.arc(0, -18, 8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(0, 14, 16, 0); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill();
        if (discipline.key === "parachute") {
          ctx.strokeStyle = "#334155"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, -36, 26, Math.PI, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-18,-28); ctx.lineTo(-6,-10); ctx.moveTo(18,-28); ctx.lineTo(6,-10); ctx.stroke();
        }
      }
      ctx.restore();

      // HUD
      ctx.fillStyle = "#0f172a"; ctx.globalAlpha = 0.85;
      ctx.fillRect(12, 12, 210, 96);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillText(`${LEVELS[levelIdx].name}`, 20, 32);
      ctx.fillText(`모드: ${discipline.label}`, 20, 52);
      ctx.fillText(`속도: ${hud.speed.toFixed(2)}`, 20, 72);
      ctx.fillText(`점수: ${hud.score}`, 20, 92);

      // 체력바
      ctx.fillStyle = "#94a3b8"; ctx.fillRect(20, 102, 180, 10);
      ctx.fillStyle = hud.health>35? "#22c55e" : "#ef4444";
      ctx.fillRect(20, 102, Math.max(0, 180 * (hud.health/100)), 10);

      // 진행바
      ctx.fillStyle = "#94a3b8"; ctx.fillRect(20, h-24, w-40, 8);
      ctx.fillStyle = discipline.color; ctx.fillRect(20, h-24, (w-40) * Math.min(1, hud.dist), 8);

      // 일시정지/결과 오버레이
      if (paused || result) {
        ctx.fillStyle = "#00000080"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "28px ui-sans-serif";
        if (paused) {
          ctx.fillText("일시정지 (P)", w/2, h/2);
        }
        if (result) {
          ctx.fillText(result.win?"클리어!" : "실패…", w/2, h/2 - 20);
          ctx.font = "18px ui-sans-serif";
          ctx.fillText(`시간: ${result.time.toFixed(1)}s  점수: ${result.score}`, w/2, h/2 + 10);
        }
        ctx.textAlign = "left";
      }
    };

    tick();
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, levelIdx, discipline]);

  // 모바일 터치 상태 핸들러
  const setTouch = (key) => (pressed) => {
    inputRef.current[key] = pressed;
  };

  const startGame = () => { setRunning(true); setPaused(false); setResult(null); };

  return (
    <div className="w-full h-full min-h-screen bg-gradient-to-br from-sky-200 to-slate-100 text-slate-900 flex flex-col items-center justify-start p-4 select-none">
      <div className="w-full max-w-5xl flex flex-col gap-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          🏔️ SnowRider — Alps & Alaska
        </h1>
        <p className="text-sm md:text-base text-slate-600">웹/모바일 레벨형 스노우 스포츠 게임 — 스키·보드·윙슈트·낙하산·썰매</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">모드</label>
          <div className="flex flex-wrap gap-2">
            {DISCIPLINES.map(d => (
              <button key={d.key} onClick={()=>setDiscipline(d)} className={`px-3 py-1.5 rounded-xl text-sm shadow ${discipline.key===d.key?"bg-slate-900 text-white":"bg-white/80"}`}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-slate-300 mx-2"/>
          <label className="text-sm">레벨</label>
          <select className="px-3 py-1.5 rounded-xl bg-white/80 shadow text-sm" value={levelIdx} onChange={e=>setLevelIdx(parseInt(e.target.value))}>
            {LEVELS.map((lv,i)=>(<option key={lv.name} value={i}>{i+1}. {lv.name}</option>))}
          </select>
          <div className="grow"/>
          {!running ? (
            <button onClick={startGame} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow-lg">게임 시작</button>
          ) : (
            <button onClick={()=>setPaused(p=>!p)} className="px-4 py-2 rounded-xl bg-white/80 shadow">{paused?"재개(P)":"일시정지(P)"}</button>
          )}
          {running && (
            <button onClick={()=>{ setRunning(false); setResult(null); }} className="px-3 py-2 rounded-xl bg-white/80 shadow">종료</button>
          )}
        </div>
      </div>

      {/* 캔버스 */}
      <div className="w-full max-w-5xl aspect-[16/9] bg-white/60 rounded-2xl shadow-xl overflow-hidden mt-2 relative">
        <canvas ref={canvasRef} className="w-full h-full"/>
        {/* 모바일 컨트롤 */}
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-between px-3 md:px-6 gap-3 pointer-events-none select-none">
          <div className="flex gap-2 pointer-events-auto">
            <TouchButton label="◀︎" onPress={setTouch("left")} />
            <TouchButton label="▶︎" onPress={setTouch("right")} />
          </div>
          <div className="pointer-events-auto">
            <TouchButton label={discipline.key === "wingsuit" || discipline.key === "parachute" ? "부스트" : "점프"} onPress={setTouch("up")} className="px-6"/>
          </div>
        </div>
      </div>

      {/* 도움말 */}
      <div className="w-full max-w-5xl mt-3 grid md:grid-cols-3 gap-3 text-sm">
        <div className="bg-white/80 rounded-xl p-3 shadow">
          <div className="font-semibold mb-1">조작</div>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>좌/우: 방향 전환 (←/→ 또는 A/D)</li>
            <li>점프/부스트: ↑ 또는 Space</li>
            <li>일시정지: P</li>
          </ul>
        </div>
        <div className="bg-white/80 rounded-xl p-3 shadow">
          <div className="font-semibold mb-1">레벨 규칙</div>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>레벨이 오를수록 길이, 속도, 지형 기복, 장애물이 증가</li>
            <li>충돌 시 체력 감소, 0이 되면 실패</li>
            <li>링 통과(공중 모드)와 속도 유지로 점수 획득</li>
          </ul>
        </div>
        <div className="bg-white/80 rounded-xl p-3 shadow">
          <div className="font-semibold mb-1">커스터마이즈</div>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>LEVELS 배열로 난이도/길이 조절</li>
            <li>DISCIPLINES 색/레이블 변경 가능</li>
            <li>perlinLike() 파라미터로 슬로프 형태 변경</li>
          </ul>
        </div>
      </div>

      {/* 결과 리스타트 바 */}
      {result && (
        <div className="w-full max-w-5xl mt-3 flex items-center gap-2">
          <div className={`px-3 py-2 rounded-xl text-sm ${result.win?"bg-emerald-600 text-white":"bg-rose-600 text-white"}`}>
            {result.win?"클리어! 축하합니다." : "실패했습니다. 다시 도전!"}
          </div>
          <div className="text-sm">시간 {result.time.toFixed(1)}s · 점수 {result.score}</div>
          <div className="grow"/>
          <button onClick={()=>{ setResult(null); setRunning(true); }} className="px-3 py-2 rounded-xl bg-slate-900 text-white">다시 시작</button>
        </div>
      )}

      <footer className="opacity-60 text-xs mt-4">© SnowRider demo. Made for Stone.</footer>
    </div>
  );
}
