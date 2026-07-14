import { Overlayer } from './overlayer.js';

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
let myName = localStorage.getItem('bc-name') || 'Reader ' + Math.floor(Math.random() * 1000);
let myColor = localStorage.getItem('bc-color') || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
let intentionalClose = false;

// Local state caches
let activeMembers = {};
let activeHighlights = {};
let activeCommentCfi = null;
let pendingCommentCfi = null;
let pendingCommentText = null; // Stores comment text while waiting for CFI confirmation
let selectionMenu = null;

// Live Cursor Synchronization State
const peerCursors = new Map(); // wsId -> DOM element
let lastMoveTime = 0;
let currentSectionIndex = null;
let floatingComposer = null;
let hoverPopover = null;
let hoverPopoverTimeout = null;
let isMouseOverPopover = false;
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
        localStorage.setItem('redirect_room', urlRoomId); // Store redirect room code immediately
        try {
            const res = await fetch(`/api/rooms/${roomId}`);
            if (res.ok) {
                const roomData = await res.json();
                
                if (roomData.hasBook) {
                    console.log(`[Book Club] Joining Room ${roomId}. Downloading book...`);
                    // Programmatic loading of book
                    if (globalThis.openBook) {
                        await globalThis.openBook(roomData.bookPath);
                    } else {
                        console.error('[Book Club] globalThis.openBook not found');
                    }
                } else {
                    console.log(`[Book Club] Room ${roomId} found but book is expired. Showing re-upload panel.`);
                    showReuploadPanel(roomData.title, roomData.author);
                }
            } else {
                alert('Room not found! Check the code you entered.');
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
    $('#bc-reupload-panel').style.display = 'none';
}

function showReuploadPanel(title, author) {
    $('#bc-setup-panel').style.display = 'none';
    $('#bc-room-panel').style.display = 'none';
    $('#bc-reupload-panel').style.display = 'block';
    
    $('#bc-reupload-title-val').innerText = title || 'Untitled';
    $('#bc-reupload-author-val').innerText = author || 'Unknown';
}

function showRoomPanel() {
    $('#bc-setup-panel').style.display = 'none';
    $('#bc-reupload-panel').style.display = 'none';
    $('#bc-room-panel').style.display = 'block';
    $('#bc-room-id-val').innerText = roomId;
}

// Handle Room Setup Events
function initSetupEvents() {
    // Create Room Button
    $('#bc-create-room-btn').addEventListener('click', async () => {
        const reader = globalThis.reader;
        if (!reader || !reader.currentFile) {
            alert('Please open a book first by dragging a file or choosing from the menu before starting the club!');
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

        $('#bc-create-room-btn').innerText = 'Creating Room...';
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
                alert('Error creating room.');
            }
        } catch (err) {
            console.error('[Book Club] Create room error:', err);
            alert('Network error creating room.');
        } finally {
            $('#bc-create-room-btn').innerText = 'Create Room with Current Book';
            $('#bc-create-room-btn').disabled = false;
        }
    });

    // Join Room Button
    $('#bc-join-room-btn').addEventListener('click', () => {
        const inputVal = $('#bc-join-id-input').value.trim();
        if (!inputVal) {
            alert('Enter a valid room code.');
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
            btn.innerHTML = 'Copied!';
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 2000);
        });
    });

    // Select Re-upload file button click
    const selectReuploadBtn = $('#bc-select-reupload-btn');
    const reuploadFileInput = $('#bc-reupload-file-input');
    if (selectReuploadBtn && reuploadFileInput) {
        selectReuploadBtn.addEventListener('click', () => {
            reuploadFileInput.click();
        });
        
        reuploadFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && globalThis.openBook) {
                await globalThis.openBook(file);
            }
        });
    }

    // Cancel Re-upload button click
    const cancelReuploadBtn = $('#bc-cancel-reupload-btn');
    if (cancelReuploadBtn) {
        cancelReuploadBtn.addEventListener('click', () => {
            window.history.replaceState({}, document.title, window.location.pathname);
            roomId = null;
            showSetupPanel();
        });
    }



    // Drop-target join button (home screen — before book is loaded)
    const dropJoinBtn = $('#drop-join-btn');
    const dropJoinInput = $('#drop-join-input');
    if (dropJoinBtn && dropJoinInput) {
        const doJoin = () => {
            let val = dropJoinInput.value.trim();
            if (!val) return;
            // Support pasting the full invite URL — extract just the room param
            try {
                const parsed = new URL(val);
                const roomParam = parsed.searchParams.get('room');
                if (roomParam) val = roomParam;
            } catch (_) { /* not a URL, use as-is */ }
            if (val && val !== 'null') {
                window.location.href = `${window.location.pathname}?room=${val}`;
            }
        };
        dropJoinBtn.addEventListener('click', doJoin);
        dropJoinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doJoin();
        });
    }
}

