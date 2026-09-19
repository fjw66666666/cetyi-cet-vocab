// 词战长空 · React 渲染层（Canvas 挂载 + HUD + 弹药区 + 强化卡 + 结束面板 + 生命周期）
// 三层状态分离：实体坐标在引擎私有字段（不进 React）；HUD 数值经 onHud 离散/节流推送；
// 强化卡与结束面板走 onEvent 事件通道。
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, Heart, Pause, Plane, Play, RotateCcw, Volume2, X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { CountUp } from '@/components/CountUp';
import { SpeakerButton, StatCard } from '@/components/ui-bits';
import { store } from '@/lib/store';
import { speechSupported, stopSpeak } from '@/lib/speech';
import type { WordEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DIGIT_KEYS, MOVE_STEP, QUIZ_MODE_LABELS } from './constants';
import { Engine } from './engine';
import { disposeTheme, getCachedColors, subscribeTheme } from './theme';
import { useGameWords } from './useGameWords';
import { loadWrongBook, saveWrongBook } from './wrongbook';
import type {
  GameEvent,
  GameState,
  HudSnapshot,
  PlayMode,
  Question,
  QuizMode,
  SessionSummary,
  Verdict,
  WrongBook,
} from './types';

// ---------------- HUD（React.memo：仅离散/10Hz 推送时重建） ----------------

const SNAPSHOT_INIT: HudSnapshot = {
  hp: 3,
  wave: 1,
  score: 0,
  combo: 0,
  maxCombo: 0,
  timeRatio: 1,
  urgent: false,
};

