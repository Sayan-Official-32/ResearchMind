document.addEventListener('DOMContentLoaded', () => {
    const topicInput = document.getElementById('topicInput');
    const runBtn = document.getElementById('runBtn');
    const exampleChips = document.querySelectorAll('.example-chip');
    
    const chatContainer = document.getElementById('chatContainer');
    const chatWelcome = document.getElementById('chatWelcome');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    
    // Raw outputs (workstation sidebar)
    const rawSearchContent = document.getElementById('rawSearchContent');
    const rawReaderContent = document.getElementById('rawReaderContent');
    
    // Step DOM element map
    const steps = {
        search: {
            card: document.getElementById('step-search'),
            status: document.getElementById('step-search')
        },
        reader: {
            card: document.getElementById('step-reader'),
            status: document.getElementById('step-reader')
        },
        writer: {
            card: document.getElementById('step-writer'),
            status: document.getElementById('step-writer')
        },
        critic: {
            card: document.getElementById('step-critic'),
            status: document.getElementById('step-critic')
        }
    };

    let currentAiMsgBubbleId = null;

    // ── Auto-resize Input Textarea ──
    topicInput.addEventListener('input', autoResizeInput);
    function autoResizeInput() {
        topicInput.style.height = 'auto';
        topicInput.style.height = topicInput.scrollHeight + 'px';
    }

    // ── Example Chips Handler ──
    exampleChips.forEach(chip => {
        chip.addEventListener('click', () => {
            topicInput.value = chip.getAttribute('data-topic');
            topicInput.focus();
            autoResizeInput();
        });
    });

    // ── Enter Key Submit ──
    topicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runPipeline();
        }
    });

    runBtn.addEventListener('click', runPipeline);

    // ── Clear History Handler ──
    clearHistoryBtn.addEventListener('click', () => {
        const messages = chatContainer.querySelectorAll('.chat-msg');
        messages.forEach(m => m.remove());
        chatWelcome.style.display = 'block';
    });

    // ── Main Pipeline Execution ──
    async function runPipeline() {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert('Please enter a research topic first.');
            return;
        }

        // 1. Prepare UI States for New Message
        chatWelcome.style.display = 'none';
        
        // Append User Bubble
        const userMsgHtml = `
            <div class="chat-msg user">
                <div class="msg-sender">USER</div>
                <div class="msg-bubble">
                    ${topic}
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', userMsgHtml);
        
        // Append AI Placeholder Bubble
        currentAiMsgBubbleId = `ai-msg-${Date.now()}`;
        const aiMsgHtml = `
            <div class="chat-msg ai" id="${currentAiMsgBubbleId}">
                <div class="msg-sender">RESEARCHMIND</div>
                <div class="msg-bubble">
                    <div class="report-content-wrapper" style="display:none;">
                        <div class="markdown-body report-text"></div>
                        <a class="btn-download" href="#" download="research_report.md" style="margin-top:1rem; display:inline-flex;">
                            <span>⬇ Download Report (.md)</span>
                        </a>
                    </div>
                    <div class="feedback-content-wrapper" style="display:none; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.2rem;">
                        <div class="critic-score-box" style="font-size: 1.4rem; font-weight:700; color: var(--accent-green); margin-bottom: 0.8rem;">SCORE: --</div>
                        <div class="markdown-body feedback-text"></div>
                    </div>
                    <div class="ai-loading" style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.82rem; font-family: var(--font-sans);">
                        <svg class="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; color: var(--accent-orange);">
                            <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                            <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                        </svg>
                        <span>Agent pipeline executing. Check the workstation on the left...</span>
                    </div>
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', aiMsgHtml);
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Reset topic Input
        topicInput.value = '';
        autoResizeInput();

        setRunningState(true);
        resetWorkstationAndProgress();

        try {
            // 2. Fetch stream from FastAPI backend
            const response = await fetch('/research/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            // 3. Process the NDJSON (Newline Delimited JSON) stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Hold onto the last incomplete line segment

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const payload = JSON.parse(line);
                            handleStreamEvent(payload);
                        } catch (err) {
                            console.error('Failed to parse line:', line, err);
                        }
                    }
                }
            }

            // Process any remainder in buffer
            if (buffer.trim()) {
                try {
                    const payload = JSON.parse(buffer);
                    handleStreamEvent(payload);
                } catch (err) {
                    console.error('Failed to parse trailing buffer:', buffer, err);
                }
            }

        } catch (error) {
            console.error('Pipeline error:', error);
            alert(`An error occurred while running the pipeline: ${error.message}`);
            // Reset active running steps to failed if error
            for (const key in steps) {
                if (steps[key].card.classList.contains('active')) {
                    updateStepState(key, 'failed');
                }
            }
            // Remove the loading indicator if we failed
            if (currentAiMsgBubbleId) {
                const aiBubble = document.getElementById(currentAiMsgBubbleId);
                if (aiBubble) {
                    const loadingEl = aiBubble.querySelector('.ai-loading');
                    if (loadingEl) {
                        loadingEl.innerHTML = `<span style="color:#ff5a1a;">⚠️ Pipeline execution failed: ${error.message}</span>`;
                    }
                }
            }
        } finally {
            setRunningState(false);
        }
    }

    // ── Helper: Set Running UI state ──
    function setRunningState(running) {
        topicInput.disabled = running;
        runBtn.disabled = running;
        if (running) {
            runBtn.innerHTML = `
                <svg class="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="2" x2="12" y2="6"/>
                    <line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                    <line x1="2" y1="12" x2="6" y2="12"/>
                    <line x1="18" y1="12" x2="22" y2="12"/>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
            `;
        } else {
            runBtn.innerHTML = `
                <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"/>
                    <polyline points="5 12 12 5 19 12"/>
                </svg>
            `;
        }
    }

    // ── Helper: Reset Workstation and Steps Progress ──
    function resetWorkstationAndProgress() {
        Object.keys(steps).forEach(key => {
            updateStepState(key, 'waiting');
        });
        rawSearchContent.textContent = 'Awaiting step...';
        rawReaderContent.textContent = 'Awaiting step...';
    }

    // ── Helper: Update Step Card Visuals ──
    function updateStepState(stepKey, state) {
        const step = steps[stepKey];
        if (!step) return;

        step.card.classList.remove('active', 'done');

        if (state === 'running') {
            step.card.classList.add('active');
        } else if (state === 'done') {
            step.card.classList.add('done');
        }
    }

    // ── Process Stream Events ──
    function handleStreamEvent(eventObj) {
        const { event, data } = eventObj;
        
        // Find current AI bubble DOM elements
        const aiBubble = currentAiMsgBubbleId ? document.getElementById(currentAiMsgBubbleId) : null;
        
        switch (event) {
            // Search Step
            case 'search_start':
                updateStepState('search', 'running');
                rawSearchContent.textContent = 'Searching the web for recent and reliable information...';
                break;
            case 'search_done':
                updateStepState('search', 'done');
                rawSearchContent.textContent = data;
                break;
            case 'search_failed':
                updateStepState('search', 'failed');
                rawSearchContent.textContent = data;
                break;

            // Reader Step
            case 'reader_start':
                updateStepState('reader', 'running');
                rawReaderContent.textContent = 'Scraping and cleaning HTML content from the top search results URL...';
                break;
            case 'reader_done':
                updateStepState('reader', 'done');
                rawReaderContent.textContent = data;
                break;
            case 'reader_failed':
                updateStepState('reader', 'failed');
                rawReaderContent.textContent = data;
                break;

            // Writer Step
            case 'writer_start':
                updateStepState('writer', 'running');
                break;
            case 'writer_done':
                updateStepState('writer', 'done');
                if (aiBubble) {
                    // Hide loading indicator
                    const loadingEl = aiBubble.querySelector('.ai-loading');
                    if (loadingEl) loadingEl.style.display = 'none';

                    // Show report wrapper
                    const reportWrapper = aiBubble.querySelector('.report-content-wrapper');
                    const reportText = aiBubble.querySelector('.report-text');
                    const downloadBtn = aiBubble.querySelector('.btn-download');
                    
                    if (reportWrapper && reportText) {
                        reportWrapper.style.display = 'block';
                        reportText.innerHTML = marked.parse(data);
                        
                        // Set up download blob
                        const blob = new Blob([data], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        downloadBtn.href = url;
                        downloadBtn.download = `research_report_${Date.now()}.md`;
                    }
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                break;
            case 'writer_failed':
                updateStepState('writer', 'failed');
                if (aiBubble) {
                    const loadingEl = aiBubble.querySelector('.ai-loading');
                    if (loadingEl) loadingEl.style.display = 'none';

                    const reportWrapper = aiBubble.querySelector('.report-content-wrapper');
                    const reportText = aiBubble.querySelector('.report-text');
                    if (reportWrapper && reportText) {
                        reportWrapper.style.display = 'block';
                        reportText.innerHTML = `<span style="color:#ff5a1a;">Report generation failed: ${data}</span>`;
                    }
                }
                break;

            // Critic Step
            case 'critic_start':
                updateStepState('critic', 'running');
                break;
            case 'critic_done':
                updateStepState('critic', 'done');
                if (aiBubble) {
                    const feedbackWrapper = aiBubble.querySelector('.feedback-content-wrapper');
                    const feedbackText = aiBubble.querySelector('.feedback-text');
                    const criticScoreBox = aiBubble.querySelector('.critic-score-box');

                    if (feedbackWrapper && feedbackText) {
                        feedbackWrapper.style.display = 'block';
                        feedbackText.innerHTML = marked.parse(data);

                        // Extract score if possible (e.g. Score: 8/10, or just 8/10)
                        const scoreMatch = data.match(/([0-9.]+\/10)/i) || data.match(/Score:\s*([0-9.]+)/i);
                        if (scoreMatch) {
                            criticScoreBox.textContent = `SCORE: ${scoreMatch[1].includes('/10') ? scoreMatch[1] : scoreMatch[1] + '/10'}`;
                        } else {
                            criticScoreBox.textContent = 'EVALUATED';
                        }
                    }
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                break;
            case 'critic_failed':
                updateStepState('critic', 'failed');
                if (aiBubble) {
                    const feedbackWrapper = aiBubble.querySelector('.feedback-content-wrapper');
                    const feedbackText = aiBubble.querySelector('.feedback-text');
                    if (feedbackWrapper && feedbackText) {
                        feedbackWrapper.style.display = 'block';
                        feedbackText.innerHTML = `<span style="color:#ff5a1a;">Evaluation failed: ${data}</span>`;
                    }
                }
                break;
                
            case 'complete':
                console.log('Research pipeline finished successfully!', eventObj.state);
                break;
        }
    }

    // ── Interactive Cursor Spotlight Effect ──
    document.addEventListener('mousemove', (e) => {
        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    });
});
