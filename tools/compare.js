/**
 * @file _compare.js
 * @description 通用函数级文件对比工具，支持 JS↔JS、JS↔TS、TS↔TS 对比
 *
 * 用法：
 *   node _compare.js --base <文件> --target <文件1> [<文件2> ...] [选项]
 *
 * 选项：
 *   --base <路径>         基准文件（必填）
 *   --target <路径>       目标文件，可多个，内容会合并（必填）
 *   --names <name1,name2>  只检查指定函数名（逗号分隔），不传则自动提取
 *   --ignore <name1,name2> 忽略的函数名（逗号分隔），这些函数的差异不报错
 *   --no-auto             不自动提取函数名，必须配合 --names 使用
 *   --strip-types         去除 TypeScript 类型注解后再对比（JS↔TS 时推荐）
 *   --show-match          也输出匹配的函数名
 *   --context <数字>       差异上下文字符数，默认 80
 *
 * 支持的函数定义模式：
 *   - function name() {} / async function name() {}
 *   - export function name() {}
 *   - name(params) { }               对象字面量方法简写（Mixin 核心）
 *   - name: function(params) { }     对象字面量传统方法
 *   - const name = function() {}     函数表达式
 *   - const name = () => {}          箭头函数
 *   - static name() / private name() 类方法
 *   - TS 泛型/返回类型/访问修饰符
 *
 * 示例：
 *   node _compare.js --base a.js --target b.js
 *   node _compare.js --base scene-llm.js --target llm-settings.js --target llm-prompt.js
 *   node _compare.js --base overlay.js --target overlay.ts --strip-types
 *   node _compare.js --base a.js --target b.js --ignore fillLlmSettingsForm
 *   node _compare.js --base a.js --target b.js --names foo,bar,baz
 */

const fs = require('fs')
const path = require('path')

// ─── 参数解析 ───

function parseArgs(argv) {
  const args = { base: '', targets: [], names: [], ignore: [], noAuto: false, stripTypes: false, showMatch: false, context: 80, comments: false, batch: [] }
  let i = 2
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--base') { args.base = argv[++i]; i++ }
    else if (arg === '--target') { args.targets.push(argv[++i]); i++ }
    else if (arg === '--names') { args.names = argv[++i].split(',').map(s => s.trim()).filter(Boolean); i++ }
    else if (arg === '--ignore') { args.ignore = argv[++i].split(',').map(s => s.trim()).filter(Boolean); i++ }
    else if (arg === '--no-auto') { args.noAuto = true; i++ }
    else if (arg === '--strip-types') { args.stripTypes = true; i++ }
    else if (arg === '--show-match') { args.showMatch = true; i++ }
    else if (arg === '--context') { args.context = parseInt(argv[++i], 10) || 80; i++ }
    else if (arg === '--comments') { args.comments = true; i++ }
    else if (arg === '--batch') {
      // 格式: --batch base1,target1;base2,target2;base3,target3
      // 或: --batch @file.txt 从文件读取
      let batchStr = argv[++i]
      if (batchStr.startsWith('@')) {
        const batchFile = batchStr.slice(1)
        batchStr = fs.readFileSync(path.resolve(batchFile), 'utf-8').trim()
      }
      const pairs = batchStr.split(';').map(s => s.trim()).filter(Boolean)
      for (const pair of pairs) {
        const [b, t] = pair.split(',').map(s => s.trim())
        if (b && t) args.batch.push({ base: b, target: t })
      }
      i++
    }
    else { i++ }
  }
  return args
}

/**
 * 使用 TypeScript 编译器剥离类型注解
 * 比 regex 方案准确、可靠，不会产生误删或漏删
 */
function stripTypes(code) {
  const ts = require('typescript')
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      esModuleInterop: true,
    }
  })
  let output = result.outputText
  // 去掉 "use strict"; 和可能的 export 空语句
  output = output.replace(/^"use strict";\s*\n?/m, '')
  // 去掉末尾可能的空 export {}
  output = output.replace(/\nexport\s*\{\}\s*;?\s*$/m, '')
  return output
}

// ─── 函数提取 ───

const SKIP_NAMES = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch',
  'return', 'const', 'let', 'var', 'function', 'class', 'new',
  'throw', 'try', 'typeof', 'instanceof', 'void', 'delete',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'forEach', 'map', 'filter', 'reduce', 'push', 'pop', 'shift',
  'unshift', 'splice', 'slice', 'concat', 'join', 'indexOf',
  'includes', 'toString', 'valueOf', 'hasOwnProperty', 'constructor',
  'prototype', 'then', 'finally', 'resolve', 'reject',
  'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math',
  'console', 'document', 'window', 'Promise', 'Error', 'Date',
  'assert', 'require', 'module', 'exports', 'import', 'from',
  'async', 'await', 'yield', 'break', 'continue', 'default',
  'extends', 'implements', 'super', 'this', 'static', 'get', 'set',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'addEventListener', 'removeEventListener', 'querySelector',
  'querySelectorAll', 'getElementById', 'createElement',
  'appendChild', 'removeChild', 'insertBefore', 'replaceChild',
  'setAttribute', 'getAttribute', 'classList', 'style', 'innerHTML',
  'textContent', 'innerText', 'outerHTML', 'value',
  'log', 'warn', 'error', 'info', 'debug',
  'parse', 'stringify', 'keys', 'values', 'entries', 'assign',
  'bind', 'call', 'apply', 'length', 'name', 'type',
  'test', 'exec', 'match', 'replace', 'search', 'split',
  'charAt', 'substring', 'toLowerCase', 'toUpperCase', 'trim',
  'startsWith', 'endsWith', 'repeat', 'padStart', 'padEnd',
])

