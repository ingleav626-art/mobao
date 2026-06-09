const fs = require('fs');
const path = require('path');

const htmlPath = 'e:/浏览器下载/人才招聘首页静态展示.html';
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script type="text\/babel">([\s\S]+?)<\/script>/);
if (!scriptMatch) {
  console.log('ERROR: No Babel script found');
  process.exit(1);
}

const jsxCode = scriptMatch[1];
console.log('JSX code length:', jsxCode.length, 'characters');

const issues = [];

const openBraces = (jsxCode.match(/\{/g) || []).length;
const closeBraces = (jsxCode.match(/\}/g) || []).length;
if (openBraces !== closeBraces) {
  issues.push(`Brace mismatch: { = ${openBraces}, } = ${closeBraces}`);
}

const openParens = (jsxCode.match(/\(/g) || []).length;
const closeParens = (jsxCode.match(/\)/g) || []).length;
if (openParens !== closeParens) {
  issues.push(`Parenthesis mismatch: ( = ${openParens}, ) = ${closeParens}`);
}

const openBrackets = (jsxCode.match(/\[/g) || []).length;
const closeBrackets = (jsxCode.match(/\]/g) || []).length;
if (openBrackets !== closeBrackets) {
  issues.push(`Bracket mismatch: [ = ${openBrackets}, ] = ${closeBrackets}`);
}

const dynamicComponentPattern = /<[a-zA-Z]+\.[a-zA-Z]+[^>]*>/g;
const dynamicMatches = jsxCode.match(dynamicComponentPattern);
if (dynamicMatches) {
  issues.push(`Dynamic component syntax found (not supported in Babel standalone): ${dynamicMatches.join(', ')}`);
}

const functionPattern = /function\s+(\w+)\s*\(/g;
let funcMatch;
const functions = [];
while ((funcMatch = functionPattern.exec(jsxCode)) !== null) {
  functions.push(funcMatch[1]);
}
console.log('Functions found:', functions.length, '-', functions.slice(0, 10).join(', ') + (functions.length > 10 ? '...' : ''));

if (issues.length > 0) {
  console.log('\n=== ISSUES FOUND ===');
  issues.forEach(issue => console.log('  - ' + issue));
  process.exit(1);
} else {
  console.log('\n=== BASIC CHECK PASSED ===');
  console.log('No obvious syntax issues found.');
  console.log('Note: Full JSX validation requires Babel transpilation.');
}