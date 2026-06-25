# ResearchMind 🔬 · Developer Documentation

This document provides a comprehensive overview of the **ResearchMind** architecture, detailed file-by-file explanations, library usages, and logic design choices, along with inline code explanations.

---

## 🏗️ System Architecture Overview

ResearchMind uses a sequential multi-agent orchestration architecture. Instead of running a single long LLM prompt, the system breaks the research process down into discrete steps handled by specialized agents and structured chains:

1. **Information Retrieval** (Search Agent)
2. **Deep Content Extraction** (Reader Agent)
3. **Synthesis & Draft Compilation** (Writer Chain)
4. **Factual & Quality Inspection** (Critic Chain)

This separation of concerns increases accuracy, reduces hallucinations, and allows for real-time tracking of intermediate steps.

---

## 📂 File-by-File Breakdown & Code Explanations

### 1. [tools.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/tools.py)
* **Purpose**: Defines the custom actions (tools) that the LangChain agents can execute to interact with the external world.
* **Libraries Used**:
  * `langchain.tools.tool`: A decorator that converts standard Python functions into structured LangChain `Tool` objects. It automatically parses the function's docstring and type hints to generate descriptions the LLM uses to understand when and how to call the tool.
  * `tavily.TavilyClient`: The official client library for the Tavily Search API. Tavily is optimized specifically for LLM search tasks, returning raw search data pre-ranked and filtered for factual relevance.
  * `requests`: A clean HTTP library used to fetch raw HTML pages from selected URLs.
  * `bs4.BeautifulSoup`: A parser library used to scrape and clean HTML pages by removing useless nodes (scripts, styles, navigation bars, and footers), leaving only readable content.

#### 💻 Code Explanation: `web_search`
```python
tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

@tool
def web_search(query : str) -> str:
    """Search the web for recent and reliable information on a topic . Returns Titles , URLs and snippets."""
    # Queries Tavily API for the top 5 most relevant pages
    results = tavily.search(query=query, max_results=5)

    out = []
    # Loop through search results to format titles, URLs, and snippets
    for r in results['results']:
        out.append(
            f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content'][:300]}\n"
        )
    
    return "\n----\n".join(out)
```
* **Why it is structured this way**:
  * The `@tool` decorator allows the agent to recognize `web_search` as an available action.
  * The function docstring acts as the tool description, instructing the agent on *when* it should be triggered.
  * Slicing `r['content'][:300]` extracts just enough detail to present to the LLM without consuming too many tokens.

#### 💻 Code Explanation: `scrape_url`
```python
@tool
def scrape_url(url: str) -> str:
    """Scrape and return clean text content from a given URL for deeper reading."""
    try:
        # Fetch the HTML document with a mock User-Agent to avoid scraping blocks
        resp = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Deconstruct non-article elements to remove boilerplate clutter
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
            
        # Extract clean text and return the first 3000 characters
        return soup.get_text(separator=" ", strip=True)[:3000]
    except Exception as e:
        return f"Could not scrape URL: {str(e)}"
```
* **Why it is structured this way**:
  * Websites often block empty requests. Passing a `"User-Agent"` header makes the scraper look like a standard web browser.
  * `tag.decompose()` drops visual or executable tags like scripts and styles.
  * Slicing to `[:3000]` ensures the reader agent receives high-density text while keeping the size small enough for context limit guidelines.

---

### 2. [agents.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/agents.py)
* **Purpose**: Configures the LLM models, custom prompts, agents, and sequential processing chains.
* **Libraries Used**:
  * `langchain.agents.create_agent`: Instantiates autonomous agents that can choose to invoke tools iteratively.
  * `langchain_mistralai.ChatMistralAI`: Interface to invoke Mistral AI language models.
  * `langchain_core.prompts.ChatPromptTemplate`: Structures the instructions sent to the LLM. It separates System-level instructions (rules, behaviors) from Human-level inputs (data placeholders).
  * `langchain_core.output_parsers.StrOutputParser`: Extracts raw text content from LLM response payloads, preventing the need to write boilerplate extraction code.

#### 💻 Code Explanation: Agent Instantiation
```python
llm = ChatMistralAI(model="mistral-large-latest", temperature=0)

def build_search_agent():
    return create_agent(
        model = llm,
        tools= [web_search]
    )
```
* **Why it is structured this way**:
  * `temperature=0` guarantees consistent output formatting and logical reasoning.
  * `create_agent` creates a ReAct (Reasoning and Acting) loop agent, giving the model capability to construct search queries, run them via `web_search`, and evaluate results.

