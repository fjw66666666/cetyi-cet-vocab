// 极光氛围背景：渐变光斑 + 细网格 + 漂浮粒子
// 纯装饰层：pointer-events-none、aria-hidden、整体 opacity≤10%，移动端隐藏粒子、reduced-motion 禁用动画
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 细网格 */}
      <div className="absolute inset-0 bg-tech-grid bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_20%,transparent_75%)]" />
      {/* 极光光斑 ×2 */}
      <div className="absolute -top-32 left-[-10%] h-[420px] w-[560px] animate-aurora rounded-full bg-aurora-grad opacity-[0.10] blur-3xl" />
      <div className="absolute right-[-12%] top-1/3 h-[380px] w-[480px] animate-aurora-alt rounded-full bg-aurora-grad opacity-[0.08] blur-3xl" />
      {/* 漂浮粒子（移动端隐藏） */}
      <div className="aurora-particles absolute inset-0">
        {[
          { l: '12%', t: '22%', d: '0s', s: 5 },
          { l: '78%', t: '14%', d: '1.6s', s: 4 },
          { l: '58%', t: '58%', d: '3.1s', s: 6 },
          { l: '26%', t: '72%', d: '2.2s', s: 4 },
          { l: '88%', t: '76%', d: '4.4s', s: 5 },
          { l: '42%', t: '36%', d: '5.2s', s: 3 },
        ].map((p, i) => (
          <span
            key={i}
            className="animate-float-particle absolute rounded-full bg-aurora-grad opacity-40"
            style={{ left: p.l, top: p.t, width: p.s, height: p.s, animationDelay: p.d }}
          />
        ))}
      </div>
    </div>
  );
}
