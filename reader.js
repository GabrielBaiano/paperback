import './view.js'
import { createTOCView } from './ui/tree.js'
import { Overlayer } from './overlayer.js'
import { FoliateMenuBuilder } from './ui/menu-builder.js'

// Initialize theme on load
const savedTheme = localStorage.getItem('paperback-theme') || 'system'
const htmlEl = document.documentElement
htmlEl.classList.remove('theme-light', 'theme-dark', 'theme-sepia')
if (savedTheme === 'light') {
    htmlEl.classList.add('theme-light')
} else if (savedTheme === 'dark') {
    htmlEl.classList.add('theme-dark')
} else if (savedTheme === 'sepia') {
    htmlEl.classList.add('theme-sepia')
}

const getCSS = ({ spacing, justify, hyphenate, theme, size = 100 }) => {
    let themeCSS = ''
    if (theme === 'dark') {
        themeCSS = `
            body {
                background-color: #09090b !important;
                color: #f4f4f5 !important;
            }
        `
    } else if (theme === 'sepia') {
        themeCSS = `
            body {
                background-color: #f4ebd0 !important;
                color: #433422 !important;
            }
        `
    } else if (theme === 'light') {
        themeCSS = `
            body {
                background-color: #ffffff !important;
                color: #000000 !important;
            }
        `
    } else {
        themeCSS = `
            @media (prefers-color-scheme: dark) {
                body {
                    background-color: #09090b !important;
                    color: #f4f4f5 !important;
                }
            }
            @media (prefers-color-scheme: light) {
                body {
                    background-color: #ffffff !important;
                    color: #000000 !important;
                }
            }
        `
    }

    return `
        @namespace epub "http://www.idpf.org/2007/ops";
        html {
            color-scheme: ${theme === 'system' ? 'light dark' : (theme === 'sepia' ? 'light' : theme)};
            font-size: ${size}% !important;
        }
        ${themeCSS}
        /* https://github.com/whatwg/html/issues/5426 */
        @media (prefers-color-scheme: dark) {
            a:link {
                color: lightblue;
            }
        }
        p, li, blockquote, dd {
            line-height: ${spacing};
            text-align: ${justify ? 'justify' : 'start'};
            -webkit-hyphens: ${hyphenate ? 'auto' : 'manual'};
            hyphens: ${hyphenate ? 'auto' : 'manual'};
            -webkit-hyphenate-limit-before: 3;
            -webkit-hyphenate-limit-after: 2;
            -webkit-hyphenate-limit-lines: 2;
            hanging-punctuation: allow-end last;
            widows: 2;
        }
        /* prevent the above from overriding the align attribute */
        [align="left"] { text-align: left; }
        [align="right"] { text-align: right; }
        [align="center"] { text-align: center; }
        [align="justify"] { text-align: justify; }

        pre {
            white-space: pre-wrap !important;
        }
        aside[epub|type~="endnote"],
        aside[epub|type~="footnote"],
        aside[epub|type~="note"],
        aside[epub|type~="rearnote"] {
            display: none;
        }
    `
}

const $ = document.querySelector.bind(document)

const locales = 'en'
const percentFormat = new Intl.NumberFormat(locales, { style: 'percent' })
const listFormat = new Intl.ListFormat(locales, { style: 'short', type: 'conjunction' })

const formatLanguageMap = x => {
    if (!x) return ''
    if (typeof x === 'string') return x
    const keys = Object.keys(x)
    return x[keys[0]]
}

const formatOneContributor = contributor => typeof contributor === 'string'
    ? contributor : formatLanguageMap(contributor?.name)

const formatContributor = contributor => Array.isArray(contributor)
    ? listFormat.format(contributor.map(formatOneContributor))
    : formatOneContributor(contributor)

class Reader {
    #tocView
    style = {
        spacing: 1.4,
        justify: true,
        hyphenate: true,
        theme: localStorage.getItem('paperback-theme') || 'system',
        size: parseInt(localStorage.getItem('paperback-font-size') || '100', 10)
    }
    annotations = new Map()
    annotationsByValue = new Map()
    closeSideBar() {
        $('#dimming-overlay').classList.remove('show')
        $('#side-bar').classList.remove('show')
    }
    setTheme(theme) {
        localStorage.setItem('paperback-theme', theme)
        const html = document.documentElement
        html.classList.remove('theme-light', 'theme-dark', 'theme-sepia')
        if (theme === 'light') {
            html.classList.add('theme-light')
        } else if (theme === 'dark') {
            html.classList.add('theme-dark')
        } else if (theme === 'sepia') {
            html.classList.add('theme-sepia')
        }
        
        this.style.theme = theme
        if (this.view && this.view.renderer) {
            this.view.renderer.setStyles?.(getCSS(this.style))
        }
    }

