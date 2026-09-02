# Local Browser Agent for Physical Layout Mapping & Web Automation

An autonomous local agent designed for physical layout parsing, privacy-preserving visual analysis, structural screen mapping, and dynamic browser action execution.

---

## 🎯 Local Agent & Goals

The local agent focuses on converting visual and DOM browser states into lightweight structural maps while preserving privacy and executing tasks reliably. Its 5 core goals are:

1. **Identify Physical Layout of the Page**: Determine accurate physical coordinates and visual dimensions of all elements rendered on screen.
2. **Privacy Filtering**: Detect sensitive data (PII) locally and perform redaction prior to data processing.
3. **Convert Visual Screen into a Lightweight Text-Based Structural Map**: Transform complex visual interface layouts into compact, structured representations for machine reasoning.
4. **Action Execution**: Execute actions dynamically on web elements (clicking, scrolling, navigating, dynamic input).
5. **State Monitoring**: Track page state changes, waiting conditions, dynamic content rendering, and recovery logic.

---

## 💡 Ideas

- **Block Browser Tracking**: Block telemetry, ad trackers, and third-party script tracking at the browser level to improve speed, performance, and user privacy.

---

## ✨ Features (Atlas & Comet Capabilities)

- **Dynamic Navigation & Control**: Dynamically navigate pages, manage and switch open tabs, interact with multi-level menus, and scroll viewports seamlessly.
- **Handles Interruptions**: Dynamically detect and handle popups, modals, captchas, DOM variations, and unexpected UI changes.
- **State-Aware Waiting**: Perform intelligent waiting based on network state, dynamic component rendering, and UI stability rather than static time delays.
- **Learn Patterns**: Learn recurring page navigation and workflow patterns over time for optimized execution.
- **Form Filling & Mail Operations**: Automate complex multi-field form completion and read/parse email messages.
- **Visual Scraping**: Extract data from standard web pages as well as visual graphics, canvases, and media overlays.

---

## 💡 IDEA

### Physical Layout & Visual Parsing Pipeline

1. **DOM Physical Layout Extraction**
   - Iterate through every DOM element on the page.
   - Use native browser APIs to retrieve element bounding properties: `x` coordinates, `y` coordinates, `width`, and `height`.
   - **Element Filtering**: Ignore elements with `width == 0` or `visibility == "hidden"`.

2. **Visual ML Fallback Engine (Canvas, PDF & Images)**
   - For graphical elements (`<canvas>`, embedded PDFs, images) or elements missed by the DOM tree, trigger a visual ML inspection.
   - Capture a local viewport screenshot using the `chrome.tabs.captureVisibleTab` API.
   - Run local machine learning models on the captured screenshot:
     - **YOLO**: Detect non-standard UI controls, icons, and visual elements missed by DOM parsing.
     - **PP-OCRv5mobile**: High-speed mobile OCR to parse text embedded in images, canvas elements, and PDF renders.

3. **PII Detection & Local Redaction**
   - Process all parsed text and visual metadata through a local PII filter.
   - Apply local redaction to mask sensitive user information (credentials, personal details, tokens) before output generation.

4. **Single JSON Array Physical Map**
   - Combine DOM layout coordinates and Visual ML bounding boxes into a **single JSON array**.
   - Output a JSON file representing the physical structural map of the active screen.

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
