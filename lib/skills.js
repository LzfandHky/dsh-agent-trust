// 技能提供方：把本包 skills/<name>/SKILL.md 注册进 DSH 的技能目录（ctx.skills）。
//
// 用户自己的 ~/.dsh/skills 或项目 .dsh/skills 里放同名技能时那一份优先：
// 本提供方用 rank 600（随包提供），低于项目（100/200）与用户（400/500）根。
//
// frontmatter 用一个小而完整的解析器，而不是单行正则——本套技能的 description
// 用 YAML 折叠标量（`description: >`），单行正则只会取到 ">" 这个字符。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

// 取回 `key: >` / `key: |` 块标量或普通标量；不含嵌套结构，够本包用。
function scalar(lines, key) {
  const i = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (i < 0) return undefined
  const inline = lines[i].slice(key.length + 1).trim()
  if (inline && inline !== '>' && inline !== '|') return unquote(inline)
  const block = []
  for (const line of lines.slice(i + 1)) {
    if (line.trim() === '' || /^\s/.test(line)) block.push(line.trim())
    else break
  }
  const text = inline === '|' ? block.join('\n') : block.join(' ')
  return text.trim() || undefined
}

const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2')

export function parseSkill(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const lines = m[1].split(/\r?\n/)
  const name = scalar(lines, 'name')
  const description = scalar(lines, 'description')
  if (!name || !description) return null
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return null
  return { name, description, whenToUse: scalar(lines, 'whenToUse'), body: text.slice(m[0].length) }
}

export function readSkills(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = join(dir, d.name, 'SKILL.md')
      if (!existsSync(file)) return null
      const parsed = parseSkill(readFileSync(file, 'utf8'))
      return parsed && { ...parsed, dir: join(dir, d.name), file }
    })
    .filter(Boolean)
}

function candidate(skill) {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'agent-trust',
    rank: RANK,
    locator: skill.dir,
    resourceBase: { kind: 'directory', path: skill.dir },
  }
}

export function createSkillProvider(dir) {
  return {
    name: 'agent-trust',
    async list() {
      return readSkills(dir).map(candidate)
    },
    async get(ref) {
      const skill = readSkills(dir).find((s) => s.dir === ref.locator && s.name === ref.name)
      if (!skill) return undefined
      const { rank, locator, ...summary } = candidate(skill)
      // 正文里的 references/ 路径相对技能目录；把根路径替换进去，模型不必猜。
      const content = skill.body.replaceAll('<SKILL_ROOT>', skill.dir)
      return { ...summary, content }
    },
  }
}