    setFontSize(newSize) {
        this.style.size = Math.min(200, Math.max(70, newSize))
        localStorage.setItem('paperback-font-size', this.style.size)
        const badge = $('#menu-zoom-val')
        if (badge) badge.textContent = `${this.style.size}%`
        if (this.view && this.view.renderer) {
            this.view.renderer.setStyles?.(getCSS(this.style))
        }
    }

    constructor() {
        $('#side-bar-button').addEventListener('click', () => {
            $('#dimming-overlay').classList.add('show')
            $('#side-bar').classList.add('show')
        })
        $('#dimming-overlay').addEventListener('click', () => this.closeSideBar())

        // Build settings menu declaratively using FoliateMenuBuilder
        this.menuBuilder = new FoliateMenuBuilder({
            container: '#menu-button-morph',
            trigger: '#menu-toggle-btn'
        }).build([
            {
                header: 'Layout',
                items: [
                    {
                        id: 'menu-layout-paginated',
                        label: 'Paginated',
                        type: 'radio',
                        group: 'layout',
                        checked: true,
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
                        onClick: () => {
                            this.view?.renderer.setAttribute('flow', 'paginated')
                            this.menuBuilder.close()
                        }
                    },
                    {
                        id: 'menu-layout-scrolled',
                        label: 'Scrolled',
                        type: 'radio',
                        group: 'layout',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
                        onClick: () => {
                            this.view?.renderer.setAttribute('flow', 'scrolled')
                            this.menuBuilder.close()
                        }
                    }
                ]
            },
            {
                header: 'Text Size',
                items: [
                    {
                        id: 'menu-zoom-control',
                        label: '',
                        isZoom: true,
                        value: this.style.size,
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
                        onZoomOut: () => {
                            this.setFontSize((this.style.size || 100) - 10)
                        },
                        onZoomIn: () => {
                            this.setFontSize((this.style.size || 100) + 10)
                        }
                    }
                ]
            },
            {
                header: 'Theme',
                items: [
                    {
                        id: 'menu-theme-light',
                        label: 'Light',
                        type: 'radio',
                        group: 'theme',
                        checked: this.style.theme === 'light',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.22" x2="5.64" y2="17.78"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
                        onClick: () => {
                            this.setTheme('light')
                            this.menuBuilder.close()
                        }
                    },
                    {
                        id: 'menu-theme-sepia',
                        label: 'Sepia',
                        type: 'radio',
                        group: 'theme',
                        checked: this.style.theme === 'sepia',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M12 7v10"/><path d="M12 12h5"/></svg>`,
                        onClick: () => {
                            this.setTheme('sepia')
                            this.menuBuilder.close()
                        }
                    },
                    {
                        id: 'menu-theme-dark',
                        label: 'Dark',
                        type: 'radio',
                        group: 'theme',
                        checked: this.style.theme === 'dark',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
                        onClick: () => {
                            this.setTheme('dark')
                            this.menuBuilder.close()
                        }
                    }
                ]
            },
            {
                items: [
                    {
                        id: 'menu-action-home',
                        label: 'Back to Home',
                        isExit: true,
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
                        onClick: () => {
                            this.menuBuilder.close()
                            if (typeof globalThis.leaveBookClubAndGoHome === 'function') {
                                globalThis.leaveBookClubAndGoHome()
                            } else {
                                window.location.href = window.location.origin + window.location.pathname
                            }
                        }
                    },
                    {
                        id: 'menu-action-help',
                        label: 'Help & About',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
                        onClick: () => {
                            this.menuBuilder.close()
                            const overlay = document.getElementById('help-modal-overlay')
                            if (overlay) {
                                overlay.style.display = 'flex'
                                document.body.style.overflow = 'hidden'
                            }
                        }
                    }
                ]
            }
        ])

        // Initialize default active theme on load
        this.setTheme(this.style.theme)
    }
    async open(file) {
        this.view = document.createElement('foliate-view')
        document.body.append(this.view)
        await this.view.open(file)
        this.view.addEventListener('load', this.#onLoad.bind(this))
        this.view.addEventListener('relocate', this.#onRelocate.bind(this))

        const { book } = this.view
        book.transformTarget?.addEventListener('data', ({ detail }) => {
            detail.data = Promise.resolve(detail.data).catch(e => {
                console.error(new Error(`Failed to load ${detail.name}`, { cause: e }))
                return ''
            })
        })
        this.view.renderer.setStyles?.(getCSS(this.style))
        this.view.renderer.next()

        $('#header-bar').style.visibility = 'visible'
        $('#nav-bar').style.visibility = 'visible'
        $('#left-button').addEventListener('click', () => this.view.goLeft())
        $('#right-button').addEventListener('click', () => this.view.goRight())

        const slider = $('#progress-slider')
        slider.dir = book.dir
        slider.addEventListener('input', e =>
            this.view.goToFraction(parseFloat(e.target.value)))
        for (const fraction of this.view.getSectionFractions()) {
            const option = document.createElement('option')
            option.value = fraction
            $('#tick-marks').append(option)
        }

        document.addEventListener('keydown', this.#handleKeydown.bind(this))

        const title = formatLanguageMap(book.metadata?.title) || 'Untitled Book'
        document.title = title
        $('#side-bar-title').innerText = title
        $('#side-bar-author').innerText = formatContributor(book.metadata?.author)
        Promise.resolve(book.getCover?.())?.then(blob =>
            blob ? $('#side-bar-cover').src = URL.createObjectURL(blob) : null)

        const toc = book.toc
        if (toc) {
            this.#tocView = createTOCView(toc, href => {
                this.view.goTo(href).catch(e => console.error(e))
                this.closeSideBar()
            })
            $('#toc-view').append(this.#tocView.element)
        }

        // load and show highlights embedded in the file by Calibre
        const bookmarks = await book.getCalibreBookmarks?.()
        if (bookmarks) {
            const { fromCalibreHighlight } = await import('./epubcfi.js')
            for (const obj of bookmarks) {
                if (obj.type === 'highlight') {
                    const value = fromCalibreHighlight(obj)
                    const color = obj.style.which
                    const note = obj.notes
                    const annotation = { value, color, note }
                    const list = this.annotations.get(obj.spine_index)
                    if (list) list.push(annotation)
                    else this.annotations.set(obj.spine_index, [annotation])
                    this.annotationsByValue.set(value, annotation)
                }
            }
            this.view.addEventListener('create-overlay', e => {
                const { index } = e.detail
                const list = this.annotations.get(index)
                if (list) for (const annotation of list)
                    this.view.addAnnotation(annotation)
            })
            this.view.addEventListener('draw-annotation', e => {
                const { draw, annotation } = e.detail
                const { color } = annotation
                draw(Overlayer.highlight, { color })
            })
            this.view.addEventListener('show-annotation', e => {
                const annotation = this.annotationsByValue.get(e.detail.value)
                if (annotation.note) alert(annotation.note)
            })
        }
    }
    #handleKeydown(event) {
        const k = event.key
        if (k === 'ArrowLeft' || k === 'h') this.view.goLeft()
        else if(k === 'ArrowRight' || k === 'l') this.view.goRight()
    }
    #onLoad({ detail: { doc } }) {
        doc.addEventListener('keydown', this.#handleKeydown.bind(this))
        doc.addEventListener('click', () => {
            const menuMorph = document.getElementById('menu-button-morph')
            if (menuMorph) {
                menuMorph.classList.remove('open')
            }
        })
    }
    #onRelocate({ detail }) {
        const { fraction, location, tocItem, pageItem } = detail
        const percent = percentFormat.format(fraction)
        const loc = pageItem
            ? `Page ${pageItem.label}`
            : `Loc ${location.current}`
        const slider = $('#progress-slider')
        slider.style.visibility = 'visible'
        slider.value = fraction
        slider.title = `${percent} · ${loc}`
        if (tocItem?.href) this.#tocView?.setCurrentHref?.(tocItem.href)
    }
}

