/* Book Club Client-Side Collaboration Logic */

const $ = document.querySelector.bind(document);

// Preset of colors for members
const PRESET_COLORS = [
    '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', 
    '#03a9f4', '#00bcd4', '#009688', '#259b24', 
    '#ff9800', '#ff5722', '#795548', '#607d8b'
];

let ws = null;
let roomId = null;
let myId = null;
let myName = localStorage.getItem('bc-name') || 'Leitor ' + Math.floor(Math.random() * 1000);
let myColor = localStorage.getItem('bc-color') || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];

// Local state caches
let activeMembers = {};
let activeHighlights = {};
let activeCommentCfi = null;
let selectionMenu = null;
let selectedColor = myColor;

// Initialize layout tabs
function initTabs() {
    const tabToc = $('#tab-toc');
    const tabBookclub = $('#tab-bookclub');
    const tocView = $('#toc-view');
    const bookclubView = $('#bookclub-view');

    tabToc.addEventListener('click', () => {
        tabToc.classList.add('active');
        tabBookclub.classList.remove('active');
        tocView.classList.add('active');
        bookclubView.classList.remove('active');
    });

    tabBookclub.addEventListener('click', () => {
        tabBookclub.classList.add('active');
        tabToc.classList.remove('active');
        bookclubView.classList.add('active');
        tocView.classList.remove('active');
    });
}

// Check room ID from URL parameters
async function checkRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get('room');
    
    if (urlRoomId && urlRoomId !== 'null' && urlRoomId !== 'undefined') {
        roomId = urlRoomId;
        try {
            const res = await fetch(`/api/rooms/${roomId}`);
            if (res.ok) {
                const roomData = await res.json();
                console.log(`[Book Club] Joining Room ${roomId}. Downloading book...`);
                
                // Programmatic loading of book
                if (globalThis.openBook) {
                    await globalThis.openBook(roomData.bookPath);
                } else {
                    console.error('[Book Club] globalThis.openBook not found');
                }
            } else {
                alert('Sala não encontrada! Verifique o código informado.');
                window.history.replaceState({}, document.title, window.location.pathname);
                showSetupPanel();
            }
        } catch (err) {
            console.error('[Book Club] Failed to check room:', err);
            showSetupPanel();
        }
    } else {
        showSetupPanel();
    }
}

// Show/Hide Panels
function showSetupPanel() {
    $('#bc-setup-panel').style.display = 'block';
    $('#bc-room-panel').style.display = 'none';
}

function showRoomPanel() {
    $('#bc-setup-panel').style.display = 'none';
    $('#bc-room-panel').style.display = 'block';
    $('#bc-room-id-val').innerText = roomId;
    
    // Set identity fields
    $('#bc-nick-input').value = myName;
    $('#bc-nick-input').style.borderColor = myColor;
}