/**
 * 从源码中提取函数体
 *
 * 支持的模式：
 *   1. function name() {} / async function name() {} / export function name() {}
 *   2. name(params) { }              对象字面量方法简写（Mixin 核心）
 *   3. name: function(params) { }    对象字面量传统方法
 *   4. const name = function() {}    函数表达式
 *   5. const name = () => {}         箭头函数
 *   6. static/async/private name()   类方法
 *   7. TS 泛型/返回类型
 *
 * 策略：用多种正则找到函数名位置，验证后面确实有 {（跳过泛型、参数、返回类型），
 *       然后通过大括号匹配提取完整函数体
 */
function extractFunction(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // 多种定义模式的正则，统一找到 name 的位置
  const patterns = [
    // 1. function 声明：function name( / async function name( / export function name(
    new RegExp(
      '(?:^|\\n|\\r\\n)' +
      '[ \\t]*' +
      '(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s+' +
      escaped +
      '\\s*[<(]',
      'gm'
    ),
    // 2. 对象方法简写：name( / async name(
    //    必须在行首或 { , 之后（排除函数调用）
    new RegExp(
      '(?:(?:^|\\n|\\r\\n)[ \\t]*|[,\\{]\\s*)' +
      '(?:async\\s+)?' +
      escaped +
      '\\s*\\(',
      'gm'
    ),
    // 3. 对象属性方法：name: function( / name: async function(
    new RegExp(
      '(?:^|\\n|\\r\\n)[ \\t]*' +
      escaped +
      '\\s*:\\s*(?:async\\s+)?function\\s*\\(',
      'gm'
    ),
    // 4. 函数表达式：const/let/var name = function( / const name = () =>
    new RegExp(
      '(?:^|\\n|\\r\\n)[ \\t]*' +
      '(?:const|let|var)\\s+' +
      escaped +
      '\\s*=\\s*(?:async\\s+)?(?:function\\s*\\(|\\([^)]*\\)\\s*=>)',
      'gm'
    ),
    // 5. 类方法：static/async/private name(
    new RegExp(
      '(?:^|\\n|\\r\\n)[ \\t]*' +
      '(?:(?:public|private|protected|static|readonly|abstract|override)\\s+)*' +
      '(?:async\\s+)?(?:\\*\\s*)?' +
      escaped +
      '\\s*[<(]',
      'gm'
    ),
    // 6. 原型方法：Name.prototype.methodName = function(
    new RegExp(
      escaped.replace(/\\\./g, '\\.') +
      '\\s*=\\s*(?:async\\s+)?function\\s*\\(',
      'gm'
    ),
  ]

  for (const regex of patterns) {
    const result = tryExtractWithRegex(content, name, regex)
    if (result) return result
  }

  return null
}

/**
 * 用给定正则尝试提取函数体，验证匹配后面确实有 {
 * 返回 { body, startLine, endLine } 或 null
 */
function tryExtractWithRegex(content, name, regex) {
  let match
  while ((match = regex.exec(content)) !== null) {
    const namePos = match.index + match[0].indexOf(name)
    const afterName = content.slice(namePos + name.length)

    // 跳过泛型 <...>、参数列表 (...)、返回类型 : Type，检查是否有 {
    const j = skipToBrace(afterName)
    if (j !== null && j < afterName.length && afterName[j] === '{') {
      // 找到真正的定义，提取函数体
      return extractBody(content, namePos, name, afterName, j)
    }
  }
  return null
}

/**
 * 从 name 位置开始，跳过泛型、参数、返回类型，找到 { 的位置
 * 返回 afterName 中的索引，或 null
 */
