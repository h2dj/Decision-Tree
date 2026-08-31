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

// id를 무시하고 텍스트/라벨/구조만 비교한다 (마크다운 왕복 테스트용).
function stripIds(node) {
  return {
    text: node.text,
    children: (node.children || []).map((e) => ({ label: e.label, node: stripIds(e.node) })),
  };
}

test('findEdgePath는 루트에서 해당 엣지까지의 경로를 얕은 순서로 반환한다', () => {
  const root = TreeModel.createNode('root');
  const a = TreeModel.addChild(root, 'A');
  const aa = TreeModel.addChild(a, 'AA');
  TreeModel.addChild(root, 'B');

  const edgeToA = root.children.find((e) => e.node === a);
  const edgeToAA = a.children.find((e) => e.node === aa);

  assert.deepStrictEqual(TreeModel.findEdgePath(root, edgeToAA.id), [edgeToA, edgeToAA]);
  assert.deepStrictEqual(TreeModel.findEdgePath(root, edgeToA.id), [edgeToA]);
  assert.strictEqual(TreeModel.findEdgePath(root, 'nope'), null);
});

test('collectSubtreeIds는 노드와 하위 노드/엣지 id를 모두 모은다', () => {
  const root = TreeModel.createNode('root');
  const a = TreeModel.addChild(root, 'A');
  const aa = TreeModel.addChild(a, 'AA');
  TreeModel.addChild(root, 'B');

  const { nodeIds, edgeIds } = TreeModel.collectSubtreeIds(a);
  assert.deepStrictEqual([...nodeIds].sort(), [a.id, aa.id].sort());
  const edgeToAA = a.children[0];
  assert.deepStrictEqual([...edgeIds], [edgeToAA.id]);
});

test('computeDimmedIds는 강조된 분기의 형제 분기와 그 하위 트리만 흐림 대상으로 삼는다', () => {
  const root = TreeModel.createNode('오늘 배포를 진행할까요?');
  const yesNode = TreeModel.addChild(root, '예', TreeModel.createNode('모든 테스트가 통과했나요?'));
  const noNode = TreeModel.addChild(root, '아니오', TreeModel.createNode('배포 보류'));
  const yesYesNode = TreeModel.addChild(yesNode, '예', TreeModel.createNode('배포 진행'));
  TreeModel.addChild(yesNode, '아니오', TreeModel.createNode('테스트 수정 후 재검토'));

  const yesEdgeId = root.children.find((e) => e.label === '예').id;
  const noEdgeId = root.children.find((e) => e.label === '아니오').id;

  const dimmed = TreeModel.computeDimmedIds(root, yesEdgeId);
  // '아니오' 분기(및 하위 '배포 보류')만 흐려지고, '예' 쪽(및 그 하위)은 대상에서 빠진다.
  assert.strictEqual(dimmed.edgeIds.has(noEdgeId), true);
  assert.strictEqual(dimmed.nodeIds.has(noNode.id), true);
  assert.strictEqual(dimmed.nodeIds.has(yesNode.id), false);
  assert.strictEqual(dimmed.nodeIds.has(yesYesNode.id), false);
  assert.strictEqual(dimmed.nodeIds.has(root.id), false);
});

test('computeDimmedIds는 깊은 곳의 분기를 강조하면 그 경로의 조상 단계에서 갈라진 다른 분기도 함께 흐린다', () => {
  const root = TreeModel.createNode('root');
  const yesNode = TreeModel.addChild(root, '예', TreeModel.createNode('Q2'));
  const topNoNode = TreeModel.addChild(root, '아니오', TreeModel.createNode('결과B'));
  TreeModel.addChild(yesNode, '예', TreeModel.createNode('결과C'));
  const deepNoNode = TreeModel.addChild(yesNode, '아니오', TreeModel.createNode('결과D'));

  const deepYesEdgeId = yesNode.children.find((e) => e.label === '예').id;
  const deepNoEdgeId = yesNode.children.find((e) => e.label === '아니오').id;
  const topNoEdgeId = root.children.find((e) => e.label === '아니오').id;

  const dimmed = TreeModel.computeDimmedIds(root, deepYesEdgeId);
  // 같은 부모(Q2) 아래 형제 분기는 흐려진다.
  assert.strictEqual(dimmed.edgeIds.has(deepNoEdgeId), true);
  assert.strictEqual(dimmed.nodeIds.has(deepNoNode.id), true);
  // 강조된 분기로 갈 수 없는 최상위 단계의 '아니오' 분기(및 그 하위 '결과B')도 함께 흐려진다.
  assert.strictEqual(dimmed.edgeIds.has(topNoEdgeId), true);
  assert.strictEqual(dimmed.nodeIds.has(topNoNode.id), true);
  // 경로 위에 있는 루트/Q2/강조된 엣지 자신은 흐림 대상이 아니다.
  assert.strictEqual(dimmed.nodeIds.has(yesNode.id), false);
  assert.strictEqual(dimmed.nodeIds.has(root.id), false);
  assert.strictEqual(dimmed.edgeIds.has(deepYesEdgeId), false);
});