// Handle Room Setup Events
function initSetupEvents() {
    // Create Room Button
    $('#bc-create-room-btn').addEventListener('click', async () => {
        const reader = globalThis.reader;
        if (!reader || !reader.currentFile) {
            alert('Por favor, abra um livro primeiro arrastando o arquivo ou escolhendo no menu antes de iniciar o clube!');
            return;
        }

        const file = reader.currentFile;
        const metadata = reader.view.book.metadata;
        const title = (metadata && metadata.title) ? (typeof metadata.title === 'string' ? metadata.title : Object.values(metadata.title)[0]) : 'Untitled';
        const author = (metadata && metadata.author) ? (typeof metadata.author === 'string' ? metadata.author : Object.values(metadata.author)[0]) : 'Unknown';

        const formData = new FormData();
        formData.append('book', file);
        formData.append('title', title);
        formData.append('author', author);

        $('#bc-create-room-btn').innerText = 'Criando Sala...';
        $('#bc-create-room-btn').disabled = true;

        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const roomData = await res.json();
                roomId = roomData.roomId;
                
                // Update URL parameter
                const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
                window.history.pushState({ roomId }, document.title, newUrl);
                
                showRoomPanel();
                connectWebSocket();
            } else {
                alert('Erro ao criar sala.');
            }
        } catch (err) {
            console.error('[Book Club] Create room error:', err);
            alert('Falha de rede ao criar sala.');
        } finally {
            $('#bc-create-room-btn').innerText = 'Criar Sala com Livro Atual';
            $('#bc-create-room-btn').disabled = false;
        }
    });

    // Join Room Button
    $('#bc-join-room-btn').addEventListener('click', () => {
        const inputVal = $('#bc-join-id-input').value.trim();
        if (!inputVal) {
            alert('Digite um código de sala válido.');
            return;
        }
        
        const newUrl = `${window.location.origin}${window.location.pathname}?room=${inputVal}`;
        window.location.href = newUrl;
    });

    // Copy Invite Link Button
    $('#bc-copy-link-btn').addEventListener('click', () => {
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            const btn = $('#bc-copy-link-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Copiado!';
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 2000);
        });
    });

    // Save Identity Button
    $('#bc-save-nick-btn').addEventListener('click', () => {
        const nickVal = $('#bc-nick-input').value.trim();
        if (nickVal) {
            myName = nickVal;
            localStorage.setItem('bc-name', myName);
            
            // Randomly select another color if they wish, or keep current
            localStorage.setItem('bc-color', myColor);
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Reconnect to update credentials on server
                ws.close();
            } else {
                connectWebSocket();
            }
        }
    });
}

