// 本包的冒烟测试：解析每个 SKILL.md 的 frontmatter，检查名称合法、
// 描述是完整句子（而不是 YAML 的 '>' 标记）、references 里提到的文件真实存在。
// 跑法：node --test test/skills.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSkills, parseSkill } from '../lib/skills.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILL_DIR = join(ROOT, 'skills')

const EXPECTED = [
  'agent-trust',
  'runtime-verify',
  'feature-map',
  'evidence-first-debug',
  'skill-eval',
  'agent-ready-architecture',
]

test('六个技能全部可被发现', () => {
  const names = readSkills(SKILL_DIR).map((s) => s.name).sort()
  assert.deepEqual(names, [...EXPECTED].sort())
})

test('description 解析出正文而不是折叠标记', () => {
  for (const skill of readSkills(SKILL_DIR)) {
    assert.ok(skill.description.length > 40, `${skill.name} 的 description 太短：${skill.description}`)
    assert.notEqual(skill.description, '>', `${skill.name} 的 description 只解析出了 '>'`)
    assert.ok(!skill.description.startsWith('|'), `${skill.name} 的 description 解析成了块标记`)
  }
})

test('名称是 kebab-case', () => {
  for (const skill of readSkills(SKILL_DIR)) {
    assert.match(skill.name, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  }
})

test('每个 description 都写了排他说明', () => {
  for (const skill of readSkills(SKILL_DIR)) {
    assert.match(skill.description, /Do NOT trigger for:/i, `${skill.name} 缺少 Do NOT trigger for`)
  }
})

test('正文里引用的 references 文件真实存在', () => {
  for (const skill of readSkills(SKILL_DIR)) {
    const refs = [...skill.body.matchAll(/`(references\/[\w.-]+\.md)`/g)].map((m) => m[1])
    for (const rel of new Set(refs)) {
      assert.ok(existsSync(join(skill.dir, rel)), `${skill.name} 缺少 ${rel}`)
    }
  }
})

test('缺失 frontmatter 的文件被拒绝而不是静默通过', () => {
  assert.equal(parseSkill('# 没有 frontmatter\n'), null)
  assert.equal(parseSkill('---\nname: x\n---\n'), null, '缺 description 应返回 null')
  assert.equal(parseSkill('---\nname: Bad_Name\ndescription: 有描述\n---\n'), null, '非法名称应返回 null')
})

test('每个技能目录都能被独立加载出正文', async () => {
  const provider = (await import('../lib/skills.js')).createSkillProvider(SKILL_DIR)
  for (const summary of await provider.list()) {
    const loaded = await provider.get({ name: summary.name, locator: summary.locator })
    assert.ok(loaded, `${summary.name} 加载失败`)
    assert.ok(loaded.content.length > 200, `${summary.name} 正文过短`)
  }
})

test('包清单与 patch 一致', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /name: dsh-agent-trust/)
  assert.match(patch, /id: agent-trust-kit/)
})

test('locale 与图标存在且可解析', () => {
  for (const lang of ['en', 'zh']) {
    const file = join(ROOT, 'locale', `${lang}.json`)
    const meta = JSON.parse(readFileSync(file, 'utf8')).meta
    assert.ok(meta.title && meta.description, `${lang} 缺少 title/description`)
    assert.ok(existsSync(join(ROOT, meta.detail)), `${lang} 的 detail 文件不存在`)
  }
  assert.ok(readFileSync(join(ROOT, 'icon.svg'), 'utf8').includes('<svg'))
})

test('技能目录里没有多余条目', () => {
  const dirs = readdirSync(SKILL_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  for (const d of dirs) {
    assert.ok(existsSync(join(SKILL_DIR, d.name, 'SKILL.md')), `${d.name} 没有 SKILL.md`)
  }
})
