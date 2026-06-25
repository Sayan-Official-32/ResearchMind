import time
from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain
from rich import print 

def run_research_pipeline(topic: str) -> dict:
    state = {}

    # Step 1 — Search Agent
    print("\n" + "=" * 50)
    print("Step 1 - Search Agent is working ...")
    print("=" * 50)

    try:
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        state["search_results"] = search_result['messages'][-1].content
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
                f"Search Results:\n{state['search_results'][:800]}"
            )]
        })
        state['scraped_content'] = reader_result['messages'][-1].content
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

    # Step 2 — Reader Agent
    time.sleep(2)
    yield {"event": "reader_start"}
    try:
        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results'][:800]}"
            )]
        })
        state['scraped_content'] = reader_result['messages'][-1].content
        yield {"event": "reader_done", "data": state['scraped_content']}
    except Exception as e:
        state['scraped_content'] = f"Scraping failed: {str(e)}"
        yield {"event": "reader_failed", "data": state['scraped_content']}

    # Step 3 — Writer Chain
    time.sleep(2)
    yield {"event": "writer_start"}
    try:
        research_combined = (
            f"SEARCH RESULTS:\n{state['search_results']}\n\n"
            f"DETAILED SCRAPED CONTENT:\n{state['scraped_content']}"
        )
        state["report"] = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })
        yield {"event": "writer_done", "data": state["report"]}
    except Exception as e:
        state["report"] = f"Report generation failed: {str(e)}"
        yield {"event": "writer_failed", "data": state["report"]}

    # Step 4 — Critic Chain
    time.sleep(2)
    yield {"event": "critic_start"}
    try:
        state["feedback"] = critic_chain.invoke({
            "report": state['report']
        })
        yield {"event": "critic_done", "data": state["feedback"]}
    except Exception as e:
        state["feedback"] = f"Critique failed: {str(e)}"
        yield {"event": "critic_failed", "data": state["feedback"]}

    yield {"event": "complete", "state": state}


if __name__ == "__main__":
    topic = input("\n Enter a research topic: ")
    run_research_pipeline(topic)