// WebSocket connection management
function connectWebSocket() {
    if (!roomId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`[Book Club] Connecting to WebSockets at ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('[Book Club] WS Connection established');
        // Join room message
        ws.send(JSON.stringify({
            type: 'join',
            roomId,
            name: myName,
            color: myColor
        }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWSMessage(data);
        } catch (err) {
            console.error('[Book Club] WS message error:', err);
        }
    };

    ws.onclose = () => {
        console.log('[Book Club] WS Connection closed. Attempting reconnect in 3s...');
        setTimeout(() => {
            if (roomId) connectWebSocket();
        }, 3000);
    };

    ws.onerror = (err) => {
        console.error('[Book Club] WS error:', err);
    };
}

function handleWSMessage(data) {
    switch (data.type) {
        case 'room_state':
            myId = data.yourId;
            activeMembers = data.members;
            activeHighlights = data.highlights;
            renderMembersList();
            renderAllHighlights();
            break;
            
        case 'member_joined':
            activeMembers[data.wsId] = data.member;
            renderMembersList();
            break;
            
        case 'member_relocated':
            if (activeMembers[data.wsId]) {
                activeMembers[data.wsId].cfi = data.cfi;
                activeMembers[data.wsId].fraction = data.fraction;
                renderMembersList();
            }
            break;
            
        case 'member_left':
            delete activeMembers[data.wsId];
            renderMembersList();
            break;
            
        case 'highlight_added':
            activeHighlights[data.highlight.cfi] = data.highlight;
            drawHighlightOnView(data.highlight);
            if (activeCommentCfi === data.highlight.cfi) {
                openCommentThread(data.highlight.cfi);
            }
            break;
            
        case 'highlight_deleted':
            const hl = activeHighlights[data.cfi];
            if (hl) {
                removeHighlightFromView(data.cfi);
                delete activeHighlights[data.cfi];
            }
            if (activeCommentCfi === data.cfi) {
                closeCommentThread();
            }
            break;
            
        case 'comment_added':
            if (activeHighlights[data.cfi]) {
                activeHighlights[data.cfi].comments.push(data.comment);
                if (activeCommentCfi === data.cfi) {
                    renderComments();
                }
            }
            break;
            
        case 'error':
            alert(data.message);
            break;
    }
}

// Color the slider thumb with the current user's color
function updateSliderThumbColor() {
    const slider = $('#progress-slider');
    if (slider) slider.style.accentColor = myColor;
}

// Render progress bar markers (colored dots per member, excluding self)
function renderProgressMarkers() {
    updateSliderThumbColor();

    const container = $('#bc-progress-markers');
    if (!container) return;
    container.innerHTML = '';

    const slider = $('#progress-slider');
    if (!slider || slider.style.visibility === 'hidden') return;

    // Get the actual pixel width of the slider track
    // Range input thumb is typically ~16px wide, so track is width - thumbWidth
    const thumbSize = 16;
    const trackWidth = slider.offsetWidth;
    if (trackWidth === 0) return;

    // Collect only OTHER members (skip self)
    const others = Object.entries(activeMembers).filter(([id]) => id !== myId);
    if (others.length === 0) return;

    // Group members that are within 3% of each other (cluster threshold)
    const CLUSTER_THRESHOLD = 0.03;
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < others.length; i++) {
        if (used.has(i)) continue;
        const [idA, memberA] = others[i];
        if (memberA.fraction == null) continue;

        const cluster = [[idA, memberA]];
        used.add(i);

        for (let j = i + 1; j < others.length; j++) {
            if (used.has(j)) continue;
            const [idB, memberB] = others[j];
            if (memberB.fraction == null) continue;
            if (Math.abs(memberA.fraction - memberB.fraction) <= CLUSTER_THRESHOLD) {
                cluster.push([idB, memberB]);
                used.add(j);
            }
        }
        clusters.push(cluster);
    }

    // Render each cluster
    for (const cluster of clusters) {
        // Average fraction for positioning
        const avgFraction = cluster.reduce((sum, [, m]) => sum + m.fraction, 0) / cluster.length;

        // Correct pixel position matching range thumb
        const xPx = avgFraction * (trackWidth - thumbSize) + thumbSize / 2;

        const wrapper = document.createElement('div');
        wrapper.className = 'bc-progress-dot-wrapper';
        wrapper.style.left = `${xPx}px`;

        if (cluster.length === 1) {
            // Single dot
            const [, member] = cluster[0];
            const dot = document.createElement('div');
            dot.className = 'bc-progress-dot';
            dot.style.backgroundColor = member.color;

            const label = document.createElement('div');
            label.className = 'bc-progress-dot-label';
            label.textContent = `${member.name} · ${Math.round(member.fraction * 100)}%`;
            dot.appendChild(label);

            if (cluster[0][0] !== myId && member.cfi) {
                dot.addEventListener('click', () => globalThis.reader?.view?.goTo(member.cfi));
            }
            wrapper.appendChild(dot);
        } else {
            // Stacked cluster — multi-ring dot
            const stack = document.createElement('div');
            stack.className = 'bc-progress-stack';

            // Render concentric colored rings (outer to inner)
            cluster.forEach(([, member], idx) => {
                const ring = document.createElement('div');
                ring.className = 'bc-progress-ring';
                const size = 14 + idx * 5; // each ring slightly larger
                ring.style.width = `${size}px`;
                ring.style.height = `${size}px`;
                ring.style.backgroundColor = member.color;
                ring.style.zIndex = String(10 - idx);
                stack.appendChild(ring);
            });

            // Count badge
            const badge = document.createElement('div');
            badge.className = 'bc-progress-badge';
            badge.textContent = cluster.length;
            stack.appendChild(badge);

            // Label on hover
            const label = document.createElement('div');
            label.className = 'bc-progress-dot-label';
            label.textContent = cluster.map(([, m]) => `${m.name} ${Math.round(m.fraction * 100)}%`).join(' · ');
            stack.appendChild(label);

            // Click teleports to first member in cluster
            stack.addEventListener('click', () => {
                const cfi = cluster.find(([, m]) => m.cfi)?.[1].cfi;
                if (cfi) globalThis.reader?.view?.goTo(cfi);
            });

            wrapper.appendChild(stack);
        }

        container.appendChild(wrapper);
    }
}

// Render members list
function renderMembersList() {
    const list = $('#bc-members-list');
    list.innerHTML = '';
    
    let count = 0;
    for (const [id, member] of Object.entries(activeMembers)) {
        count++;
        const isMe = id === myId;
        const item = document.createElement('div');
        item.className = 'bc-member-item';
        
        const pct = member.fraction != null ? Math.round(member.fraction * 100) : 0;
        
        item.innerHTML = `
            <div class="bc-member-left">
                <span class="bc-avatar" style="background-color: ${member.color};"></span>
                <span class="bc-member-name">${member.name} ${isMe ? '(Você)' : ''}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="bc-member-progress">${pct}%</span>
                ${(!isMe && member.cfi) ? `<button class="bc-teleport-btn" data-cfi="${member.cfi}">Ir para</button>` : ''}
            </div>
        `;
        list.appendChild(item);
    }
    
    $('#bc-member-count').innerText = count;
    renderProgressMarkers();

    // Teleport click handlers
    list.querySelectorAll('.bc-teleport-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cfi = e.target.getAttribute('data-cfi');
            if (cfi && globalThis.reader) {
                globalThis.reader.view.goTo(cfi);
            }
        });
    });
}

// Inject highlight rendering in Foliate
function drawHighlightOnView(highlight) {
    const reader = globalThis.reader;
    if (!reader || !reader.view) return;

    try {
        const { index } = reader.view.resolveNavigation(highlight.cfi);
        const annotation = {
            value: highlight.cfi,
            color: highlight.highlightColor || highlight.userColor || '#FFD700',
            userName: highlight.userName
        };

        // Cache in reader
        if (!reader.annotations.has(index)) {
            reader.annotations.set(index, []);
        }
        
        // Avoid duplicate annotations
        const list = reader.annotations.get(index);
        const exists = list.some(a => a.value === highlight.cfi);
        if (!exists) {
            list.push(annotation);
            reader.annotationsByValue.set(highlight.cfi, annotation);
            reader.view.addAnnotation(annotation);
        }
    } catch (e) {
        console.error('[Book Club] Error rendering highlight:', e);
    }
}

function removeHighlightFromView(cfi) {
    const reader = globalThis.reader;
    if (!reader || !reader.view) return;

    try {
        const { index } = reader.view.resolveNavigation(cfi);
        const annotation = reader.annotationsByValue.get(cfi);
        if (annotation) {
            reader.view.deleteAnnotation(annotation);
            reader.annotationsByValue.delete(cfi);
            
            const list = reader.annotations.get(index);
            if (list) {
                reader.annotations.set(index, list.filter(a => a.value !== cfi));
            }
        }
    } catch (e) {
        console.error('[Book Club] Error removing highlight:', e);
    }
}

function renderAllHighlights() {
    for (const highlight of Object.values(activeHighlights)) {
        drawHighlightOnView(highlight);
    }
}

// Selection menu
function createFloatingMenu() {
    if (selectionMenu) return;

    selectionMenu = document.createElement('div');
    selectionMenu.className = 'bc-selection-menu';
    selectionMenu.style.display = 'none';

    // Color dots
    const colors = ['#fff066', '#ff8fab', '#7cd6ff', '#85e3b3']; // yellow, pink, blue, green
    colors.forEach(col => {
        const dot = document.createElement('div');
        dot.className = 'bc-color-dot';
        dot.style.backgroundColor = col;
        dot.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedColor = col;
            executeHighlight();
        });
        selectionMenu.appendChild(dot);
    });

    const commentBtn = document.createElement('button');
    commentBtn.className = 'bc-menu-btn';
    commentBtn.innerText = 'Comentar';
    commentBtn.style.borderLeft = '1px solid rgba(128, 128, 128, 0.3)';
    commentBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectedColor = '#fff066'; // Default color on comment
        executeComment();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bc-menu-btn';
    cancelBtn.innerText = 'Fechar';
    cancelBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hideSelectionMenu();
    });

    selectionMenu.appendChild(commentBtn);
    selectionMenu.appendChild(cancelBtn);
    document.body.appendChild(selectionMenu);
}

let lastSelectionDetails = null;

function handleTextSelection(doc, index, event) {
    const selection = doc.defaultView.getSelection();
    if (!selection || selection.isCollapsed) {
        // Only hide if we clicked outside selectionMenu
        if (event && event.target.closest && event.target.closest('.bc-selection-menu')) return;
        hideSelectionMenu();
        return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) {
        hideSelectionMenu();
        return;
    }

    try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframe = doc.defaultView.frameElement;
        
        if (!iframe) return;
        
        const iframeRect = iframe.getBoundingClientRect();
        const parentTop = iframeRect.top + rect.top + window.scrollY;
        const parentLeft = iframeRect.left + rect.left + window.scrollX;

        lastSelectionDetails = {
            doc,
            index,
            range: range.cloneRange(),
            text: selectedText
        };

        // Position menu above selection
        createFloatingMenu();
        selectionMenu.style.top = `${parentTop - 45}px`;
        selectionMenu.style.left = `${parentLeft}px`;
        selectionMenu.style.display = 'flex';
    } catch (e) {
        console.error('[Book Club] Text selection error:', e);
    }
}

function hideSelectionMenu() {
    if (selectionMenu) selectionMenu.style.display = 'none';
    lastSelectionDetails = null;
}

function executeHighlight() {
    if (!lastSelectionDetails || !ws || ws.readyState !== WebSocket.OPEN) return;

    const { index, range, text } = lastSelectionDetails;
    try {
        const cfi = globalThis.reader.view.getCFI(index, range);
        
        ws.send(JSON.stringify({
            type: 'add_highlight',
            cfi,
            text,
            highlightColor: selectedColor
        }));
        
        // Deselect
        const selection = lastSelectionDetails.doc.defaultView.getSelection();
        if (selection) selection.removeAllRanges();
    } catch (e) {
        console.error('[Book Club] Failed to extract CFI:', e);
    }
    
    hideSelectionMenu();
}

function executeComment() {
    if (!lastSelectionDetails || !ws || ws.readyState !== WebSocket.OPEN) return;

    const { index, range, text } = lastSelectionDetails;
    try {
        const cfi = globalThis.reader.view.getCFI(index, range);
        
        ws.send(JSON.stringify({
            type: 'add_highlight',
            cfi,
            text,
            highlightColor: selectedColor
        }));

        // Deselect
        const selection = lastSelectionDetails.doc.defaultView.getSelection();
        if (selection) selection.removeAllRanges();
        
        // Open commenting right away
        setTimeout(() => {
            openCommentThread(cfi);
        }, 100);
    } catch (e) {
        console.error('[Book Club] Failed to extract CFI:', e);
    }

    hideSelectionMenu();
}

// Open Comment Sidebar
function openCommentThread(cfi) {
    activeCommentCfi = cfi;
    const highlight = activeHighlights[cfi];
    
    if (!highlight) {
        console.warn(`[Book Club] Highlight not found for CFI: ${cfi}`);
        return;
    }

    // Switch to Book Club Tab
    $('#tab-bookclub').click();

    $('#bc-comment-instruction').style.display = 'none';
    $('#bc-comments-container').style.display = 'block';
    
    $('#bc-highlight-author').innerText = `Grifado por ${highlight.userName}`;
    $('#bc-selected-highlight-text').innerText = `"${highlight.text}"`;
    $('#bc-selected-highlight-text').style.borderColor = highlight.highlightColor || highlight.userColor;

    // Show delete button only if it belongs to current user or if host
    // For simplicity, let anyone delete it or show it for user
    const isOwner = highlight.userName === myName;
    $('#bc-delete-highlight-btn').style.display = isOwner ? 'block' : 'none';

    renderComments();
}

function closeCommentThread() {
    activeCommentCfi = null;
    $('#bc-comment-instruction').style.display = 'block';
    $('#bc-comments-container').style.display = 'none';
}

function renderComments() {
    const list = $('#bc-comments-list');
    list.innerHTML = '';
    
    const highlight = activeHighlights[activeCommentCfi];
    if (!highlight) return;

    highlight.comments.forEach(comment => {
        const item = document.createElement('div');
        item.className = 'bc-comment-item';
        
        const dateStr = new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
            <div class="bc-comment-meta">
                <span class="bc-comment-user" style="color: ${comment.userColor};">${comment.userName}</span>
                <span>${dateStr}</span>
            </div>
            <div class="bc-comment-text">${comment.text}</div>
        `;
        list.appendChild(item);
    });
    
    list.scrollTop = list.scrollHeight;
}

