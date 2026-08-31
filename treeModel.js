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

  /** node와 그 아래 모든 하위 노드/엣지의 id를 모은다. */
  function collectSubtreeIds(node) {
    const nodeIds = new Set();
    const edgeIds = new Set();
    function visit(n) {
      nodeIds.add(n.id);
      for (const edge of n.children || []) {
        edgeIds.add(edge.id);
        visit(edge.node);
      }
    }
    visit(node);
    return { nodeIds, edgeIds };
  }

  /**
   * 특정 분기(엣지)를 강조했을 때 흐리게 표시할 노드/엣지 id를 계산한다.
   * 강조된 엣지와 같은 부모를 둔 "선택받지 않은" 형제 분기들과 그 하위 트리 전체를
   * 흐림 대상으로 삼는다. 강조된 엣지의 조상이나 무관한 다른 가지는 대상에서 제외된다.
   * highlightedEdgeId가 없거나 트리에서 찾을 수 없으면 빈 집합을 반환한다.
   */
  function computeDimmedIds(rootNode, highlightedEdgeId) {
    const empty = { nodeIds: new Set(), edgeIds: new Set() };
    if (!highlightedEdgeId) return empty;
    const found = findEdge(rootNode, highlightedEdgeId);
    if (!found) return empty;

    const { parent } = found;
    const nodeIds = new Set();
    const edgeIds = new Set();
    for (const sibling of parent.children) {
      if (sibling.id === highlightedEdgeId) continue;
      edgeIds.add(sibling.id);
      const sub = collectSubtreeIds(sibling.node);
      sub.nodeIds.forEach((id) => nodeIds.add(id));
      sub.edgeIds.forEach((id) => edgeIds.add(id));
    }
    return { nodeIds, edgeIds };
  }

  /**
   * 분기 입력 문자열을 "/"로 구분된 여러 분기 이름으로 나눈다.
   * 예: "예 / 아니오 / 보류" -> ["예", "아니오", "보류"]
   * 앞뒤 공백은 제거하고 빈 항목은 무시한다. 입력이 비어있으면 기본값 하나를 반환한다.
   */
  function parseBranchLabels(raw) {
    if (raw == null) return ['분기'];
    const parts = String(raw)
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : ['분기'];
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

  /** 마크다운 한 줄에 안전하게 쓸 수 있도록 텍스트를 다듬는다. */
  function escapeMdText(value) {
    let text = String(value == null ? '' : value)
      .replace(/\r\n|\r|\n/g, ' ')
      .trim();
    // "*"로 시작하면 재가져오기(또는 다른 마크다운 렌더러)에서 굵게/기울임으로
    // 오인식될 수 있으므로 이스케이프한다.
    if (text.startsWith('*')) text = '\\' + text;
    return text;
  }

  /**
   * 트리를 노션과 호환되는 중첩 불릿 목록 마크다운으로 변환한다.
   * 루트는 라벨 없이, 그 아래는 "**분기 이름:** 노드 내용" 형태의 불릿으로 표현한다.
   *
   * 예:
   * - 오늘 배포를 진행할까요?
   *   - **예:** 모든 테스트가 통과했나요?
   *     - **예:** 배포 진행
   *   - **아니오:** 배포 보류
   */
  function treeToMarkdown(rootNode) {
    function lines(node, depth, label) {
      const indent = '  '.repeat(depth);
      const prefix = label != null ? `**${escapeMdText(label).replace(/\*/g, '')}:** ` : '';
      const out = [`${indent}- ${prefix}${escapeMdText(node.text)}`];
      for (const edge of node.children || []) {
        out.push(...lines(edge.node, depth + 1, edge.label));
      }
      return out;
    }
    return lines(rootNode, 0, null).join('\n') + '\n';
  }

  /**
   * 중첩 불릿 목록 마크다운을 트리로 되돌린다. treeToMarkdown이 만든 형식뿐 아니라
   * 노션에서 내보낸 "- **라벨**: 내용" / "- **라벨:** 내용" 형태도 함께 인식한다.
   * 들여쓰기 폭(2/4칸, 탭)에 관계없이 상대적인 깊이만으로 계층을 재구성한다.
   * 목록 항목을 하나도 찾지 못하면 null을 반환한다.
   */
  function parseMarkdownToTree(markdown) {
    const lines = String(markdown || '').split(/\r\n|\r|\n/);
    const bulletRe = /^(\s*)[-*+]\s+(.*)$/;
    const labelRe = /^\*\*([^*]+)\*\*:?\s*(.*)$/;

    let root = null;
    const stack = []; // [{ indent, node }], 얕은 순서로 쌓인다

    for (const rawLine of lines) {
      const m = rawLine.match(bulletRe);
      if (!m) continue;
      const indent = m[1].replace(/\t/g, '    ').length;
      let content = m[2].trim();
      if (!content) continue;

      let label = null;
      const labelMatch = content.match(labelRe);
      if (labelMatch) {
        label = labelMatch[1].trim().replace(/:$/, '').trim();
        content = labelMatch[2].trim();
      }

      const node = createNode(content || '새 질문');

      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

      if (stack.length === 0) {
        if (root === null) {
          root = node;
        } else {
          // 최상위 불릿이 여러 개면(형식이 어긋난 문서) 데이터 손실을 막기 위해
          // 루트의 추가 분기로 붙인다.
          addChild(root, label || `분기 ${root.children.length + 1}`, node);
        }
      } else {
        const parent = stack[stack.length - 1].node;
        addChild(parent, label || `분기 ${parent.children.length + 1}`, node);
      }

      stack.push({ indent, node });
    }

    return root;
  }

  /**
   * 파일 내용으로부터 트리를 만든다. 확장자가 있으면 그것을 우선 신뢰하고,
   * 모호하면 내용으로 JSON/마크다운 여부를 추정한다. 실패 시 Error를 던진다.
   */
  function importTreeFromFileContent(content, filename) {
    const lower = String(filename || '').toLowerCase();
    const isMd = lower.endsWith('.md') || lower.endsWith('.markdown');
    const isJson = lower.endsWith('.json');
    const looksJson = !isMd && (isJson || content.trim().startsWith('{'));

    if (looksJson) {
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        throw new Error('JSON 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
      if (!isValidTree(parsed)) {
        throw new Error('올바른 의사결정 트리 JSON 형식이 아닙니다.');
      }
      return parsed;
    }

    const parsed = parseMarkdownToTree(content);
    if (!parsed) {
      throw new Error('마크다운에서 목록(-) 구조를 찾을 수 없습니다.');
    }
    return parsed;
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
    collectSubtreeIds,
    computeDimmedIds,
    parseBranchLabels,
    computeLayout,
    countNodes,
    isValidTree,
    treeToMarkdown,
    parseMarkdownToTree,
    importTreeFromFileContent,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TreeModel = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
