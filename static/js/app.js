document.addEventListener('DOMContentLoaded', () => {
    const topicInput = document.getElementById('topicInput');
    const runBtn = document.getElementById('runBtn');
    const exampleChips = document.querySelectorAll('.example-chip');
    const resultsSection = document.getElementById('resultsSection');
    
    // Raw outputs
    const rawSearchContent = document.getElementById('rawSearchContent');
    const rawReaderContent = document.getElementById('rawReaderContent');
    
    // Final report
    const reportContainer = document.getElementById('reportContainer');
    const reportContent = document.getElementById('reportContent');
    const downloadBtn = document.getElementById('downloadBtn');
    
    // Critic feedback
    const feedbackPanel = document.getElementById('feedbackPanel');
    const criticScore = document.getElementById('criticScore');
    const feedbackContent = document.getElementById('feedbackContent');
    
    // Step DOM element map
    const steps = {
        search: {
            card: document.getElementById('step-search'),
            status: document.getElementById('status-search')
        },
        reader: {
            card: document.getElementById('step-reader'),
            status: document.getElementById('status-reader')
        },
        writer: {
            card: document.getElementById('step-writer'),
            status: document.getElementById('status-writer')
        },
        critic: {
            card: document.getElementById('step-critic'),
            status: document.getElementById('status-critic')
        }
    };

    // ── Example Chips Handler ──
    exampleChips.forEach(chip => {
        chip.addEventListener('click', () => {
            topicInput.value = chip.getAttribute('data-topic');
            topicInput.focus();
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

    // ── Main Pipeline Execution ──
    async function runPipeline() {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert('Please enter a research topic first.');
            return;
        }

        // 1. Reset UI States
        setRunningState(true);
        resetUI();

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
                if (steps[key].status.textContent.includes('RUNNING')) {
                    updateStepState(key, 'failed', 'FAILED');
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
            runBtn.innerHTML = `<span>⏳ Running Pipeline...</span>`;
        } else {
            runBtn.innerHTML = `<span>⚡ Run Research Pipeline</span>`;
        }
    }

    // ── Helper: Reset UI ──
    function resetUI() {
        resultsSection.classList.add('visible');
        
        // Reset steps
        Object.keys(steps).forEach(key => {
            updateStepState(key, 'waiting', 'WAITING');
        });

        // Hide reports
        reportContainer.style.display = 'none';
        feedbackPanel.style.display = 'none';
        
        // Reset raw content
        rawSearchContent.textContent = 'Awaiting step...';
        rawReaderContent.textContent = 'Awaiting step...';
        reportContent.innerHTML = '';
        feedbackContent.innerHTML = '';
        criticScore.textContent = 'SCORE: --';
    }

    // ── Helper: Update Step Card Visuals ──
    function updateStepState(stepKey, state, labelText) {
        const step = steps[stepKey];
        if (!step) return;

        // Reset classes
        step.card.classList.remove('active', 'done');
        step.status.className = 'step-status';

        if (state === 'running') {
            step.card.classList.add('active');
            step.status.classList.add('status-running');
            step.status.innerHTML = `<span class="pulsing-dot"></span> ${labelText}`;
        } else if (state === 'done') {
            step.card.classList.add('done');
            step.status.classList.add('status-done');
            step.textContent = '';
            step.status.innerHTML = `✓ ${labelText}`;
        } else if (state === 'failed') {
            step.status.classList.add('status-waiting');
            step.status.style.color = '#ff5a1a';
            step.status.textContent = labelText;
        } else {
            step.status.classList.add('status-waiting');
            step.status.textContent = labelText;
        }
    }

    // ── Process Stream Events ──
    function handleStreamEvent(eventObj) {
        const { event, data } = eventObj;
        
        switch (event) {
            // Search Step
            case 'search_start':
                updateStepState('search', 'running', 'RUNNING');
                rawSearchContent.textContent = 'Searching the web for recent and reliable information...';
                break;
            case 'search_done':
                updateStepState('search', 'done', 'DONE');
                rawSearchContent.textContent = data;
                break;
            case 'search_failed':
                updateStepState('search', 'failed', 'FAILED');
                rawSearchContent.textContent = data;
                break;

            // Reader Step
            case 'reader_start':
                updateStepState('reader', 'running', 'RUNNING');
                rawReaderContent.textContent = 'Scraping and cleaning HTML content from the top search results URL...';
                break;
            case 'reader_done':
                updateStepState('reader', 'done', 'DONE');
                rawReaderContent.textContent = data;
                break;
            case 'reader_failed':
                updateStepState('reader', 'failed', 'FAILED');
                rawReaderContent.textContent = data;
                break;

            // Writer Step
            case 'writer_start':
                updateStepState('writer', 'running', 'RUNNING');
                break;
            case 'writer_done':
                updateStepState('writer', 'done', 'DONE');
                
                // Show report container & render markdown
                reportContainer.style.display = 'block';
                reportContent.innerHTML = marked.parse(data);
                
                // Configure Download Button
                const blob = new Blob([data], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                downloadBtn.href = url;
                downloadBtn.download = `research_report_${Date.now()}.md`;
                break;
            case 'writer_failed':
                updateStepState('writer', 'failed', 'FAILED');
                reportContainer.style.display = 'block';
                reportContent.textContent = data;
                break;

            // Critic Step
            case 'critic_start':
                updateStepState('critic', 'running', 'RUNNING');
                break;
            case 'critic_done':
                updateStepState('critic', 'done', 'DONE');
                feedbackPanel.style.display = 'block';
                
                // Extract score if possible (e.g. Score: 8/10)
                const scoreMatch = data.match(/Score:\s*([0-9.]+\/10)/i);
                if (scoreMatch) {
                    criticScore.textContent = `SCORE: ${scoreMatch[1]}`;
                } else {
                    criticScore.textContent = 'EVALUATED';
                }
                
                feedbackContent.innerHTML = marked.parse(data);
                break;
            case 'critic_failed':
                updateStepState('critic', 'failed', 'FAILED');
                feedbackPanel.style.display = 'block';
                feedbackContent.textContent = data;
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