// Send current mouse coordinates to the room, throttled to 50ms (20fps)
function sendMouseMove(e, isInsideIframe, doc) {
    if (!roomId) return;
    const now = Date.now();
    if (now - lastMoveTime < 50) return;
    lastMoveTime = now;

    let x = e.clientX;
    let y = e.clientY;

    if (isInsideIframe && doc) {
        const iframe = doc.defaultView.frameElement;
        if (iframe) {
            const rect = iframe.getBoundingClientRect();
            x += rect.left;
            y += rect.top;
        }
    }

    const pctX = x / window.innerWidth;
    const pctY = y / window.innerHeight;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'mousemove',
            x: pctX,
            y: pctY,
            index: currentSectionIndex
        }));
    }
}

// Create or update a peer's cursor on our screen
function handlePeerMouseMove(data) {
    const { wsId, name, color, x, y, index } = data;

    // Only show cursor if they are on the same section as us
    if (index !== currentSectionIndex) {
        const existingCursor = peerCursors.get(wsId);
        if (existingCursor) {
            existingCursor.style.display = 'none';
        }
        return;
    }

    let cursorEl = peerCursors.get(wsId);
    if (cursorEl && (cursorEl.dataset.color !== color || cursorEl.dataset.name !== name)) {
        cursorEl.remove();
        cursorEl = null;
    }

    if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.className = 'bc-peer-cursor';
        cursorEl.style.position = 'fixed';
        cursorEl.style.pointerEvents = 'none';
        cursorEl.style.zIndex = '999999';
        cursorEl.style.transition = 'left 0.1s linear, top 0.1s linear';
        cursorEl.dataset.color = color;
        cursorEl.dataset.name = name;
        
        cursorEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="transform: translate(-2px, -2px); filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35));">
                <path d="M4.5 3V19L9.5 14L15.5 20L18.5 17L12.5 11L17.5 7.5L4.5 3Z" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>
            <div style="background-color: ${color}; color: white; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 10px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; margin-left: 14px; margin-top: -6px; box-shadow: 0 2px 5px rgba(0,0,0,0.25); font-weight: bold;">
                ${name}
            </div>
        `;
        document.body.appendChild(cursorEl);
        peerCursors.set(wsId, cursorEl);
    }

    cursorEl.style.display = 'block';
    // Calculate pixel coordinates based on our current viewport size
    cursorEl.style.left = `${x * window.innerWidth}px`;
    cursorEl.style.top = `${y * window.innerHeight}px`;
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
        console.log('[Book Club] WS Connection closed.');
        if (!intentionalClose && roomId) {
            console.log('[Book Club] Unexpected close, reconnecting in 3s...');
            setTimeout(() => connectWebSocket(), 3000);
        }
        intentionalClose = false;
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

            // Check if our own color got reassigned by server due to conflict
            if (activeMembers[myId] && activeMembers[myId].color !== myColor) {
                myColor = activeMembers[myId].color;
                localStorage.setItem('bc-color', myColor);
                updateSliderThumbColor();
                const colorInput = $('#bc-color-input');
                if (colorInput) colorInput.value = myColor;
                
                // Re-select color presets in sidebar
                const presetsContainer = $('#bc-color-presets');
                if (presetsContainer) {
                    presetsContainer.querySelectorAll('.bc-color-swatch').forEach(s => {
                        s.classList.toggle('selected', s.dataset.color === myColor);
                    });
                }
            }

            renderMembersList();
            renderAllHighlights();
            break;
            
        case 'member_joined':
            activeMembers[data.wsId] = data.member;
            renderMembersList();
            break;

        case 'member_updated':
            if (activeMembers[data.wsId]) {
                activeMembers[data.wsId] = { ...activeMembers[data.wsId], ...data.member };
                renderMembersList();
            }
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
            
            // Clean up cursor element
            const cursorEl = peerCursors.get(data.wsId);
            if (cursorEl) {
                cursorEl.remove();
                peerCursors.delete(data.wsId);
            }
            break;

        case 'mousemove':
            handlePeerMouseMove(data);
            break;
            
        case 'highlight_added':
            const hCfi = data.cfi || data.highlight?.cfi;
            if (hCfi && data.highlight) {
                activeHighlights[hCfi] = data.highlight;
                drawHighlightOnView(data.highlight);
            }
            break;
            
        case 'highlight_deleted':
            if (activeHighlights[data.cfi]) {
                removeHighlightFromView(data.cfi);
                delete activeHighlights[data.cfi];
            }
            break;
            
        case 'error':
            alert(data.message);
            break;
    }
}

// Send identity update without reconnecting
function sendIdentityUpdate() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'update_identity',
            name: myName,
            color: myColor
        }));
        // Update local member state immediately
        if (myId && activeMembers[myId]) {
            activeMembers[myId].name = myName;
            activeMembers[myId].color = myColor;
            renderMembersList();
            updateSliderThumbColor();
        }
    }
}
// Color the slider thumb with the current user's color
function updateSliderThumbColor() {
    const slider = $('#progress-slider');
    if (slider) {
        slider.style.setProperty('--bc-user-color', myColor);
    }
}

// Render progress bar markers (colored dots per member, excluding self, plus custom chapter ticks)
function renderProgressMarkers() {
    updateSliderThumbColor();

    const container = $('#bc-progress-markers');
    if (!container) return;
    container.innerHTML = '';

    const slider = $('#progress-slider');
    if (!slider || slider.style.visibility === 'hidden') return;

    // Get the actual pixel width of the slider track
    const thumbSize = 16;
    const trackWidth = slider.offsetWidth;
    if (trackWidth === 0) return;

    // 1. Draw custom chapter ticks (so they show on all browsers/custom sliders)
    if (globalThis.reader?.view?.getSectionFractions) {
        const fractions = globalThis.reader.view.getSectionFractions();
        fractions.forEach(fraction => {
            const xPx = fraction * (trackWidth - thumbSize) + thumbSize / 2;
            const tick = document.createElement('div');
            tick.className = 'bc-progress-tick';
            tick.style.left = `${xPx}px`;
            container.appendChild(tick);
        });
    }

    // 2. Collect only OTHER members (skip self, as native thumb is user's dot)
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
            const [id, member] = cluster[0];
            const dot = document.createElement('div');
            dot.className = 'bc-progress-dot';
            dot.style.backgroundColor = member.color;

            const label = document.createElement('div');
            label.className = 'bc-progress-dot-label';
            label.textContent = `${member.name} · ${Math.round(member.fraction * 100)}%`;
            dot.appendChild(label);

            if (member.cfi) {
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
                const size = 12 + idx * 4; // each ring slightly larger
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
                <span class="bc-member-name">${member.name} ${isMe ? '(You)' : ''}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="bc-member-progress">${pct}%</span>
                ${(!isMe && member.cfi) ? `<button class="bc-teleport-btn" data-cfi="${member.cfi}">Go to</button>` : ''}
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

    const highlightBtn = document.createElement('button');
    highlightBtn.id = 'bc-floating-highlight-btn';
    highlightBtn.className = 'bc-menu-btn bc-menu-btn-primary';
    highlightBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9.62 12L12 4.67 14.38 12H9.62zM11 2L5.5 18H8l1.12-3h5.76L16 18h2.5L13 2h-2z"/></svg> Highlight`;
    highlightBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        executeHighlight();
    });

    const commentBtn = document.createElement('button');
    commentBtn.id = 'bc-floating-comment-btn';
    commentBtn.className = 'bc-menu-btn';
    commentBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg> Comment`;
    commentBtn.style.borderLeft = '1px solid rgba(128, 128, 128, 0.3)';
    commentBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        executeComment();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bc-menu-btn bc-menu-btn-ghost';
    cancelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    cancelBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hideSelectionMenu();
    });

    selectionMenu.appendChild(highlightBtn);
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

        // Style the buttons dynamically with user's current color
        const highlightBtn = $('#bc-floating-highlight-btn');
        if (highlightBtn) {
            highlightBtn.style.backgroundColor = myColor;
            highlightBtn.style.color = '#ffffff';
        }
        const commentBtn = $('#bc-floating-comment-btn');
        if (commentBtn) {
            commentBtn.style.color = myColor;
        }
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
            highlightColor: myColor  // always use the user's own color
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
        
        // Hide selection menu and show comment composer at the selection rect position
        const iframe = lastSelectionDetails.doc.defaultView.frameElement;
        const rect = range.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        const parentTop = iframeRect.top + rect.top + window.scrollY;
        const parentLeft = iframeRect.left + rect.left + window.scrollX;
        
        // Deselect
        const selection = lastSelectionDetails.doc.defaultView.getSelection();
        if (selection) selection.removeAllRanges();

        hideSelectionMenu();
        showFloatingComposer(cfi, text, parentTop, parentLeft);
    } catch (e) {
        console.error('[Book Club] Failed to extract CFI:', e);
        hideSelectionMenu();
    }
}

// Floating Composer Popover UI (to enter single note)
function showFloatingComposer(cfi, highlightText, top, left) {
    if (floatingComposer) floatingComposer.remove();

    floatingComposer = document.createElement('div');
    floatingComposer.className = 'bc-floating-composer';
    floatingComposer.style.top = `${top - 140}px`;
    floatingComposer.style.left = `${left}px`;
    floatingComposer.style.setProperty('--my-color', myColor);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Write a comment / note about this passage...';
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    const actions = document.createElement('div');
    actions.className = 'bc-composer-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bc-btn bc-btn-sm bc-btn-ghost';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        hideFloatingComposer();
    });

    const sendBtn = document.createElement('button');
    sendBtn.className = 'bc-btn bc-btn-sm bc-btn-primary';
    sendBtn.innerText = 'Save';
    sendBtn.style.backgroundColor = myColor;
    sendBtn.style.color = '#ffffff';
    sendBtn.addEventListener('click', () => {
        const val = textarea.value.trim();
        if (!val) return;

        // Send highlight message WITH the note directly
        ws.send(JSON.stringify({
            type: 'add_highlight',
            cfi,
            text: highlightText,
            highlightColor: myColor,
            note: val
        }));

        hideFloatingComposer();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(sendBtn);

    floatingComposer.appendChild(textarea);
    floatingComposer.appendChild(actions);
    document.body.appendChild(floatingComposer);

    textarea.focus();
}

function hideFloatingComposer() {
    if (floatingComposer) {
        floatingComposer.remove();
        floatingComposer = null;
    }
}

// Hover Popover showing highlights
function showHoverCommentsPopover(cfi, range, iframe, e) {
    clearTimeout(hoverPopoverTimeout);
    
    const highlight = activeHighlights[cfi];
    if (!highlight) return;

    if (!hoverPopover) {
        hoverPopover = document.createElement('div');
        hoverPopover.className = 'bc-hover-popover';
        
        hoverPopover.addEventListener('mouseenter', () => {
            isMouseOverPopover = true;
        });
        hoverPopover.addEventListener('mouseleave', () => {
            isMouseOverPopover = false;
            hideHoverCommentsPopover();
        });
        document.body.appendChild(hoverPopover);
    }

    hoverPopover.dataset.cfi = cfi;

    // Get position relative to viewport
    const rect = range.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    const top = iframeRect.top + rect.top + window.scrollY;
    const left = iframeRect.left + rect.left + window.scrollX;

    hoverPopover.style.top = `${top - hoverPopover.offsetHeight - 10}px`;
    hoverPopover.style.left = `${left}px`;
    
    const isOwner = highlight.userName === myName;

    // Render contents (Header, Highlight Quote, Note, Delete button)
    hoverPopover.innerHTML = `
        <div class="bc-popover-header">
            <span class="bc-popover-author-dot" style="background-color: ${highlight.userColor || 'gray'};"></span>
            <span class="bc-popover-author">${highlight.userName}</span>
            ${isOwner ? `<button class="bc-popover-delete-btn" title="Delete Highlight">✕</button>` : ''}
        </div>
        <div class="bc-popover-quote">"${highlight.text}"</div>
        ${highlight.note ? `<div class="bc-popover-note" style="--bc-highlight-color: ${highlight.highlightColor || 'gray'}">${highlight.note}</div>` : ''}
    `;

    // Wire up delete button if present
    const deleteBtn = hoverPopover.querySelector('.bc-popover-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this highlight?')) {
                ws.send(JSON.stringify({
                    type: 'delete_highlight',
                    cfi
                }));
                hideHoverCommentsPopover();
            }
        });
    }

    hoverPopover.style.display = 'flex';
    // Trigger fade in animation
    setTimeout(() => {
        hoverPopover.classList.add('show');
        // Reposition correctly since height might have changed after rendering
        hoverPopover.style.top = `${top - hoverPopover.offsetHeight - 10}px`;
    }, 10);
}

function hideHoverCommentsPopover() {
    clearTimeout(hoverPopoverTimeout);
    hoverPopoverTimeout = setTimeout(() => {
        if (hoverPopover && !isMouseOverPopover) {
            hoverPopover.classList.remove('show');
            setTimeout(() => {
                if (hoverPopover && !hoverPopover.classList.contains('show')) {
                    hoverPopover.style.display = 'none';
                }
            }, 180);
        }
    }, 200);
}


// Inject highlight rendering in Foliate
async function drawHighlightOnView(highlight) {
    const reader = globalThis.reader;
    if (!reader || !reader.view) return;

    try {
        const { index } = await reader.view.resolveNavigation(highlight.cfi);
        const annotation = {
            value: highlight.cfi,
            color: highlight.highlightColor || highlight.userColor || '#FFD700',
            userName: highlight.userName,
            note: highlight.note // Save the note directly in the annotation
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
            await reader.view.addAnnotation(annotation);
        }
    } catch (e) {
        console.error('[Book Club] Error rendering highlight:', e);
    }
}

async function removeHighlightFromView(cfi) {
    const reader = globalThis.reader;
    if (!reader || !reader.view) return;

    try {
        const { index } = await reader.view.resolveNavigation(cfi);
        const annotation = reader.annotationsByValue.get(cfi);
        if (annotation) {
            await reader.view.deleteAnnotation(annotation);
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

window.addEventListener('book-opened', async ({ detail: reader }) => {
    console.log('[Book Club] Book opened hook initialized');
    
    if (roomId) {
        // If reupload panel is visible, upload the book to restore it on the server
        const reuploadPanel = $('#bc-reupload-panel');
        const isReuploadActive = reuploadPanel && reuploadPanel.style.display === 'block';

        if (isReuploadActive && reader.currentFile) {
            console.log('[Book Club] Expired room session active. Restoring book on server...');
            const formData = new FormData();
            formData.append('book', reader.currentFile);
            
            try {
                const res = await fetch(`/api/rooms/${roomId}/reupload`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    console.log('[Book Club] Room restored on server successfully.');
                } else {
                    console.error('[Book Club] Failed to restore room on server.');
                }
            } catch (err) {
                console.error('[Book Club] Error restoring room:', err);
            }
        }

        showRoomPanel();
        connectWebSocket();
        
        // Wait a small moment to ensure reader.view is ready before rendering existing highlights
        setTimeout(() => {
            renderAllHighlights();
        }, 100);
    } else {
        showSetupPanel();
    }
    
    // Listen for progress changes (relocate event)
    reader.view.addEventListener('relocate', (e) => {
        hideFloatingComposer();
        // Hide hover popover instantly (bypass timeout/hover state)
        if (hoverPopover) {
            hoverPopover.classList.remove('show');
            hoverPopover.style.display = 'none';
        }

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

    // Listen for section document load event to inject text selection and hover listeners
    reader.view.addEventListener('load', ({ detail: { doc, index } }) => {
        console.log(`[Book Club] Loaded section ${index}. Injecting selection/hover handlers.`);
        currentSectionIndex = index; // Track current loaded section index for cursor visibility filter
        
        // Selection change listener
        doc.addEventListener('mouseup', (event) => {
            handleTextSelection(doc, index, event);
        });

        doc.addEventListener('keyup', (event) => {
            handleTextSelection(doc, index, event);
        });

        // Mouse hover over highlighted text inside doc to open comment popover
        doc.addEventListener('mousemove', (e) => {
            sendMouseMove(e, true, doc); // Send mouse coordinates to peers

            const overlayerObj = globalThis.reader?.view?.renderer?.getContents()
                ?.find(x => x.index === index && x.overlayer);
            if (overlayerObj?.overlayer) {
                const [cfi, range] = overlayerObj.overlayer.hitTest({ x: e.clientX, y: e.clientY });
                if (cfi && !cfi.startsWith('search-') && activeHighlights[cfi]) {
                    showHoverCommentsPopover(cfi, range, overlayerObj.doc.defaultView.frameElement, e);
                } else {
                    hideHoverCommentsPopover();
                }
            } else {
                hideHoverCommentsPopover();
            }
        });
    });

    // Intercept show-annotation event (highlight clicked)
    reader.view.addEventListener('show-annotation', (e) => {
        const cfi = e.detail?.value ?? e.detail?.annotation?.value;
        if (cfi && activeHighlights[cfi]) {
            // Find overlayer of current page to get iframe frame element
            const overlayerObj = globalThis.reader?.view?.renderer?.getContents()
                ?.find(x => x.overlayer);
            if (overlayerObj?.overlayer && e.detail.range) {
                showHoverCommentsPopover(cfi, e.detail.range, overlayerObj.doc.defaultView.frameElement);
            }
        }
    });

    // draw-annotation: render the highlight with the stored color
    reader.view.addEventListener('draw-annotation', e => {
        const { draw, annotation } = e.detail;
        const color = annotation.color || '#FFD700';
        
        // Use native Overlayer.highlight from overlayer.js module
        if (Overlayer?.highlight) {
            draw(Overlayer.highlight, { color });
        } else {
            draw((el) => {
                el.style.backgroundColor = color;
                el.style.opacity = '0.35';
                el.style.borderRadius = '2px';
                el.style.cursor = 'pointer';
            }, { color });
        }
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
        // Block if another active member already has this exact color
        const colorLower = color.toLowerCase();
        const takenBy = Object.values(activeMembers).find(
            m => m.color && m.color.toLowerCase() === colorLower && m.name !== myName
        );
        if (takenBy) {
            // Shake the picker visually
            presetsContainer.classList.add('bc-color-taken-shake');
            setTimeout(() => presetsContainer.classList.remove('bc-color-taken-shake'), 500);
            colorInput.value = myColor; // revert input
            return;
        }

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

        // Send update via WS — no reconnect needed
        sendIdentityUpdate();
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

// Check Discord login status
let myDiscordId = null;
let myAvatarUrl = null;

// Load recent reading history from server
async function loadHistoryList() {
    const historyPanel = $('#bc-history-panel');
    const historyList = $('#bc-history-list');
    if (!historyPanel || !historyList) return;

    try {
        const res = await fetch('/api/my-rooms');
        if (res.ok) {
            const rooms = await res.json();
            if (rooms && rooms.length > 0) {
                historyPanel.style.display = 'block';
                historyList.innerHTML = '';
                
                rooms.forEach(room => {
                    const roomCard = document.createElement('div');
                    roomCard.className = 'bc-card';
                    roomCard.style.padding = '10px';
                    roomCard.style.cursor = 'pointer';
                    roomCard.style.transition = 'transform 0.2s, background-color 0.2s';
                    roomCard.style.display = 'flex';
                    roomCard.style.flexDirection = 'column';
                    roomCard.style.gap = '4px';
                    roomCard.style.border = '1px solid rgba(128,128,128,0.15)';
                    
                    const titleText = room.title || 'Untitled Book';
                    const authorText = room.author || 'Unknown Author';
                    const badgeText = room.hasBook ? 'Active' : 'Expired';
                    const badgeColor = room.hasBook ? '#259b24' : '#ff9800';
                    
                    roomCard.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="font-size: 0.9em; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titleText}</strong>
                            <span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background-color: ${badgeColor}; color: white; font-weight: bold;">${badgeText}</span>
                        </div>
                        <span style="font-size: 0.8em; opacity: 0.7;">${authorText}</span>
                        <span style="font-size: 0.75em; opacity: 0.5; font-family: monospace;">Code: ${room.roomId}</span>
                    `;
                    
                    roomCard.addEventListener('mouseenter', () => {
                        roomCard.style.backgroundColor = 'rgba(128, 128, 128, 0.08)';
                        roomCard.style.transform = 'translateY(-1px)';
                    });
                    roomCard.addEventListener('mouseleave', () => {
                        roomCard.style.backgroundColor = '';
                        roomCard.style.transform = 'none';
                    });
                    
                    roomCard.addEventListener('click', () => {
                        const newUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
                        window.location.href = newUrl;
                    });
                    
                    historyList.appendChild(roomCard);
                });
            } else {
                historyPanel.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('[Book Club] Failed to load reading history:', err);
    }
}

