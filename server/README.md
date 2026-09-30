# Local Reasoning Server

FastAPI reasoning service for the Agentic Browser system. Provides LLM-driven decision planning, PII-aware prompt construction, and strict policy guardrails.

## Architecture

- [`app.py`](file:///c:/Users/sriva/SIH-2026/server/app.py): FastAPI app exposing `GET /` and `POST /reason`.
- [`planner.py`](file:///c:/Users/sriva/SIH-2026/server/planner.py): Formats sanitized page state into prompt instructions for the LLM, validates output schema, and provides safety fallback to `ask_user`.
- [`policy.py`](file:///c:/Users/sriva/SIH-2026/server/policy.py): Validates actions before dispatch (ensures `target_id` exists in DOM and confidence >= 0.5).
- [`llm.py`](file:///c:/Users/sriva/SIH-2026/server/llm.py): Provider-agnostic LLM interface supporting Google Gemini (`gemini-2.5-flash`) and OpenAI (`gpt-4o-mini`) with zero-temperature JSON responses.
- [`schemas.py`](file:///c:/Users/sriva/SIH-2026/server/schemas.py): Pydantic models for `Element`, `PageInfo`, `ReasonRequest`, and `Action`.
- [`test_request.py`](file:///c:/Users/sriva/SIH-2026/server/test_request.py): Sample client script to test the `/reason` endpoint.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
# or with uv:
uv pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env` and provide your API key:
```bash
cp .env.example .env
```

Set either:
- `LLM_PROVIDER=gemini` with `GEMINI_API_KEY`
- `LLM_PROVIDER=openai` with `OPENAI_API_KEY`

### 3. Run the Server
```bash
uvicorn app:app --reload --port 8000
```

### 4. Test the Endpoint
In a separate terminal:
```bash
python test_request.py
```
