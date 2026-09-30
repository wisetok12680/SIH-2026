import requests


data = {
    "task_id": "demo1",
    "goal": "Submit the reimbursement form",
    "step": 1,
    "page": {
        "url": "https://demo.local/reimbursement",
        "title": "Reimbursement Portal",
        "elements": [
            {
                "id": "e1",
                "role": "textbox",
                "label": "Employee Email",
                "value": "[REDACTED]",
                "sensitive": True
            },
            {
                "id": "e2",
                "role": "textbox",
                "label": "Amount",
                "value": "4500",
                "sensitive": False
            },
            {
                "id": "e3",
                "role": "button",
                "text": "Submit",
                "sensitive": False
            }
        ]
    }
}


response = requests.post(
    "http://127.0.0.1:8000/reason",
    json=data
)

print(response.status_code)
print(response.json())
