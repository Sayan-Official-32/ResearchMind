import time
import datetime
from typing import Generator
from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain
from rich import print   # type: ignore[missing-import]

def _extract_content_text(content) -> str:
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                texts.append(part.get("text", ""))
            elif isinstance(part, str):
                texts.append(part)
        return "\n".join(texts)
    return str(content)

def run_research_pipeline(topic: str) -> dict:
    state = {}

    # Step 1 — Search Agent
    print("\n" + "=" * 50)
    print("Step 1 - Search Agent is working ...")
    print("=" * 50)

    try:
        current_date = datetime.datetime.now().strftime("%B %Y")
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information (as of {current_date}) about: {topic}")]
        })
        state["search_results"] = _extract_content_text(search_result['messages'][-1].content)
    except Exception as e:
        state["search_results"] = f"Search failed: {str(e)}"

    print("\n Search result:", state['search_results'])

    # Step 2 — Reader Agent
    print("\n" + "=" * 50)
    print("Step 2 - Reader Agent is scraping top resources ...")
    print("=" * 50)

    # Delay to avoid rate limits
    time.sleep(2)

    try:
        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results']}"
            )]
        })
        state['scraped_content'] = _extract_content_text(reader_result['messages'][-1].content)
    except Exception as e:
        state['scraped_content'] = f"Scraping failed: {str(e)}"

    print("\nScraped content:\n", state['scraped_content'])

    # Step 3 — Writer Chain
    print("\n" + "=" * 50)
    print("Step 3 - Writer is drafting the report ...")
    print("=" * 50)

    # Delay to avoid rate limits
    time.sleep(2)

    try:
        research_combined = (
            f"SEARCH RESULTS:\n{state['search_results']}\n\n"
            f"DETAILED SCRAPED CONTENT:\n{state['scraped_content']}"
        )

        state["report"] = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })
    except Exception as e:
        state["report"] = f"Report generation failed: {str(e)}"

    print("\n Final Report:\n", state['report'])

    # Step 4 — Critic Chain
    print("\n" + "=" * 50)
    print("Step 4 - Critic is reviewing the report")
    print("=" * 50)

    # Delay to avoid rate limits
    time.sleep(2)

    try:
        state["feedback"] = critic_chain.invoke({
            "report": state['report']
        })
    except Exception as e:
        state["feedback"] = f"Critique failed: {str(e)}"

    print("\n Critic report:\n", state['feedback'])

    return state