const open = async file => {
    const dropTarget = $('#drop-target')
    
    if (dropTarget) {
        if (window.hideLoading) {
            window.hideLoading()
        }
        
        const icon = $('.logo-loading-wrapper')
        
        // Define a list of premium water gradient options to randomly select from
        const gradients = [
            'linear-gradient(to top, #f43f5e, #f97316)', // Sunset Red/Coral (original logo vibes)
            'linear-gradient(to top, #3b82f6, #06b6d4)', // Electric Blue
            'linear-gradient(to top, #0ea5e9, #10b981)', // Ocean Blue/Teal
            'linear-gradient(to top, #d946ef, #8b5cf6)', // Neon Purple/Pink
            'linear-gradient(to top, #10b981, #84cc16)', // Emerald Green
            'linear-gradient(to top, #f59e0b, #ef4444)', // Warm Sunset Orange
            'linear-gradient(to top, #8b5cf6, #ec4899)'  // Violet/Deep Pink
        ]
        const randomGradient = gradients[Math.floor(Math.random() * gradients.length)]
        const waterEl = $('.liquid-water')
        if (waterEl) {
            waterEl.style.background = randomGradient
        }

        // --- STAGE 1: Text disappears ---
        dropTarget.classList.add('loading-stage-1')
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // --- STAGE 2: Icon glides down to center of device ---
        if (icon) {
            const rect = icon.getBoundingClientRect()
            const parentRect = dropTarget.getBoundingClientRect()
            const inner = $('.drop-target-inner')
            const innerRect = inner.getBoundingClientRect()
            
            // Set starting absolute position matching static layout visually relative to its relative parent (.drop-target-inner)
            icon.style.transition = 'none'
            icon.style.position = 'absolute'
            icon.style.top = `${rect.top - innerRect.top}px`
            icon.style.left = '50%'
            icon.style.transform = 'translate(-50%, 0)'
            icon.style.margin = '0'
            icon.offsetHeight // Reflow
            
            // Restore transition smoothly (takes exactly 800ms)
            icon.style.transition = 'top 0.8s cubic-bezier(0.25, 1, 0.5, 1), transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)'
            icon.offsetHeight // Reflow
            
            // Calculate the exact center of the screen relative to .drop-target-inner's coordinate space
            const screenCenterY = parentRect.height / 2
            const innerTopOffset = innerRect.top - parentRect.top
            const targetTop = screenCenterY - innerTopOffset
            
            // Glide to the vertical center of the device
            icon.style.top = `${targetTop}px`
            icon.style.transform = 'translate(-50%, -50%)'
        }
        
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // --- STAGE 3: Liquid loading starts ---
        dropTarget.classList.add('loading-stage-3')
        
        let progress = 0
        const fillEl = $('.liquid-fill')
        
        // Progress animation interval (simulated progress from 0 to 100%)
        const animPromise = new Promise(resolve => {
            const interval = setInterval(() => {
                progress += Math.random() * 8 + 2
                if (progress >= 100) {
                    progress = 100
                    clearInterval(interval)
                    if (fillEl) fillEl.style.height = '100%'
                    setTimeout(resolve, 400) // let it settle
                } else {
                    if (fillEl) fillEl.style.height = `${progress}%`
                }
            }, 100)
        })
        
        const reader = new Reader()
        reader.currentFile = file
        globalThis.reader = reader
        
        try {
            // Await both the reader initialization and the progress animation
            await Promise.all([animPromise, reader.open(file)])
        } catch (err) {
            dropTarget.className = 'filter'
            if (icon) {
                icon.removeAttribute('style')
            }
            if (fillEl) fillEl.style.height = '0%'
            throw err
        }
        
        // --- STAGE 4: Load finished (fade out lights and screen) ---
        dropTarget.classList.add('loading-finished')
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Remove it from the DOM
        try {
            if (dropTarget.parentNode) {
                dropTarget.parentNode.removeChild(dropTarget)
            }
        } catch (e) {
            console.warn('Could not remove drop-target:', e)
        }
        
        window.dispatchEvent(new CustomEvent('book-opened', { detail: reader }))
    } else {
        // Fallback for when drop-target does not exist
        if (window.showLoading) {
            window.showLoading('Opening book...')
        }
        const reader = new Reader()
        reader.currentFile = file
        globalThis.reader = reader
        try {
            await reader.open(file)
        } catch (err) {
            if (window.hideLoading) {
                window.hideLoading()
            }
            throw err
        }
        window.dispatchEvent(new CustomEvent('book-opened', { detail: reader }))
    }
}
globalThis.openBook = open