test('computeDimmedIds: 상위 분기를 고른 뒤 그 하위 분기를 골라도 상위의 다른 분기는 계속 흐려진 채로 유지된다', () => {
  const root = TreeModel.createNode('root');
  const yesNode = TreeModel.addChild(root, '예', TreeModel.createNode('Q2'));
  TreeModel.addChild(root, '아니오', TreeModel.createNode('결과B'));
  const deepYesNode = TreeModel.addChild(yesNode, '예', TreeModel.createNode('결과C'));
  TreeModel.addChild(yesNode, '아니오', TreeModel.createNode('결과D'));

  const topYesEdgeId = root.children.find((e) => e.label === '예').id;
  const topNoEdgeId = root.children.find((e) => e.label === '아니오').id;
  const deepYesEdgeId = yesNode.children.find((e) => e.node === deepYesNode).id;

  // 1단계: 최상위 '예'를 고르면 최상위 '아니오'가 흐려진다.
  const afterTopPick = TreeModel.computeDimmedIds(root, topYesEdgeId);
  assert.strictEqual(afterTopPick.edgeIds.has(topNoEdgeId), true);

  // 2단계: 그 아래(Q2의) '예'를 다시 고르더라도, 최상위 '아니오'는 다시 밝아지지 않고
  // 계속 흐려진 상태로 남아 있어야 한다.
  const afterDeepPick = TreeModel.computeDimmedIds(root, deepYesEdgeId);
  assert.strictEqual(afterDeepPick.edgeIds.has(topNoEdgeId), true);
});

test('computeDimmedIds는 강조 대상이 없거나 존재하지 않으면 빈 집합을 반환한다', () => {
  const root = TreeModel.createNode('root');
  TreeModel.addChild(root, 'A');
  assert.deepStrictEqual(TreeModel.computeDimmedIds(root, null), { nodeIds: new Set(), edgeIds: new Set() });
  assert.deepStrictEqual(TreeModel.computeDimmedIds(root, 'nope'), { nodeIds: new Set(), edgeIds: new Set() });
});

test('treeToMarkdown은 중첩 불릿 목록을 만든다', () => {
  const root = TreeModel.createNode('오늘 배포를 진행할까요?');
  const yes = TreeModel.addChild(root, '예', TreeModel.createNode('모든 테스트가 통과했나요?'));
  TreeModel.addChild(root, '아니오', TreeModel.createNode('배포 보류'));
  TreeModel.addChild(yes, '예', TreeModel.createNode('배포 진행'));

  const md = TreeModel.treeToMarkdown(root);
  const lines = md.split('\n');
  assert.strictEqual(lines[0], '- 오늘 배포를 진행할까요?');
  assert.strictEqual(lines[1], '  - **예:** 모든 테스트가 통과했나요?');
  assert.strictEqual(lines[2], '    - **예:** 배포 진행');
  assert.strictEqual(lines[3], '  - **아니오:** 배포 보류');
});

test('parseMarkdownToTree는 treeToMarkdown의 결과를 원래 구조로 되돌린다 (왕복)', () => {
  const root = TreeModel.createNode('오늘 배포를 진행할까요?');
  const yes = TreeModel.addChild(root, '예', TreeModel.createNode('모든 테스트가 통과했나요?'));
  TreeModel.addChild(root, '아니오', TreeModel.createNode('배포 보류'));
  TreeModel.addChild(yes, '예', TreeModel.createNode('배포 진행'));
  TreeModel.addChild(yes, '아니오', TreeModel.createNode('테스트 수정 후 재검토'));

  const md = TreeModel.treeToMarkdown(root);
  const roundTripped = TreeModel.parseMarkdownToTree(md);
  assert.deepStrictEqual(stripIds(roundTripped), stripIds(root));
});

test('parseMarkdownToTree는 들여쓰기 폭이 달라도(4칸/탭) 계층을 인식한다', () => {
  const md = ['- 루트', '    - **예:** 자식A', '        - **아니오:** 손자'].join('\n');
  const tree = TreeModel.parseMarkdownToTree(md);
  assert.strictEqual(tree.text, '루트');
  assert.strictEqual(tree.children[0].label, '예');
  assert.strictEqual(tree.children[0].node.text, '자식A');
  assert.strictEqual(tree.children[0].node.children[0].label, '아니오');
  assert.strictEqual(tree.children[0].node.children[0].node.text, '손자');
});

test('parseMarkdownToTree는 "**라벨**: 내용" 형태(콜론이 굵게 밖)도 인식한다', () => {
  const md = ['- 루트', '  - **예**: 자식A'].join('\n');
  const tree = TreeModel.parseMarkdownToTree(md);
  assert.strictEqual(tree.children[0].label, '예');
  assert.strictEqual(tree.children[0].node.text, '자식A');
});

test('parseMarkdownToTree는 라벨이 없으면 순번으로 기본 라벨을 붙인다', () => {
  const md = ['- 루트', '  - 자식A', '  - 자식B'].join('\n');
  const tree = TreeModel.parseMarkdownToTree(md);
  assert.strictEqual(tree.children[0].label, '분기 1');
  assert.strictEqual(tree.children[1].label, '분기 2');
});

test('parseMarkdownToTree는 목록이 없으면 null을 반환한다', () => {
  assert.strictEqual(TreeModel.parseMarkdownToTree('그냥 문단입니다.'), null);
  assert.strictEqual(TreeModel.parseMarkdownToTree(''), null);
});

test('importTreeFromFileContent는 확장자로 JSON/마크다운을 구분한다', () => {
  const root = TreeModel.createNode('루트');
  TreeModel.addChild(root, '예', TreeModel.createNode('결과'));

  const fromJson = TreeModel.importTreeFromFileContent(JSON.stringify(root), 'tree.json');
  assert.strictEqual(fromJson.text, '루트');

  const fromMd = TreeModel.importTreeFromFileContent(TreeModel.treeToMarkdown(root), 'tree.md');
  assert.strictEqual(fromMd.text, '루트');
  assert.strictEqual(fromMd.children[0].label, '예');

  assert.throws(() => TreeModel.importTreeFromFileContent('{"bad": true}', 'tree.json'));
  assert.throws(() => TreeModel.importTreeFromFileContent('그냥 텍스트', 'tree.md'));
});

console.log(`\n${passed} test(s) passed.`);
