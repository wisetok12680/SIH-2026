# Agentic Browser & Local Reasoning Agent

An autonomous, privacy-preserving agent system designed for physical layout parsing, visual analysis, natural language browser automation, and robust local action reasoning.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Features](#features)
- [Local Agent & 5 Core Goals](#local-agent--5-core-goals)
- [Physical Layout & Visual Parsing Pipeline](#physical-layout--visual-parsing-pipeline)
- [Reasoning Server (`server/`)](#reasoning-server-server)
  - [Architecture & Flow](#architecture--flow)
  - [Policy Guardrails](#policy-guardrails)
  - [Multi-Provider LLM Integration](#multi-provider-llm-integration)
- [Hardware and Compute Requirements](#hardware-and-compute-requirements)
  - [1. Architecture and Where Each Part Runs](#1-architecture-and-where-each-part-runs)
  - [2. Requirements by Component](#2-requirements-by-component)
  - [3. Live Benchmark & Empirical Measurements](#3-live-benchmark--empirical-measurements)
  - [4. Research Recommendation: Lightweight Client-Side Vision](#4-research-recommendation-lightweight-client-side-vision)
  - [5. Optional Edge Deployment](#5-optional-edge-deployment)
  - [6. Privacy Rationale](#6-privacy-rationale)
- [Quick Start](#quick-start)
  - [1. Install uv](#1-install-uv)
  - [2. Clone the Repository](#2-clone-the-repository)
  - [3. Set up the Virtual Environment](#3-set-up-the-virtual-environment)
  - [4. Install Dependencies](#4-install-dependencies)
  - [5. Install Playwright Drivers](#5-install-playwright-drivers)
  - [6. Configure the Environment](#6-configure-the-environment)
  - [7. Running the Project](#7-running-the-project)
  - [Running API with Docker](#running-api-with-docker-for-agenticbench)
- [API Reference & Testing](#api-reference--testing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Overview

**Agentic Browser** is an agent-based system designed to automate browser interactions using a natural language interface. Built upon the [PydanticAI Python agent framework](https://github.com/pydantic/pydantic-ai) alongside FastAPI and modern LLMs (Gemini / OpenAI), Agentic Browser allows users to automate complex browser tasks such as:

- **Form filling & multi-step workflow execution**
- **Product searches & price comparisons on e-commerce platforms**
- **Content retrieval & research synthesis**
- **Media interaction & canvas element inspection**
- **Project and task management across web platforms**

The system bridges client-side browser control (Chrome Extension / Playwright automation) with a dedicated **Local Reasoning Server** (`server/`) that plans safe, privacy-preserving actions.

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Browser Interface                    │
│   (Chrome Extension / Playwright / Local Browser)       │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Extracts Layout & Sanitized DOM
                           ▼
┌────────────────────────────────────────────────────────┐
│                Local ML & PII Sanitizer                │
│    - YOLO UI Detector + EasyOCR/PP-OCR Fallback        │
│    - Client-side / Local PII Redaction                 │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Sanitized ReasonRequest
                           ▼
┌────────────────────────────────────────────────────────┐
│            FastAPI Reasoning Server (server/)          │
│                                                        │
│   ┌──────────────┐   Prompt    ┌───────────────────┐   │
│   │  planner.py  │ ──────────► │      llm.py       │   │
│   └──────┬───────┘             │ (Gemini / OpenAI) │   │
│          │ Action JSON         └───────────────────┘   │
│          ▼                                             │
│   ┌──────────────┐                                     │
│   │  policy.py   │  (Policy Guardrails:                │
│   │  Validation  │   target existence, confidence >=0.5)│
│   └──────┬───────┘                                     │
└──────────┼─────────────────────────────────────────────┘
           │ 3. Validated Action (click, type, scroll, wait, finish, ask_user)
           ▼
┌────────────────────────────────────────────────────────┐
│                Browser Action Executor                 │
│      (Executes verified action in active tab)          │
└────────────────────────────────────────────────────────┘
```

---

## Features

### Browser Automation
- **Web Research and Analysis**: Intelligent web research across academic papers, travel sites, and code repositories with natural language queries.
- **Data Extraction**: Extracts and compiles data of various types such as sports stats, historical datasets, financial markets, and currency rates.
- **E-commerce Information**: Scrapes real-time information like price, specifications, and availability across various e-commerce websites (e.g., Amazon, Flipkart).
- **Web Traversal**: Smart cross-domain navigation with context-aware website traversal and multi-page data correlation.

### Atlas & Comet Capabilities
- **Dynamic Navigation & Control**: Dynamically navigate pages, manage and switch open tabs, interact with multi-level menus, and scroll viewports seamlessly.
- **Handles Interruptions**: Dynamically detect and handle popups, modals, captchas, DOM variations, and unexpected UI changes.
- **State-Aware Waiting**: Perform intelligent waiting based on network state, dynamic component rendering, and UI stability rather than static time delays.
- **Learn Patterns**: Learn recurring page navigation and workflow patterns over time for optimized execution.
- **Form Filling & Mail Operations**: Automate complex multi-field form completion and parse email messages.
- **Visual Scraping**: Extract data from standard web pages as well as visual graphics, canvases, and media overlays.
- **Tracker Blocking**: Block telemetry, ad trackers, and third-party script tracking at the browser level to improve speed, performance, and user privacy.

---

## Local Agent & 5 Core Goals

The local agent focuses on converting visual and DOM browser states into lightweight structural maps while preserving privacy and executing tasks reliably:

1. **Identify Physical Layout of the Page**: Determine accurate physical coordinates and visual dimensions of all elements rendered on screen.
2. **Privacy Filtering**: Detect sensitive data (PII) locally and perform redaction prior to data processing.
3. **Convert Visual Screen into a Lightweight Text-Based Structural Map**: Transform complex visual interface layouts into compact, structured representations for machine reasoning.
4. **Action Execution**: Execute actions dynamically on web elements (clicking, scrolling, navigating, dynamic input).
5. **State Monitoring**: Track page state changes, waiting conditions, dynamic content rendering, and recovery logic.

---

## Physical Layout & Visual Parsing Pipeline

1. **DOM Physical Layout Extraction**
   - Iterate through every DOM element on the page.
   - Use native browser APIs to retrieve element bounding properties: `x` coordinates, `y` coordinates, `width`, and `height`.
   - **Element Filtering**: Ignore elements with `width == 0` or `visibility == "hidden"`.

2. **Visual ML Fallback Engine (Canvas, PDF & Images)**
   - For graphical elements (`<canvas>`, embedded PDFs, images) or elements missed by the DOM tree, trigger a visual ML inspection.
   - Capture a local viewport screenshot using `chrome.tabs.captureVisibleTab`.
   - Run local machine learning models on the captured screenshot:
     - **YOLO**: Detect non-standard UI controls, icons, and visual elements missed by DOM parsing.
     - **PP-OCRv5mobile / EasyOCR**: High-speed OCR to parse text embedded in images, canvas elements, and PDF renders.

3. **PII Detection & Local Redaction**
   - Process all parsed text and visual metadata through a local PII filter.
   - Apply local redaction to mask sensitive user information (credentials, personal details, tokens) before transmission to the reasoning engine.

4. **Single JSON Array Physical Map**
   - Combine DOM layout coordinates and Visual ML bounding boxes into a **single JSON array**:

```json
[
  {
    "id": "el_1",
    "tagName": "BUTTON",
    "text": "Submit Form",
    "x": 140,
    "y": 520,
    "width": 120,
    "height": 44,
    "source": "dom"
  },
  {
    "id": "ml_1",
    "tagName": "CANVAS_ELEMENT",
    "text": "Interactive Chart Node",
    "x": 300,
    "y": 180,
    "width": 200,
    "height": 80,
    "source": "yolo_pp_ocr"
  }
]
```

---

## Reasoning Server (`server/`)

The [`server/`](file:///c:/Users/sriva/SIH-2026/server) directory contains the standalone FastAPI reasoning engine powering the agent's decision-making.

### Key Components

- **[`server/app.py`](file:///c:/Users/sriva/SIH-2026/server/app.py)**: The FastAPI service exposing `GET /` (health status) and `POST /reason` (action planner endpoint).
- **[`server/schemas.py`](file:///c:/Users/sriva/SIH-2026/server/schemas.py)**: Pydantic v2 data models for `Element`, `PageInfo`, `ReasonRequest`, and `Action`.
- **[`server/planner.py`](file:///c:/Users/sriva/SIH-2026/server/planner.py)**: Bridges the incoming structured page state and the LLM. Enforces safety boundaries, untrusted web text isolation, and JSON extraction. If reasoning fails, safely falls back to `"ask_user"`.
- **[`server/policy.py`](file:///c:/Users/sriva/SIH-2026/server/policy.py)**: Deterministic policy guardrails ensuring the proposed `target_id` actually exists in the active DOM and confidence is >= 0.5.
- **[`server/llm.py`](file:///c:/Users/sriva/SIH-2026/server/llm.py)**: Model abstraction layer supporting Google Gemini (`gemini-2.5-flash`) and OpenAI (`gpt-4o-mini`) via zero-temperature structured JSON generation.
- **[`server/test_request.py`](file:///c:/Users/sriva/SIH-2026/server/test_request.py)**: Automated verification script sending a sample reimbursement form payload to test the reasoning pipeline.

### Allowed Actions

The reasoning engine strictly selects from the following schema-enforced actions:
- `click`: Target a button, link, or clickable node.
- `type`: Enter text into an input or textarea element.
- `select`: Choose an option from a dropdown or select control.
- `scroll`: Scroll the viewport up or down.
- `wait`: Pause for dynamic DOM or asynchronous network operations.
- `finish`: Conclude the task when the goal is achieved.
- `ask_user`: Safely request human input when uncertainty arises or sensitive actions are encountered.

---

## Hardware and Compute Requirements

### 1. Architecture and Where Each Part Runs

The agent follows a **DOM-first architecture**. A Chrome extension reads the page's DOM and accessibility tree, builds a structured map of interactive elements, and redacts personal data locally before anything is passed to a model. Vision models are invoked only for content the DOM cannot describe, such as `<canvas>`, embedded PDFs, or image-based controls.

- **Chrome Extension (Client)**:
  - **Responsibilities**: Accessibility-tree parser, layout extractor, 11-pattern PII filter (email, phone, card, SSN, PAN, Aadhaar, tokens, GSTIN, passport, driving licence, medical identifiers), rule-based hybrid router, trajectory cache, action executor, and side panel.
  - **Stack**: Plain JavaScript — zero model download, zero GPU required.
- **Local LLM (Client Machine)**:
  - **Responsibilities**: Local reasoning and privacy-preserving action planning.
  - **Stack**: Ollama on `127.0.0.1:11434` with default model `qwen3:4b`. The extension also automatically detects any installed Qwen variant.
- **Local Vision Service (`backend/`, FastAPI)**:
  - **Responsibilities**: Visual fallback using YOLO (`yolov8n` nano weights via Ultralytics) for UI element bounding boxes, EasyOCR in CPU mode for embedded text, and an OpenCV contour fallback.
  - **Auxiliary Endpoints**: Exposes a rule-based `/reason` endpoint with deterministic policy verification and a `/api/sanitize-pii` endpoint. *(Note: The extension does not stream screenshots to this endpoint during standard execution; screenshots are currently captured for side-panel preview).*
- **Reasoning Server (`server/`, FastAPI)**:
  - **Responsibilities**: Stateless planner bridging the sanitized page map with Google Gemini 2.5 Flash or OpenAI GPT-4o-mini, validating returned actions against the active DOM policy guardrail before execution.
- **Training Scripts (`scripts/`)**:
  - **Responsibilities**: QLoRA fine-tuning of `Qwen2.5-0.5B-Instruct` for localized PII redaction, synthetic dataset generation, and an Ollama `Modelfile` for bundling local PII SLMs.

---

### 2. Requirements by Component

| Component | Minimum Hardware | Recommended | GPU Needed? | Footprint / Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Extension (DOM Path)** | Any machine running modern Chrome | 4 GB+ RAM | No | Negligible CPU/memory load; pure JS DOM script. |
| **Local LLM (Ollama)** | Quad-core CPU, 8 GB RAM | 16 GB RAM, modern multi-core CPU | Optional (accelerates gen speed) | `qwen3:4b` is ~2.5 GB on disk (4-bit quantized); allocates ~3.0–3.5 GB active RAM during inference. |
| **Local Vision (`backend/`)** | Dual-core CPU, 4 GB RAM | Quad-core CPU, 8 GB RAM | No (runs CPU-only `gpu=False`) | PyTorch + OpenCV + EasyOCR runtime; models load lazily on first request. |
| **Reasoning Server (`server/`)** | 1–2 vCPU, 2 GB RAM | 2 vCPU, 4 GB RAM | No | Outbound HTTPS calls to Gemini/OpenAI; requires internet access and API key. |
| **PII Model Training (`scripts/`)** | NVIDIA GPU with CUDA (>=6 GB VRAM) | 8 GB+ VRAM (RTX 3060/4060 or Colab T4) | **Yes (CUDA)** | QLoRA 4-bit (bitsandbytes), fp16, rank 16, batch size 2, 4 grad-accum steps, 512 context length. |

---

### 3. Live Benchmark & Empirical Measurements

Empirical measurements gathered on a baseline test environment (**Windows 11 AMD64, 15.3 GB RAM, 6-core/12-thread CPU**, using [`benchmark.py`](file:///c:/Users/sriva/SIH-2026/benchmark.py)):

#### Latency & Throughput Profile

| Subsystem / Endpoint | Runs | Median (ms) | P95 (ms) | Min (ms) | Max (ms) | Throughput / Speed |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Ollama `qwen3:4b` (128 tokens)** | 3 | **5585.7 ms** | 5820.4 ms | 5567.8 ms | 5820.4 ms | **~22.7 – 74.1 tokens/sec** |
| **Backend Visual ML (`/api/visual-ml/inspect`)** | 3 | **19.3 ms** | 20.3 ms | 15.3 ms | 20.3 ms | Sub-25ms UI contour extraction |
| **Backend Rule Reasoner (`/reason`)** | 3 | **3.5 ms** | 4.3 ms | 3.1 ms | 4.3 ms | Deterministic policy matching |
| **Backend PII Redaction (`/api/sanitize-pii`)** | 3 | **3.0 ms** | 3.2 ms | 3.0 ms | 3.2 ms | 11 sensitive entity patterns |

#### Resident Memory (RSS) Footprint

| Process | Idle RAM (RSS) | Active Peak RAM | Role |
| :--- | :---: | :---: | :--- |
| **Ollama Daemon (`ollama`)** | ~27 MB | **~3,364 MB** | Loaded quantized weights & KV cache for `qwen3:4b` |
| **ML Backend (`uvicorn main:app`)** | ~52 MB | **~70 MB** | Vision fallback, OpenCV edge detector, PII parser |
| **Reasoning Server (`uvicorn app:app`)** | ~43 MB | **~64 MB** | FastAPI planner, JSON schemas, policy validator |

---

### 4. Research Recommendation: Lightweight Client-Side Vision

The current prototype provides a Python vision fallback service (`backend/`). For mass consumer deployment on everyday laptops without requiring local Python or PyTorch installations, architecture research recommends running lightweight vision directly in the browser via **ONNX Runtime Web (WebAssembly / WebGL)**:

- **UI Detector**: **YOLOX-Nano** (~0.91M parameters, ~4 MB as an ONNX file) under the **Apache 2.0** license. *(Note: Ultralytics YOLO is AGPL-3.0, posing distribution constraints. Released weights are COCO-trained, requiring fine-tuning on a UI widget dataset).*
- **Text Recognition**: **PP-OCRv5 mobile** (detection model 4.7 MB with Hmean 79.0%; recognition model 16 MB with 81.29% average accuracy on PaddleOCR benchmarks; English-specific `en_PP-OCRv5_mobile_rec` achieves 85.3%). Both models total ~21 MB on disk and are licensed under **Apache 2.0**.
- **Deployment Advantages**:
  - Eliminates the ~4 GB Python/PyTorch runtime dependency entirely.
  - Total on-disk model weight footprint drops to **~25 MB**.
  - **Absolute Privacy**: Screen pixels never leave the client's browser sandbox.

---

### 5. Optional Edge Deployment

The entire stack can be hosted on dedicated low-power edge hardware:
- **NVIDIA Jetson Orin Nano Super**: 8 GB 128-bit LPDDR5, up to 67 INT8 sparse TOPS (33 dense TOPS), configurable between 7W and 25W. Can host both the vision pipeline and a 4-bit SLM concurrently.
- **Raspberry Pi 5 (8 GB)**: Low-cost CPU-only alternative capable of running the DOM extraction and client-side ONNX vision stack.

---

### 6. Privacy Rationale

Recent research by Ukani et al., *"Privacy Practices of Browser Agents"* ([arXiv:2512.07725](https://arxiv.org/abs/2512.07725)), audited eight prominent browser agents and identified **30 critical privacy vulnerabilities**, including sensitive personal identifiers being inadvertently autocompleted or leaked to external LLM providers.

Agentic Browser addresses these vulnerabilities architecturally:
1. **Client-Side Redaction**: DOM content and input fields are filtered inside the extension via 11 regex and structural patterns before data ever exits the active browser tab.
2. **Hybrid Sensitive Routing**: Workflows handling sensitive data are confined to the local SLM (Ollama), preventing sensitive payloads from traversing third-party cloud APIs.
3. **Local LLM Isolation**: With the local model enabled, no web text, user inputs, or navigation trajectories leave the physical machine.

---

## Quick Start

### Setup

Follow the steps below to set up dependencies and configure your environment.

### 1. Install uv

Agentic Browser uses [uv](https://github.com/astral-sh/uv) to manage the Python virtual environment and package dependencies with maximum speed.

**macOS/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows (PowerShell):**
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

*Alternatively, you can install uv using pip:*
```bash
pip install uv
```

### 2. Clone the Repository

```bash
git clone https://github.com/AJ-creative/SIH.git
cd SIH
```

### 3. Set up the Virtual Environment

Use `uv` to create and activate a virtual environment for the project:

```bash
# Create Python 3.11 virtual environment
uv venv --python=3.11

# On macOS/Linux:
source .venv/bin/activate

# On Windows (PowerShell / Command Prompt):
.venv\Scripts\activate
```

### 4. Install Dependencies

Install the core server requirements:

```bash
uv pip install -r server/requirements.txt
```

*(Optional: if running the root ML/vision backend, install `uv pip install -r backend/requirements.txt`)*

### 5. Install Playwright Drivers

For headless browser control and automated execution:

```bash
playwright install
```

> **Using Local Chrome Profile:**  
> If you prefer using your local Chrome browser session over Playwright's clean browser, navigate to `chrome://version/` in Chrome, copy your Profile Path, and set `BROWSER_STORAGE_DIR` to that path in your `.env` file.

### 6. Configure the Environment

Create a `.env` file from the example configuration:

```bash
# For the reasoning server:
cp server/.env.example server/.env

# Or for the root agentic browser:
cp .env.example .env
```

#### Server Configuration (`server/.env`):
```dotenv
# Select backend: "gemini" or "openai"
LLM_PROVIDER=gemini

# Google Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

#### Extended Agentic Browser Configuration (`.env`):
```dotenv
# Text Model Configuration
AGENTIC_BROWSER_TEXT_MODEL=gpt-4o
AGENTIC_BROWSER_TEXT_API_KEY=<your text model API key>
AGENTIC_BROWSER_TEXT_BASE_URL=https://api.openai.com/v1

# Screenshot Analysis Configuration
AGENTIC_BROWSER_SS_ENABLED=true
AGENTIC_BROWSER_SS_MODEL=gpt-4o
AGENTIC_BROWSER_SS_API_KEY=<your screenshot model API key>
AGENTIC_BROWSER_SS_BASE_URL=https://api.openai.com/v1

# Logging & Monitoring
LOGFIRE_TOKEN=<your logfire write token>

# Google Search Configuration
GOOGLE_API_KEY=<your Custom Search json api>
GOOGLE_CX=<your google custom search engine id>

# Browser Configuration
BROWSER_STORAGE_DIR=./browser_storage
STEEL_DEV_API_KEY=<Optional: Enable remote browser via Steel Dev CDP>
```

---

### 7. Running the Project

You can run the reasoning server as an API or execute automated browser workflows directly.

#### Option A: Running the FastAPI Reasoning Server

```bash
# Navigate to server folder and run with uvicorn
cd server
uvicorn app:app --reload --port 8000
```
Or run directly from the workspace root:
```bash
uvicorn server.app:app --reload --port 8000
```

The reasoning server will be available at:
- **Healthcheck**: `http://127.0.0.1:8000/`
- **Interactive OpenAPI Docs**: `http://127.0.0.1:8000/docs`
- **Reasoning Endpoint**: `POST http://127.0.0.1:8000/reason`

#### Option B: Direct Execution
Run tasks directly via the CLI runner:
```bash
python3 -m core.main
```

#### Option C: Full Agentic Browser API
```bash
uvicorn core.server.api_routes:app --loop asyncio
```

---

### Running API with Docker (for AgenticBench)

You can containerize and run the agent in isolated environments:

**Ubuntu / Windows:**
```bash
docker build -t agentic_browser .
docker run -it --net=host --env-file .env agentic_browser
```

**macOS:**
```bash
docker build -t agentic_browser .
docker run -it -p 8000:8000 --env-file .env agentic_browser
```

---

## API Reference & Testing

### Reasoning Endpoint (`POST /reason`)

Send page state and user goal to receive the next validated browser action:

**Request:**
```http
POST http://127.0.0.1:8000/reason
Content-Type: application/json

{
  "task_id": "task_42",
  "goal": "Give me the price of RTX 3060ti on amazon.in and give me the latest delivery date.",
  "step": 1,
  "page": {
    "url": "https://www.amazon.in",
    "title": "Online Shopping site in India",
    "elements": [
      {
        "id": "twotabsearchtextbox",
        "role": "textbox",
        "label": "Search Amazon.in",
        "text": null,
        "value": "",
        "sensitive": false
      },
      {
        "id": "nav-search-submit-button",
        "role": "button",
        "label": null,
        "text": "Go",
        "value": null,
        "sensitive": false
      }
    ]
  }
}
```

**Response:**
```json
{
  "action": "type",
  "target_id": "twotabsearchtextbox",
  "value": "RTX 3060ti",
  "reason": "Type the product search query into the Amazon search box.",
  "confidence": 0.95
}
```

### Direct Testing Script

To verify that the server is working correctly, execute:

```bash
python server/test_request.py
```

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Acknowledgements

- [Agent-E](https://github.com/EmergenceAI/Agent-E?tab=readme-ov-file)
- [PydanticAI Python Agent Framework](https://github.com/pydantic/pydantic-ai)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Playwright](https://playwright.dev/)
