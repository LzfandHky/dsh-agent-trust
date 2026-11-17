// dsh-agent-trust · Host 半边
// 把本包 skills/ 下的六个技能注册进 DSH 技能目录（ctx.skills），
// 模型目录、/skill 命令、右侧「技能」面板都能看到。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createSkillProvider } from './lib/skills.js'

// index.js 就在包根，所以基准是 '.'（不是 '..'：那会跑到包的上一级）。
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKILL_DIR = join(ROOT, 'skills')

export const name = 'agent-trust'
export const inject = ['skills']

export function apply(ctx) {
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(SKILL_DIR)))
}
