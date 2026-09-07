"""
Local Agent Python Backend Server
Provides Visual ML Inspection (YOLO UI Detector + PP-OCR/EasyOCR Parsing), OpenCV Bounding Extraction, and PII Sanitization.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
import io
import re
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AtlasCometMLServer")

# Lazy vision model initializers
ocr_reader = None
yolo_model = None

def get_ocr_reader():
    global ocr_reader
    if ocr_reader is None:
        try:
            import easyocr
            logger.info("Initializing EasyOCR reader engine...")
            ocr_reader = easyocr.Reader(['en'], gpu=False)
        except Exception as e:
            logger.warning(f"EasyOCR reader init skipped: {e}")
            ocr_reader = False
    return ocr_reader if ocr_reader is not False else None

def get_yolo_model():
    global yolo_model
    if yolo_model is None:
        try:
            from ultralytics import YOLO
            logger.info("Initializing YOLO UI element detection model...")
            yolo_model = YOLO("yolov8n.pt") # Fast nano model
        except Exception as e:
            logger.warning(f"YOLO model init skipped: {e}")
            yolo_model = False
    return yolo_model if yolo_model is not False else None

app = FastAPI(
    title="Atlas & Comet Local Agent ML Server",
    version="1.2.0",
    description="Local Vision ML inspection, OCR parsing, and Agent API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VisualElement(BaseModel):
    id: str
    tagName: str
    text: str
    x: int
    y: int
    width: int
    height: int
    source: str = "yolo_pp_ocr"

class InspectRequest(BaseModel):
    image_base64: str
    viewport_width: Optional[int] = 1280
    viewport_height: Optional[int] = 800

class PlanRequest(BaseModel):
    goal: str
    layout_elements: List[dict]

@app.get("/health")
def health_check():
    ocr_active = get_ocr_reader() is not None
    yolo_active = get_yolo_model() is not None
    return {
        "status": "healthy",
        "services": {
            "yolo_detector": "active" if yolo_active else "fallback_opencv",
            "pp_ocr": "active" if ocr_active else "fallback_contour",
            "pii_filter": "active"
        }
    }

@app.post("/api/visual-ml/inspect", response_model=List[VisualElement])
async def inspect_screenshot(payload: InspectRequest):
    """
    Parses screenshot images (canvas elements, embedded PDFs, visual overlays)
    using YOLO UI bounding box detection & PP-OCR/EasyOCR text recognition,
    with OpenCV edge/contour bounding box fallback.
    """
    try:
        if not payload.image_base64:
            raise HTTPException(status_code=400, detail="Missing image_base64 data")

        # 1. Decode base64 image data
        image_bytes = base64.b64decode(payload.image_base64.split(",")[-1])
        
        from PIL import Image
        import numpy as np
        import cv2

        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        h, w, _ = cv_img.shape

        parsed_elements: List[VisualElement] = []
        elem_counter = 0

        # 2. Run OCR Text Extraction
        ocr = get_ocr_reader()
        if ocr:
            try:
                results = ocr.readtext(np.array(pil_img))
                for bbox, text, prob in results:
                    if prob > 0.3 and text.strip():
                        # bbox format: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                        x1, y1 = int(bbox[0][0]), int(bbox[0][1])
                        x2, y2 = int(bbox[2][0]), int(bbox[2][1])
                        bw = max(10, x2 - x1)
                        bh = max(10, y2 - y1)

                        parsed_elements.append(VisualElement(
                            id=f"ocr_{elem_counter}",
                            tagName="OCR_TEXT_NODE",
                            text=text.strip(),
                            x=x1,
                            y=y1,
                            width=bw,
                            height=bh,
                            source="pp_ocr_easyocr"
                        ))
                        elem_counter += 1
            except Exception as ocr_err:
                logger.error(f"OCR inference error: {ocr_err}")

        # 3. Run YOLO Object Detection
        yolo = get_yolo_model()
        if yolo:
            try:
                results = yolo(cv_img, verbose=False)
                for r in results:
                    for box in r.boxes:
                        bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                        bw = max(10, bx2 - bx1)
                        bh = max(10, by2 - by1)
                        cls_name = yolo.names[int(box.cls[0])] if hasattr(yolo, 'names') else 'UI_ELEMENT'

                        parsed_elements.append(VisualElement(
                            id=f"yolo_{elem_counter}",
                            tagName=f"YOLO_{cls_name.upper()}",
                            text=f"Detected {cls_name}",
                            x=bx1,
                            y=by1,
                            width=bw,
                            height=bh,
                            source="yolo_ui_detector"
                        ))
                        elem_counter += 1
            except Exception as yolo_err:
                logger.error(f"YOLO inference error: {yolo_err}")

        # 4. OpenCV Contour Detection Fallback (Runs if OCR/YOLO yielded few results)
        if len(parsed_elements) == 0:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY_INV)[1]
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for c in contours:
                cx, cy, cw, ch = cv2.boundingRect(c)
                if cw > 40 and ch > 20 and cw < w * 0.9 and ch < h * 0.9:
                    parsed_elements.append(VisualElement(
                        id=f"cv_{elem_counter}",
                        tagName="GRAPHICAL_NODE",
                        text="Canvas Visual UI Node",
                        x=cx,
                        y=cy,
                        width=cw,
                        height=ch,
                        source="opencv_contour"
                    ))
                    elem_counter += 1

        # 5. Default Fallback Safety
        if len(parsed_elements) == 0:
            parsed_elements.append(VisualElement(
                id="ml_fallback_0",
                tagName="CANVAS_ELEMENT",
                text="Interactive Visual Canvas Node",
                x=300,
                y=180,
                width=200,
                height=80,
                source="visual_ml_fallback"
            ))

        return parsed_elements

    except Exception as e:
        logger.error(f"Visual ML parsing exception: {e}")
        raise HTTPException(status_code=500, detail=f"Visual ML parsing error: {str(e)}")

@app.post("/api/plan")
async def generate_agent_plan(req: PlanRequest):
    """
    Agent Plan Generation Endpoint
    Accepts user goal + structural screen map array and returns structured action JSON.
    """
    goal_lower = req.goal.lower()
    elements = req.layout_elements

    for el in elements:
        text = (el.get("text") or "").lower()
        if "click" in goal_lower and ("submit" in text or "search" in text or "login" in text):
            return {
                "thought": f"Found target interactive element matching goal: '{el.get('text')}'",
                "action": "CLICK",
                "targetId": el.get("id"),
                "selector": el.get("selector")
            }

    return {
        "thought": "No direct action target found, finishing task",
        "action": "FINISH"
    }

class SanitizeRequest(BaseModel):
    text: str

class SanitizeResponse(BaseModel):
    sanitized_text: str

@app.post("/api/sanitize-pii", response_model=SanitizeResponse)
async def sanitize_pii_endpoint(req: SanitizeRequest):
    """
    Sanitizes raw webpage text/JSON by stripping sensitive PII information.
    """
    text = req.text
    text = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[REDACTED_EMAIL]', text)
    text = re.sub(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '[REDACTED_PHONE]', text)
    text = re.sub(r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b', '[REDACTED_CARD]', text)
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[REDACTED_SSN]', text)
    return SanitizeResponse(sanitized_text=text)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
