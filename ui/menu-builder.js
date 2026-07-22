/**
 * Lightweight, modular Menu Builder for Foliate-JS overlays.
 * Allows creating, editing, and managing custom declarative menus with smooth animations,
 * active state tracking, sliding pills, keyboard navigation, and theme reactivity.
 */
export class FoliateMenuBuilder {
    #container
    #triggerBtn
    #contentEl
    #hoverPill
    #hoverIndicator
    #itemsMap = new Map()
    #activeRadioGroups = new Map()
    #onCloseCallbacks = []
    #isOpen = false

    constructor({ container, trigger }) {
        this.#container = typeof container === 'string' ? document.querySelector(container) : container
        this.#triggerBtn = typeof trigger === 'string' ? document.querySelector(trigger) : trigger
        if (this.#container) {
            this.#initContainer()
        }
    }

    #initContainer() {
        this.#container.classList.add('menu-morph')
        
        if (this.#triggerBtn) {
            this.#triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this.toggle()
            })
        }

        window.addEventListener('click', (e) => {
            if (this.#isOpen && !this.#container.contains(e.target)) {
                this.close()
            }
        })

        window.addEventListener('keydown', (e) => {
            if (this.#isOpen && e.key === 'Escape') {
                this.close()
            }
        })
    }

    toggle() {
        if (this.#isOpen) this.close()
        else this.open()
    }

    open() {
        this.#isOpen = true
        this.#container.classList.add('open')
    }

    close() {
        this.#isOpen = false
        this.#container.classList.remove('open')
        this.#resetHoverState()
        this.#onCloseCallbacks.forEach(cb => cb())
    }

    onClose(cb) {
        this.#onCloseCallbacks.push(cb)
    }

    #resetHoverState() {
        if (this.#hoverPill) this.#hoverPill.style.opacity = '0'
        if (this.#hoverIndicator) this.#hoverIndicator.style.opacity = '0'
        this.#itemsMap.forEach(item => item.el.classList.remove('hovered'))
    }

    /**
     * Build menu content declaratively.
     * @param {Array<{ header?: string, items: Array<{ id: string, label: string, icon?: string, type?: 'radio'|'action'|'toggle', group?: string, checked?: boolean, active?: boolean, isExit?: boolean, badge?: string, onClick?: Function }> }>} sections
     */
    build(sections) {
        let contentEl = this.#container.querySelector('.menu-morph-content')
        if (!contentEl) {
            contentEl = document.createElement('div')
            contentEl.className = 'menu-morph-content'
            this.#container.appendChild(contentEl)
        } else {
            contentEl.innerHTML = ''
        }
        this.#contentEl = contentEl

        // Sliding hover pill & indicator
        this.#hoverPill = document.createElement('div')
        this.#hoverPill.className = 'menu-hover-pill'
        this.#contentEl.appendChild(this.#hoverPill)

        this.#hoverIndicator = document.createElement('div')
        this.#hoverIndicator.className = 'menu-hover-indicator'
        this.#contentEl.appendChild(this.#hoverIndicator)

        sections.forEach((sec, secIndex) => {
            if (sec.header) {
                const headerEl = document.createElement('div')
                headerEl.className = 'menu-section-header'
                headerEl.textContent = sec.header
                this.#contentEl.appendChild(headerEl)
            }

            const listEl = document.createElement('ul')
            listEl.className = 'menu-list'
            listEl.setAttribute('role', 'menu')

            sec.items.forEach(itemConfig => {
                const itemEl = this.#createMenuItem(itemConfig)
                listEl.appendChild(itemEl)
            })

            this.#contentEl.appendChild(listEl)

            if (secIndex < sections.length - 1 && !sections[secIndex + 1].header) {
                const divider = document.createElement('div')
                divider.className = 'menu-divider'
                this.#contentEl.appendChild(divider)
            }
        })

        this.#setupHoverEvents()
        return this
    }

    #createMenuItem(itemConfig) {
        const li = document.createElement('li')
        li.className = 'menu-item'
        if (itemConfig.id) li.id = itemConfig.id
        if (itemConfig.isExit) li.classList.add('menu-item-exit')

        if (itemConfig.type === 'radio') {
            li.setAttribute('role', 'menuitemradio')
            const indicator = document.createElement('span')
            indicator.className = 'active-indicator'
            li.appendChild(indicator)

            if (itemConfig.checked || itemConfig.active) {
                li.classList.add('active')
                li.setAttribute('aria-checked', 'true')
                if (itemConfig.group) {
                    this.#activeRadioGroups.set(itemConfig.group, itemConfig.id)
                }
            } else {
                li.setAttribute('aria-checked', 'false')
            }
        } else {
            li.setAttribute('role', 'menuitem')
        }

        if (itemConfig.icon) {
            const iconWrap = document.createElement('span')
            iconWrap.className = 'menu-icon-wrap'
            iconWrap.style.display = 'inline-flex'
            iconWrap.style.alignItems = 'center'
            iconWrap.style.justifyContent = 'center'
            iconWrap.innerHTML = itemConfig.icon
            li.appendChild(iconWrap)
        }

        if (itemConfig.label) {
            const labelSpan = document.createElement('span')
            labelSpan.className = 'menu-label'
            labelSpan.textContent = itemConfig.label
            li.appendChild(labelSpan)
        }

        if (itemConfig.isZoom) {
            const zoomRow = document.createElement('div')
            zoomRow.className = 'menu-zoom-row'
            zoomRow.style.display = 'flex'
            zoomRow.style.alignItems = 'center'
            zoomRow.style.gap = '8px'
            zoomRow.style.marginLeft = 'auto'

            const minusBtn = document.createElement('button')
            minusBtn.className = 'menu-zoom-btn'
            minusBtn.textContent = '-'
            minusBtn.title = 'Zoom Out'
            minusBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (typeof itemConfig.onZoomOut === 'function') itemConfig.onZoomOut()
            })

            const valBadge = document.createElement('span')
            valBadge.id = itemConfig.valId || 'menu-zoom-val'
            valBadge.className = 'menu-zoom-val'
            valBadge.textContent = `${itemConfig.value || 100}%`

            const plusBtn = document.createElement('button')
            plusBtn.className = 'menu-zoom-btn'
            plusBtn.textContent = '+'
            plusBtn.title = 'Zoom In'
            plusBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (typeof itemConfig.onZoomIn === 'function') itemConfig.onZoomIn()
            })

            zoomRow.appendChild(minusBtn)
            zoomRow.appendChild(valBadge)
            zoomRow.appendChild(plusBtn)
            li.appendChild(zoomRow)
        }

        if (itemConfig.badge) {
            const badgeSpan = document.createElement('span')
            badgeSpan.className = 'menu-badge'
            badgeSpan.textContent = itemConfig.badge
            li.appendChild(badgeSpan)
        }

        li.addEventListener('click', (e) => {
            e.stopPropagation()
            if (itemConfig.type === 'radio' && itemConfig.group) {
                this.selectRadio(itemConfig.group, itemConfig.id)
            }
            if (typeof itemConfig.onClick === 'function') {
                itemConfig.onClick(itemConfig, e)
            }
        })

        this.#itemsMap.set(itemConfig.id || itemConfig.label, { el: li, config: itemConfig })
        return li
    }

    selectRadio(group, selectedId) {
        this.#activeRadioGroups.set(group, selectedId)
        this.#itemsMap.forEach(({ el, config }) => {
            if (config.group === group) {
                if (config.id === selectedId) {
                    el.classList.add('active')
                    el.setAttribute('aria-checked', 'true')
                } else {
                    el.classList.remove('active')
                    el.setAttribute('aria-checked', 'false')
                }
            }
        })
    }

    #setupHoverEvents() {
        const items = Array.from(this.#itemsMap.values()).map(v => v.el)

        items.forEach(item => {
            item.addEventListener('mouseenter', () => {
                items.forEach(i => i.classList.remove('hovered'))
                item.classList.add('hovered')

                const itemRect = item.getBoundingClientRect()
                const contentRect = this.#contentEl.getBoundingClientRect()
                const top = itemRect.top - contentRect.top

                if (this.#hoverPill) {
                    this.#hoverPill.style.transform = `translate3d(0, ${top}px, 0)`
                    this.#hoverPill.style.height = `${itemRect.height}px`
                    this.#hoverPill.style.opacity = '1'

                    if (item.classList.contains('menu-item-exit')) {
                        this.#hoverPill.classList.add('exit-hover')
                    } else {
                        this.#hoverPill.classList.remove('exit-hover')
                    }
                }

                if (this.#hoverIndicator) {
                    if (item.classList.contains('active')) {
                        this.#hoverIndicator.style.opacity = '0'
                    } else {
                        const indicatorTop = top + (itemRect.height - 16) / 2
                        this.#hoverIndicator.style.transform = `translate3d(0, ${indicatorTop}px, 0)`
                        this.#hoverIndicator.style.opacity = '1'
                    }

                    if (item.classList.contains('menu-item-exit')) {
                        this.#hoverIndicator.classList.add('exit-hover')
                    } else {
                        this.#hoverIndicator.classList.remove('exit-hover')
                    }
                }
            })

            item.addEventListener('mouseleave', () => {
                item.classList.remove('hovered')
            })
        })

        this.#contentEl.addEventListener('mouseleave', () => {
            this.#resetHoverState()
        })
    }
}
