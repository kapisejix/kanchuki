// Scan every .tsx under a root for JSX text/string-expression children that
// are rendered inside a host element that is NOT <Text>. These are the classic
// "Text strings must be rendered within a <Text> component" runtime crashes.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = process.argv[2] || 'apps/mobile';
const TEXTISH = new Set(['Text', 'TextInput', 'Animated.Text']);
// Host (lowercase) + known native containers that cannot host raw text:
const NON_TEXT_HOSTS = new Set([
  'view', 'scrollview', 'flatlist', 'pressable', 'image', 'modal',
  'View', 'ScrollView', 'FlatList', 'Pressable', 'Image', 'Modal',
  'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'KeyboardAvoidingView', 'SafeAreaView', 'Animated.View', 'AnimatedPressable',
  'RefreshControl', 'Switch', 'ActivityIndicator', 'Skeleton',
]);

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

function isStringNode(node) {
  if (!node) return false;
  if (node.type === 'StringLiteral') return true;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return true;
  if (
    node.type === 'BinaryExpression' &&
    (node.operator === '+' || node.operator === '??') &&
    (isStringNode(node.left) || isStringNode(node.right))
  ) {
    return isStringNode(node.left) || isStringNode(node.right);
  }
  return false;
}

const findings = [];
for (const file of walk(ROOT, [])) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch (e) {
    // Ignore parse errors on files with non-standard syntax (rare)
    continue;
  }

  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (
      (node.type === 'JSXElement' || node.type === 'JSXFragment') &&
      node.openingElement &&
      node.openingElement.name
    ) {
      const name = node.openingElement.name.name || node.openingElement.name.object?.name;
      if (name && !TEXTISH.has(name) && name !== 'Text') {
        for (const child of node.children || []) {
          let bad = false;
          if (child.type === 'JSXText' && child.value.trim()) {
            bad = true;
          } else if (
            child.type === 'JSXExpressionContainer' &&
            isStringNode(child.expression)
          ) {
            bad = true;
          }
          if (bad) {
            const line = src.slice(0, child.start).split('\n').length;
            const text = child.type === 'JSXText' ? JSON.stringify(child.value.trim().slice(0, 60)) : src.slice(child.start, child.end).slice(0, 60);
            findings.push(`${file}:${line}  <${name}> child = ${text}`);
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (const it of v) {
          if (it && typeof it.type === 'string') visit(it);
        }
      } else if (v && typeof v.type === 'string') {
        visit(v);
      }
    }
  };
  visit(ast.program);
}

if (findings.length === 0) {
  console.log('CLEAN: no bare string children outside <Text> found.');
} else {
  console.log(`FOUND ${findings.length} potential issue(s):`);
  for (const f of findings) console.log('  ' + f);
}
