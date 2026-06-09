const fs = require('fs');

const htmlPath = 'd:/mobileProject/MyApplication/人才招聘首页静态展示.html';
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script type="text\/babel">([\s\S]+?)<\/script>/);
if (!scriptMatch) {
  console.log('ERROR: No Babel script found');
  process.exit(1);
}

const jsxCode = scriptMatch[1];
const lines = jsxCode.split('\n');

let balance = 0;
let maxBalance = 0;
let problemLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '(') balance++;
    if (char === ')') balance--;

    if (balance < 0) {
      problemLines.push({ lineNum, col: j + 1, balance, content: line.substring(0, 50) });
    }
    maxBalance = Math.max(maxBalance, balance);
  }
}

console.log('Final balance:', balance);
console.log('Max balance reached:', maxBalance);

if (problemLines.length > 0) {
  console.log('\n=== Lines where balance went negative ===');
  problemLines.slice(0, 10).forEach(p => {
    console.log(`Line ${p.lineNum}, col ${p.col}: balance=${p.balance}`);
    console.log(`  Content: ${p.content}...`);
  });
}

if (balance !== 0) {
  console.log('\n=== Searching for unmatched parentheses ===');
  let stack = [];
  for (let i = 0; i < jsxCode.length; i++) {
    const char = jsxCode[i];
    if (char === '(') {
      stack.push({ pos: i, char });
    } else if (char === ')') {
      if (stack.length > 0 && stack[stack.length - 1].char === '(') {
        stack.pop();
      } else {
        const lineNum = jsxCode.substring(0, i).split('\n').length;
        const lineStart = jsxCode.lastIndexOf('\n', i - 1) + 1;
        const col = i - lineStart;
        console.log(`Extra ')' at position ${i}, line ${lineNum}, col ${col}`);
        console.log(`  Context: ...${jsxCode.substring(Math.max(0, i - 30), Math.min(jsxCode.length, i + 30))}...`);
      }
    }
  }

  if (stack.length > 0) {
    console.log('\nUnmatched "(" positions:');
    stack.slice(-5).forEach(s => {
      const lineNum = jsxCode.substring(0, s.pos).split('\n').length;
      console.log(`  Position ${s.pos}, line ${lineNum}`);
    });
  }
}