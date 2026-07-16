import './view.js'
import { createTOCView } from './ui/tree.js'
import { Overlayer } from './overlayer.js'

// Initialize theme on load
const savedTheme = localStorage.getItem('paperback-theme') || 'system'
const htmlEl = document.documentElement
htmlEl.classList.remove('theme-light', 'theme-dark')
if (savedTheme === 'light') {
    htmlEl.classList.add('theme-light')
} else if (savedTheme === 'dark') {
    htmlEl.classList.add('theme-dark')
}

const getCSS = ({ spacing, justify, hyphenate, theme }) => {
    let themeCSS = ''
    if (theme === 'dark') {
        themeCSS = `
            body {
                background-color: #09090b !important;
                color: #f4f4f5 !important;
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
            color-scheme: ${theme === 'system' ? 'light dark' : theme};
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
        theme: localStorage.getItem('paperback-theme') || 'system'
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
        html.classList.remove('theme-light', 'theme-dark')
        if (theme === 'light') {
            html.classList.add('theme-light')
        } else if (theme === 'dark') {
            html.classList.add('theme-dark')
        }
        
        this.style.theme = theme
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
 
        // Morphing Menu Interaction and Settings
        const menuMorph = $('#menu-button-morph')
        const toggleBtn = $('#menu-toggle-btn')
        const menuContent = $('.menu-morph-content')
        const hoverPill = $('#menu-hover-pill')
        const hoverIndicator = $('#menu-hover-indicator')

        if (toggleBtn && menuMorph) {
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation()
                menuMorph.classList.toggle('open')
            })

            // Close menu when clicking outside
            window.addEventListener('click', e => {
                if (!menuMorph.contains(e.target)) {
                    menuMorph.classList.remove('open')
                }
            })
        }

        // Layout settings
        const layoutPaginated = $('#menu-layout-paginated')
        const layoutScrolled = $('#menu-layout-scrolled')

        const selectLayout = (flow) => {
            this.view?.renderer.setAttribute('flow', flow)
            if (flow === 'paginated') {
                layoutPaginated?.classList.add('active')
                layoutScrolled?.classList.remove('active')
            } else {
                layoutPaginated?.classList.remove('active')
                layoutScrolled?.classList.add('active')
            }
        }

        layoutPaginated?.addEventListener('click', () => {
            selectLayout('paginated')
            menuMorph?.classList.remove('open')
        })
        layoutScrolled?.addEventListener('click', () => {
            selectLayout('scrolled')
            menuMorph?.classList.remove('open')
        })

        // Theme settings
        const themeLight = $('#menu-theme-light')
        const themeDark = $('#menu-theme-dark')
        const themeSystem = $('#menu-theme-system')

        const selectThemeUI = (theme) => {
            this.setTheme(theme)
            themeLight?.classList.remove('active')
            themeDark?.classList.remove('active')
            themeSystem?.classList.remove('active')

            if (theme === 'light') themeLight?.classList.add('active')
            else if (theme === 'dark') themeDark?.classList.add('active')
            else themeSystem?.classList.add('active')
        }

        themeLight?.addEventListener('click', () => {
            selectThemeUI('light')
            menuMorph?.classList.remove('open')
        })
        themeDark?.addEventListener('click', () => {
            selectThemeUI('dark')
            menuMorph?.classList.remove('open')
        })
        themeSystem?.addEventListener('click', () => {
            selectThemeUI('system')
            menuMorph?.classList.remove('open')
        })

        // Actions
        const actionHome = $('#menu-action-home')
        const actionHelp = $('#menu-action-help')

        actionHome?.addEventListener('click', () => {
            menuMorph?.classList.remove('open')
            if (typeof globalThis.leaveBookClubAndGoHome === 'function') {
                globalThis.leaveBookClubAndGoHome()
            } else {
                window.location.href = window.location.origin + window.location.pathname
            }
        })

        actionHelp?.addEventListener('click', () => {
            menuMorph?.classList.remove('open')
            const overlay = document.getElementById('help-modal-overlay')
            if (overlay) {
                overlay.style.display = 'flex'
                document.body.style.overflow = 'hidden'
            }
        })

        // Sliding Hover Interaction
        const menuItems = document.querySelectorAll('.menu-item')
        menuItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                // Remove hovered class from all items and add to current
                menuItems.forEach(mi => mi.classList.remove('hovered'))
                item.classList.add('hovered')

                // Calculate relative positions
                const itemRect = item.getBoundingClientRect()
                const contentRect = menuContent.getBoundingClientRect()
                
                const top = itemRect.top - contentRect.top
                const left = itemRect.left - contentRect.left

                // Update sliding hover pill
                if (hoverPill) {
                    hoverPill.style.transform = `translate3d(0, ${top}px, 0)`
                    hoverPill.style.height = `${itemRect.height}px`
                    hoverPill.style.opacity = '1'

                    if (item.classList.contains('menu-item-exit')) {
                        hoverPill.classList.add('exit-hover')
                    } else {
                        hoverPill.classList.remove('exit-hover')
                    }
                }

                // Update sliding hover indicator
                if (hoverIndicator) {
                    // Hide indicator on currently selected items to avoid duplicate bars
                    if (item.classList.contains('active')) {
                        hoverIndicator.style.opacity = '0'
                    } else {
                        const indicatorTop = top + (itemRect.height - 16) / 2
                        hoverIndicator.style.transform = `translate3d(0, ${indicatorTop}px, 0)`
                        hoverIndicator.style.opacity = '1'
                    }

                    if (item.classList.contains('menu-item-exit')) {
                        hoverIndicator.classList.add('exit-hover')
                    } else {
                        hoverIndicator.classList.remove('exit-hover')
                    }
                }
            })

            item.addEventListener('mouseleave', () => {
                item.classList.remove('hovered')
            })
        })

        // Reset hover states on menu leave
        menuContent?.addEventListener('mouseleave', () => {
            menuItems.forEach(mi => mi.classList.remove('hovered'))
            if (hoverPill) hoverPill.style.opacity = '0'
            if (hoverIndicator) hoverIndicator.style.opacity = '0'
        })

        // Initialize default active selections on load
        selectLayout('paginated')
        selectThemeUI(this.style.theme)
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
