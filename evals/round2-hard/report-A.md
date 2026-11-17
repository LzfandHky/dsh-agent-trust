# report-A（匿名诊断报告）

## 现象
node repro.mjs → stdout {"ok": false, "error": "CouponService.applyCoupon: computed discount is not finite"}；stderr [error] checkout failed ...；exit code 1。错误信息硬编码指向 CouponService，但这是诱饵。

## 已读文件与关键行
- repro.mjs:3-12 — 入口：items=[{1999,2},{500,1}], couponCode='SAVE15', region='us'
- src/api/checkout-controller.js:7-20 — checkout()：AppConfig.load() → new PricingEngine(cfg) → engine.quote()；catch 仅透传 err.message
- src/pricing/pricing-engine.js:14-23 — :19-20 硬编码 throw 'CouponService.applyCoupon...'——文案与真正 NaN 来源无关
- src/pricing/coupon-service.js:11-22 — :18 raw=4498*15/100=674.7（除数100为常量，不会为0）；Money.round→675，有限
- src/lib/money.js:3-8 — sum/round 正常
- src/pricing/tax-calculator.js:10-15 — :11 rate=0.07；:12 raw=3823*0.07=267.61；:14 return this.roundPolicy.round(raw) — NaN 在此产生
- src/lib/round-policy.js:4-17 — :6 mode='bankers'；:7 this.step = cfg.rounding.roundingStep（读的是 roundingStep）；:11-14 bankers 分支 value/this.step → step=undefined → NaN；half-up 分支安全
- src/config/app-config.js:2-18 — :9-12 rounding:{ mode:'bankers', step:25 } —— 配置写的是 step
- src/lib/logger.js:3 — debug 仅在 DEBUG 下打印

## 完整调用链
repro.mjs:11 → checkout-controller.js:8 AppConfig.load()={rounding:{mode:'bankers',step:25}} → :9 new PricingEngine→new RoundPolicy(mode='bankers', step=undefined) → engine.quote() → pricing-engine.js:15 subtotal=4498 → :16 discount=675(有限) → :17 tax.compute(3823,'us') → tax-calculator.js:12 raw=267.61 → :14 roundPolicy.round(267.61) → round-policy.js:13 267.61/undefined=NaN → total=NaN → :19-20 硬编码 throw → catch 返回 ok:false。

## 根因（已证实）
配置字段名错配：app-config.js:11 定义 rounding.step，而 round-policy.js:7 读取 cfg.rounding.roundingStep，导致 RoundPolicy.step === undefined；默认 mode='bankers' 下 value / undefined = NaN，税额为 NaN，总价随之 NaN。pricing-engine.js:20 把错误文案硬编码成 CouponService，构成误导性诱饵——折扣实为有限值 675。触发需两条件叠加：mode='bankers' + 名称不一致。

## 判别实验（未修改文件）
1. DEBUG=1 node repro.mjs → coupon raw=674.7 amount=675。折扣有限，排除 CouponService。
2. 逐层探针：step=25, roundingStep=undefined；RoundPolicy.step=undefined；round(267.61)=NaN；coupon=675 finite；tax=NaN；total=NaN。
3. 内存修复对照：补 roundingStep=25 → round=275 finite, total=4098；改 half-up → round=268 finite。证明字段名错配是根因。

## 未能证实
按要求只诊断，未修改任何文件。无法判定「正确修复」是改配置字段名还是改 RoundPolicy 读取名（属修复决策）。