#### 💻 Code Explanation: LangChain LCEL Chains
```python
writer_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert research writer. Write clear, structured and insightful reports."),
    ("human", """Write a detailed research report on the topic below...""")
])

writer_chain = writer_prompt | llm | StrOutputParser()
```
* **Why it is structured this way**:
  * The `|` operator compiles prompt, LLM, and parser using the LangChain Expression Language (LCEL).
  * It passes variables into `writer_prompt`, pipes the prompt to `llm`, and then formats the output into a clean Python string through `StrOutputParser()`.

---

### 3. [pipeline.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/pipeline.py)
* **Purpose**: Orchestrates all agents/chains sequentially and exposes synchronous (CLI) and generator (Web API) pipeline runners.
* **Key Functions**:
  * `run_research_pipeline(topic: str) -> dict`: A synchronous function that runs all steps end-to-end, prints results in the terminal, and returns a state dictionary. Used as the CLI entry point.

#### 💻 Code Explanation: `run_research_pipeline_stream`
```python
def run_research_pipeline_stream(topic: str):
    state = {}

    # Step 1 — Search Agent
    yield {"event": "search_start"}
    try:
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        state["search_results"] = search_result['messages'][-1].content
        yield {"event": "search_done", "data": state["search_results"]}
    except Exception as e:
        state["search_results"] = f"Search failed: {str(e)}"
        yield {"event": "search_failed", "data": state["search_results"]}
        
    # Subsequent steps follow this pattern...
```
* **Why it is structured this way**:
  * It acts as a python Generator, utilizing the `yield` statement to emit dictionaries at specific stages.
  * A traditional REST endpoint blocks the client until the entire process is completed (which takes 15–20 seconds). Using a generator permits the FastAPI server to push updates step-by-step.

---

### 4. [app.py](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/app.py)
* **Purpose**: Serves static SPA assets and exposes API stream route.
* **Libraries Used**:
  * `fastapi.responses.FileResponse`: Used to serve the SPA `index.html` at the root path (`/`).
  * `fastapi.responses.StreamingResponse`: Serves chunked data over HTTP.
  * `fastapi.staticfiles.StaticFiles`: Mounts directories to serve CSS/JS stylesheets directly.

#### 💻 Code Explanation: Serving the Stream
```python
@app.post("/research/stream")
def research_stream(request: ResearchRequest):
    from pipeline import run_research_pipeline_stream

    def event_generator():
        # Iterate over the python generator
        for event in run_research_pipeline_stream(request.topic):
            # Serialize each event dictionary to a string + a newline character (\n)
            yield json.dumps(event) + "\n"

    # Return a StreamingResponse with media type application/x-ndjson (NDJSON)
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")
```
* **Why it is structured this way**:
  * NDJSON (Newline Delimited JSON) is a standard format for streaming structured records over a single HTTP connection.
  * `StreamingResponse` maps HTTP chunked transfer-encoding to the frontend client, feeding stream reader events progressively as they run.

---

### 5. [static/js/app.js](file:///c:/Users/ASUS/OneDrive/Documents/VSCODE/MultiAgentSystem/static/js/app.js)
* **Purpose**: Manages frontend interactive actions, triggers API requests, and processes event data streams.

#### 💻 Code Explanation: Stream Processing
```javascript
// Send POST request to request the research stream
const response = await fetch('/research/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // Decode current chunk and append to buffer
    buffer += decoder.decode(value, { stream: true });
    
    // Split the buffer by newline character
    const lines = buffer.split('\n');
    
    // Hold onto the last element as it might be incomplete
    buffer = lines.pop(); 

    // Loop through complete JSON lines
    for (const line of lines) {
        if (line.trim()) {
            const payload = JSON.parse(line);
            handleStreamEvent(payload); // Updates UI elements based on event
        }
    }
}
```
* **Why it is structured this way**:
  * Using `fetch` streaming enables processing data as it arrives instead of buffering everything.
  * Streams can split JSON records across network packets. Appending to `buffer` and holding the last element `lines.pop()` ensures we only parse complete JSON strings, preventing parsing crashes.