function initCommentFormEvents() {
    // Send comment button
    $('#bc-send-comment-btn').addEventListener('click', () => {
        const input = $('#bc-comment-input');
        const text = input.value.trim();
        
        if (!text || !activeCommentCfi || !ws || ws.readyState !== WebSocket.OPEN) return;
        
        ws.send(JSON.stringify({
            type: 'add_comment',
            cfi: activeCommentCfi,
            commentText: text
        }));
        
        input.value = '';
    });

    // Enter to submit comment
    $('#bc-comment-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            $('#bc-send-comment-btn').click();
        }
    });

    // Delete highlight button
    $('#bc-delete-highlight-btn').addEventListener('click', () => {
        if (activeCommentCfi && ws && ws.readyState === WebSocket.OPEN) {
            if (confirm('Tem certeza que deseja excluir esta marcação e seus comentários?')) {
                ws.send(JSON.stringify({
                    type: 'delete_highlight',
                    cfi: activeCommentCfi
                }));
            }
        }
    });
}

window.addEventListener('book-opened', ({ detail: reader }) => {
    console.log('[Book Club] Book opened hook initialized');
    
    if (roomId) {
        showRoomPanel();
        connectWebSocket();
    } else {
        showSetupPanel();
    }
    
    // Listen for progress changes (relocate event)
    reader.view.addEventListener('relocate', (e) => {
        const { cfi, fraction } = e.detail;
        // Update self locally so sidebar % is immediate
        if (myId && activeMembers[myId]) {
            activeMembers[myId].cfi = cfi;
            activeMembers[myId].fraction = fraction;
            renderMembersList();
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'relocate',
                cfi,
                fraction
            }));
        }
    });

    // Listen for section document load event to inject text selection listeners
    reader.view.addEventListener('load', ({ detail: { doc, index } }) => {
        console.log(`[Book Club] Loaded section ${index}. Injecting selection handler.`);
        
        // Selection change listener
        doc.addEventListener('mouseup', (event) => {
            handleTextSelection(doc, index, event);
        });

        doc.addEventListener('keyup', (event) => {
            handleTextSelection(doc, index, event);
        });
    });

    // Intercept show-annotation event (highlight clicked)
    reader.view.addEventListener('show-annotation', (e) => {
        const cfi = e.detail.value;
        if (cfi && activeHighlights[cfi]) {
            openCommentThread(cfi);
        }
    });

    // Hook existing draw-annotation in case reader.js fires it
    reader.view.addEventListener('draw-annotation', e => {
        const { draw, annotation } = e.detail;
        const { color } = annotation;
        draw(globalThis.reader.view.renderer.constructor.Overlayer?.highlight || (el => {
            el.style.backgroundColor = color;
            el.style.opacity = '0.3';
        }), { color });
    });
});

