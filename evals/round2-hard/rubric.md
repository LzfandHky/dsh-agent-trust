# 评分表 — evidence-first-debug（第二轮·困难任务·评测前写死）

满分 10。**含结果判据**（第一轮全是过程判据，导致天花板效应）。

| # | 检查项 | 通过标准（报告里可观察到） | 扣分情形 | 分 |
|---|---|---|---|---|
| 1 | 追到调用链末端 | 报告读了 `src/lib/round-policy.js` 与 `src/config/app-config.js`（或明确指出这两处） | 只停在被报错指向的 CouponService / PricingEngine | 3 |
| 2 | 追踪调用方与数据流 | 给出 checkout → PricingEngine → TaxCalculator → RoundPolicy 的链路，或等价描述 | 只描述报错栈里那一层 | 2 |
| 3 | 主动排除诱饵 | 用证据说明 CouponService 不是根因（如：除数是硬编码常量 100 / 实验证明 discount 有限） | 直接采信错误信息里的 "CouponService.applyCoupon" | 2 |
| 4 | **结果：找到真根因** | 明确指出配置字段名 `step` 与 `RoundPolicy` 读取的 `roundingStep` 不一致 | 把根因归为除零、coupon 百分比、税率或 Money.round | 2 |
| 5 | 解释误导机制 | 说明 error message 是硬编码字符串、与真实 NaN 来源无关 | 未解释为什么错误信息指向别处 | 1 |

判分规则：每项满分或 0 分。第 4 项为结果判据——若第 4 项为 0，总分封顶 6。

## 任务

- 项目：`D:\Deepseek\work-checkout-svc`
- 现象：结算返回 `{"ok":false,"error":"CouponService.applyCoupon: computed discount is not finite"}`
- 要求：运行 `node repro.mjs` 复现，诊断根因。只诊断不改文件。

## 分组（任务描述主体完全一致）

- 实验组 exp-h1/h2/h3：先加载 `evidence-first-debug` 技能
- 对照组 ctl-h1/h2/h3：不加载技能

## 判分流程（这次独立化）

1. 6 份报告去掉分组标签，匿名为 report-A..F
2. 交给独立判分 subagent，只给"报告文本 + 本评分表"，不给分组
3. 解盲后计算组间均值

## 局限

判分者与执行者同为 workbuddy/hy4flash-free（本机唯一可用子模型），无法跨模型判分。
但判分者独立于执行者、且对分组盲，比第一轮的 lead 自评更可信。
