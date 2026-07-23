import './view.js'
import { createTOCView } from './ui/tree.js'
import { Overlayer } from './overlayer.js'
import { FoliateMenuBuilder } from './ui/menu-builder.js'

// Initialize theme on load
const savedTheme = localStorage.getItem('paperback-theme') || 'system'
const htmlEl = document.documentElement
htmlEl.classList.remove('theme-light', 'theme-dark', 'theme-sepia', 'theme-blue')
if (savedTheme === 'light') {
    htmlEl.classList.add('theme-light')
} else if (savedTheme === 'dark') {
    htmlEl.classList.add('theme-dark')
} else if (savedTheme === 'sepia') {
    htmlEl.classList.add('theme-sepia')
} else if (savedTheme === 'blue') {
    htmlEl.classList.add('theme-blue')
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
    } else if (theme === 'blue') {
        themeCSS = `
            body {
                background-color: #e0f2fe !important;
                color: #0f172a !important;
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
        spacing: parseFloat(localStorage.getItem('paperback-line-spacing') || '1.4'),
        justify: true,
        hyphenate: localStorage.getItem('paperback-hyphenate') !== 'false',
        theme: localStorage.getItem('paperback-theme') || 'system',
        size: parseInt(localStorage.getItem('paperback-font-size') || '100', 10)
    }
    annotations = new Map()
    annotationsByValue = new Map()

    ttsActive = false
    ttsPaused = false
    selectedVoiceURI = localStorage.getItem('paperback-tts-voice') || ''
    ttsRate = parseFloat(localStorage.getItem('paperback-tts-rate') || '1.0')
    ttsCurrentAnnotation = null

    closeSideBar() {
        $('#dimming-overlay').classList.remove('show')
        $('#side-bar').classList.remove('show')
    }

    setTheme(theme) {
        localStorage.setItem('paperback-theme', theme)
        const html = document.documentElement
        html.classList.remove('theme-light', 'theme-dark', 'theme-sepia', 'theme-blue')
        if (theme === 'light') {
            html.classList.add('theme-light')
        } else if (theme === 'dark') {
            html.classList.add('theme-dark')
        } else if (theme === 'sepia') {
            html.classList.add('theme-sepia')
        } else if (theme === 'blue') {
            html.classList.add('theme-blue')
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

    setHyphenate(hyphenate) {
        this.style.hyphenate = hyphenate
        localStorage.setItem('paperback-hyphenate', hyphenate)
        if (this.view && this.view.renderer) {
            this.view.renderer.setStyles?.(getCSS(this.style))
        }
    }

    setLineSpacing(spacing) {
        this.style.spacing = spacing
        localStorage.setItem('paperback-line-spacing', spacing)
        if (this.view && this.view.renderer) {
            this.view.renderer.setStyles?.(getCSS(this.style))
        }
    }

    initTTSVoices() {
        if (!('speechSynthesis' in window)) return
        const select = $('#tts-voice-select')

        const populate = () => {
            if (!select) return
            const voices = window.speechSynthesis.getVoices()
            if (!voices || !voices.length) return
            select.innerHTML = ''

            const userLang = (navigator.language || 'pt-BR').toLowerCase()
            voices.sort((a, b) => {
                const aMatch = a.lang.toLowerCase().startsWith(userLang.slice(0, 2))
                const bMatch = b.lang.toLowerCase().startsWith(userLang.slice(0, 2))
                if (aMatch && !bMatch) return -1
                if (!aMatch && bMatch) return 1
                return a.name.localeCompare(b.name)
            })

            voices.forEach(v => {
                const opt = document.createElement('option')
                opt.value = v.voiceURI
                opt.textContent = `${v.name} (${v.lang})`
                if (this.selectedVoiceURI === v.voiceURI || (!this.selectedVoiceURI && v.default)) {
                    opt.selected = true
                    this.selectedVoiceURI = v.voiceURI
                }
                select.appendChild(opt)
            })
        }

        populate()
        if ('onvoiceschanged' in window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = populate
        }

        select?.addEventListener('change', (e) => {
            this.selectedVoiceURI = e.target.value
            localStorage.setItem('paperback-tts-voice', this.selectedVoiceURI)
            if (this.ttsActive && !this.ttsPaused) {
                this.restartTTSBlock()
            }
        })

        const rateSelect = $('#tts-rate-select')
        if (rateSelect) {
            rateSelect.value = this.ttsRate.toString()
            rateSelect.addEventListener('change', (e) => {
                this.ttsRate = parseFloat(e.target.value)
                localStorage.setItem('paperback-tts-rate', this.ttsRate)
                if (this.ttsActive && !this.ttsPaused) {
                    this.restartTTSBlock()
                }
            })
        }

        $('#tts-play-btn')?.addEventListener('click', () => this.toggleTTSPlayPause())
        $('#tts-prev-btn')?.addEventListener('click', () => this.prevTTSBlock())
        $('#tts-next-btn')?.addEventListener('click', () => this.nextTTSBlock())
        $('#tts-close-btn')?.addEventListener('click', () => this.stopTTS())
    }

    onTTSHighlight(range) {
        if (this.ttsCurrentAnnotation) {
            try { this.view?.deleteAnnotation(this.ttsCurrentAnnotation) } catch (e) {}
            this.ttsCurrentAnnotation = null
        }
        if (!range) return
        this.ttsCurrentAnnotation = {
            range,
            style: {
                fill: 'rgba(255, 235, 59, 0.45)'
            }
        }
        this.view?.addAnnotation(this.ttsCurrentAnnotation)
        this.view?.renderer?.scrollToAnchor(range, true)
    }

    async startTTS() {
        if (!('speechSynthesis' in window)) {
            alert('Speech synthesis is not supported in this browser.')
            return
        }
        if (!this.view) return

        this.menuBuilder?.close()

        const topBar = $('#tts-top-bar')
        if (topBar) topBar.classList.add('show')

        await this.view.initTTS('word', (range) => this.onTTSHighlight(range))
        this.ttsActive = true
        this.ttsPaused = false
        this.speakTTSCurrentBlock()
    }

    speakTTSCurrentBlock(ssmlData) {
        if (!this.ttsActive || !this.view?.tts) return
        window.speechSynthesis.cancel()

        const [ssml] = ssmlData || this.view.tts.start() || []
        if (!ssml) {
            this.stopTTS()
            return
        }

        // Parse HTML/SSML into clean plain text without tags or XML artifacts
        let text = ''
        try {
            const parser = new DOMParser()
            const htmlDoc = parser.parseFromString(ssml, 'text/html')
            htmlDoc.querySelectorAll('script, style, xml').forEach(el => el.remove())
            text = htmlDoc.body.textContent || htmlDoc.body.innerText || ''
        } catch (e) {
            text = ssml.replace(/<[^>]+>/g, ' ')
        }

        text = (text || '').replace(/\s+/g, ' ').trim()
        if (!text) {
            this.nextTTSBlock()
            return
        }

        const utter = new SpeechSynthesisUtterance(text)
        utter.rate = this.ttsRate

        // Voice selection: prioritize natural human voices over robotic ones
        const voices = window.speechSynthesis.getVoices()
        if (voices && voices.length) {
            let voice = null
            if (this.selectedVoiceURI) {
                voice = voices.find(v => v.voiceURI === this.selectedVoiceURI)
            }
            if (!voice) {
                const lang = (navigator.language || 'pt-BR').toLowerCase()
                voice = voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)) && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Luciana') || v.name.includes('Helena') || v.name.includes('Francisca') || v.name.includes('Daniel') || v.name.includes('Microsoft') || v.name.includes('Online')))
                    || voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)) && !v.name.toLowerCase().includes('espeak'))
                    || voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)))
                    || voices[0]
            }
            if (voice) {
                utter.voice = voice
                this.selectedVoiceURI = voice.voiceURI
            }
        }

        utter.onstart = () => {
            this.updateTTSPlayButtonState(true)
        }

        utter.onend = () => {
            if (this.ttsActive && !this.ttsPaused) {
                this.nextTTSBlock()
            }
        }

        utter.onerror = (e) => {
            console.warn('TTS Speech error:', e)
            if (this.ttsActive && !this.ttsPaused) {
                this.nextTTSBlock()
            }
        }

        this.ttsUtterance = utter
        this.updateTTSPlayButtonState(true)
        window.speechSynthesis.speak(utter)
    }

    nextTTSBlock() {
        if (!this.view?.tts) return
        window.speechSynthesis.cancel()
        const res = this.view.tts.next(true)
        if (!res) {
            this.stopTTS()
            return
        }
        this.speakTTSCurrentBlock(res)
    }

    prevTTSBlock() {
        if (!this.view?.tts) return
        window.speechSynthesis.cancel()
        const res = this.view.tts.prev(true)
        if (!res) return
        this.speakTTSCurrentBlock(res)
    }

    restartTTSBlock() {
        if (!this.view?.tts) return
        window.speechSynthesis.cancel()
        const res = this.view.tts.resume()
        this.speakTTSCurrentBlock(res)
    }

    pauseTTS() {
        if ('speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
            window.speechSynthesis.pause()
            this.ttsPaused = true
            this.updateTTSPlayButtonState(false)
        }
    }

    resumeTTS() {
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume()
            this.ttsPaused = false
            this.updateTTSPlayButtonState(true)
        } else {
            this.startTTS()
        }
    }

    toggleTTSPlayPause() {
        if (!this.ttsActive) {
            this.startTTS()
        } else if (this.ttsPaused) {
            this.resumeTTS()
        } else {
            this.pauseTTS()
        }
    }

    stopTTS() {
        this.ttsActive = false
        this.ttsPaused = false
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
        }
        if (this.ttsCurrentAnnotation) {
            try { this.view?.deleteAnnotation(this.ttsCurrentAnnotation) } catch (e) {}
            this.ttsCurrentAnnotation = null
        }
        const topBar = $('#tts-top-bar')
        if (topBar) topBar.classList.remove('show')
        this.updateTTSPlayButtonState(false)
    }

    updateTTSPlayButtonState(isPlaying) {
        const playIcon = $('#tts-play-icon')
        const pauseIcon = $('#tts-pause-icon')
        if (playIcon && pauseIcon) {
            playIcon.style.display = isPlaying ? 'none' : 'block'
            pauseIcon.style.display = isPlaying ? 'block' : 'none'
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
                items: [
                    {
                        id: 'menu-zoom-control',
                        label: '',
                        isZoom: true,
                        value: this.style.size,
                        onZoomOut: () => this.setFontSize((this.style.size || 100) - 10),
                        onZoomIn: () => this.setFontSize((this.style.size || 100) + 10)
                    }
                ]
            },
            {
                items: [
                    {
                        id: 'menu-theme-circles',
                        isThemeRow: true,
                        activeTheme: this.style.theme,
                        onSelectTheme: (theme) => this.setTheme(theme)
                    }
                ]
            },
            {
                items: [
                    {
                        id: 'menu-line-spacing-seg',
                        isSegmented: true,
                        selectedValue: this.style.spacing,
                        options: [
                            { label: '1.2', value: 1.2 },
                            { label: '1.4', value: 1.4 },
                            { label: '1.6', value: 1.6 },
                            { label: '1.8', value: 1.8 }
                        ],
                        onSelect: (val) => this.setLineSpacing(val)
                    }
                ]
            },
            {
                items: [
                    {
                        id: 'menu-hyphenate-toggle',
                        label: 'Auto-Hyphenation',
                        type: 'toggle',
                        checked: this.style.hyphenate,
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M5 6h7"/><path d="M5 18h10"/></svg>`,
                        onClick: (checked) => this.setHyphenate(checked)
                    },
                    {
                        id: 'menu-scrolled-toggle',
                        label: 'Scrolling View',
                        type: 'toggle',
                        checked: this.view?.renderer?.getAttribute('flow') === 'scrolled',
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
                        onClick: (checked) => {
                            this.view?.renderer?.setAttribute('flow', checked ? 'scrolled' : 'paginated')
                        }
                    },
                    {
                        id: 'menu-action-tts',
                        label: 'Read Aloud (TTS)',
                        type: 'toggle',
                        checked: this.ttsActive,
                        icon: `<svg class="menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
                        onClick: (checked) => {
                            this.menuBuilder.close()
                            if (checked) this.startTTS()
                            else this.stopTTS()
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

        // Initialize TTS Voices & Control Bar listeners
        this.initTTSVoices()
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
        Promise.resolve(book.getCover?.())?.then(blob => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const coverEl = $('#side-bar-cover')
            if (coverEl) coverEl.src = url

            try {
                const reader = new FileReader()
                reader.onloadend = () => {
                    if (reader.result && title) {
                        try { localStorage.setItem(`paperback-cover-${title}`, reader.result) } catch (e) {}
                    }
                }
                reader.readAsDataURL(blob)
            } catch (e) {}
        })

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
            if (this.menuBuilder) {
                this.menuBuilder.close()
            } else {
                const menuMorph = document.getElementById('menu-button-morph')
                if (menuMorph) menuMorph.classList.remove('open')
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
    
    // Clean up previous reader view from DOM to free memory
    if (globalThis.reader && globalThis.reader.view) {
        try {
            globalThis.reader.view.remove()
        } catch (e) {
            console.warn('Could not remove previous reader view:', e)
        }
    }

    if (window.showLoading) {
        window.showLoading('Abrindo livro...', 15, 'Lendo arquivo...')
    }

    const reader = new Reader()
    reader.currentFile = file
    globalThis.reader = reader

    try {
        if (window.updateLoadingProgress) {
            window.updateLoadingProgress(45, 'Processando formato EPUB...')
        }
        
        await reader.open(file)
        
        if (window.updateLoadingProgress) {
            window.updateLoadingProgress(85, 'Renderizando páginas...')
        }
        await new Promise(resolve => setTimeout(resolve, 150))
        
        if (window.updateLoadingProgress) {
            window.updateLoadingProgress(100, 'Livro aberto com sucesso!')
        }
        await new Promise(resolve => setTimeout(resolve, 200))
    } catch (err) {
        if (window.hideLoading) window.hideLoading()
        if (dropTarget) dropTarget.style.display = 'block'
        throw err
    }

    if (window.hideLoading) {
        window.hideLoading()
    }

    try {
        if (dropTarget && dropTarget.parentNode) {
            dropTarget.parentNode.removeChild(dropTarget)
        }
    } catch (e) {
        console.warn('Could not remove drop-target:', e)
    }

    window.dispatchEvent(new CustomEvent('book-opened', { detail: reader }))
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
        const moreScreen = document.querySelector('.drop-screen-more')
        if (moreScreen) {
            moreScreen.scrollIntoView({ behavior: 'smooth' })
        } else {
            scroller.scrollTo({ top: window.innerHeight, behavior: 'smooth' })
        }
    })
    
    viewBackBtn.addEventListener('click', () => {
        const homeScreen = document.querySelector('.drop-screen-home')
        if (homeScreen) {
            homeScreen.scrollIntoView({ behavior: 'smooth' })
        } else {
            scroller.scrollTo({ top: 0, behavior: 'smooth' })
        }
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
