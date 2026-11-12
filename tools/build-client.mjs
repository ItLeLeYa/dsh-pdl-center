// 把 client-src 的分片按顺序拼接为单文件 client.js（DSH Client 模块加载格式）。
// 用法： node tools/build-client.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcDir = join(root, 'client-src')

const files = readdirSync(srcDir).filter(f => /^\d\d-.*\.js$/.test(f)).sort()
const parts = files.map(f => `// ---- ${f} ----\n` + readFileSync(join(srcDir, f), 'utf8'))

const body = `/**
 * PDL 井数据整理加载中台 —— Client 半边（浏览器模块）。
 * 由 tools/build-client.mjs 从 client-src/*.js 拼接；不要直接编辑本文件。
 */
window.__ModuleLoader__.load({
  id: 'dsh-pdl-center',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

${parts.join('\n')}
  },
})
`

writeFileSync(join(root, 'client.js'), body, 'utf8')
console.log(`built client.js from ${files.length} fragments (${body.length} bytes)`)
