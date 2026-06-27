import os
os.environ["HTTPX_NO_HTTP2"] = "1"

from fastapi import FastAPI  # type: ignore[missing-import]
from fastapi.responses import FileResponse, StreamingResponse   # type: ignore[missing-import]
from fastapi.staticfiles import StaticFiles  # type: ignore[missing-import]
from pydantic import BaseModel  # type: ignore[missing-import]
import json
from dotenv import load_dotenv  # type: ignore[missing-import]

# Load environment variables
load_dotenv()

app = FastAPI(
    title="ResearchMind API",
    description="Backend API supporting the multi-agent AI research pipeline.",
    version="1.0.0"
)

class ResearchRequest(BaseModel):
    topic: str

# Serve the Single Page Application index.html at the root route
@app.get("/")
def read_index() -> FileResponse:
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "index.html not found in static folder."}

# Endpoint to stream the research pipeline steps as NDJSON (Newline Delimited JSON)
@app.post("/research/stream")
def research_stream(request: ResearchRequest) -> StreamingResponse:
    from pipeline import run_research_pipeline_stream

    def event_generator() -> None:
        # Iterate over pipeline events and stream them as newline-delimited JSON strings
        for event in run_research_pipeline_stream(request.topic):
            yield json.dumps(event) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

# Mount the static directory to serve other assets (CSS, JS, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn  # type: ignore[missing-import]
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)