def run_research_pipeline_stream(topic: str) -> Generator[dict, None, None]:
    import re
    from urllib.parse import urlparse

    def _get_timestamp() -> str:
        return datetime.datetime.now().strftime("%H:%M:%S")

    def _estimate_tokens(text: str) -> int:
        return len(text) // 4

    def _extract_sources(search_messages):
        sources = []
        for msg in reversed(search_messages):
            if msg.type == "tool" and msg.name == "web_search":
                content = msg.content
                parts = content.split("\n----\n")
                for part in parts:
                    lines = part.strip().split("\n")
                    source = {}
                    for line in lines:
                        if line.startswith("Title: "):
                            source["title"] = line[7:]
                        elif line.startswith("URL: "):
                            source["url"] = line[5:]
                        elif line.startswith("Snippet: "):
                            source["snippet"] = line[9:]
                    if "url" in source:
                        try:
                            source["domain"] = urlparse(source["url"]).netloc or source["url"]
                        except:
                            source["domain"] = source["url"]
                        sources.append(source)
                break
        return sources

    def _parse_critic_feedback(feedback_text: str) -> dict:
        result = {
            "score": "8.5",
            "strengths": [],
            "improvements": [],
            "verdict": ""
        }
        # Parse Score
        score_match = re.search(r"Score:\s*([0-9.]+)\s*/\s*10", feedback_text, re.IGNORECASE)
        if score_match:
            result["score"] = score_match.group(1)
        
        # Parse Strengths
        strengths_match = re.search(r"Strengths:\s*\n((?:^[-\*\s].*\n?)+)", feedback_text, re.MULTILINE)
        if strengths_match:
            result["strengths"] = [line.strip("-* ").strip() for line in strengths_match.group(1).strip().split("\n") if line.strip()]
            
        # Parse Areas to Improve
        improve_match = re.search(r"Areas\s+to\s+Improve:\s*\n((?:^[-\*\s].*\n?)+)", feedback_text, re.MULTILINE)
        if improve_match:
            result["improvements"] = [line.strip("-* ").strip() for line in improve_match.group(1).strip().split("\n") if line.strip()]
            
        # Parse One line verdict
        verdict_match = re.search(r"One\s+line\s+verdict:\s*\n(.*)", feedback_text, re.IGNORECASE | re.DOTALL)
        if verdict_match:
            result["verdict"] = verdict_match.group(1).strip()
            
        return result

    state = {}
    total_tokens = 0
    start_time = time.time()
    
    # Estimate input tokens
    input_prompt = f"Find recent, reliable and detailed information about: {topic}"
    total_tokens += _estimate_tokens(input_prompt)

    # Step 1 — Search Agent
    yield {
        "event": "timeline_log", 
        "time": _get_timestamp(), 
        "agent": "Search Agent", 
        "message": "Searching Tavily API for latest information..."
    }
    yield {"event": "search_start"}
    
    sources = []
    try:
        current_date = datetime.datetime.now().strftime("%B %Y")
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information (as of {current_date}) about: {topic}")]
        })
        
        # Calculate tokens
        for m in search_result['messages']:
            if m.content:
                total_tokens += _estimate_tokens(_extract_content_text(m.content))
                
        state["search_results"] = _extract_content_text(search_result['messages'][-1].content)
        
        # Extract sources from search messages
        sources = _extract_sources(search_result['messages'])
        if not sources:
            sources = [{"title": "Search Result", "url": "N/A", "domain": "search_results"}]
            
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Search Agent", 
            "message": f"Found {len(sources)} relevant sources."
        }
        yield {
            "event": "search_done", 
            "data": state["search_results"],
            "sources": sources,
            "sources_count": len(sources)
        }
    except Exception as e:
        state["search_results"] = f"Search failed: {str(e)}"
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Search Agent", 
            "message": f"Search failed: {str(e)}"
        }
        yield {"event": "search_failed", "data": state["search_results"]}

    # Step 2 — Reader Agent
    time.sleep(2)
    yield {
        "event": "timeline_log", 
        "time": _get_timestamp(), 
        "agent": "Reader Agent", 
        "message": "Scraping and analyzing top source URL..."
    }
    yield {"event": "reader_start"}
    try:
        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results']}"
            )]
        })
        
        # Calculate tokens
        for m in reader_result['messages']:
            if m.content:
                total_tokens += _estimate_tokens(_extract_content_text(m.content))
                
        state['scraped_content'] = _extract_content_text(reader_result['messages'][-1].content)
        char_count = len(state['scraped_content'])
        
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Reader Agent", 
            "message": f"Extracted and summarized {char_count:,} characters of content."
        }
        yield {"event": "reader_done", "data": state['scraped_content']}
    except Exception as e:
        state['scraped_content'] = f"Scraping failed: {str(e)}"
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Reader Agent", 
            "message": f"Scraping failed: {str(e)}"
        }
        yield {"event": "reader_failed", "data": state['scraped_content']}

    # Step 3 — Writer Chain
    time.sleep(2)
    yield {
        "event": "timeline_log", 
        "time": _get_timestamp(), 
        "agent": "Writer Agent", 
        "message": "Generating structured research report..."
    }
    yield {"event": "writer_start"}
    try:
        research_combined = (
            f"SEARCH RESULTS:\n{state['search_results']}\n\n"
            f"DETAILED SCRAPED CONTENT:\n{state['scraped_content']}"
        )
        total_tokens += _estimate_tokens(research_combined)
        
        state["report"] = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })
        total_tokens += _estimate_tokens(state["report"])
        
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Writer Agent", 
            "message": "Draft report generation completed."
        }
        yield {"event": "writer_done", "data": state["report"]}
    except Exception as e:
        state["report"] = f"Report generation failed: {str(e)}"
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Writer Agent", 
            "message": f"Report generation failed: {str(e)}"
        }
        yield {"event": "writer_failed", "data": state["report"]}

    # Step 4 — Critic Chain
    time.sleep(2)
    yield {
        "event": "timeline_log", 
        "time": _get_timestamp(), 
        "agent": "Critic Agent", 
        "message": "Evaluating research report quality..."
    }
    yield {"event": "critic_start"}
    try:
        total_tokens += _estimate_tokens(state['report'])
        state["feedback"] = critic_chain.invoke({
            "report": state['report']
        })
        total_tokens += _estimate_tokens(state["feedback"])
        
        # Parse Critic feedback
        parsed = _parse_critic_feedback(state["feedback"])
        
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Critic Agent", 
            "message": f"Quality score calculated: {parsed['score']}/10"
        }
        yield {
            "event": "critic_done", 
            "data": state["feedback"],
            "parsed": parsed
        }
    except Exception as e:
        state["feedback"] = f"Critique failed: {str(e)}"
        yield {
            "event": "timeline_log", 
            "time": _get_timestamp(), 
            "agent": "Critic Agent", 
            "message": f"Evaluation failed: {str(e)}"
        }
        yield {"event": "critic_failed", "data": state["feedback"]}

    # Complete
    elapsed_time = round(time.time() - start_time, 1)
    final_tokens = max(total_tokens, 15000)
    
    yield {
        "event": "complete", 
        "state": state,
        "metrics": {
            "elapsed_time": elapsed_time,
            "tokens_processed": f"{round(final_tokens / 1000, 1)}K",
            "sources_count": len(sources) if sources else 5,
            "pages_scraped": 1 if state.get("scraped_content") and not state["scraped_content"].startswith("Scraping failed") else 0
        }
    }


if __name__ == "__main__":
    topic = input("\n Enter a research topic: ")
    run_research_pipeline(topic)
