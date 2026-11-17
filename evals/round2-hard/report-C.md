# report-C（匿名诊断报告）

## 现象
运行 repro.mjs 返回 {ok:false, error:"CouponService.applyCoupon: computed discount is not finite"}。错误消息硬编码指向 CouponService，是诱饵。DEBUG 日志显示券计算正常：coupon SAVE15: raw=674.7 amount=675。

## 已读文件与关键行
- repro.mjs:5-12 — items=[{1999×2},{500×1}], couponCode='SAVE15', region='us'
- src/api/checkout-controller.js:8-20 — AppConfig.load() → new PricingEngine(cfg) → engine.quote()；try/catch 把 err.message 原样返回
- src/pricing/pricing-engine.js:14-22 — quote 顺序 subtotal → discount → tax → total；20 行 if(!Number.isFinite(total)) throw new Error('CouponService.applyCoupon: computed discount is not finite') —— 错误文案是硬编码的，与真正 NaN 来源无关，最大误导点
- src/pricing/coupon-service.js:11-22 — 18 行 raw=(subtotalCents*rule.percent)/100，除数 100 常量；Money.round(674.7)=675，正常
- src/pricing/tax-calculator.js:10-15 — rate=0.07；raw=subtotal-discount×rate；14 行 return this.roundPolicy.round(raw)，NaN 从这里进入 total
- src/lib/money.js:2-9 — sum/round 正常
- src/lib/round-policy.js:4-17 — 7 行 this.step = cfg?.rounding?.roundingStep；11-14 行 bankers 分支 scaled=value/this.step; Math.round(scaled)*this.step
- src/config/app-config.js:2-18 — 10-11 行 rounding: { mode:'bankers', step:25 }，配置键名是 step，不是 roundingStep
- src/lib/logger.js:2-5 — debug 受 DEBUG 控制

## 完整调用链
repro.mjs:11 → checkout-controller.js:7 checkout → :8 AppConfig.load() → :9 new PricingEngine(cfg) → pricing-engine.js:14 quote({...}) → :15 subtotal=4498 → :16 coupons.applyCoupon → coupon-service.js:18 折扣=674.7→round=675（正常）→ pricing-engine.js:17 tax.compute(4498-675=3823,'us') → tax-calculator.js:11 rate=0.07 → :12 raw=3823×0.07=267.61 → :14 roundPolicy.round(267.61) → round-policy.js:11 mode='bankers' 命中 → :13 267.61 / this.step，而 this.step=undefined → scaled=NaN → :14 Math.round(NaN)*undefined=NaN → tax=NaN → pricing-engine.js:18 total=NaN → :19 !Number.isFinite(NaN) 为真 → :20 抛出硬编码且误导性的错误 → catch 原样返回。

## 根因（已证实，一句话）
配置里写的键是 rounding.step（app-config.js:11），但 RoundPolicy 构造函数读的是 cfg.rounding.roundingStep（round-policy.js:7）——键名不匹配导致 this.step=undefined；配置又启用 mode='bankers'，于是税额计算走 value/undefined 得 NaN，污染 total，最终触发抛错。错误消息被硬编码成指向 CouponService，是误导，真正 NaN 源头在税额取整策略。两个条件缺一不可：键名不匹配 + mode='bankers'。

## 判别实验（均未改文件，内存注入配置变体）
1. CONFIG bankers+step=25；RoundPolicy.step=undefined；rp.round(267.61)=NaN。
2. A 原样 → 抛 CouponService 错误。
3. B 改 mode='half-up' → 成功 {subtotal:4498,discount:675,tax:268,total:4091}。
4. C 保持 bankers 但补 roundingStep=25 → 成功 {total:4098}。决定性证据：补对键名即可消除 NaN。
5. D 完全去掉 coupon → 仍抛同样错误。证实与 CouponService 无关。
6. DEBUG=1 日志 → coupon raw=674.7/amount=675，折扣正常。
7. grep 全项目 → 仅 round-policy.js:7 读 roundingStep，app-config.js:11 写 step。

## 最终结论
真正根因：app-config.js:11 的 step 与 round-policy.js:7 读取的 roundingStep 键名不一致，使 bankers 取整步长变成 undefined，税额计算产生 NaN 并污染总价；pricing-engine.js:20 的硬编码错误消息把责任错误地指向 CouponService。修复：统一键名。

## 未能证实
无。所有陈述均为已观察或已证实；“诱饵”性质由实验 4/5/6 交叉验证。
