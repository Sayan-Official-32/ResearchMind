# ResearchMind 🔬 · In-Depth Developer Documentation & Architecture Guide

This document provides an exhaustive, production-grade guide to the **ResearchMind** codebase. It covers the core multi-agent orchestration architecture, step-by-step code walkthroughs, design decisions, data structures, and the integration between backend Python pipelines and frontend visual interfaces.

---

## 🎨 Graphical Abstract

Below is the visual concept and execution flow of the ResearchMind Multi-Agent system:

![ResearchMind Graphical Abstract](C:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/static/graphical_abstract.png)

### 🔄 Multi-Agent Orchestration & Data Flow Diagram

```mermaid
graph TD
    %% Define styles for distinct modules
    classDef client fill:#1e1e2f,stroke:#7b2cbf,stroke-width:2px,color:#fff;
    classDef api fill:#1c2d37,stroke:#00b4d8,stroke-width:2px,color:#fff;
    classDef pipeline fill:#102e1c,stroke:#2a9d8f,stroke-width:2px,color:#fff;
    classDef agent fill:#3d2010,stroke:#e76f51,stroke-width:2px,color:#fff;
    classDef tool fill:#2d1a2d,stroke:#ff5a1a,stroke-width:2px,color:#fff;

    %% Elements
    User([User Prompt / Topic])
    SPA["SPA Web Interface (index.html / app.js)"]:::client
    FastAPI["FastAPI App (app.py)"]:::api
    Runner["run_research_pipeline_stream (pipeline.py)"]:::pipeline
    
    subgraph OrchestratedAgents ["agents.py (Agent Graphs)"]
        SearchAgent["Search Agent (ReAct)"]:::agent
        ReaderAgent["Reader Agent (ReAct)"]:::agent
        WriterChain["Writer Chain (LCEL)"]:::agent
        CriticChain["Critic Chain (LCEL)"]:::agent
    end

    subgraph ExternalTools ["tools.py (Custom Tools)"]
        WebSearchTool["web_search (Tavily API)"]:::tool
        ScrapeUrlTool["scrape_url (BeautifulSoup4)"]:::tool
    end

    %% Flow
    User -->|Topic Input| SPA
    SPA -->|1. POST /research/stream| FastAPI
    FastAPI -->|2. Invokes stream generator| Runner
    
    %% Sequential pipeline steps
    Runner -->|3. Event: search_start| SearchAgent
    SearchAgent -->|Invokes| WebSearchTool
    WebSearchTool -->|Returns snippets & URLs| SearchAgent
    SearchAgent -->|Event: search_done| Runner
    
    Runner -->|4. Event: reader_start| ReaderAgent
    ReaderAgent -->|Invokes| ScrapeUrlTool
    ScrapeUrlTool -->|Returns parsed content| ReaderAgent
    ReaderAgent -->|Event: reader_done| Runner
    
    Runner -->|5. Event: writer_start| WriterChain
    WriterChain -->|Synthesizes Search + Scrape| WriterChain
    WriterChain -->|Event: writer_done (Markdown)| Runner
    
    Runner -->|6. Event: critic_start| CriticChain
    CriticChain -->|Evaluates report (Score & comments)| CriticChain
    CriticChain -->|Event: critic_done| Runner

    Runner -->|7. NDJSON Stream chunk-by-chunk| FastAPI
    FastAPI -->|8. Real-time updates| SPA
```

---

## 🏗️ System Architecture & Design Philosophy

When asking generic LLMs to construct research reports, they suffer from knowledge cutoffs, single-turn hallucination, and lack of formatting structure. **ResearchMind** solves this by decomposing the process into a **cooperative multi-agent assembly line**.

The system utilizes LangChain and LangGraph to define autonomous agents and chains:
*   **Search Agent**: Queries the web to discover active resources.
*   **Reader Agent**: Accesses specific websites, strips non-text bloat (CSS, JS, footers), and reads page bodies.
*   **Writer Chain**: Compiles the gathered data into a structured report using LangChain Expression Language (LCEL).
*   **Critic Chain**: Proofreads the output, evaluates the quality, and provides scores and actionable feedback.

---

## 📂 File-by-File Complete Guide & Walkthrough

Here is the exact description of how each file operates, how libraries are used, and how variables flow between modules:

### 1. [tools.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/tools.py)
*   **Role**: Exposes functions decorated with `@tool` to allow agents to interact with search engines and retrieve webpage documents.
*   **Core Logic**:
    *   **Tavily API Integration**: `TavilyClient` (line 10) queries Tavily's dedicated LLM-friendly index. It returns JSON objects containing page titles, URLs, and relevant content snippets.
    *   **HTML Scraping**: Uses `requests` to fetch raw HTML pages with a user-agent header to prevent bot-detection blocks. `BeautifulSoup4` extracts core text, parses the structure, decomposes junk tags (`<script>`, `<style>`, `<nav>`, `<footer >`), and truncates the resulting plain text to `3000` characters to prevent LLM context overflows.

```python
# tools.py snippet
@tool
def web_search(query : str) -> str:
    """Search the web for recent and reliable information on a topic . Returns Titles , URLs and snippets."""
    results = tavily.search(query=query, max_results=5)
    out = []
    for r in results['results']:
        out.append(f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content'][:300]}\n")
    return "\n----\n".join(out)
```

---