function skipToBrace(afterName) {
  let j = 0

  // 跳过空白
  while (j < afterName.length && /\s/.test(afterName[j])) j++

  // 跳过 = 和 async（原型方法/静态方法：Name.prototype.method = function / Name.method = async function）
  if (j < afterName.length && afterName[j] === '=') {
    j++
    while (j < afterName.length && /\s/.test(afterName[j])) j++
    // 跳过 async
    if (j + 4 < afterName.length && afterName.slice(j, j + 5) === 'async' && /\s/.test(afterName[j + 5])) {
      j += 5
      while (j < afterName.length && /\s/.test(afterName[j])) j++
    }
    // 跳过 function
    if (j + 7 < afterName.length && afterName.slice(j, j + 8) === 'function' && /[\s(]/.test(afterName[j + 8])) {
      j += 8
      while (j < afterName.length && /\s/.test(afterName[j])) j++
    }
  }

  // 跳过泛型 <...>
  if (j < afterName.length && afterName[j] === '<') {
    let d = 0
    while (j < afterName.length) {
      if (afterName[j] === '<') d++
      else if (afterName[j] === '>') { d--; if (d === 0) { j++; break } }
      j++
    }
  }

  // 跳过空白
  while (j < afterName.length && /\s/.test(afterName[j])) j++

  // 跳过参数列表 (...)
  if (j < afterName.length && afterName[j] === '(') {
    let d = 0
    while (j < afterName.length) {
      if (afterName[j] === '(') d++
      else if (afterName[j] === ')') { d--; if (d === 0) { j++; break } }
      j++
    }
  }

  // 跳过空白
  while (j < afterName.length && /\s/.test(afterName[j])) j++

  // 跳过返回类型 : Type
  if (j < afterName.length && afterName[j] === ':') {
    j++
    while (j < afterName.length && /\s/.test(afterName[j])) j++
    // 跳过类型直到 { 或 => 或 ;
    while (j < afterName.length && afterName[j] !== '{' && afterName[j] !== ';' && afterName[j] !== '=') j++
    // 如果遇到 =，检查是否是 => （箭头函数返回类型）
    if (j < afterName.length && afterName[j] === '=' && afterName[j + 1] === '>') {
      // ): Type => 形式，跳过 =>
      j += 2
      while (j < afterName.length && /\s/.test(afterName[j])) j++
    }
  }

  // 跳过空白
  while (j < afterName.length && /\s/.test(afterName[j])) j++

  return j
}

/**
 * 从 namePos 开始提取完整函数体（大括号匹配）
 * 返回 { body, startLine, endLine }，行号为 1-based
 */
function extractBody(content, namePos, name, afterName, braceOffset) {
  const braceStart = namePos + name.length + braceOffset

  // 大括号匹配
  let depth = 0
  let endIdx = braceStart
  for (let k = braceStart; k < content.length; k++) {
    if (content[k] === '{') depth++
    else if (content[k] === '}') {
      depth--
      if (depth === 0) { endIdx = k; break }
    }
  }

  const body = content.slice(namePos, endIdx + 1)
  // 计算行号：namePos 之前有多少个 \n
  const beforeStart = content.slice(0, namePos)
  const startLine = (beforeStart.match(/\n/g) || []).length + 1
  const endLine = startLine + (body.match(/\n/g) || []).length

  return { body, startLine, endLine }
}

/**
 * 自动从源码中提取所有函数名
 * 支持 JS 和 TS，包括对象字面量方法简写
 */
function autoExtractNames(content) {
  const names = new Set()

  // 模式1：function name( / async function name( / export function name(
  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+\*?\s*([a-zA-Z_$][\w$]*)\s*[<(]/g
  // 模式2：对象方法简写 name( { — 必须在行首缩进或 { , 之后
  const methodShorthandRegex = /(?:^|[\n\r])[\t ]*(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm
  // 模式3：对象属性方法 name: function(
  const methodColonRegex = /(?:^|[\n\r])[\t ]*([a-zA-Z_$][\w$]*)\s*:\s*(?:async\s+)?function\s*\(/gm
  // 模式4：函数表达式 const/let/var name = function / const name = () =>
  const funcExprRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\s*\(|\([^)]*\)\s*=>)/g
  // 模式5：原型方法 Name.prototype.methodName = function(
  const protoMethodRegex = /([a-zA-Z_$][\w$]*)\.prototype\.([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/g
  // 模式6：构造函数静态方法 Name.staticMethod = function(（排除 .prototype.）
  // 要求行首缩进，排除 self.ws.onopen 等局部赋值
  const staticMethodRegex = /(?:^|[\n\r])[ \t]*([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/gm

  let m
  // 先收集 prototype 和 static 方法的短名，避免 methodShorthandRegex 重复提取
  const protoShortNames = new Set()
  const staticShortNames = new Set()
  while ((m = protoMethodRegex.exec(content)) !== null) {
    protoShortNames.add(m[2])
    const fullName = m[1] + '.prototype.' + m[2]
    names.add(fullName)
  }
  while ((m = staticMethodRegex.exec(content)) !== null) {
    // 排除 prototype 模式（已被 protoMethodRegex 捕获）
    if (content.slice(Math.max(0, m.index - 10), m.index + m[0].length).includes('.prototype.')) continue
    staticShortNames.add(m[2])
    const fullName = m[1] + '.' + m[2]
    names.add(fullName)
  }

  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1]
    if (!SKIP_NAMES.has(name) && name.length > 1) names.add(name)
  }
  while ((m = methodShorthandRegex.exec(content)) !== null) {
    const name = m[1]
    // 跳过已被 protoMethod/staticMethod 捕获的短名
    if (!SKIP_NAMES.has(name) && name.length > 1 && !protoShortNames.has(name) && !staticShortNames.has(name)) names.add(name)
  }
  while ((m = methodColonRegex.exec(content)) !== null) {
    const name = m[1]
    if (!SKIP_NAMES.has(name) && name.length > 1) names.add(name)
  }
  while ((m = funcExprRegex.exec(content)) !== null) {
    const name = m[1]
    if (!SKIP_NAMES.has(name) && name.length > 1) names.add(name)
  }

  return [...names].sort()
}

/**
 * 归一化：去除空白差异，便于对比
 */
function normalize(code) {
  return code
    .replace(/\r\n/g, '\n')
    .replace(/"/g, "'")                   // 统一引号（双引号→单引号）
    .replace(/^\s*;\s*$/gm, '')           // 删除独立分号行（TS 编译器残留）
    .replace(/;\s*/g, ' ')                // 删除分号（TS 编译器自动添加的）
    .replace(/\bfunction\s*\(/g, 'function(')  // 统一 function( 和 function (
    .replace(/\/\*\s*ignore\s*\*\//g, '')     // 删除 /* ignore */ 注释（TS lint 要求）
    .replace(/\bwindow\./g, '')           // 统一 window.xxx → xxx（TS 迁移常见简化）
    .replace(/:\s*function\s*\(/g, '(')   // 统一方法简写: name: function() → name()
    .replace(/\s+/g, ' ')                 // 合并空白
    .replace(/\(\s+/g, '(')               // 忽略括号内前导空格差异
    .replace(/\s+\)/g, ')')              // 忽略括号内尾随空格差异
    .trim()
}

/**
 * 格式化函数行号范围字符串
 */
function formatRange(baseRange, targetRange) {
  const parts = []
  if (baseRange) parts.push('基准L' + baseRange.start + '-' + baseRange.end)
  if (targetRange) parts.push('目标L' + targetRange.start + '-' + targetRange.end)
  return parts.length > 0 ? ' [' + parts.join(', ') + ']' : ''
}

/**
 * 找到两个字符串第一个差异位置
 */
function firstDiffPos(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/**
 * 在源码中搜索 normalize 后的文本片段，返回匹配到的行号
 * 策略：从差异片段中提取多个短 token，在源码逐行搜索最匹配的行
 */
function findDiffLines(sourceContent, normalizedDiff) {
  // 从差异文本中提取关键 token
  // 先按 ... 分割（上下文分隔符），然后每个片段提取短 token
  const parts = normalizedDiff.split('...')
  const tokens = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.length < 4) continue
    // 按空格分割，取长度 > 3 的 token
    const words = trimmed.split(/\s+/).filter(w => w.length > 3)
    // 优先取看起来像标识符/字符串的 token
    for (const w of words) {
      if (/[a-zA-Z_$]/.test(w) || /[\u4e00-\u9fff]/.test(w)) {
        tokens.push(w)
      }
    }
  }
  if (tokens.length === 0) return null

  // 去重，取最多 8 个 token
  const uniqueTokens = [...new Set(tokens)].slice(0, 8)

  const lines = sourceContent.split('\n')
  let bestLine = null
  let bestScore = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNorm = lines[i].replace(/\s+/g, ' ').trim()
    let score = 0
    for (const token of uniqueTokens) {
      if (lineNorm.includes(token)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestLine = i + 1 // 1-based 行号
    }
  }

  // 至少匹配 1 个 token 才返回
  return bestScore > 0 ? bestLine : null
}

/**
 * 找出两个 normalize 后字符串的所有差异片段
 * 返回 [{ base, target, baseLine, targetLine }] 数组，每个元素是一处差异的上下文
 */
function findAllDiffs(a, b, ctx, baseSource, targetSource) {
  const diffs = []
  let i = 0
  while (i < Math.max(a.length, b.length)) {
    // 跳过相同部分
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    if (i >= a.length && i >= b.length) break
    const diffStart = i
    // 找到下一个相同的位置（往前看一小段，避免把连续差异拆太碎）
    let j = i
    while (j < Math.max(a.length, b.length)) {
      if (j < a.length && j < b.length && a[j] === b[j]) {
        // 确认连续3个字符相同才算重新同步
        if (j + 2 < a.length && j + 2 < b.length && a[j + 1] === b[j + 1] && a[j + 2] === b[j + 2]) break
      }
      j++
    }
    const diffEnd = j
    const start = Math.max(0, diffStart - ctx)
    const end = Math.min(Math.max(a.length, b.length), diffEnd + ctx)
    const baseSnippet = a.slice(start, end)
    const targetSnippet = b.slice(start, end)
    diffs.push({
      base: baseSnippet,
      target: targetSnippet,
      baseLine: baseSource ? findDiffLines(baseSource, baseSnippet) : null,
      targetLine: targetSource ? findDiffLines(targetSource, targetSnippet) : null,
    })
    i = diffEnd
  }
  return diffs
}

// ─── 注释专项检查 ───

/**
 * 从源码中提取所有注释，关联到所在函数
 * 返回 Map<函数名, 注释数组>，全局注释用 '__global__' 作 key
 *
 * 提取策略：
 *   1. 单行注释 // ...（不含 URL // 和正则内 //）
 *   2. 块注释 /* ... *‍/
 *   3. 忽略 JSDoc @file/@description 等文件头注释
 *   4. 忽略纯分隔线注释（如 // ────）
 *   5. 忽略只含 type/interface 的 TS 专用注释
 */
function extractComments(content) {
  const commentMap = new Map() // 函数名 → [{ line, text }]
  const globalComments = []

  // 先建立函数名→行号范围映射
  const funcRanges = buildFuncRanges(content)

  // 逐行扫描注释
  const lines = content.split('\n')
  let inBlockComment = false
  let blockStart = -1
  let blockText = ''

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const lineNum = lineIdx + 1

    // 块注释处理
    if (inBlockComment) {
      blockText += '\n' + line
      if (line.includes('*/')) {
        inBlockComment = false
        const comment = cleanComment(blockText)
        if (comment) {
          assignComment(comment, blockStart, funcRanges, commentMap, globalComments)
        }
      }
      continue
    }

    // 检查块注释开始
    const blockStartIdx = line.indexOf('/*')
    if (blockStartIdx >= 0 && !line.slice(blockStartIdx).includes('*/')) {
      // 跨行块注释
      inBlockComment = true
      blockStart = lineNum
      blockText = line
      continue
    }

    // 单行块注释 /* ... */
    if (blockStartIdx >= 0 && line.includes('*/')) {
      const comment = cleanComment(line.trim())
      if (comment) {
        assignComment(comment, lineNum, funcRanges, commentMap, globalComments)
      }
      continue
    }

    // 单行注释 //
    const singleLineIdx = findSingleLineComment(line)
    if (singleLineIdx >= 0) {
      const commentText = line.slice(singleLineIdx).trim()
      const comment = cleanComment(commentText)
      if (comment) {
        assignComment(comment, lineNum, funcRanges, commentMap, globalComments)
      }
    }
  }

  if (globalComments.length > 0) {
    commentMap.set('__global__', globalComments)
  }
  return commentMap
}

/**
 * 找到行内 // 注释的起始位置
 * 跳过 URL 中的 // 和字符串中的 //
 */
function findSingleLineComment(line) {
  let inString = false
  let stringChar = ''
  let i = 0
  while (i < line.length - 1) {
    const ch = line[i]
    if (inString) {
      if (ch === '\\') { i += 2; continue }
      if (ch === stringChar) inString = false
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true
      stringChar = ch
      i++
      continue
    }
    if (ch === '/' && line[i + 1] === '/') {
      return i
    }
    i++
  }
  return -1
}

/**
 * 清理注释文本，返回 null 表示应忽略
 */
function cleanComment(text) {
  let t = text.trim()
  // 去掉 // 前缀
  if (t.startsWith('//')) t = t.slice(2).trim()
  // 去掉 /* */ 前缀后缀
  if (t.startsWith('/*')) t = t.slice(2)
  if (t.endsWith('*/')) t = t.slice(0, -2)
  t = t.trim()

  // 忽略空注释
  if (!t) return null
  // 忽略纯分隔线（如 ────, ====, ****）
  if (/^[─═\-_*#]+\s*$/.test(t)) return null
  // 忽略 JSDoc 文件头
  if (/^@\w/.test(t)) return null
  // 忽略只含 TypeScript 关键字的注释
  if (/^(ts-ignore|ts-expect-error|eslint-disable|@ts-ignore|@ts-expect-error|eslint-enable)/.test(t)) return null
  // 忽略极短注释（1-2字符，通常是分隔符）
  if (t.length <= 2) return null

  return t
}

/**
 * 将注释分配到对应函数
 */
function assignComment(comment, lineNum, funcRanges, commentMap, globalComments) {
  // 找到包含此行的函数
  for (const [name, range] of funcRanges) {
    if (lineNum >= range.start && lineNum <= range.end) {
      if (!commentMap.has(name)) commentMap.set(name, [])
      commentMap.get(name).push({ line: lineNum, text: comment })
      return
    }
  }
  // 不在任何函数内 → 全局注释
  globalComments.push({ line: lineNum, text: comment })
}

/**
 * 建立函数名→行号范围映射
 * 起始行往前扩展到包含函数上方的 JSDoc/注释
 */
function buildFuncRanges(content) {
  const ranges = new Map()
  const lines = content.split('\n')

  // 用已有的 autoExtractNames 获取函数名
  const names = autoExtractNames(content)

  for (const name of names) {
    const funcBody = extractFunction(content, name)
    if (!funcBody) continue

    // 找到函数体在源码中的位置
    const funcStart = content.indexOf(funcBody)
    if (funcStart < 0) continue

    // 计算行号
    let startLine = content.slice(0, funcStart).split('\n').length
    const endLine = startLine + funcBody.split('\n').length - 1

    // 往前扩展：把函数上方的 JSDoc 和注释也纳入范围
    // 从 startLine - 1 开始往上找，遇到空行或非注释行停止
    for (let i = startLine - 2; i >= 0; i--) {
      const line = lines[i].trim()
      if (line === '' || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line.startsWith('/**')) {
        startLine = i + 1
      } else {
        break
      }
    }

    ranges.set(name, { start: startLine, end: endLine })
  }

  return ranges
}

/**
 * 对比两个注释 Map，找出基准有但目标没有的注释
 */
function compareComments(baseComments, targetComments) {
  const lost = [] // { func, line, text }
  const kept = [] // { func, line, text }

  for (const [funcName, baseCmts] of baseComments) {
    const targetCmts = targetComments.get(funcName) || []
    const targetTexts = new Set(targetCmts.map(c => normalizeComment(c.text)))

    for (const c of baseCmts) {
      const norm = normalizeComment(c.text)
      if (targetTexts.has(norm)) {
        kept.push({ func: funcName, line: c.line, text: c.text })
      } else {
        // 模糊匹配：检查目标中是否有包含相同关键词的注释
        const fuzzyMatch = targetCmts.some(tc => fuzzyCommentMatch(norm, normalizeComment(tc.text)))
        if (fuzzyMatch) {
          kept.push({ func: funcName, line: c.line, text: c.text })
        } else {
          lost.push({ func: funcName, line: c.line, text: c.text })
        }
      }
    }
  }

  return { lost, kept }
}

/**
 * 注释归一化：去除空白、标点差异
 */
function normalizeComment(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[，。；：！？、]/g, ',')
    .replace(/[""''`]/g, '"')
    .trim()
    .toLowerCase()
}

/**
 * 模糊注释匹配：关键词重叠度 > 60%
 */
function fuzzyCommentMatch(a, b) {
  if (!a || !b) return false
  const wordsA = new Set(a.split(/[\s,;:]+/).filter(w => w.length > 1))
  const wordsB = new Set(b.split(/[\s,;:]+/).filter(w => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return false
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  const ratio = overlap / Math.max(wordsA.size, wordsB.size)
  return ratio > 0.6
}

// ─── 主逻辑 ───

/**
 * 对单对文件执行对比，返回 results 对象
 */
function compareFiles(baseFilePath, targetFilePaths, options) {
  const { names: forcedNames, ignore, noAuto, stripTypes: doStripTypes, context, comments } = options
  const ignoreSet = new Set(ignore)
  const ctx = context

  // 读取文件
  const basePath = path.resolve(baseFilePath)
  if (!fs.existsSync(basePath)) {
    console.error('基准文件不存在: ' + basePath)
    return null
  }
  let baseContent = fs.readFileSync(basePath, 'utf8')

  let targetContent = ''
  for (const t of targetFilePaths) {
    const tPath = path.resolve(t)
    if (!fs.existsSync(tPath)) {
      console.error('目标文件不存在: ' + tPath)
      return null
    }
    targetContent += fs.readFileSync(tPath, 'utf8') + '\n'
  }

  // 自动检测是否需要 strip-types
  const baseIsTs = basePath.endsWith('.ts')
  const targetIsTs = targetFilePaths.some(t => t.endsWith('.ts'))
  const autoStrip = doStripTypes || (baseIsTs !== targetIsTs)

  if (autoStrip) {
    if (baseIsTs) baseContent = stripTypes(baseContent)
    if (targetIsTs) targetContent = stripTypes(targetContent)
  }

  // 确定要检查的函数名
  let names = forcedNames
  if (names.length === 0 && !noAuto) {
    const baseNames = autoExtractNames(baseContent)
    const targetNames = new Set(autoExtractNames(targetContent))
    names = baseNames
    const missing = names.filter(n => !targetNames.has(n))
    if (missing.length > 0) {
      console.log('  目标文件中未找到（可能仍存在，提取器未识别）: ' + missing.join(', '))
    }
  }

  if (names.length === 0) {
    console.log('  (无可提取的函数，跳过)')
    return { matched: [], differed: [], missing: [], ignored: [], autoStrip, names: [], skipped: true }
  }

  // 保存原始文件内容（用于行号定位）
  const baseRaw = fs.readFileSync(basePath, 'utf-8')
  const targetRaw = targetFilePaths.map(t => fs.readFileSync(path.resolve(t), 'utf-8')).join('\n')

  // 对比
  const results = { matched: [], differed: [], missing: [], ignored: [], autoStrip, names }

  for (const name of names) {
    const b = extractFunction(baseContent, name)
    const n = extractFunction(targetContent, name)

    if (!b) continue
    if (!n) {
      if (ignoreSet.has(name)) {
        results.ignored.push({ name, base: '(缺失)', target: '(缺失)' })
      } else {
        results.missing.push(name)
      }
      continue
    }

    const bNorm = normalize(b.body)
    const nNorm = normalize(n.body)

    if (bNorm === nNorm) {
      results.matched.push(name)
    } else if (ignoreSet.has(name)) {
      const diffs = findAllDiffs(bNorm, nNorm, ctx, baseRaw, targetRaw)
      results.ignored.push({ name, diffs, baseRange: { start: b.startLine, end: b.endLine }, targetRange: { start: n.startLine, end: n.endLine } })
    } else {
      const diffs = findAllDiffs(bNorm, nNorm, ctx, baseRaw, targetRaw)
      results.differed.push({ name, diffs, baseRange: { start: b.startLine, end: b.endLine }, targetRange: { start: n.startLine, end: n.endLine } })
    }
  }

  // 注释专项检查
  if (comments) {
    const baseComments = extractComments(baseContent)
    const targetComments = extractComments(targetContent)
    results.commentResults = compareComments(baseComments, targetComments)
    results.baseCommentCount = [...baseComments.values()].reduce((s, v) => s + v.length, 0)
    results.targetCommentCount = [...targetComments.values()].reduce((s, v) => s + v.length, 0)
  }

  return results
}

/**
 * 输出单对文件的对比结果
 */
function printResults(results, baseFilePath, targetFilePaths, options) {
  const { showMatch, comments } = options
  const basePath = path.resolve(baseFilePath)
  const autoStrip = results.autoStrip

  console.log('')
  console.log('═══════════════════════════════════════')
  console.log('  对比结果')
  console.log('═══════════════════════════════════════')
  console.log('基准: ' + path.basename(basePath))
  console.log('目标: ' + targetFilePaths.map(t => path.basename(t)).join(', '))
  console.log('模式: ' + (autoStrip ? 'TS↔JS（已去除类型）' : 'JS↔JS'))
  console.log('检查: ' + results.names.length + ' 个函数')
  console.log('───────────────────────────────────────')
  console.log('匹配: ' + results.matched.length)
  console.log('差异: ' + results.differed.length)
  console.log('缺失: ' + results.missing.length)
  console.log('已忽略差异: ' + results.ignored.length)
  console.log('═══════════════════════════════════════')

  if (showMatch && results.matched.length > 0) {
    console.log('\n  匹配的函数:')
    results.matched.forEach(n => console.log('    + ' + n))
  }

  if (results.missing.length > 0) {
    console.log('\n  目标文件中缺失:')
    results.missing.forEach(n => console.log('    - ' + n))
  }

  if (results.differed.length > 0) {
    console.log('\n  有差异的函数:')
    for (const d of results.differed) {
      const rangeStr = formatRange(d.baseRange, d.targetRange)
      console.log('    -- ' + d.name + ' (' + d.diffs.length + '处差异)' + rangeStr + ' --')
      for (let i = 0; i < d.diffs.length; i++) {
        const diff = d.diffs[i]
        const loc = []
        if (diff.baseLine) loc.push('基准L' + diff.baseLine)
        if (diff.targetLine) loc.push('目标L' + diff.targetLine)
        const locStr = loc.length > 0 ? ' [' + loc.join(', ') + ']' : ''
        console.log('    差异#' + (i + 1) + locStr + ':')
        console.log('      基准: ...' + diff.base + '...')
        console.log('      目标: ...' + diff.target + '...')
      }
    }
  }

  if (results.ignored.length > 0) {
    console.log('\n  已忽略的差异 (--ignore):')
    for (const d of results.ignored) {
      const rangeStr = formatRange(d.baseRange, d.targetRange)
      console.log('    ~ ' + d.name + ' (' + d.diffs.length + '处差异)' + rangeStr)
      for (let i = 0; i < d.diffs.length; i++) {
        const diff = d.diffs[i]
        const loc = []
        if (diff.baseLine) loc.push('基准L' + diff.baseLine)
        if (diff.targetLine) loc.push('目标L' + diff.targetLine)
        const locStr = loc.length > 0 ? ' [' + loc.join(', ') + ']' : ''
        console.log('      差异#' + (i + 1) + locStr + ':')
        console.log('        基准: ...' + diff.base + '...')
        console.log('        目标: ...' + diff.target + '...')
      }
    }
  }

  // 注释专项检查结果
  if (comments && results.commentResults) {
    const cr = results.commentResults
    console.log('')
    console.log('═══════════════════════════════════════')
    console.log('  注释专项检查')
    console.log('═══════════════════════════════════════')
    console.log('基准注释数: ' + results.baseCommentCount)
    console.log('目标注释数: ' + results.targetCommentCount)
    console.log('保留: ' + cr.kept.length)
    console.log('丢失: ' + cr.lost.length)
    console.log('═══════════════════════════════════════')

    if (cr.lost.length > 0) {
      console.log('\n  基准有但目标丢失的注释:')
      const byFunc = new Map()
      for (const c of cr.lost) {
        const key = c.func === '__global__' ? '(全局)' : c.func
        if (!byFunc.has(key)) byFunc.set(key, [])
        byFunc.get(key).push(c)
      }
      for (const [func, comments] of byFunc) {
        console.log('    [' + func + ']')
        for (const c of comments) {
          const display = c.text.length > 80 ? c.text.slice(0, 77) + '...' : c.text
          console.log('      L' + c.line + ': ' + display)
        }
      }
    } else {
      console.log('\n  所有注释均已保留，无丢失。')
    }
  }
}

function main() {
  const args = parseArgs(process.argv)

  // 批量模式
  if (args.batch.length > 0) {
    console.log('批量对比模式: ' + args.batch.length + ' 对文件')
    console.log('═══════════════════════════════════════')

    const options = {
      names: args.names,
      ignore: args.ignore,
      noAuto: args.noAuto,
      stripTypes: args.stripTypes,
      context: args.context,
      comments: args.comments,
      showMatch: args.showMatch,
    }

    let totalMatched = 0, totalDiffered = 0, totalMissing = 0
    let allOk = true

    for (let i = 0; i < args.batch.length; i++) {
      const pair = args.batch[i]
      console.log('\n[' + (i + 1) + '/' + args.batch.length + '] ' + path.basename(pair.base) + ' → ' + path.basename(pair.target))

      const results = compareFiles(pair.base, [pair.target], options)
      if (!results) { allOk = false; continue }

      printResults(results, pair.base, [pair.target], options)

      totalMatched += results.matched.length
      totalDiffered += results.differed.length
      totalMissing += results.missing.length
      if (results.differed.length > 0 || results.missing.length > 0) allOk = false
      if (results.commentResults && results.commentResults.lost.length > 0) allOk = false
    }

    console.log('')
    console.log('═══════════════════════════════════════')
    console.log('  批量对比汇总')
    console.log('═══════════════════════════════════════')
    console.log('文件对: ' + args.batch.length)
    console.log('总匹配: ' + totalMatched)
    console.log('总差异: ' + totalDiffered)
    console.log('总缺失: ' + totalMissing)
    console.log('═══════════════════════════════════════')

    process.exit(allOk ? 0 : 1)
  }

  // 单对模式
  if (!args.base || args.targets.length === 0) {
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║  _compare.js — 函数级代码对比工具                           ║')
    console.log('║  用于 TS 迁移验证、重构检查、代码一致性对比                   ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log('')
    console.log('用法:')
    console.log('  单对对比:')
    console.log('    node _compare.js --base <基准文件> --target <目标文件> [选项]')
    console.log('')
    console.log('  批量对比（多对文件一一对应）:')
    console.log('    node _compare.js --batch "base1,target1;base2,target2;base3,target3" [选项]')
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('选项:')
    console.log('')
    console.log('  文件指定:')
    console.log('    --base <路径>       基准文件（原始版本）')
    console.log('    --target <路径>     目标文件（待验证版本），可指定多个合并为一个目标')
    console.log('    --batch <对>        批量对比，格式: "base1,target1;base2,target2"')
    console.log('                        每对用 ; 分隔，文件对内用 , 分隔')
    console.log('                        支持 @file.txt 从文件读取（文件内容格式相同）')
    console.log('')
    console.log('  对比控制:')
    console.log('    --names <n1,n2>     只检查指定函数名（逗号分隔）')
    console.log('    --ignore <n1,n2>    忽略差异的函数名（不计入错误，但仍显示差异）')
    console.log('    --no-auto           不自动提取函数名（需配合 --names 使用）')
    console.log('    --context <数字>     差异上下文字符数（默认 80）')
    console.log('')
    console.log('  类型处理:')
    console.log('    --strip-types       强制去除 TS 类型注解后再对比')
    console.log('                        （默认自动检测：JS↔TS 时自动启用，JS↔JS 时关闭）')
    console.log('')
    console.log('  检查模式:')
    console.log('    --comments          注释专项：检查基准有但目标丢失的注释')
    console.log('                        使用模糊匹配，关键词重叠 >60% 视为保留')
    console.log('    --show-match        显示匹配的函数列表')
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('示例:')
    console.log('')
    console.log('  1. JS↔TS 迁移验证（自动去除类型注解）:')
    console.log('     node _compare.js --base old.js --target new.ts')
    console.log('')
    console.log('  2. TS↔TS 对比（纯逻辑差异）:')
    console.log('     node _compare.js --base v1.ts --target v2.ts')
    console.log('')
    console.log('  3. 批量验证多个迁移文件:')
    console.log('     node _compare.js --batch "a.js,a.ts;b.js,b.ts;c.js,c.ts"')
    console.log('')
    console.log('  4. 只检查特定函数 + 注释专项:')
    console.log('     node _compare.js --base old.js --target new.ts --names "foo,bar" --comments')
    console.log('')
    console.log('  5. 忽略已知差异的函数:')
    console.log('     node _compare.js --base old.js --target new.ts --ignore "deprecatedFunc"')
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('输出说明:')
    console.log('')
    console.log('  匹配: 函数逻辑完全一致（去除类型和格式差异后）')
    console.log('  差异: 函数逻辑有不同，显示具体差异位置和内容')
    console.log('        [基准L起始-结束, 目标L起始-结束] = 函数在源文件中的行号范围')
    console.log('        [基准L行, 目标L行] = 差异所在的具体行号')
    console.log('  缺失: 基准中有但目标中找不到的函数')
    console.log('')
    console.log('  退出码: 0=全部匹配  1=有差异或缺失')
    console.log('═══════════════════════════════════════════════════════════════')
    process.exit(1)
  }

  const options = {
    names: args.names,
    ignore: args.ignore,
    noAuto: args.noAuto,
    stripTypes: args.stripTypes,
    context: args.context,
    comments: args.comments,
    showMatch: args.showMatch,
  }

  const results = compareFiles(args.base, args.targets, options)
  if (!results) process.exit(1)

  printResults(results, args.base, args.targets, options)

  const hasProblems = results.differed.length > 0 || results.missing.length > 0 || (results.commentResults && results.commentResults.lost.length > 0)
  process.exit(hasProblems ? 1 : 0)
}

main()
