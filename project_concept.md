# ResearchMind 🔬 · Project Concept & Design Philosophy

## 💡 The Core Problem

When users ask traditional Large Language Models (LLMs) to perform detailed research on a topic, they encounter three core limitations:
1. **Knowledge Cutoffs**: Monolithic LLMs cannot access real-world facts occurring after their training cutoff date.
2. **Hallucinations**: Without strict reference to source URLs and parsed text, models easily fabricate details, dates, and statistics.
3. **Lack of Editing (Single-Shot Bias)**: LLMs attempting to search, read, write, and verify in a single prompt suffer from cognitive dilution, resulting in shallow, unformatted summaries instead of rigorous reports.

---

## 🚀 The Solution: Cooperative Multi-Agent Orchestration

**ResearchMind** solves these issues by dividing the cognitive workload across a cooperative team of four distinct, specialized agents and chains. Rather than asking one model to do everything, we compile a multi-phase assembly line where each agent performs one job exceptionally well.

```
[User Input] 
     │
     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Search Agent │ ───> │ Reader Agent │ ───> │ Writer Chain │ ───> │ Critic Chain │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
    (Finds top          (Scrapes top           (Drafts the          (Scores & reviews
     resources)          resource)              report)              factuality)
```

---

## 👥 Agent Personas & Responsibilities

### 1. The Investigator (Search Agent)
*   **Persona**: A meticulous internet investigator.
*   **System Role**: `build_search_agent()`
*   **Responsibilities**: Uses search queries to find the most recent, relevant web resources via Tavily. Rather than outputting conversational filler, it acts as a filter, feeding raw titles, snippets, and URLs into the workspace state.

### 2. The Analyst (Reader Agent)
*   **Persona**: A speed-reader and data extractor.
*   **System Role**: `build_reader_agent()`
*   **Responsibilities**: Analyzes the search snippets to select the highest-quality source. It then scrapes the webpage directly, strips out code headers/footers/menus, and summarizes the deepest content to prevent context window saturation.

### 3. The Synthesizer (Writer Chain)
*   **Persona**: A professional research writer.
*   **System Role**: `writer_chain`
*   **Responsibilities**: Integrates the search snippets and detailed scraped content into a formal markdown document. It adheres to strict formatting requirements: introductory outline, key findings (minimum of three), a professional conclusion, and exact source citations.

### 4. The Editor (Critic Chain)
*   **Persona**: A rigorous, objective proofreader.
*   **System Role**: `critic_chain`
*   **Responsibilities**: Critiques the writer's report. It assigns an objective score from 1-10, documents core strengths, identifies areas to improve, and gives a final verdict.

---

## ⚡ Technical Innovation: State Graphs

ResearchMind uses LangChain's state graph architecture. The agents are compiled as **StateGraphs**, allowing them to check status inputs, invoke external APIs through custom tool definitions, update the conversation history context, and exit loop execution cleanly.

---

## 🗺️ Future Roadmap & Enhancements

To take this project to a production-grade enterprise research system, the following features are planned:

1. **Multi-Turn Critique Loop**: Instead of stopping after the first critique, the Critic's score and feedback will feed back into the Writer. The Writer will revise the draft, and this loop will continue until the Critic scores the report `8/10` or higher.
2. **Parallel Page Scraping**: Using `asyncio` to scrape multiple URLs from the search list simultaneously, creating a broader, more comprehensive research pool.
3. **Local LLM Execution**: Integrating LangChain's Ollama bindings to allow ResearchMind to run entirely locally using open-source models like `Llama 3` or `Mistral-7B`.
4. **Multi-Format Export**: Extending the Streamlit UI to download research files not only in Markdown (`.md`) but also as PDF or Word (`.docx`) files.
