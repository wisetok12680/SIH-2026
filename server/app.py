from fastapi import FastAPI, HTTPException
from schemas import ReasonRequest, Action
from planner import decide_action
from policy import validate_action


app = FastAPI(
    title="SIH Browser Agent Reasoning Server",
    version="0.1"
)


@app.get("/")
def root():
    return {
        "status": "running",
        "message": "SIH26171 reasoning server is online"
    }


@app.post("/reason", response_model=Action)
def reason(request: ReasonRequest):
    action = decide_action(request)

    allowed, message = validate_action(action, request)

    if not allowed:
        raise HTTPException(status_code=400, detail=message)

    return action