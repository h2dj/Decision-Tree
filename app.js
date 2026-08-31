(function () {
  'use strict';

  const STORAGE_KEY = 'decisionTreeBuilder.tree.v1';

  // 레이아웃 상수 (픽셀)
  const NODE_W = 200;
  const NODE_H = 64; // min-height와 맞춤 (텍스트가 길면 실제 높이는 더 커질 수 있음)
  const H_GAP = 48;
  const V_GAP = 90;
  const PADDING = 60;

  // --- DOM 참조 ---
  const el = {
    canvas: document.getElementById('canvas'),
    viewport: document.getElementById('viewport'),
    edgesSvg: document.getElementById('edges-svg'),
    edgesLayer: document.getElementById('edges-layer'),
    labelsLayer: document.getElementById('labels-layer'),
    nodesLayer: document.getElementById('nodes-layer'),
    sideEmpty: document.getElementById('side-empty'),
    sideContent: document.getElementById('side-content'),
    sideNodeText: document.getElementById('side-node-text'),
    branchList: document.getElementById('side-branch-list'),
    btnAddBranch: document.getElementById('btn-add-branch'),
    btnDeleteNode: document.getElementById('btn-delete-node'),
    btnNew: document.getElementById('btn-new'),
    btnImport: document.getElementById('btn-import'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnExportSvg: document.getElementById('btn-export-svg'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    fileInput: document.getElementById('file-input'),
    autosaveIndicator: document.getElementById('autosave-indicator'),
  };

  // --- 상태 ---
  let tree = loadFromStorage() || createDefaultTree();
  let selectedId = tree.id;
  let scale = 1;
  let panX = PADDING;
  let panY = PADDING;

  function createDefaultTree() {
    const root = TreeModel.createNode('오늘 배포를 진행할까요?');
    const yes = TreeModel.addChild(root, '예', TreeModel.createNode('모든 테스트가 통과했나요?'));
    TreeModel.addChild(root, '아니오', TreeModel.createNode('배포 보류'));
    TreeModel.addChild(yes, '예', TreeModel.createNode('배포 진행'));
    TreeModel.addChild(yes, '아니오', TreeModel.createNode('테스트 수정 후 재검토'));
    return root;
  }

  // --- 저장/불러오기 ---
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
      flashAutosave();
    } catch (e) {
      // localStorage를 쓸 수 없는 환경(프라이빗 모드 등)이면 조용히 무시한다.
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return TreeModel.isValidTree(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  let flashTimer = null;
  function flashAutosave() {
    el.autosaveIndicator.textContent = '자동 저장됨 · ' + new Date().toLocaleTimeString('ko-KR');
    el.autosaveIndicator.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.autosaveIndicator.classList.remove('show'), 1600);
  }

  // --- 커스텀 프롬프트 모달 (window.prompt 대체) ---
  function askText(title, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML =
        '<div class="modal-box">' +
        '<h3></h3>' +
        '<input type="text" />' +
        '<div class="modal-actions">' +
        '<button class="btn" data-act="cancel">취소</button>' +
        '<button class="btn" data-act="ok" style="border-color:var(--accent);color:var(--accent)">확인</button>' +
        '</div></div>';
      overlay.querySelector('h3').textContent = title;
      const input = overlay.querySelector('input');
      input.value = defaultValue || '';
      document.body.appendChild(overlay);
      input.focus();
      input.select();

      function close(result) {
        document.body.removeChild(overlay);
        resolve(result);
      }
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
      });
    });
  }

  // --- 좌표 계산 ---
  function computePixelPositions() {
    const { nodeInfo, leafCount, maxDepth } = TreeModel.computeLayout(tree);
    const positions = new Map();
    nodeInfo.forEach((info, id) => {
      positions.set(id, {
        x: info.col * (NODE_W + H_GAP),
        y: info.depth * (NODE_H + V_GAP),
        depth: info.depth,
      });
    });
    const width = Math.max(leafCount * (NODE_W + H_GAP) - H_GAP, NODE_W) + PADDING * 2;
    const height = (maxDepth + 1) * (NODE_H + V_GAP) - V_GAP + PADDING * 2;
    return { positions, width, height };
  }

  // --- 렌더링 ---
  function render() {
    const { positions, width, height } = computePixelPositions();

    el.viewport.style.width = width + 'px';
    el.viewport.style.height = height + 'px';
    el.edgesSvg.setAttribute('width', width);
    el.edgesSvg.setAttribute('height', height);
    el.edgesLayer.innerHTML = '';
    el.labelsLayer.innerHTML = '';
    el.nodesLayer.innerHTML = '';

    function offset(id) {
      const p = positions.get(id);
      return { x: p.x + PADDING, y: p.y + PADDING };
    }

    function walk(node) {
      const pos = offset(node.id);
      renderNode(node, pos);
      for (const edge of node.children) {
        const childPos = offset(edge.node.id);
        renderEdge(node.id, pos, edge, childPos);
        walk(edge.node);
      }
    }

    walk(tree);
    renderSidebar();
    applyTransform();
  }

  function renderNode(node, pos) {
    const isLeaf = TreeModel.isLeaf(node);
    const div = document.createElement('div');
    div.className = 'node' + (isLeaf ? ' leaf' : '') + (node.id === selectedId ? ' selected' : '');
    div.style.left = pos.x + 'px';
    div.style.top = pos.y + 'px';
    div.dataset.id = node.id;

    const badge = document.createElement('div');
    badge.className = 'node-badge';
    badge.textContent = node.id === tree.id ? '시작' : isLeaf ? '결과' : '질문';
    div.appendChild(badge);

    const text = document.createElement('div');
    text.className = 'node-text';
    text.contentEditable = 'true';
    text.spellcheck = false;
    text.textContent = node.text;
    text.addEventListener('mousedown', (e) => e.stopPropagation());
    text.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node.id);
    });
    text.addEventListener('input', () => {
      node.text = text.textContent;
      saveToStorage();
      if (node.id === selectedId) el.sideNodeText.textContent = node.text;
    });
    text.addEventListener('blur', () => render());
    div.appendChild(text);

    div.addEventListener('mousedown', (e) => e.stopPropagation());
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node.id);
    });

    el.nodesLayer.appendChild(div);
  }

  function renderEdge(parentId, parentPos, edge, childPos) {
    const x1 = parentPos.x + NODE_W / 2;
    const y1 = parentPos.y + NODE_H;
    const x2 = childPos.x + NODE_W / 2;
    const y2 = childPos.y;
    const midY = y1 + (y2 - y1) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M${x1},${y1} V${midY} H${x2} V${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--edge-color)');
    path.setAttribute('stroke-width', '1.75');
    path.setAttribute('marker-end', 'url(#arrow)');
    el.edgesLayer.appendChild(path);

    const label = document.createElement('div');
    label.className = 'edge-label';
    label.contentEditable = 'true';
    label.spellcheck = false;
    label.textContent = edge.label;
    label.dataset.edgeId = edge.id;
    label.style.left = x2 + 'px';
    label.style.top = midY + 'px';
    label.addEventListener('mousedown', (e) => e.stopPropagation());
    label.addEventListener('input', () => {
      edge.label = label.textContent;
      saveToStorage();
    });
    el.labelsLayer.appendChild(label);
  }

  // --- 사이드바 ---
  function selectNode(id) {
    selectedId = id;
    document.querySelectorAll('.node').forEach((n) => {
      n.classList.toggle('selected', n.dataset.id === id);
    });
    renderSidebar();
  }

  function renderSidebar() {
    const found = TreeModel.findNode(tree, selectedId);
    if (!found) {
      el.sideEmpty.hidden = false;
      el.sideContent.hidden = true;
      return;
    }
    el.sideEmpty.hidden = true;
    el.sideContent.hidden = false;

    const { node } = found;
    el.sideNodeText.textContent = node.text;

    el.branchList.innerHTML = '';
    node.children.forEach((edge) => {
      const li = document.createElement('li');
      li.className = 'branch-item';
      const input = document.createElement('input');
      input.value = edge.label;
      input.addEventListener('input', () => {
        edge.label = input.value;
        saveToStorage();
        const canvasLabel = el.labelsLayer.querySelector(`[data-edge-id="${edge.id}"]`);
        if (canvasLabel) canvasLabel.textContent = edge.label;
      });
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = '이 분기와 하위 트리 삭제';
      del.addEventListener('click', () => {
        if (!confirm('이 분기와 그 아래 하위 트리를 삭제할까요?')) return;
        TreeModel.removeChildEdge(node, edge.id);
        saveToStorage();
        render();
      });
      li.appendChild(input);
      li.appendChild(del);
      el.branchList.appendChild(li);
    });

    el.btnDeleteNode.disabled = node.id === tree.id;
  }

  // 선택된 노드에 분기를 추가한다. "예 / 아니오 / 보류"처럼 "/"로 구분해 입력하면
  // 한 번에 여러 분기를 만든다. 사이드바 버튼과 Tab/Insert 단축키가 이 함수를 공유한다.
  async function promptAndAddBranches() {
    const found = TreeModel.findNode(tree, selectedId);
    if (!found) return;
    const raw = await askText(
      '분기 이름을 입력하세요 ("/"로 구분하면 여러 개를 한 번에 추가합니다. 예: 예 / 아니오 / 보류)',
      ''
    );
    if (raw === null) return;
    const labels = TreeModel.parseBranchLabels(raw);
    labels.forEach((label) => TreeModel.addChild(found.node, label));
    saveToStorage();
    render();
  }

  el.btnAddBranch.addEventListener('click', promptAndAddBranches);

  el.btnDeleteNode.addEventListener('click', () => {
    const found = TreeModel.findNode(tree, selectedId);
    if (!found || !found.parent) return;
    if (!confirm('선택한 노드와 그 아래 하위 트리를 모두 삭제할까요?')) return;
    TreeModel.removeChildEdge(found.parent, found.edge.id);
    selectedId = tree.id;
    saveToStorage();
    render();
  });

  // --- 새 트리 / 가져오기 / 내보내기 ---
  el.btnNew.addEventListener('click', () => {
    if (!confirm('현재 트리를 지우고 새로 시작할까요? 저장하지 않은 변경사항은 사라집니다.')) return;
    tree = TreeModel.createNode('새 질문');
    selectedId = tree.id;
    saveToStorage();
    render();
  });

  el.btnImport.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!TreeModel.isValidTree(parsed)) {
          alert('올바른 의사결정 트리 JSON 파일이 아닙니다.');
          return;
        }
        tree = parsed;
        selectedId = tree.id;
        saveToStorage();
        render();
      } catch (err) {
        alert('JSON 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  el.btnExportJson.addEventListener('click', () => {
    downloadBlob(JSON.stringify(tree, null, 2), 'decision-tree.json', 'application/json');
  });

  el.btnExportSvg.addEventListener('click', () => {
    const { positions, width, height } = computePixelPositions();
    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`
    );
    parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    parts.push(
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="#94a3b8"/></marker></defs>'
    );

    function offset(id) {
      const p = positions.get(id);
      return { x: p.x + PADDING, y: p.y + PADDING };
    }

    function walkEdges(node) {
      const pos = offset(node.id);
      for (const edge of node.children) {
        const childPos = offset(edge.node.id);
        const x1 = pos.x + NODE_W / 2;
        const y1 = pos.y + NODE_H;
        const x2 = childPos.x + NODE_W / 2;
        const y2 = childPos.y;
        const midY = y1 + (y2 - y1) / 2;
        parts.push(
          `<path d="M${x1},${y1} V${midY} H${x2} V${y2}" fill="none" stroke="#94a3b8" stroke-width="1.75" marker-end="url(#arrow)"/>`
        );
        const label = escapeXml(edge.label);
        parts.push(
          `<rect x="${x2 - 40}" y="${midY - 10}" width="80" height="20" rx="10" fill="#ffffff" stroke="#e2e8f0"/>`
        );
        parts.push(
          `<text x="${x2}" y="${midY + 4}" text-anchor="middle" font-size="11" fill="#64748b">${label}</text>`
        );
        walkEdges(edge.node);
      }
    }

    function walkNodes(node) {
      const pos = offset(node.id);
      const isLeaf = TreeModel.isLeaf(node);
      parts.push(
        `<rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="#ffffff" stroke="#e2e8f0"/>`
      );
      parts.push(
        `<rect x="${pos.x}" y="${pos.y}" width="4" height="${NODE_H}" fill="${isLeaf ? '#16a34a' : '#2563eb'}"/>`
      );
      parts.push(
        `<foreignObject x="${pos.x + 10}" y="${pos.y + 8}" width="${NODE_W - 20}" height="${NODE_H - 16}">` +
          `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:13px;line-height:1.4;color:#1e293b;font-family:sans-serif;overflow:hidden;">${escapeXml(
            node.text
          )}</div>` +
          '</foreignObject>'
      );
      for (const edge of node.children) walkNodes(edge.node);
    }

    walkEdges(tree);
    walkNodes(tree);
    parts.push('</svg>');
    downloadBlob(parts.join(''), 'decision-tree.svg', 'image/svg+xml');
  });

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- 팬 & 줌 ---
  function applyTransform() {
    el.viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function setScale(next) {
    scale = Math.min(2.5, Math.max(0.3, next));
    applyTransform();
  }

  el.btnZoomIn.addEventListener('click', () => setScale(scale * 1.15));
  el.btnZoomOut.addEventListener('click', () => setScale(scale / 1.15));
  el.btnZoomReset.addEventListener('click', () => {
    scale = 1;
    panX = PADDING;
    panY = PADDING;
    applyTransform();
  });

  el.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / 1.08 : 1.08;
      setScale(scale * delta);
    },
    { passive: false }
  );

  let isPanning = false;
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  el.canvas.addEventListener('mousedown', (e) => {
    isPanning = true;
    el.canvas.classList.add('panning');
    panStart = { x: e.clientX, y: e.clientY, panX, panY };
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = panStart.panX + (e.clientX - panStart.x);
    panY = panStart.panY + (e.clientY - panStart.y);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    isPanning = false;
    el.canvas.classList.remove('panning');
  });

  // --- 키보드 단축키 ---
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-overlay')) return; // 모달이 떠 있으면 무시

    const active = document.activeElement;
    const activeIsEditable = active && (active.isContentEditable || active.tagName === 'INPUT');

    // Delete/Backspace는 텍스트를 입력/수정하는 중에는 일반적인 삭제로 동작해야 하므로
    // 편집 가능한 요소에 포커스가 있을 때는 노드 삭제 단축키를 무시한다.
    if ((e.key === 'Delete' || e.key === 'Backspace') && !activeIsEditable && selectedId) {
      const found = TreeModel.findNode(tree, selectedId);
      if (found && found.parent) {
        if (confirm('선택한 노드와 그 아래 하위 트리를 모두 삭제할까요?')) {
          TreeModel.removeChildEdge(found.parent, found.edge.id);
          selectedId = tree.id;
          saveToStorage();
          render();
        }
      }
      return;
    }

    // Insert 키(맥 키보드에서는 Tab)로 선택된 노드에 분기를 추가한다.
    // 노드를 클릭하면 텍스트가 바로 편집 가능한 상태(contentEditable)가 되므로,
    // 포커스가 캔버스 안(노드 텍스트 등)에 있을 때는 편집 중이어도 단축키를 그대로 허용한다.
    // 반대로 툴바 버튼이나 사이드바 입력창 등 캔버스 밖에서는 Tab의 기본 동작(포커스 이동)을
    // 그대로 두어야 하므로 무시한다.
    if ((e.key === 'Insert' || e.key === 'Tab') && selectedId) {
      const focusOutsideCanvas = active && active !== document.body && !el.canvas.contains(active);
      if (focusOutsideCanvas) return;
      e.preventDefault();
      promptAndAddBranches();
    }
  });

  // --- 초기 렌더 ---
  render();
})();
