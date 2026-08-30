/**
 * treeModel.js
 * DOM에 의존하지 않는 순수 데이터 모델/레이아웃 로직.
 * 브라우저(app.js)와 Node.js(테스트) 양쪽에서 동일하게 사용할 수 있도록
 * UMD 스타일로 내보낸다.
 */
(function (root) {
  'use strict';

  function makeId(prefix) {
    return (
      prefix +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  /** 새 질문/결과 노드를 만든다. */
  function createNode(text) {
    return {
      id: makeId('n'),
      text: text || '새 질문',
      children: [], // [{ id, label, node }]
    };
  }

  /** 새 분기(엣지)를 만들어 parentNode.children에 추가하고 자식 노드를 반환한다. */
  function addChild(parentNode, label, childNode) {
    const child = childNode || createNode('새 질문');
    parentNode.children.push({
      id: makeId('e'),
      label: label || '분기',
      node: child,
    });
    return child;
  }

  function isLeaf(node) {
    return !node.children || node.children.length === 0;
  }

  /**
   * id로 노드를 찾는다. 루트 자신이면 parent/edge가 null.
   * 반환: { node, parent, edge } | null
   */
  function findNode(rootNode, id) {
    if (rootNode.id === id) return { node: rootNode, parent: null, edge: null };
    if (!rootNode.children) return null;
    for (const edge of rootNode.children) {
      if (edge.node.id === id) return { node: edge.node, parent: rootNode, edge };
      const found = findNode(edge.node, id);
      if (found) return found;
    }
    return null;
  }

  /** id로 엣지(분기)를 찾는다. 반환: { edge, parent } | null */
  function findEdge(rootNode, edgeId) {
    if (!rootNode.children) return null;
    for (const edge of rootNode.children) {
      if (edge.id === edgeId) return { edge, parent: rootNode };
      const found = findEdge(edge.node, edgeId);
      if (found) return found;
    }
    return null;
  }

  function removeChildEdge(parentNode, edgeId) {
    parentNode.children = parentNode.children.filter((e) => e.id !== edgeId);
  }

  /**
   * 트리 레이아웃 계산 (그리드 단위, 픽셀 아님).
   * - depth: 루트=0부터 내려가는 레벨
   * - col: 리프 노드는 왼쪽부터 0,1,2... 정수, 내부 노드는 자식들의 평균
   * 반환: { nodeInfo: Map(id -> {col, depth}), leafCount, maxDepth }
   */
  function computeLayout(rootNode) {
    let nextLeafIndex = 0;
    let maxDepth = 0;
    const nodeInfo = new Map();

    function visit(node, depth) {
      maxDepth = Math.max(maxDepth, depth);
      if (isLeaf(node)) {
        const col = nextLeafIndex++;
        nodeInfo.set(node.id, { col, depth });
        return col;
      }
      const childCols = node.children.map((edge) => visit(edge.node, depth + 1));
      const col = childCols.reduce((a, b) => a + b, 0) / childCols.length;
      nodeInfo.set(node.id, { col, depth });
      return col;
    }

    visit(rootNode, 0);
    return { nodeInfo, leafCount: nextLeafIndex, maxDepth };
  }

  /** 트리 전체 노드 개수를 센다 (테스트/검증용). */
  function countNodes(node) {
    if (!node) return 0;
    let count = 1;
    for (const edge of node.children || []) count += countNodes(edge.node);
    return count;
  }

  /** 가져온 JSON이 트리 노드로서 최소한의 형태를 갖췄는지 검사한다. */
  function isValidTree(node) {
    if (!node || typeof node !== 'object') return false;
    if (typeof node.id !== 'string' || typeof node.text !== 'string') return false;
    if (!Array.isArray(node.children)) return false;
    return node.children.every(
      (edge) =>
        edge &&
        typeof edge.id === 'string' &&
        typeof edge.label === 'string' &&
        isValidTree(edge.node)
    );
  }

  const api = {
    createNode,
    addChild,
    isLeaf,
    findNode,
    findEdge,
    removeChildEdge,
    computeLayout,
    countNodes,
    isValidTree,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TreeModel = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
