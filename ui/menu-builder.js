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
        const isCurrentlyOpen = this.#container ? this.#container.classList.contains('open') : this.#isOpen
        if (isCurrentlyOpen) this.close()
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
        } else if (itemConfig.type === 'toggle' || itemConfig.type === 'checkbox') {
            li.setAttribute('role', 'menuitemcheckbox')
            const toggleWrap = document.createElement('span')
            toggleWrap.className = 'menu-toggle-switch' + (itemConfig.checked ? ' active' : '')
            toggleWrap.style.marginLeft = 'auto'
            const toggleKnob = document.createElement('span')
            toggleKnob.className = 'menu-toggle-knob'
            toggleWrap.appendChild(toggleKnob)
            li.appendChild(toggleWrap)
            li.setAttribute('aria-checked', itemConfig.checked ? 'true' : 'false')
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
            li.classList.add('menu-item-custom-row')
            const zoomBox = document.createElement('div')
            zoomBox.className = 'menu-segmented-control menu-zoom-box'

            const minusBtn = document.createElement('button')
            minusBtn.type = 'button'
            minusBtn.className = 'menu-segmented-btn'
            minusBtn.textContent = 'a'
            minusBtn.style.fontSize = '13px'
            minusBtn.style.fontWeight = '600'
            minusBtn.title = 'Decrease Text Size'
            minusBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (typeof itemConfig.onZoomOut === 'function') itemConfig.onZoomOut()
            })

            const valBadge = document.createElement('span')
            valBadge.id = itemConfig.valId || 'menu-zoom-val'
            valBadge.className = 'menu-zoom-val'
            valBadge.textContent = `${itemConfig.value || 100}%`

            const plusBtn = document.createElement('button')
            plusBtn.type = 'button'
            plusBtn.className = 'menu-segmented-btn'
            plusBtn.textContent = 'A'
            plusBtn.style.fontSize = '17px'
            plusBtn.style.fontWeight = '700'
            plusBtn.title = 'Increase Text Size'
            plusBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (typeof itemConfig.onZoomIn === 'function') itemConfig.onZoomIn()
            })

            zoomBox.appendChild(minusBtn)
            zoomBox.appendChild(valBadge)
            zoomBox.appendChild(plusBtn)
            li.appendChild(zoomBox)
        }

        if (itemConfig.isThemeRow) {
            li.classList.add('menu-item-custom-row')
            const themeRow = document.createElement('div')
            themeRow.className = 'menu-theme-circles-row'

            const themes = [
                { id: 'light', bg: '#FFFFFF', border: '#D0D0D5', label: 'Light' },
                { id: 'sepia', bg: '#F7F0E0', border: '#E2D5C3', label: 'Sepia' },
                { id: 'blue', bg: '#E0F2FE', border: '#BAE6FD', label: 'Sky Blue' },
                { id: 'dark', bg: '#000000', border: '#2C2C2E', label: 'Dark' }
            ]

            themes.forEach(t => {
                const circleBtn = document.createElement('button')
                circleBtn.type = 'button'
                circleBtn.className = `menu-theme-circle ${t.id}` + (itemConfig.activeTheme === t.id ? ' active' : '')
                circleBtn.title = t.label
                circleBtn.style.backgroundColor = t.bg
                circleBtn.style.borderColor = t.border

                circleBtn.addEventListener('click', (e) => {
                    e.stopPropagation()
                    themeRow.querySelectorAll('.menu-theme-circle').forEach(c => c.classList.remove('active'))
                    circleBtn.classList.add('active')
                    if (typeof itemConfig.onSelectTheme === 'function') {
                        itemConfig.onSelectTheme(t.id)
                    }
                })
                themeRow.appendChild(circleBtn)
            })
            li.appendChild(themeRow)
        }

        if (itemConfig.isSegmented) {
            li.classList.add('menu-item-custom-row')
            const segContainer = document.createElement('div')
            segContainer.className = 'menu-segmented-control'
            itemConfig.options.forEach(opt => {
                const segBtn = document.createElement('button')
                segBtn.type = 'button'
                segBtn.className = 'menu-segmented-btn' + (opt.value === itemConfig.selectedValue ? ' active' : '')
                segBtn.textContent = opt.label
                segBtn.addEventListener('click', (e) => {
                    e.stopPropagation()
                    segContainer.querySelectorAll('.menu-segmented-btn').forEach(b => b.classList.remove('active'))
                    segBtn.classList.add('active')
                    if (typeof itemConfig.onSelect === 'function') {
                        itemConfig.onSelect(opt.value)
                    }
                })
                segContainer.appendChild(segBtn)
            })
            li.appendChild(segContainer)
        }

        if (itemConfig.badge) {
            const badgeSpan = document.createElement('span')
            badgeSpan.className = 'menu-badge'
            badgeSpan.textContent = itemConfig.badge
            li.appendChild(badgeSpan)
        }

        li.addEventListener('click', (e) => {
            e.stopPropagation()
            if (itemConfig.type === 'toggle' || itemConfig.type === 'checkbox') {
                const isChecked = li.getAttribute('aria-checked') === 'true'
                const newChecked = !isChecked
                li.setAttribute('aria-checked', newChecked ? 'true' : 'false')
                const toggleSwitch = li.querySelector('.menu-toggle-switch')
                if (toggleSwitch) toggleSwitch.classList.toggle('active', newChecked)
                if (typeof itemConfig.onClick === 'function') {
                    itemConfig.onClick(newChecked, itemConfig, e)
                }
                return
            }
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

                if (item.classList.contains('menu-item-custom-row')) {
                    if (this.#hoverPill) this.#hoverPill.style.opacity = '0'
                    if (this.#hoverIndicator) this.#hoverIndicator.style.opacity = '0'
                    return
                }

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
