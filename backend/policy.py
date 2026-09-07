"""
Policy Layer (policy.py)
Verifies element existence, confidence thresholds, rejecting hallucinated targets,
and enforcing strict guardrails against destructive or unauthorized actions.
"""

import logging
import re

logger = logging.getLogger("PolicyValidator")

DESTRUCTIVE_KEYWORDS = [
    r"\bdelete\b", r"\bremove all\b", r"\bpurge\b", r"\bdrop\b", r"\bformat\b",
    r"\btransfer money\b", r"\bpay now\b", r"\bconfirm payment\b", r"\brevoke\b",
    r"\bunsubscribe all\b", r"\bwipe\b"
]

def check_destructive_action(action_payload: dict, matched_element: dict) -> tuple:
    """
    Checks whether the proposed action is destructive or high-risk.
    Returns (is_destructive, risk_rating, reason).
    """
    thought = (action_payload.get("thought") or "").lower()
    value = (action_payload.get("value") or "").lower()
    el_name = (matched_element.get("name") or matched_element.get("text") or "").lower()

    combined_text = f"{thought} {value} {el_name}"

    for pattern in DESTRUCTIVE_KEYWORDS:
        if re.search(pattern, combined_text, re.IGNORECASE):
            return True, "CRITICAL", f"Detected high-risk destructive phrase matching pattern '{pattern}'"

    return False, "LOW", "Standard routine action"

def verify_action_policy(action_payload: dict, available_elements: list, allow_destructive: bool = False) -> dict:
    """
    Verifies that the target element proposed by LLM exists in the accessibility tree / page elements,
    satisfies non-disabled constraints, and checks destructive action guardrails.
    """
    target_ref = action_payload.get("target_ref") or action_payload.get("targetId") or action_payload.get("ref")
    action_type = action_payload.get("action", "FINISH").upper()

    if action_type == "FINISH" or not target_ref:
        return {
            "valid": True,
            "action": action_payload,
            "reason": "Terminal or non-element action approved",
            "risk_rating": "LOW",
            "destructive_blocked": False
        }

    # 1. Verify target existence in available elements list
    matched_element = None
    for el in available_elements:
        el_id = el.get("ref") or el.get("id") or el.get("selector")
        if el_id == target_ref:
            matched_element = el
            break

    if not matched_element:
        logger.warning(f"[Policy Verification Failed] Target '{target_ref}' does not exist in page elements. Rejecting hallucinated target.")
        return {
            "valid": False,
            "action": {
                "thought": f"Rejected hallucinated target element '{target_ref}' by security policy.",
                "action": "FINISH",
                "target_ref": None
            },
            "reason": f"Target '{target_ref}' not found on active page elements.",
            "risk_rating": "HIGH",
            "destructive_blocked": False
        }

    # 2. Verify element is non-disabled
    if matched_element.get("disabled") is True:
        logger.warning(f"[Policy Verification Failed] Target '{target_ref}' is disabled.")
        return {
            "valid": False,
            "action": {
                "thought": f"Rejected action on disabled element '{target_ref}'.",
                "action": "FINISH",
                "target_ref": None
            },
            "reason": f"Target '{target_ref}' is currently disabled.",
            "risk_rating": "LOW",
            "destructive_blocked": False
        }

    # 3. Check for Destructive / High-Risk Guardrail
    is_destructive, risk_rating, risk_reason = check_destructive_action(action_payload, matched_element)
    if is_destructive and not allow_destructive:
        logger.warning(f"[Policy Guardrail Triggered] Blocking destructive action on '{target_ref}': {risk_reason}")
        return {
            "valid": False,
            "action": {
                "thought": f"Blocked destructive action on target '{target_ref}' ({risk_reason}). Explicit user confirmation required.",
                "action": "FINISH",
                "target_ref": target_ref
            },
            "reason": f"Blocked destructive action: {risk_reason}",
            "risk_rating": risk_rating,
            "destructive_blocked": True
        }

    logger.info(f"[Policy Approved] Action '{action_type}' on target '{target_ref}' verified successfully (Risk: {risk_rating}).")
    return {
        "valid": True,
        "action": action_payload,
        "reason": "Target existence, element status, and security policy verified",
        "risk_rating": risk_rating,
        "destructive_blocked": False
    }