const Hud = memo(function Hud({ hud, onPause }: { hud: HudSnapshot; onPause: () => void }) {
  const hearts = Math.max(0, Math.min(5, hud.hp));
  return (
    <div className="absolute inset-x-0 top-0 z-10 p-2 sm:p-3">
      <div className="glass-card flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs sm:text-sm">
        <div className="flex items-center gap-0.5" aria-label={`剩余生命 ${hud.hp}`} role="img">
          {Array.from({ length: hearts }).map((_, i) => (
            <Heart key={i} className="h-4 w-4 fill-destructive text-destructive" />
          ))}
          {hearts === 0 && <span className="text-destructive">❤ 0</span>}
        </div>
        <span className="ml-1 font-mono text-muted-foreground">WAVE {hud.wave}</span>
        <span className="ml-auto font-mono font-semibold tabular-nums">
          {hud.score.toLocaleString()}
        </span>
        <span
          className={cn(
            'font-mono',
            hud.combo > 0 ? 'text-primary' : 'text-muted-foreground/60',
          )}
        >
          🔥×{hud.combo}
        </span>
        <button
          type="button"
          aria-label="暂停游戏"
          onClick={onPause}
          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pause className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

// ---------------- 主组件 ----------------

type Highlight = 'correct' | 'wrong' | null;

export default function SkyWords() {
  const navigate = useNavigate();

  const [wrongbook, setWrongbook] = useState<WrongBook>(() => loadWrongBook());
  const [quizMode, setQuizMode] = useState<QuizMode>('en2zh');
  const [playMode, setPlayMode] = useState<PlayMode>('normal');
  const [gameId, setGameId] = useState(0);

  const [gameState, setGameState] = useState<GameState>('ready');
  const [hud, setHud] = useState<HudSnapshot>(SNAPSHOT_INIT);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [verdictInfo, setVerdictInfo] = useState<{
    verdict: Verdict;
    damage: number;
    correctIndex: number;
  } | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [cardExtended, setCardExtended] = useState(false);

  const { pool, wrongPool, map, size } = useGameWords(playMode, wrongbook);

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // 引擎持有最新创建参数（避免 effect 重订阅）
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const autoStartRef = useRef(false);
  const optsRef = useRef({ quizMode, playMode, pool, wrongPool });
  optsRef.current = { quizMode, playMode, pool, wrongPool };

  // ---------------- 引擎事件回调（稳定引用） ----------------

  const onHud = useCallback((snap: HudSnapshot) => {
    setHud(snap);
  }, []);

  const onEvent = useCallback((ev: GameEvent) => {
    switch (ev.type) {
      case 'state':
        setGameState(ev.state);
        break;
      case 'question':
        setActiveQuestion(ev.question);
        setVerdictInfo(null);
        setCardExtended(false);
        break;
      case 'verdict': {
        setVerdictInfo({ verdict: ev.verdict, damage: ev.damage, correctIndex: ev.correctIndex });
        setCardExtended(false);
        const wb = engineRef.current?.getWrongBook();
        if (wb) saveWrongBook(wb);
        break;
      }
      case 'card-closed':
        setVerdictInfo(null);
        setActiveQuestion(null);
        setCardExtended(false);
        break;
      case 'gameover': {
        setSummary(ev.summary);
        const wb = engineRef.current?.getWrongBook();
        if (wb) {
          saveWrongBook(wb);
          setWrongbook(wb);
        }
        break;
      }
      case 'wave':
        break;
      case 'warn':
        console.warn('[SkyWords]', ev.message);
        break;
      default:
        break;
    }
  }, []);

  // ---------------- ① 引擎挂载 / 卸载（仅在 gameId 变化时重建） ----------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const o = optsRef.current;
    const engine = new Engine(canvas, {
      pool: o.pool,
      wrongPool: o.wrongPool,
      mode: o.playMode,
      quizMode: o.quizMode,
      reduceMotion,
      soundOn: true,
      voice: store.get().settings.voice,
      wrongbook: loadWrongBook(),
      callbacks: { onHud, onEvent },
    });
    engineRef.current = engine;
    engine.setColors(getCachedColors());
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) engine.resize(rect.width, rect.height);
    if (autoStartRef.current) {
      autoStartRef.current = false;
      engine.start();
    }
    // ⚠️ 不变量：此处只释放引擎，绝不调用 disposeTheme()。
    // 主题单例 observer 的生命周期绑定在组件挂载（effect ③），若在 gameId 重建时销毁它，
    // effect ③（deps=[]）不会重跑，主题订阅将永久失效 → Canvas 不再跟随主题变色。
    // 重建后的引擎通过上面的 engine.setColors(getCachedColors()) 拿到当前色值；
    // 因 observer 一直存活，.dark 变化会持续刷新 cache（theme.ts），故 always fresh。
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [gameId, reduceMotion, onHud, onEvent]);

  // ---------------- ② 尺寸（ResizeObserver + DPR） ----------------

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const sync = () => {
      const rect = wrap.getBoundingClientRect();
      engineRef.current?.resize(rect.width, rect.height);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    sync();
    return () => ro.disconnect();
  }, []);

  // ---------------- ③ 主题订阅 ----------------

  useEffect(() => {
    const unsub = subscribeTheme((c) => engineRef.current?.setColors(c));
    // 订阅与释放成对：仅在组件真正卸载时释放主题单例（gameId 重建不触发本 effect）。
    return () => {
      unsub();
      disposeTheme();
    };
  }, []);

  // ---------------- ④ 输入监听（键盘 / 可见性 / 鼠标 / 触摸） ----------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.key === 'ArrowLeft') {
        engine.dispatch({ kind: 'move-by', dx: -MOVE_STEP });
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        engine.dispatch({ kind: 'move-by', dx: MOVE_STEP });
        e.preventDefault();
        return;
      }
      if (e.key in DIGIT_KEYS) {
        engine.dispatch({ kind: 'answer', index: DIGIT_KEYS[e.key] });
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        engine.dispatch({ kind: 'pause' });
        e.preventDefault();
        return;
      }
      // Space：仅当焦点不在交互元素上时才用于暂停，避免破坏按钮键盘激活
      if (e.key === ' ' || e.key === 'Spacebar') {
        const active = document.activeElement;
        const isInteractive =
          active instanceof HTMLButtonElement ||
          active instanceof HTMLAnchorElement ||
          active instanceof HTMLInputElement;
        if (!isInteractive) {
          engine.dispatch({ kind: 'pause' });
          e.preventDefault();
        }
      }
    };
    const onVis = () => {
      if (document.hidden) engineRef.current?.dispatch({ kind: 'pause' });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);

    const canvas = canvasRef.current;
    const toFieldX = (clientX: number): number => engineRef.current?.toFieldX(clientX) ?? 0;
    const onMouseMove = (e: MouseEvent) => {
      engineRef.current?.dispatch({ kind: 'move', x: toFieldX(e.clientX) });
    };
    const onMouseLeave = () => {
      engineRef.current?.dispatch({ kind: 'pause' });
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) engineRef.current?.dispatch({ kind: 'move', x: toFieldX(t.clientX) });
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // 阻止页面滚动（P0-17）
      const t = e.touches[0];
      if (t) engineRef.current?.dispatch({ kind: 'move', x: toFieldX(t.clientX) });
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
    };

    if (canvas) {
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      if (canvas) {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
      }
      stopSpeak(); // 卸载时停掉发音队列
    };
  }, []);

  // ---------------- 操作 ----------------

  const beginGame = useCallback(() => {
    setSummary(null);
    setHud(SNAPSHOT_INIT);
    autoStartRef.current = true;
    setGameId((g) => g + 1);
  }, []);

  const restartWrong = useCallback(() => {
    setPlayMode('wrongbook');
    setGameState('ready');
    setSummary(null);
    setHud(SNAPSHOT_INIT);
    autoStartRef.current = true;
    setGameId((g) => g + 1);
  }, []);

  const quitToHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handlePause = useCallback(() => {
    engineRef.current?.dispatch({ kind: 'pause' });
  }, []);
  const handleResume = useCallback(() => {
    engineRef.current?.dispatch({ kind: 'resume' });
  }, []);
  const handleReplay = useCallback(() => {
    engineRef.current?.dispatch({ kind: 'replay' });
  }, []);
  const handleExtend = useCallback(() => {
    setCardExtended(true);
    engineRef.current?.dispatch({ kind: 'extend' });
  }, []);
  const handleContinue = useCallback(() => {
    engineRef.current?.dispatch({ kind: 'continue' });
  }, []);

  // ---------------- 派生渲染数据 ----------------

  const showAmmo = activeQuestion !== null && (gameState === 'playing' || gameState === 'card');
  const highlight: Highlight = verdictInfo
    ? verdictInfo.verdict === 'correct'
      ? 'correct'
      : 'wrong'
    : null;

  const cardEntry: WordEntry | null =
    activeQuestion && gameState === 'card' ? activeQuestion.entry : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-2 py-4 sm:px-4">
      <div
        ref={wrapRef}
        className="game-root relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        <Hud hud={hud} onPause={handlePause} />

        {/* 读屏倒计时（仅在整数秒变化时更新，避免高频朗读） */}
        <span className="sr-only" aria-live="polite">
          {gameState === 'playing'
            ? `剩余 ${Math.ceil(hud.timeRatio * Math.max(4, 8 - 0.25 * (hud.wave - 1)) * 10) / 10} 秒`
            : ''}
        </span>

        {/* ---------------- 弹药区 ---------------- */}
        {showAmmo && activeQuestion && (
          <div className="absolute inset-x-0 bottom-0 z-30 safe-bottom p-2 sm:p-3">
            {activeQuestion.quizType === 'listen' && (
              <div className="mb-2 flex justify-center">
                <button
                  type="button"
                  aria-label="重播发音"
                  onClick={handleReplay}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-4 text-sm text-primary transition-colors hover:bg-primary/20"
                >
                  <Volume2 className="h-4 w-4" /> 重播发音
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {activeQuestion.options.map((opt, i) => {
                const isCorrectOpt = i === activeQuestion.correctIndex;
                const marked = highlight !== null && isCorrectOpt;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={gameState !== 'playing'}
                    aria-label={`选择 ${opt.text}（按键 ${i + 1}）`}
                    onClick={() => engineRef.current?.submitAnswer(i)}
                    className={cn(
                      'flex min-h-11 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-sm transition-colors',
                      'border-border bg-card/90 text-foreground hover:border-primary/40 hover:bg-secondary',
                      marked && highlight === 'correct' && 'border-primary bg-primary/15 text-primary',
                      marked && highlight === 'wrong' && 'border-destructive bg-destructive/15 text-destructive',
                    )}
                  >
                    <span className="font-word leading-tight">{opt.text}</span>
                    {marked && (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px]">
                        {highlight === 'correct' ? (
                          <>
                            <Check className="h-3 w-3" /> 正确
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3" /> 正确
                          </>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {highlight === 'wrong' && (
              <div className="mt-2 text-center text-xs text-destructive">
                正确释义是「{activeQuestion.entry.meanings[0]}」
              </div>
            )}
          </div>
        )}

        {/* ---------------- 覆盖层 ---------------- */}
        {gameState === 'ready' && (
          <Overlay>
            <GlassCard className="w-full max-w-sm p-6 text-center">
              <div className="mb-1 flex items-center justify-center gap-2 text-primary">
                <Plane className="h-6 w-6" />
                <h1 className="text-xl font-semibold">词战长空</h1>
              </div>
              <p className="text-xs text-muted-foreground">在弹幕中记住单词 · 答错不扣分只扣血</p>

              <div className="mt-4 text-left text-xs text-muted-foreground">题型</div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['en2zh', 'zh2en', 'listen', 'mix'] as QuizMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={quizMode === m}
                    onClick={() => setQuizMode(m)}
                    className={cn(
                      'min-h-11 rounded-lg border px-2 py-2 text-xs transition-colors',
                      quizMode === m
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {QUIZ_MODE_LABELS[m]}
                  </button>
                ))}
              </div>

              <div className="mt-3 text-left text-xs text-muted-foreground">玩法</div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={playMode === 'normal'}
                  onClick={() => setPlayMode('normal')}
                  className={cn(
                    'min-h-11 rounded-lg border px-2 py-2 text-xs transition-colors',
                    playMode === 'normal'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary',
                  )}
                >
                  普通闯关
                </button>
                <button
                  type="button"
                  aria-pressed={playMode === 'wrongbook'}
                  disabled={wrongPool.length === 0}
                  onClick={() => setPlayMode('wrongbook')}
                  className={cn(
                    'min-h-11 rounded-lg border px-2 py-2 text-xs transition-colors disabled:opacity-40',
                    playMode === 'wrongbook'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary',
                  )}
                >
                  专攻错词 ({wrongPool.length})
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">词池 {size} 词</p>
              {playMode === 'wrongbook' && wrongPool.length < 4 && wrongPool.length > 0 && (
                <p className="mt-1 text-xs text-amber-500">错词较少，干扰项将从全量词池补齐</p>
              )}

              <button
                type="button"
                onClick={beginGame}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <Play className="h-4 w-4" /> 开始游戏
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                ← → 移动 · 1–4 作答 · 触屏拖动
              </p>
            </GlassCard>
          </Overlay>
        )}

        {gameState === 'paused' && (
          <Overlay>
            <GlassCard className="w-full max-w-xs p-6 text-center">
              <h2 className="text-lg font-semibold">已暂停</h2>
              <p className="mt-1 text-xs text-muted-foreground">切回后计时不会补扣</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleResume}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground"
                >
                  <Play className="h-4 w-4" /> 继续游戏
                </button>
                <button
                  type="button"
                  onClick={quitToHome}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-secondary"
                >
                  退出
                </button>
              </div>
            </GlassCard>
          </Overlay>
        )}

        {gameState === 'card' && cardEntry && (
          <Overlay>
            <GlassCard
              className={cn(
                'w-full max-w-sm animate-pop p-5',
                verdictInfo && verdictInfo.verdict !== 'correct' && 'border border-destructive/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-word text-2xl font-semibold">{cardEntry.word}</span>
                {(cardEntry.us ?? cardEntry.uk) && (
                  <span className="text-sm text-muted-foreground">
                    /{(cardEntry.us ?? cardEntry.uk)?.replace(/^\/|\/$/g, '')}/
                  </span>
                )}
                {speechSupported && <SpeakerButton text={cardEntry.word} size="sm" className="ml-auto" />}
              </div>
              <div className="mt-1 text-sm">
                {cardEntry.pos && <span className="mr-2 text-muted-foreground">{cardEntry.pos}</span>}
                <span>{cardEntry.meanings.join('；')}</span>
              </div>

              {cardEntry.example && (
                <>
                  <hr className="my-3 border-border" />
                  <p className="text-sm leading-relaxed">{cardEntry.example.en}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{cardEntry.example.zh}</p>
                </>
              )}

              {cardEntry.mnemonic && (
                <p className="mt-3 text-xs text-muted-foreground">💡 {cardEntry.mnemonic}</p>
              )}

              {verdictInfo && verdictInfo.verdict !== 'correct' && (
                <p className="mt-3 text-sm font-medium text-destructive">
                  ❌ 正确释义：{cardEntry.meanings[0]}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleExtend}
                  disabled={cardExtended}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  记一下
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground"
                >
                  继续
                </button>
              </div>
            </GlassCard>
          </Overlay>
        )}

        {gameState === 'over' && summary && (
          <Overlay>
            <GlassCard className="w-full max-w-sm p-5">
              <h2 className="text-center text-lg font-semibold">本局战果</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatCard label="得分" value={summary.score} />
                <StatCard label="最高连击" value={`×${summary.maxCombo}`} />
                <StatCard label="击落敌机" value={summary.killed} />
                <StatCard label="本局词汇量" value={summary.uniqueWords} />
              </div>
              <div className="mt-2 text-center text-sm text-muted-foreground">
                正确率 <CountUp value={Math.round(summary.accuracy * 100)} className="font-mono" />%
              </div>

              <hr className="my-4 border-border" />
              <div className="text-xs text-muted-foreground">
                待巩固单词（错词本新增 {summary.newWrongEntries.length} 个）
              </div>
              {summary.newWrongEntries.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">本局无新增错词 👍</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {summary.newWrongEntries.map((e) => (
                    <li key={e.word} className="flex items-center gap-2 text-sm">
                      <span className="font-word font-medium">{e.word}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {map.get(e.word.toLowerCase())?.meanings[0] ?? ''}
                      </span>
                      <span className="ml-auto text-xs text-destructive">❌×{e.wrongCount}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  aria-label="再战一场，专攻错词"
                  onClick={restartWrong}
                  disabled={wrongPool.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> 再战一场 · 专攻错词
                </button>
                <button
                  type="button"
                  aria-label="回到词库查看"
                  onClick={() => navigate('/library')}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-secondary"
                >
                  回到词库
                </button>
              </div>
            </GlassCard>
          </Overlay>
        )}
      </div>
    </div>
  );
}

/** 覆盖层容器（居中 + 半透明遮罩） */
function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      {children}
    </div>
  );
}