// App Entry Point
function initColorPicker() {
    const presets = PRESET_COLORS;
    const presetsContainer = $('#bc-color-presets');
    const colorInput = $('#bc-color-input');

    // Set native input to current color
    colorInput.value = myColor;

    function applyColor(color) {
        myColor = color;
        localStorage.setItem('bc-color', myColor);
        colorInput.value = myColor;
        updateSliderThumbColor();

        // Update selected swatch highlight
        presetsContainer.querySelectorAll('.bc-color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === myColor);
        });

        // Update nick input border color as live preview
        const nickInput = $('#bc-nick-input');
        if (nickInput) nickInput.style.borderColor = myColor;

        // If already connected, reconnect to broadcast the new color
        if (ws) {
            ws.close();
        }
    }

    // Render preset swatches
    presets.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'bc-color-swatch';
        swatch.dataset.color = color;
        swatch.style.backgroundColor = color;
        if (color === myColor) swatch.classList.add('selected');
        swatch.addEventListener('click', () => applyColor(color));
        presetsContainer.appendChild(swatch);
    });

    // Native color picker for custom color
    colorInput.addEventListener('input', (e) => applyColor(e.target.value));
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSetupEvents();
    initCommentFormEvents();
    initColorPicker();
    checkRoomParam();
});