### 2. [agents.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/agents.py)
*   **Role**: Initializes the LLM engine (`ChatMistralAI` with `temperature=0` for deterministic outputs), imports tools, and builds the agents and chains.
*   **Core Code Changes**: Added explicit return annotations (`-> CompiledStateGraph`) to satisfy type checking environments.
*   **Function Details**:
    *   **[build_search_agent](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/agents.py#L15)**: Binds the `web_search` tool to the LLM agent graph.
    *   **[build_reader_agent](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/agents.py#L23)**: Binds the `scrape_url` tool to the LLM agent graph.
    *   **`writer_chain`**: A LangChain Expression Language (LCEL) sequence. Combines System/Human instructions, feeds it to Mistral, and parses the output as plain text.
    *   **`critic_chain`**: Evaluates the written report, scores it out of 10, and structures strengths and areas of improvement.

---

### 3. [pipeline.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/pipeline.py)
*   **Role**: Orchestrates the agents and chains sequentially. It exposes two key runners:
    *   `run_research_pipeline`: Synchronous version used in command-line environments.
    *   `run_research_pipeline_stream`: An asynchronous-friendly Python generator (`yield`) that posts progress updates (`search_start`, `search_done`, etc.) step-by-step.
*   **State Machine**:
    *   The state dictionary is built progressively:
        $$\text{State} = \{ \text{"search\_results"}, \text{"scraped\_content"}, \text{"report"}, \text{"feedback"} \}$$
    *   Delays (`time.sleep(2)`) are strategically injected between steps to prevent hitting Mistral and Tavily rate limits.

---

### 4. [app.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/app.py)
*   **Role**: Serves as the web backend using FastAPI.
*   **Connections**:
    *   Binds the static folder `static` containing the SPA frontend (HTML/CSS/JS) to the `/static` route.
    *   Binds the root endpoint `/` to return `static/index.html`.
    *   Exposes a `/research/stream` streaming route. It imports the python generator from `pipeline.py`, wraps it inside an event generator, serializes output dictionaries into NDJSON (Newline Delimited JSON) strings separated by `\n`, and yields them inside FastAPI's `StreamingResponse`.

```python
# app.py snippet
@app.post("/research/stream")
def research_stream(request: ResearchRequest) -> StreamingResponse:
    from pipeline import run_research_pipeline_stream
    def event_generator() -> None:
        for event in run_research_pipeline_stream(request.topic):
            yield json.dumps(event) + "\n"
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")
```

---

### 5. [static/js/app.js](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/static/js/app.js)
*   **Role**: Executes UI updates, handles inputs/event-chips, and parses the NDJSON HTTP payload stream.
*   **Connection and Stream Handling**:
    *   Utilizes the browser `fetch()` API and retrieves a reader (`response.body.getReader()`).
    *   Loops to decode network bytes into string fragments via `TextDecoder` and accumulates them in a buffer.
    *   Splits the buffer by the newline character `\n` to process each line. It pops off the last element (`lines.pop()`) which might be partially downloaded, parsing only complete JSON statements to prevent client app crashes.
    *   Uses `marked.js` to render Markdown syntax into HTML dynamically.

---

### 6. [static/css/style.css](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/static/css/style.css)
*   **Role**: Provides a modern, dark-themed, glassmorphic UI design matching premium design aesthetics.
*   **Key Design Elements**:
    *   **Repeating Dot Grid Background**: Built using a radial-gradient background pattern (`background-image: radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)`).
    *   **Spotlight Glow**: Tracks the cursor position by listening to mouse movements in JavaScript and writing values to CSS custom properties (`--mouse-x` and `--mouse-y`), which update a radial glow background mask.
    *   **Pulsing State Indicators**: Animates waiting/running cards dynamically to enhance real-time responsiveness.

---

## 🔌 API Contract Reference

### Post Research Stream
*   **URL**: `/research/stream`
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **Request Body**:
    ```json
    {
      "topic": "String representing the research topic"
    }
    ```
*   **Response**: `application/x-ndjson` (Newline-Delimited JSON)
*   **Event Payloads**:
    *   `{"event": "search_start"}`
    *   `{"event": "search_done", "data": "Raw snippets and links..."}`
    *   `{"event": "reader_start"}`
    *   `{"event": "reader_done", "data": "Scraped webpage contents..."}`
    *   `{"event": "writer_start"}`
    *   `{"event": "writer_done", "data": "# Markdown Report Title..."}`
    *   `{"event": "critic_start"}`
    *   `{"event": "critic_done", "data": "Score: 8/10\nStrengths..."}`
    *   `{"event": "complete", "state": { ... }}`

---

## ⚙️ Execution Flow Chart (How variables pass)

```
[UI Input Box] (topic) 
      │ 
      ├─► (topic) ──► FastAPI POST [/research/stream]
      │                                │
      │                                ▼
      ├─► (topic) ──► pipeline.py [run_research_pipeline_stream]
      │                                │
      │   ┌────────────────────────────┴──────────────────────────┐
      │   ▼                                                       ▼
  Search Agent (web_search)                               Reader Agent (scrape_url)
      │                                                       │
      ▼                                                       ▼
  [search_results] ──────────────────────────────────────► [scraped_content]
      │                                                       │
      └────────────────────────┬──────────────────────────────┘
                               │ (Combined Research Text)
                               ▼
                         Writer Chain ──► [report] (Markdown)
                               │
                               ▼
                         Critic Chain ──► [feedback] (Score & Comments)
                               │
                               ▼
                         [complete] (Event sent back to SPA)
```

---

## 🚀 Setup & Launching the Project

1. **Requirements**: Make sure you have Python 3.10+ installed.
2. **Environment Configuration**: Set up your keys in a root `.env` file:
   ```env
   TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxx"
   MISTRAL_API_KEY="xxxxxxxxxxxxxxxxxxx"
   ```
3. **Launch Server**:
   ```bash
   python app.py
   ```
4. **Access UI**: Open `http://localhost:8000/` in your browser.