const dragOverHandler = e => e.preventDefault()
const dropHandler = e => {
    e.preventDefault()
    const item = Array.from(e.dataTransfer.items)
        .find(item => item.kind === 'file')
    if (item) {
        const entry = item.webkitGetAsEntry()
        open(entry.isFile ? item.getAsFile() : entry).catch(e => console.error(e))
    }
}
const dropTarget = $('#drop-target')
dropTarget.addEventListener('drop', dropHandler)
dropTarget.addEventListener('dragover', dragOverHandler)

$('#file-input').addEventListener('change', e =>
    open(e.target.files[0]).catch(e => console.error(e)))
$('#file-button').addEventListener('click', () => $('#file-input').click())

// View More / Back Screen Scroller
const scroller = $('#drop-target-scroller')
const viewMoreBtn = $('#bc-view-more-btn')
const viewBackBtn = $('#bc-view-back-btn')

if (scroller && viewMoreBtn && viewBackBtn) {
    viewMoreBtn.addEventListener('click', () => {
        scroller.scrollTo({
            top: window.innerHeight,
            behavior: 'smooth'
        })
    })
    
    viewBackBtn.addEventListener('click', () => {
        scroller.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    })
}

// Copyright Link opens Help & About Modal
const copyrightLink = $('.bc-copyright')
if (copyrightLink) {
    copyrightLink.addEventListener('click', () => {
        const overlay = document.getElementById('help-modal-overlay')
        if (overlay) {
            overlay.style.display = 'flex'
            document.body.style.overflow = 'hidden'
        }
    })
}

const params = new URLSearchParams(location.search)
const url = params.get('url')
if (url) open(url).catch(e => console.error(e))
else dropTarget.style.visibility = 'visible'
