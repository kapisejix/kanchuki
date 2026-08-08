// Second pass: catch RUNTIME string values rendered as direct children of a
// non-Text host element: {someVar}, {obj.prop}, {arr[i]}, {fn()}. Static string
// literals are already proven clean; a runtime identifier can still hold a
// string and trigger the same "Text strings must be rendered within a <Text>"
// crash.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = process.argv[2] || 'apps/mobile';
const TEXTISH = new Set(['Text', 'TextInput', 'Animated.Text']);
const SKIP_PROPS = new Set([
  'key', 'style', 'className', 'accessibilityLabel', 'placeholder',
  'title', 'label', 'value', 'name', 'source', 'uri', 'color', 'size',
  'testID', 'hitSlop', 'id', 'onPress', 'data',
]);
// Expressions that are likely ReactNode (elements, numbers with validators,
// booleans are fine in RN but strings are not; null/undefined fine).
function looksLikeStringish(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Identifier':
      return true; // could be a string variable
    case 'MemberExpression':
      return true; // obj.prop — could be string
    case 'CallExpression':
      return true; // fn() — could return string
    case 'ConditionalExpression':
      return true; // cond ? a : b
    case 'LogicalExpression':
      return true; // a && b / a ?? b
    case 'TemplateLiteral':
      return true;
    case 'StringLiteral':
      return true;
    default:
      return false;
  }
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      walk(p, out);
    } else if (ent.name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

const findings = [];
for (const file of walk(ROOT, [])) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch {
    continue;
  }
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXElement' && node.openingElement && node.openingElement.name) {
      const name = node.openingElement.name.name || node.openingElement.name.object?.name;
      if (name && !TEXTISH.has(name) && name !== 'Text') {
        for (const child of node.children || []) {
          if (child.type !== 'JSXExpressionContainer') continue;
          const expr = child.expression;
          // Skip non-stringy expressions and prop-looking containers.
          if (!looksLikeStringish(expr)) continue;
          // Heuristic exclusion: expressions whose text contains obvious
          // non-string operators are kept; we'll eyeball the rest.
          const text = src.slice(child.start, child.end).replace(/\s+/g, ' ').slice(0, 80);
          const line = src.slice(0, child.start).split('\n').length;
          findings.push({ file, line, name, text });
        }
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (const it of v) if (it && typeof it.type === 'string') visit(it);
      } else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast.program);
}

// Dedupe by file:line:text
const seen = new Set();
for (const f of findings) {
  const k = `${f.file}:${f.line}:${f.text}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`${f.file}:${f.line}  <${f.name}>  { ${f.text} }`);
}
console.log(`\nTotal: ${seen.size}`);
