(() => {
  const icons = {
    cursor: '<svg viewBox="0 0 24 24"><path d="M5 3.5 18.4 12l-6.1 1.4-2.9 5.7L5 3.5Z"/></svg>',
    frame: '<svg viewBox="0 0 24 24"><path d="M5 3v18M19 3v18M3 6h5M16 6h5M3 18h5M16 18h5"/></svg>',
    rectangle: '<svg viewBox="0 0 24 24"><rect x="4.5" y="5" width="15" height="14" rx="1.5"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="7"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="m5 18 14-12"/></svg>',
    straight: '<svg viewBox="0 0 24 24"><path d="M5 18 18 6M12.5 6H18v5.5"/></svg>',
    curve: '<svg viewBox="0 0 24 24"><path d="M5 18c2.4-8 7.1-11.8 13-11M12.7 4.2 18 7l-3.1 5"/></svg>',
    elbow: '<svg viewBox="0 0 24 24"><path d="M5 18v-8h13M14 6l4 4-4 4"/></svg>',
    draw: '<svg viewBox="0 0 24 24"><path d="M4 18c2-8 4-11 6-11 3 0 0 10 3 10 2 0 3-4 7-5"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v13M8 19h8"/></svg>',
    comment: '<svg viewBox="0 0 24 24"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg>',
    library: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
  }

  const labels = {
    cursor: 'Cursor',
    frame: 'Frame',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    line: 'Line',
    straight: 'Straight arrow',
    curve: 'Curved arrow',
    elbow: 'Elbow arrow',
    draw: 'Draw',
    text: 'Text',
    comment: 'Comment',
    library: 'Open library'
  }

  const planMessages = {
    p1: {
      aEnter: 'A → stock keyboard registry recalls the arrow tool.',
      aCycle: 'A again → wrapped stock tool selects Curve; before-create supplies bend.',
      r: 'R → stock Rectangle tool sets GeoShapeGeoStyle.',
      o: 'O → stock Ellipse tool sets GeoShapeGeoStyle.',
      l: 'L → stock Line tool runs unchanged.',
      library: '+ → tldraw popover/focus opens the host shape catalog.'
    },
    p2: {
      aEnter: 'A → tldraw keyboard calls the owned ToolbarController.',
      aCycle: 'A again → reducer advances Curve; guarded effect supplies bend.',
      r: 'R → one command path selects the stock Rectangle tool.',
      o: 'O → one command path selects the stock Ellipse tool.',
      l: 'L → one command path selects the stock Line tool.',
      library: '+ → controller opens the owned sidebar and returns focus on close.'
    },
    p3: {
      aEnter: 'A → catalog activates the remembered arrow preset StateNode.',
      aCycle: 'A again → catalog switches to the Curve Arrow tool ID.',
      r: 'R → catalog resolves the stock Rectangle descriptor.',
      o: 'O → catalog resolves the stock Ellipse descriptor.',
      l: 'L → catalog resolves the stock Line descriptor.',
      library: '+ → shared descriptor catalog opens in the library surface.'
    }
  }

  const traceNode = {
    p1: { aEnter: 'registry', aCycle: 'adapter', r: 'registry', o: 'registry', l: 'registry', library: 'library' },
    p2: { aEnter: 'family', aCycle: 'adapter', r: 'family', o: 'family', l: 'family', library: 'library' },
    p3: { aEnter: 'registry', aCycle: 'registry', r: 'family', o: 'family', l: 'family', library: 'library' }
  }

  const families = ['cursor', 'frame', 'shape', 'draw', 'text', 'comment', 'library']
  const arrowCycle = ['straight', 'curve', 'elbow']

  function setupPrototype(root) {
    const plan = root.dataset.plan
    const toolbar = root.querySelector('[data-mini-toolbar]')
    const status = root.querySelector('[data-trace-status]')
    const runButton = root.querySelector('[data-run-trace]')
    const resetButton = root.querySelector('[data-reset-trace]')
    let timers = []
    let state

    const library = document.createElement('aside')
    library.className = 'mini-library'
    library.setAttribute('aria-label', 'Shape library preview')
    library.innerHTML = '<strong>Library</strong><input type="search" placeholder="Search shapes" aria-label="Search shapes"><div class="mini-library-grid"><span>□</span><span>◇</span><span>○</span><span>↗</span><span>▤</span><span>⌁</span></div>'
    root.appendChild(library)

    function currentShapeIcon() {
      return state.shapeTool
    }

    function renderToolbar() {
      toolbar.innerHTML = ''
      families.forEach((family) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'mini-tool'
        button.dataset.family = family
        const resolved = family === 'shape' ? currentShapeIcon() : family
        button.innerHTML = icons[resolved] + (family === 'shape' || family === 'draw' ? '<span class="caret"></span>' : '')
        button.title = labels[resolved] || labels[family]
        button.setAttribute('aria-label', button.title)
        if (family === state.activeFamily && family !== 'library') button.classList.add('is-active')
        if (family === 'library' && state.libraryOpen) button.classList.add('is-active')
        button.addEventListener('click', () => activateFamily(family))
        toolbar.appendChild(button)
      })
      library.classList.toggle('is-open', state.libraryOpen)
    }

    function highlight(nodeName) {
      root.querySelectorAll('[data-node]').forEach((node) => {
        node.classList.toggle('is-flow-active', node.dataset.node === nodeName)
      })
    }

    function setStatus(kind) {
      status.textContent = planMessages[plan][kind]
      highlight(traceNode[plan][kind])
    }

    function activateFamily(family) {
      if (family === 'library') {
        state.libraryOpen = !state.libraryOpen
        setStatus('library')
        renderToolbar()
        if (state.libraryOpen) library.querySelector('input').focus()
        else root.focus()
        return
      }
      state.libraryOpen = false
      state.activeFamily = family
      if (family === 'shape') highlight('family')
      else highlight(family === 'cursor' || family === 'frame' || family === 'draw' || family === 'text' || family === 'comment' ? 'registry' : 'family')
      status.textContent = `${labels[family]} → family slot delegates to the plan's tool boundary.`
      renderToolbar()
    }

    function press(key) {
      state.libraryOpen = false
      if (key === 'a') {
        const entering = state.activeFamily !== 'shape' || !arrowCycle.includes(state.shapeTool)
        if (entering) {
          state.activeFamily = 'shape'
          state.shapeTool = arrowCycle[state.arrowIndex]
          setStatus('aEnter')
        } else {
          state.arrowIndex = (state.arrowIndex + 1) % arrowCycle.length
          state.shapeTool = arrowCycle[state.arrowIndex]
          setStatus('aCycle')
        }
      } else if (key === 'r') {
        state.activeFamily = 'shape'
        state.shapeTool = 'rectangle'
        setStatus('r')
      } else if (key === 'o') {
        state.activeFamily = 'shape'
        state.shapeTool = 'ellipse'
        setStatus('o')
      } else if (key === 'l') {
        state.activeFamily = 'shape'
        state.shapeTool = 'line'
        setStatus('l')
      } else if (key === '+') {
        state.libraryOpen = true
        setStatus('library')
      }
      renderToolbar()
    }

    function clearTimers() {
      timers.forEach(window.clearTimeout)
      timers = []
    }

    function reset() {
      clearTimers()
      state = { activeFamily: 'cursor', shapeTool: 'rectangle', arrowIndex: 0, libraryOpen: false }
      root.querySelectorAll('[data-node]').forEach((node) => node.classList.remove('is-flow-active'))
      status.textContent = plan === 'p1'
        ? 'Ready: tldraw owns the common path.'
        : plan === 'p2'
          ? 'Ready: one owned controller defines the contract.'
          : 'Ready: presets are first-class editor tools.'
      renderToolbar()
    }

    root.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if (!['a', 'r', 'o', 'l', '+'].includes(key)) return
      event.preventDefault()
      press(key)
    })

    runButton.addEventListener('click', () => {
      reset()
      const sequence = ['a', 'a', 'r', '+']
      sequence.forEach((key, index) => {
        timers.push(window.setTimeout(() => press(key), 280 + index * 620))
      })
    })

    resetButton.addEventListener('click', reset)
    reset()
  }

  document.querySelectorAll('.plan-prototype').forEach(setupPrototype)
})()
