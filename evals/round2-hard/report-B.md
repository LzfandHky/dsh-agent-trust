# report-B（匿名诊断报告）

## 现象（已复现）
node repro.mjs 输出 { "ok": false, "error": "CouponService.applyCoupon: computed discount is not finite" }。stderr [error] checkout failed ...。exit code 1。

## 已读文件与关键行
- repro.mjs:3-12 — req: items 1999×2 + 500×1, couponCode 'SAVE15', region 'us'
- src/config/app-config.js:2-17 — DEFAULT rounding: { mode:'bankers', step:25 }（9-12 行）。字段名是 step。load() 返回 structuredClone(DEFAULT)
- src/lib/round-policy.js:4-17 — 构造 6-7 行：mode = cfg?.rounding?.mode || 'half-up'；step = cfg?.rounding?.roundingStep（读的是 roundingStep）。round() 11-15 行 bankers 分支 scaled = value / this.step; Math.round(scaled)*this.step
- src/pricing/tax-calculator.js:4-15 — 7 行 new RoundPolicy(cfg)；compute() 11-14 行 rate, raw, return roundPolicy.round(raw)
- src/pricing/coupon-service.js:11-22 — 18 行 (subtotalCents * rule.percent) / 100，除数 100 是硬编码常量；注释点明“不会为 0”
- src/pricing/pricing-engine.js:7-24 — 15 subtotal、16 discount、17 tax、18 total；19-20 行 if(!Number.isFinite(total)) throw new Error('CouponService.applyCoupon...')——硬编码误导（诱饵）
- src/api/checkout-controller.js:7-21 — catch 块 18-19 行记日志并返回 {ok:false,error}
- src/lib/money.js:2-9 — sum/round 正常
- src/lib/logger.js:2-5 — 正常

## 完整调用链
repro.mjs:11 → checkout-controller.js:8 AppConfig.load()（rounding:{mode:'bankers',step:25}）→ :9 new PricingEngine → TaxCalculator 构造 → new RoundPolicy(cfg)：mode='bankers'，step=cfg.rounding.roundingStep=undefined → :11 engine.quote() → pricing-engine.js:15 subtotal=4498 → :16 coupon discount=675（有限）→ :17 tax.compute(3823,'us') → tax-calculator.js:12 raw=3823×0.07=267.61 → round-policy.js:13 267.61/undefined=NaN → :14 Math.round(NaN)*undefined=NaN → pricing-engine.js:18 total=4498-675+NaN=NaN → :19-20 抛错（错误指向 CouponService）→ catch 返回 ok:false。

## 根因（已证实）
配置项字段名不一致：生产方 app-config.js:11 写 rounding.step，消费方 round-policy.js:7 读 cfg.rounding.roundingStep。因为配置把 mode 设为 'bankers'，激活依赖 step 的分支；step 为 undefined 使 value/undefined = NaN，NaN 沿税额→总价传播，最终在 pricing-engine.js:19 失败。触发条件：只有 mode='bankers' 才走除以 step 的分支；mode 为 'half-up' 则 round() 走 Math.round(value)，不碰 step，不会出错。错误信息指向 CouponService 是硬编码误导。

## 判别实验（内联 node 脚本，未改文件）
探针：step=25, roundingStep=undefined；RoundPolicy.mode=bankers, step=undefined；round(313.86)=NaN；subtotal=4498, discount=675(有限), tax=NaN。
- 实验 A：bankers + 正确键 roundingStep:25 → round=325（有限）。✅
- 实验 B：bankers + 现状键 step:25 → NaN。✅ 复现故障
- 实验 C：half-up（无 step）→ round=314。✅ 证明 mode 是触发开关
- 实验 D：CouponService 单独跑 SAVE15(4498) → 675, finite=true。✅ 排除券除零诱饵

## 最终结论
真正根因是 app-config.js 与 round-policy.js 对取整步长的字段名不一致（step vs roundingStep），在 mode:'bankers' 下产生 NaN 并传播到总价；报错信息硬编码指向 CouponService 是红鲱鱼。修复方向：统一两边键名。

## 未能证实
无关键未证实项，所有环节已用实测中间值闭环。唯一未执行的是按要求不做实际改文件后的回归。
