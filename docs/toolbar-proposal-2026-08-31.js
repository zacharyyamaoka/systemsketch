(() => {
  const ICONS = {
    cursor: '<path d="M5 3.5l12 7.2-5.2 1.2-2.6 4.7z"/>',
    hand: '<path d="M7.2 11V7.6a1.2 1.2 0 012.4 0v2-4.1a1.2 1.2 0 012.4 0v4-3.2a1.2 1.2 0 012.4 0v3.9-2.4a1.2 1.2 0 012.4 0v4.3c0 4-2.1 6.1-5.7 6.1-2.4 0-3.7-1.2-5-3.1l-2-3a1.4 1.4 0 012.2-1.7z"/>',
    scale: '<rect x="5" y="5" width="10" height="10" rx="1.5"/><path d="M4 9V4h5M16 11v5h-5"/>',
    frame: '<path d="M4 4h16M4 20h16M7 2v20M17 2v20"/>',
    section: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M5 8h14"/>',
    slice: '<path d="M5 18L18 5M5 18l5-1-4-4z"/>',
    shapes: '<rect x="3" y="4" width="7" height="7" rx="1"/><circle cx="17" cy="7.5" r="3.5"/><path d="M5 20l4-6 4 6zM16 14h5v5h-5z"/>',
    rectangle: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    ellipse: '<circle cx="12" cy="12" r="8"/>',
    line: '<path d="M5 19L19 5"/>',
    'arrow-straight': '<path d="M4 18L19 5M13 5h6v6"/>',
    'arrow-curve': '<path d="M4 18C6 7 12 5 19 6M13 3l6 3-3 6"/>',
    'arrow-elbow': '<path d="M4 18V8h15M14 3l5 5-5 5"/>',
    pen: '<path d="M5 19l2.2-6.2L16 4l4 4-8.8 8.8zM7.2 12.8l4 4M16 4l-2 6 6-2"/>',
    pencil: '<path d="M4 17l-.5 3.5L7 20l11.5-11.5-3-3zM13.8 7.2l3 3"/>',
    highlighter: '<path d="M6 15L15 6l4 4-9 9H6zM4 21h12"/>',
    text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
    comment: '<path d="M5 5h14v10H10l-4 4v-4H5z"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
    triangle: '<path d="M12 4l9 16H3z"/>',
    cloud: '<path d="M7 18h10a4 4 0 00.5-8 6 6 0 00-11.4 1.2A3.5 3.5 0 007 18z"/>',
    cylinder: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 19c0-1.7 3.1-3 7-3s7 1.3 7 3"/>',
    folder: '<path d="M3 7h7l2 2h9v10H3z"/>',
    hexagon: '<path d="M7 4h10l5 8-5 8H7l-5-8z"/>'
  };

  const TOOLS = {
    move: { label: 'Move', icon: 'cursor', key: 'V', family: 'cursor' },
    hand: { label: 'Hand tool', icon: 'hand', key: 'H', family: 'cursor' },
    scale: { label: 'Scale', icon: 'scale', key: 'K', family: 'cursor' },
    frame: { label: 'Frame', icon: 'frame', key: 'F', family: 'frame' },
    section: { label: 'Section', icon: 'section', key: '⇧S', family: 'frame' },
    slice: { label: 'Slice', icon: 'slice', key: 'S', family: 'frame' },
    rectangle: { label: 'Rectangle', icon: 'rectangle', key: 'R', family: 'shape' },
    ellipse: { label: 'Ellipse', icon: 'ellipse', key: 'O', family: 'shape' },
    line: { label: 'Line', icon: 'line', key: 'L', family: 'shape' },
    'arrow-straight': { label: 'Arrow · Straight', icon: 'arrow-straight', key: 'A', family: 'shape', arrowPreset: 'straight' },
    'arrow-curve': { label: 'Arrow · Curve', icon: 'arrow-curve', key: 'A×2', family: 'shape', arrowPreset: 'curve' },
    'arrow-elbow': { label: 'Arrow · Elbow', icon: 'arrow-elbow', key: 'A×3', family: 'shape', arrowPreset: 'elbow' },
    pen: { label: 'Pen', icon: 'pen', key: 'P', family: 'draw' },
    pencil: { label: 'Pencil', icon: 'pencil', key: 'D', family: 'draw' },
    highlighter: { label: 'Highlighter', icon: 'highlighter', key: '⇧D', family: 'draw' },
    text: { label: 'Text', icon: 'text', key: 'T', family: 'text' },
    comment: { label: 'Comment', icon: 'comment', key: 'C', family: 'comment' },
    library: { label: 'Library', icon: 'plus', key: '+', family: 'library' }
  };

  const FAMILY_NAMES = {
    cursor: 'Cursor',
    frame: 'Frame',
    shape: 'Shape',
    draw: 'Draw',
    text: 'Text',
    comment: 'Comment',
    library: 'Library'
  };

  const STATIC_FAMILY_ICONS = {
    cursor: 'cursor',
    frame: 'frame',
    shape: 'shapes',
    draw: 'pen',
    text: 'text',
    comment: 'comment',
    library: 'plus'
  };

  const FAMILY_OPTIONS = {
    cursor: ['move', 'hand', 'scale'],
    frame: ['frame', 'section', 'slice'],
    shape: ['rectangle', 'ellipse', 'line', 'arrow-straight', 'arrow-curve', 'arrow-elbow'],
    draw: ['pen', 'pencil', 'highlighter'],
    text: ['text'],
    comment: ['comment'],
    library: ['library']
  };

  const ARROW_ORDER = ['straight', 'curve', 'elbow'];
  const prototypeStates = new WeakMap();

  function iconSvg(name) {
    const paths = ICONS[name] || ICONS.shapes;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  }

  function familyTool(state, family) {
    if (family === 'library') return 'library';
    return state.lastByFamily[family];
  }

  function slotMarkup(prototype, state, family) {
    const toolId = familyTool(state, family);
    const tool = TOOLS[toolId];
    const staticIcons = prototype.dataset.staticIcons === 'true';
    const iconName = staticIcons ? STATIC_FAMILY_ICONS[family] : tool.icon;
    const active = family === state.activeFamily || (family === 'library' && state.libraryOpen);
    const hasMenu = FAMILY_OPTIONS[family].length > 1;
    const title = family === 'library' ? 'Open library' : `${tool.label} · ${tool.key}`;
    return `<div class="ss-split${active ? ' is-active' : ''}" data-family="${family}">
      <button class="ss-main" type="button" data-select-family="${family}" title="${title}" aria-label="${title}"${family !== 'library' ? ` aria-pressed="${active}"` : ''}>
        <span class="ss-icon">${iconSvg(iconName)}</span><span class="ss-label">${FAMILY_NAMES[family]}</span>
      </button>
      ${hasMenu ? `<button class="ss-chevron" type="button" data-open-family="${family}" title="Open ${FAMILY_NAMES[family]} tools" aria-label="Open ${FAMILY_NAMES[family]} tools">⌄</button>` : '<span class="ss-chevron"></span>'}
    </div>`;
  }

  function render(prototype) {
    const state = prototypeStates.get(prototype);
    prototype.querySelectorAll('.family-slot[data-family]').forEach((slot) => {
      slot.innerHTML = slotMarkup(prototype, state, slot.dataset.family);
    });

    const activeTool = TOOLS[state.activeTool];
    prototype.querySelectorAll('[data-active-icon]').forEach((node) => { node.innerHTML = iconSvg(activeTool.icon); });
    prototype.querySelectorAll('[data-active-label]').forEach((node) => { node.textContent = activeTool.label; });
    prototype.querySelectorAll('[data-active-key]').forEach((node) => { node.textContent = activeTool.key; });
    prototype.classList.toggle('library-open', state.libraryOpen);

    const palette = prototype.querySelector('.capsule-palette');
    if (palette) palette.hidden = !state.paletteOpen;
    if (state.menuFamily) renderMenu(prototype, state.menuFamily);
  }

  function menuPositionClass(prototype) {
    if (prototype.classList.contains('variant-stock')) return 'left-menu';
    if (prototype.classList.contains('variant-workbench')) return 'right-menu';
    if (prototype.classList.contains('variant-capsule')) return 'top-menu';
    return 'bottom-menu';
  }

  function renderMenu(prototype, family) {
    const state = prototypeStates.get(prototype);
    const mount = prototype.querySelector('[data-menu-mount]');
    if (!mount) return;
    const options = FAMILY_OPTIONS[family] || [];
    const headings = family === 'shape'
      ? { rectangle: 'Shapes', 'arrow-straight': 'Connections' }
      : { [options[0]]: FAMILY_NAMES[family] };
    const items = options.map((toolId) => {
      const tool = TOOLS[toolId];
      const heading = headings[toolId] ? `<div class="menu-heading">${headings[toolId]}</div>` : '';
      return `${heading}<button type="button" data-select-tool="${toolId}" class="${state.activeTool === toolId ? 'is-current' : ''}">
        <span class="menu-icon">${iconSvg(tool.icon)}</span><span>${tool.label}</span><kbd>${tool.key}</kbd>
      </button>`;
    }).join('');
    mount.innerHTML = `<div class="tool-menu ${menuPositionClass(prototype)}" role="menu" aria-label="${FAMILY_NAMES[family]} tools">${items}</div>`;
  }

  function closeMenu(prototype) {
    const state = prototypeStates.get(prototype);
    state.menuFamily = null;
    const mount = prototype.querySelector('[data-menu-mount]');
    if (mount) mount.innerHTML = '';
  }

  function selectTool(prototype, toolId, announce = true) {
    const state = prototypeStates.get(prototype);
    const tool = TOOLS[toolId];
    if (!tool || tool.family === 'library') return;
    state.activeTool = toolId;
    state.activeFamily = tool.family;
    state.lastByFamily[tool.family] = toolId;
    if (tool.arrowPreset) state.arrowPreset = tool.arrowPreset;
    state.menuFamily = null;
    state.paletteOpen = false;
    const mount = prototype.querySelector('[data-menu-mount]');
    if (mount) mount.innerHTML = '';
    render(prototype);
    if (announce) showConfirmation(prototype, `${tool.label} selected`);
  }

  function selectFamily(prototype, family) {
    const state = prototypeStates.get(prototype);
    if (family === 'library') {
      state.libraryOpen = !state.libraryOpen;
      state.menuFamily = null;
      state.paletteOpen = false;
      closeMenu(prototype);
      render(prototype);
      if (state.libraryOpen) {
        const search = prototype.querySelector('.library-search');
        if (search) setTimeout(() => search.focus(), 0);
      } else {
        prototype.focus();
      }
      return;
    }
    selectTool(prototype, familyTool(state, family));
  }

  function cycleArrow(prototype) {
    const state = prototypeStates.get(prototype);
    if (TOOLS[state.activeTool]?.arrowPreset) {
      const currentIndex = ARROW_ORDER.indexOf(state.arrowPreset);
      const nextPreset = ARROW_ORDER[(currentIndex + 1) % ARROW_ORDER.length];
      selectTool(prototype, `arrow-${nextPreset}`);
    } else {
      selectTool(prototype, `arrow-${state.arrowPreset}`);
    }
  }

  function showConfirmation(prototype, text) {
    let toast = prototype.querySelector('.tool-confirmation');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'tool-confirmation';
      prototype.querySelector('.prototype-board').appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 1100);
  }

  function libraryItem(name, icon) {
    return `<button class="library-item" type="button" data-library-name="${name}" title="${name}" aria-label="${name}">${iconSvg(icon)}</button>`;
  }

  function collection(name, shortName, count) {
    return `<button class="library-collection" type="button" data-library-name="${name}"><span class="collection-logo">${shortName}</span><span><b>${name}</b><small>${count} shapes</small></span><span>›</span></button>`;
  }

  function libraryMarkup(prototype) {
    const sideClass = prototype.dataset.librarySide === 'right' ? ' is-right' : '';
    const subtitle = prototype.dataset.workbench === 'true' ? 'Workbench · current tool stays active' : 'Click a shape to preview insertion';
    return `<aside class="library-panel${sideClass}" aria-label="Shape library">
      <div class="library-head"><span><b>Library</b><small>${subtitle}</small></span><button class="library-close" type="button" aria-label="Close library">×</button></div>
      <div class="library-search-wrap"><input class="library-search" type="search" placeholder="Search shapes and libraries" aria-label="Search library"></div>
      <div class="library-scroll">
        <section class="library-section" data-library-section><h4>Recents</h4><div class="library-grid">${libraryItem('Rectangle','rectangle')}${libraryItem('Arrow','arrow-straight')}${libraryItem('Decision','diamond')}${libraryItem('Database','cylinder')}</div></section>
        <section class="library-section" data-library-section><h4>Basic</h4><div class="library-grid">${libraryItem('Ellipse','ellipse')}${libraryItem('Triangle','triangle')}${libraryItem('Star','star')}${libraryItem('Cloud','cloud')}${libraryItem('Hexagon','hexagon')}${libraryItem('Comment','comment')}${libraryItem('Folder','folder')}${libraryItem('Text','text')}</div></section>
        <section class="library-section" data-library-section><h4>Flowchart</h4><div class="library-grid">${libraryItem('Process','rectangle')}${libraryItem('Decision gateway','diamond')}${libraryItem('Data store','cylinder')}${libraryItem('Connector','ellipse')}</div></section>
        <section class="library-section" data-library-section><h4>Other libraries</h4>${collection('Robotics','BOT','164')}${collection('AWS Architecture','AWS','810')}${collection('Electrical','EE','292')}</section>
        <div class="library-empty">No matching shapes.</div>
      </div>
    </aside>`;
  }

  function filterLibrary(prototype, value) {
    const panel = prototype.querySelector('.library-panel');
    if (!panel) return;
    const query = value.trim().toLowerCase();
    let visibleCount = 0;
    panel.querySelectorAll('[data-library-name]').forEach((item) => {
      const visible = !query || item.dataset.libraryName.toLowerCase().includes(query);
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    panel.querySelectorAll('[data-library-section]').forEach((section) => {
      section.hidden = ![...section.querySelectorAll('[data-library-name]')].some((item) => !item.hidden);
    });
    panel.classList.toggle('no-results', visibleCount === 0);
  }

  function hydrate(prototype) {
    const state = {
      activeTool: 'move',
      activeFamily: 'cursor',
      arrowPreset: 'straight',
      libraryOpen: false,
      paletteOpen: false,
      menuFamily: null,
      lastByFamily: {
        cursor: 'move',
        frame: 'frame',
        shape: 'rectangle',
        draw: 'pen',
        text: 'text',
        comment: 'comment'
      }
    };
    prototypeStates.set(prototype, state);

    const libraryMount = prototype.querySelector('[data-library-mount]');
    if (libraryMount) libraryMount.innerHTML = libraryMarkup(prototype);
    prototype.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = iconSvg(node.dataset.icon); });
    render(prototype);

    prototype.addEventListener('pointerdown', () => {
      if (!prototype.contains(document.activeElement) || document.activeElement === document.body) prototype.focus();
    });

    prototype.addEventListener('click', (event) => {
      const familyButton = event.target.closest('[data-select-family]');
      if (familyButton) {
        selectFamily(prototype, familyButton.dataset.selectFamily);
        return;
      }

      const menuButton = event.target.closest('[data-open-family]');
      if (menuButton) {
        const family = menuButton.dataset.openFamily;
        if (state.menuFamily === family) closeMenu(prototype);
        else {
          state.menuFamily = family;
          renderMenu(prototype, family);
        }
        return;
      }

      const toolButton = event.target.closest('[data-select-tool]');
      if (toolButton) {
        selectTool(prototype, toolButton.dataset.selectTool);
        prototype.focus();
        return;
      }

      if (event.target.closest('.palette-toggle')) {
        state.paletteOpen = !state.paletteOpen;
        closeMenu(prototype);
        render(prototype);
        return;
      }

      if (event.target.closest('.capsule-active')) {
        if (state.menuFamily === state.activeFamily) closeMenu(prototype);
        else {
          state.menuFamily = state.activeFamily;
          renderMenu(prototype, state.activeFamily);
        }
        return;
      }

      if (event.target.closest('.library-close')) {
        state.libraryOpen = false;
        render(prototype);
        prototype.focus();
        return;
      }

      const libraryButton = event.target.closest('[data-library-name]');
      if (libraryButton) {
        showConfirmation(prototype, `${libraryButton.dataset.libraryName} · insertion simulated`);
      }
    });

    prototype.addEventListener('input', (event) => {
      if (event.target.matches('.library-search')) filterLibrary(prototype, event.target.value);
    });
  }

  document.querySelectorAll('.toolbar-prototype').forEach(hydrate);

  document.addEventListener('keydown', (event) => {
    const prototype = document.activeElement?.closest?.('.toolbar-prototype');
    if (!prototype || event.target.matches('input, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    const shortcuts = { r: 'rectangle', o: 'ellipse', l: 'line', v: 'move', f: 'frame', d: 'pencil', t: 'text', c: 'comment' };
    if (key === 'a') {
      event.preventDefault();
      event.stopImmediatePropagation();
      cycleArrow(prototype);
      return;
    }
    if (shortcuts[key]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectTool(prototype, shortcuts[key]);
    }
  }, true);
})();