// Auto-reconnect WebSocket on visibility state changes (e.g. app switching on mobile)
function initAutoReconnect() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && roomId) {
            if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                console.log('[Book Club] App returned to foreground. Auto-reconnecting WebSocket...');
                connectWebSocket();
            }
        }
    });
}

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        
        if (data.loggedIn) {
            const user = data.user;
            myDiscordId = user.discord_id;
            myName = user.username;
            myAvatarUrl = user.avatar_url;
            myColor = user.color;

            // Fill sidebar profile card
            const avatarImg = $('#bc-my-avatar');
            if (avatarImg) avatarImg.src = user.avatar_url;
            const usernameSpan = $('#bc-my-username');
            if (usernameSpan) usernameSpan.innerText = user.username;

            document.documentElement.style.setProperty('--bc-user-color', user.color);
            
            // Re-select preset swatch color picker
            const swatches = document.querySelectorAll('.bc-color-swatch');
            swatches.forEach(s => {
                s.classList.toggle('selected', s.dataset.color === myColor);
            });
            const colorInput = $('#bc-color-input');
            if (colorInput) colorInput.value = myColor;

            // Wire up logout button
            const logoutBtn = $('#bc-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    const logoutRes = await fetch('/api/auth/logout', { method: 'POST' });
                    if (logoutRes.ok) {
                        window.location.reload();
                    }
                });
            }

            // Fill welcome screen info and logout button
            const welcomeUserInfo = $('#bc-welcome-user-info');
            if (welcomeUserInfo) {
                welcomeUserInfo.innerHTML = `Connected as <strong>${user.username}</strong>. Not you? <button id="bc-welcome-logout-btn" style="background: none; border: none; color: #ff4444; text-decoration: underline; cursor: pointer; padding: 0; font: inherit;">Logout</button>`;
                const welcomeLogoutBtn = $('#bc-welcome-logout-btn');
                if (welcomeLogoutBtn) {
                    welcomeLogoutBtn.addEventListener('click', async () => {
                        const logoutRes = await fetch('/api/auth/logout', { method: 'POST' });
                        if (logoutRes.ok) {
                            window.location.reload();
                        }
                    });
                }
            }

            // Show main app welcome screen, hide landing screen
            const landingText = $('#bc-landing-text');
            if (landingText) landingText.style.display = 'none';
            const appContent = $('#bc-app-content');
            if (appContent) appContent.style.display = 'flex';

            // Check if we have a saved redirect room from localStorage
            const redirectRoom = localStorage.getItem('redirect_room');
            if (redirectRoom && redirectRoom !== 'null' && redirectRoom !== 'undefined') {
                localStorage.removeItem('redirect_room');
                const newUrl = `${window.location.origin}${window.location.pathname}?room=${redirectRoom}`;
                window.history.replaceState({ roomId: redirectRoom }, document.title, newUrl);
                roomId = redirectRoom;
            } else {
                localStorage.removeItem('redirect_room'); // Clean up dirty string if any
            }

            // Now run other client initiations
            initTabs();
            initSetupEvents();
            initColorPicker();
            checkRoomParam();
            loadHistoryList();
            initAutoReconnect();
        } else {
            // Show landing screen, hide main app welcome screen
            const landingText = $('#bc-landing-text');
            if (landingText) landingText.style.display = 'flex';
            const appContent = $('#bc-app-content');
            if (appContent) appContent.style.display = 'none';
        }
    } catch (e) {
        console.error('[Book Club] Auth check failed:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Listen for mouse movement in the main parent window
    window.addEventListener('mousemove', (e) => {
        sendMouseMove(e, false);
    });

    // Prevent keypresses in inputs/textareas from triggering Foliate page-turn hotkeys
    document.addEventListener('keydown', (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
            const k = e.key;
            if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'h' || k === 'l') {
                e.stopImmediatePropagation();
            }
        }
    }, true);
});
