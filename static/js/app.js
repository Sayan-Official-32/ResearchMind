document.addEventListener('DOMContentLoaded', () => {
    const topicInput = document.getElementById('topicInput');
    const runBtn = document.getElementById('runBtn');
    const exampleChips = document.querySelectorAll('.example-chip');
    
    const chatContainer = document.getElementById('chatContainer');
    const chatWelcome = document.getElementById('chatWelcome');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    
    // Raw outputs (workstation sidebar)
    const rawWriterContent = document.getElementById('rawWriterContent');
    const rawCriticContent = document.getElementById('rawCriticContent');

    // Live activity elements (right sidebar)
    const activityFeed = document.getElementById('activityFeed');
    const activityEmpty = document.getElementById('activityEmpty');
    const activityBadge = document.getElementById('activityBadge');

    // Top sources elements
    const sourcesList = document.getElementById('sourcesList');
    const sourcesEmpty = document.getElementById('sourcesEmpty');
    const viewAllSourcesBtn = document.getElementById('viewAllSourcesBtn');
    
    // Step DOM element map
    const steps = {
        search: {
            card: document.getElementById('flow-step-search'),
            status: document.getElementById('flow-step-search')
        },
        reader: {
            card: document.getElementById('flow-step-reader'),
            status: document.getElementById('flow-step-reader')
        },
        writer: {
            card: document.getElementById('flow-step-writer'),
            status: document.getElementById('flow-step-writer')
        },
        critic: {
            card: document.getElementById('flow-step-critic'),
            status: document.getElementById('flow-step-critic')
        }
    };

    let currentAiMsgBubbleId = null;
    let pipelineTimerInterval = null;
    let hasAgentRun = false;

    const statusBarLeftToggleBtn = document.getElementById('statusBarLeftToggleBtn');
    const statusBarRightToggleBtn = document.getElementById('statusBarRightToggleBtn');
    
    const appLayout = document.querySelector('.app-layout');
    const pipelineStatusBar = document.getElementById('pipelineStatusBar');
    const progressRingFill = document.getElementById('progressRingFill');
    const progressPercentText = document.getElementById('progressPercentText');
    const progressTimeText = document.getElementById('progressTimeText');

    // Progress update helper
    function updateProgress(percent) {
        if (progressPercentText) progressPercentText.textContent = `${percent}%`;
        if (progressRingFill) {
            // Circumference of r=20 circle is ~125.6
            const offset = 125.6 - (percent / 100) * 125.6;
            progressRingFill.style.strokeDashoffset = offset;
        }
    }

    // Toggle Left Sidebar collapse
    if (statusBarLeftToggleBtn && appLayout) {
        statusBarLeftToggleBtn.addEventListener('click', () => {
            appLayout.classList.toggle('sidebar-collapsed');
        });
    }

    // Toggle Right Sidebar collapse
    if (statusBarRightToggleBtn && appLayout) {
        statusBarRightToggleBtn.addEventListener('click', () => {
            appLayout.classList.toggle('sidebar-right-collapsed');
        });
    }

    // View all sources click listener
    if (viewAllSourcesBtn) {
        viewAllSourcesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const el = activityFeed ? activityFeed.querySelector('.agent-search') : null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                flashHighlight(el, '#3b82f6');
            }
        });
    }

    // Scroll & Highlight navigation helper
    function flashHighlight(element, color) {
        element.style.outline = `2px dashed ${color}`;
        element.style.outlineOffset = '4px';
        element.style.borderRadius = '4px';
        element.style.transition = 'outline 0.3s ease, outline-offset 0.3s ease';
        setTimeout(() => {
            element.style.outline = '2px dashed transparent';
        }, 1500);
    }

    // Click navigation listeners for pipeline steps
    if (steps.search.card) {
        steps.search.card.addEventListener('click', () => {
            const el = activityFeed ? activityFeed.querySelector('.agent-search') : null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                flashHighlight(el, '#3b82f6');
            }
        });
    }
    if (steps.reader.card) {
        steps.reader.card.addEventListener('click', () => {
            const el = activityFeed ? activityFeed.querySelector('.agent-reader') : null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                flashHighlight(el, '#06b6d4');
            }
        });
    }
    if (steps.writer.card) {
        steps.writer.card.addEventListener('click', () => {
            if (appLayout) appLayout.classList.remove('sidebar-collapsed');
            if (rawWriterContent) {
                rawWriterContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                flashHighlight(rawWriterContent, '#f97316');
            }
        });
    }
    if (steps.critic.card) {
        steps.critic.card.addEventListener('click', () => {
            if (appLayout) appLayout.classList.remove('sidebar-collapsed');
            if (rawCriticContent) {
                rawCriticContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                flashHighlight(rawCriticContent, '#a855f7');
            }
        });
    }

    // Live status helper (obsolete in new layout, kept to avoid reference errors)
    function updateLiveStatus(stateClass, text) {}

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
        hasAgentRun = true;
        if (pipelineStatusBar) pipelineStatusBar.classList.add('visible');
        resetWorkstationAndProgress();
        if (activityBadge) {
            activityBadge.textContent = 'RUNNING';
            activityBadge.className = 'activity-badge running';
        }

        // Start elapsed timer

        // Start elapsed timer
        let startTime = Date.now();
        if (pipelineTimerInterval) clearInterval(pipelineTimerInterval);
        if (progressTimeText) {
            progressTimeText.innerHTML = `🕒 Running: 0s`;
            progressTimeText.classList.add('active-run');
        }
        pipelineTimerInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (progressTimeText) progressTimeText.innerHTML = `🕒 Running: ${elapsed}s`;
        }, 1000);

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
            updateLiveStatus('failed', 'Pipeline error occurred');
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
            if (pipelineTimerInterval) {
                clearInterval(pipelineTimerInterval);
                pipelineTimerInterval = null;
            }
            if (progressTimeText) progressTimeText.classList.remove('active-run');
            
            if (activityBadge) {
                const hasFailed = Array.from(Object.values(steps)).some(step => step.card.classList.contains('failed'));
                if (hasFailed) {
                    activityBadge.textContent = 'FAILED';
                    activityBadge.className = 'activity-badge';
                    activityBadge.style.color = '#ff5a1a';
                    activityBadge.style.borderColor = 'rgba(255, 90, 26, 0.3)';
                    activityBadge.style.background = 'rgba(255, 90, 26, 0.12)';
                } else {
                    activityBadge.textContent = 'DONE';
                    activityBadge.className = 'activity-badge done';
                    activityBadge.style.color = '';
                    activityBadge.style.borderColor = '';
                    activityBadge.style.background = '';
                }
            }
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
        if (rawWriterContent) rawWriterContent.textContent = 'Awaiting pipeline start...';
        if (rawCriticContent) rawCriticContent.textContent = 'Awaiting pipeline start...';
        
        // Hide status bar initially if agent hasn't run yet
        if (!hasAgentRun && pipelineStatusBar) {
            pipelineStatusBar.classList.remove('visible');
        }
        updateProgress(0);

        if (pipelineTimerInterval) {
            clearInterval(pipelineTimerInterval);
            pipelineTimerInterval = null;
        }
        if (progressTimeText) {
            progressTimeText.innerHTML = `🕒 Ready`;
            progressTimeText.classList.remove('active-run');
        }
        
        // Reset Activity Feed
        if (activityFeed) {
            const entries = activityFeed.querySelectorAll('.activity-entry');
            entries.forEach(entry => entry.remove());
            if (activityEmpty) activityEmpty.style.display = 'flex';
        }
        if (activityBadge) {
            activityBadge.textContent = 'IDLE';
            activityBadge.className = 'activity-badge';
            activityBadge.style.color = '';
            activityBadge.style.borderColor = '';
            activityBadge.style.background = '';
        }

        // Reset Top Sources
        if (sourcesList) {
            sourcesList.querySelectorAll('.source-item').forEach(el => el.remove());
            if (sourcesEmpty) sourcesEmpty.style.display = 'block';
        }
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
            // Timeline log from agent
            case 'timeline_log':
                if (activityEmpty) activityEmpty.style.display = 'none';
                
                const logTime = eventObj.time || '';
                const logAgent = eventObj.agent || 'System';
                const logMsg = eventObj.message || '';
                
                // Map agent to class name
                let agentClass = 'agent-system';
                if (logAgent.toLowerCase().includes('search')) {
                    agentClass = 'agent-search';
                } else if (logAgent.toLowerCase().includes('reader') || logAgent.toLowerCase().includes('scrape')) {
                    agentClass = 'agent-reader';
                } else if (logAgent.toLowerCase().includes('writer')) {
                    agentClass = 'agent-writer';
                } else if (logAgent.toLowerCase().includes('critic')) {
                    agentClass = 'agent-critic';
                }
                
                const entryHtml = `
                    <div class="activity-entry ${agentClass}">
                        <div class="activity-entry-header">
                            <span class="activity-entry-dot"></span>
                            <span class="activity-entry-agent">${logAgent}</span>
                            <span class="activity-entry-time">${logTime}</span>
                        </div>
                        <div class="activity-entry-msg">${logMsg}</div>
                    </div>
                `;
                
                if (activityFeed) {
                    activityFeed.insertAdjacentHTML('beforeend', entryHtml);
                    activityFeed.scrollTop = activityFeed.scrollHeight;
                }
                break;

            // Search Step
            case 'search_start':
                updateStepState('search', 'running');
                updateProgress(12);
                break;
            case 'search_done':
                updateStepState('search', 'done');
                updateProgress(25);

                // Populate Top Sources list
                if (eventObj.sources && eventObj.sources.length > 0) {
                    if (sourcesEmpty) sourcesEmpty.style.display = 'none';
                    if (sourcesList) {
                        sourcesList.querySelectorAll('.source-item').forEach(el => el.remove());
                        
                        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        eventObj.sources.slice(0, 5).forEach((source, index) => {
                            const rank = index + 1;
                            const domain = source.domain || 'unknown.com';
                            const url = source.url || '#';
                            const displayUrl = source.url ? (source.url.length > 30 ? source.url.substring(0, 30) + '...' : source.url) : 'N/A';
                            
                            const itemHtml = `
                                <div class="source-item">
                                    <div class="source-rank-badge">${rank}</div>
                                    <div class="source-item-details">
                                        <div class="source-item-domain">${domain}</div>
                                        <div class="source-item-subtext">${displayUrl} | ${timeString}</div>
                                    </div>
                                    <a href="${url}" target="_blank" class="source-item-link-btn" title="Open source link">
                                        <svg class="source-item-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                            <polyline points="15 3 21 3 21 9"/>
                                            <line x1="10" y1="14" x2="21" y2="3"/>
                                        </svg>
                                    </a>
                                </div>
                            `;
                            sourcesList.insertAdjacentHTML('beforeend', itemHtml);
                        });
                    }
                }
                break;
            case 'search_failed':
                updateStepState('search', 'failed');
                break;

            // Reader Step
            case 'reader_start':
                updateStepState('reader', 'running');
                updateProgress(38);
                break;
            case 'reader_done':
                updateStepState('reader', 'done');
                updateProgress(50);
                break;
            case 'reader_failed':
                updateStepState('reader', 'failed');
                break;

            // Writer Step
            case 'writer_start':
                updateStepState('writer', 'running');
                updateProgress(62);
                if (rawWriterContent) {
                    rawWriterContent.textContent = 'Generating structured research report...';
                    rawWriterContent.classList.add('active-log');
                }
                break;
            case 'writer_done':
                updateStepState('writer', 'done');
                updateProgress(75);
                if (rawWriterContent) {
                    rawWriterContent.textContent = data;
                    rawWriterContent.classList.remove('active-log');
                }
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
                if (rawWriterContent) {
                    rawWriterContent.textContent = `Error: ${data}`;
                    rawWriterContent.classList.remove('active-log');
                }
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
                updateProgress(88);
                if (rawCriticContent) {
                    rawCriticContent.textContent = 'Evaluating research report quality...';
                    rawCriticContent.classList.add('active-log');
                }
                break;
            case 'critic_done':
                updateStepState('critic', 'done');
                updateProgress(100);
                if (rawCriticContent) {
                    rawCriticContent.textContent = data;
                    rawCriticContent.classList.remove('active-log');
                }
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
                if (rawCriticContent) {
                    rawCriticContent.textContent = `Error: ${data}`;
                    rawCriticContent.classList.remove('active-log');
                }
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
                if (pipelineTimerInterval) {
                    clearInterval(pipelineTimerInterval);
                    pipelineTimerInterval = null;
                }
                if (progressTimeText) {
                    progressTimeText.classList.remove('active-run');
                    const elapsed = eventObj.metrics ? eventObj.metrics.elapsed_time : 0;
                    progressTimeText.innerHTML = `🕒 Completed in ${elapsed} seconds`;
                }
                updateProgress(100);
                console.log('Research pipeline finished successfully!', eventObj.state);
                break;
        }
    }

    // ── Dynamic Welcome Message Picker ──
    const welcomeMessages = [
        "\"The important thing is not to stop questioning. Curiosity has its own reason for existence.\" — Albert Einstein",
        "\"Research is to see what everybody else has seen, and to think what nobody else has thought.\" — Albert Szent-Györgyi",
        "\"Somewhere, something incredible is waiting to be known.\" — Carl Sagan",
        "\"What we know is a drop, what we don't know is an ocean.\" — Isaac Newton",
        "\"Curiosity is the wick in the candle of learning.\" — William Arthur Ward",
        "Deep research, automated synthesis. Unlocking insights at the frontiers of human knowledge."
    ];

    const welcomeMessageEl = document.getElementById('welcomeMessage');
    if (welcomeMessageEl) {
        const randomIndex = Math.floor(Math.random() * welcomeMessages.length);
        welcomeMessageEl.textContent = welcomeMessages[randomIndex];
    }

    // ── Interactive Cursor Spotlight Effect ──
    document.addEventListener('mousemove', (e) => {
        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    });
});
