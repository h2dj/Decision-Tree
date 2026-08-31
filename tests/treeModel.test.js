/**
 * treeModel.js에 대한 간단한 단위 테스트.
 * 실행: node tests/treeModel.test.js
 */
const assert = require('assert');
const path = require('path');
const TreeModel = require(path.join(__dirname, '..', 'treeModel.js'));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok - ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL - ' + name);
    console.error('    ' + err.message);
    process.exitCode = 1;
  }
}

console.log('TreeModel');

test('createNode는 기본 텍스트와 빈 children을 가진다', () => {
  const n = TreeModel.createNode();
  assert.strictEqual(n.text, '새 질문');
  assert.deepStrictEqual(n.children, []);
  assert.ok(n.id);
});

test('addChild는 부모에 자식을 붙이고 자식 노드를 반환한다', () => {
  const root = TreeModel.createNode('root');
  const child = TreeModel.addChild(root, '예');
  assert.strictEqual(root.children.length, 1);
  assert.strictEqual(root.children[0].label, '예');
  assert.strictEqual(root.children[0].node, child);
});

test('isLeaf는 children이 없을 때만 true', () => {
  const root = TreeModel.createNode('root');
  assert.strictEqual(TreeModel.isLeaf(root), true);
  TreeModel.addChild(root, '예');
  assert.strictEqual(TreeModel.isLeaf(root), false);
});

test('findNode는 루트/자식/손자를 모두 찾을 수 있다', () => {
  const root = TreeModel.createNode('root');
  const child = TreeModel.addChild(root, '예');
  const grandchild = TreeModel.addChild(child, '아니오');

  const foundRoot = TreeModel.findNode(root, root.id);
  assert.strictEqual(foundRoot.node, root);
  assert.strictEqual(foundRoot.parent, null);

  const foundChild = TreeModel.findNode(root, child.id);
  assert.strictEqual(foundChild.node, child);
  assert.strictEqual(foundChild.parent, root);

  const foundGrandchild = TreeModel.findNode(root, grandchild.id);
  assert.strictEqual(foundGrandchild.node, grandchild);
  assert.strictEqual(foundGrandchild.parent, child);

  assert.strictEqual(TreeModel.findNode(root, 'nope'), null);
});

test('removeChildEdge는 해당 분기(및 하위 트리)만 제거한다', () => {
  const root = TreeModel.createNode('root');
  const a = TreeModel.addChild(root, 'A');
  TreeModel.addChild(root, 'B');
  const edgeToA = root.children.find((e) => e.node === a);
  TreeModel.removeChildEdge(root, edgeToA.id);
  assert.strictEqual(root.children.length, 1);
  assert.strictEqual(root.children[0].label, 'B');
});

test('computeLayout: 리프는 왼쪽부터 순서대로 col을 받고, 부모는 자식들의 평균', () => {
  const root = TreeModel.createNode('root');
  const left = TreeModel.addChild(root, 'L');
  TreeModel.addChild(root, 'R');
  TreeModel.addChild(left, 'LL');
  TreeModel.addChild(left, 'LR');

  const { nodeInfo, leafCount, maxDepth } = TreeModel.computeLayout(root);
  assert.strictEqual(leafCount, 3); // LL, LR, R
  assert.strictEqual(maxDepth, 2);
  // root의 col은 (left.col + right.col)/2, left.col은 (LL.col+LR.col)/2 = 0.5
  const rightEdge = root.children.find((e) => e.label === 'R');
  assert.strictEqual(nodeInfo.get(rightEdge.node.id).col, 2);
  assert.strictEqual(nodeInfo.get(left.id).col, 0.5);
  assert.strictEqual(nodeInfo.get(root.id).col, (0.5 + 2) / 2);
});

test('countNodes는 트리의 전체 노드 수를 반환한다', () => {
  const root = TreeModel.createNode('root');
  const a = TreeModel.addChild(root, 'A');
  TreeModel.addChild(root, 'B');
  TreeModel.addChild(a, 'AA');
  assert.strictEqual(TreeModel.countNodes(root), 4);
});

test('parseBranchLabels는 "/"로 구분된 여러 분기 이름을 반환한다', () => {
  assert.deepStrictEqual(TreeModel.parseBranchLabels('예 / 아니오 / 보류'), ['예', '아니오', '보류']);
  assert.deepStrictEqual(TreeModel.parseBranchLabels('예/아니오'), ['예', '아니오']);
});

test('parseBranchLabels는 공백/빈 항목을 정리하고, 슬래시가 없으면 하나만 반환한다', () => {
  assert.deepStrictEqual(TreeModel.parseBranchLabels('  예  '), ['예']);
  assert.deepStrictEqual(TreeModel.parseBranchLabels('예 // 아니오 /'), ['예', '아니오']);
});

test('parseBranchLabels는 입력이 비어 있으면 기본값 하나를 반환한다', () => {
  assert.deepStrictEqual(TreeModel.parseBranchLabels(''), ['분기']);
  assert.deepStrictEqual(TreeModel.parseBranchLabels('   '), ['분기']);
  assert.deepStrictEqual(TreeModel.parseBranchLabels(null), ['분기']);
  assert.deepStrictEqual(TreeModel.parseBranchLabels(' / / '), ['분기']);
});

test('isValidTree는 형태가 올바른 트리만 통과시킨다', () => {
  const root = TreeModel.createNode('root');
  TreeModel.addChild(root, 'A');
  assert.strictEqual(TreeModel.isValidTree(root), true);
  assert.strictEqual(TreeModel.isValidTree(null), false);
  assert.strictEqual(TreeModel.isValidTree({}), false);
  assert.strictEqual(TreeModel.isValidTree({ id: '1', text: 't', children: [{}] }), false);
});

console.log(`\n${passed} test(s) passed.`);
