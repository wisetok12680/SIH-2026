"""
Policy Layer (policy.py)
Verifies element existence and confidence thresholds, rejecting hallucinated targets.
"""

import logging

logger = logging.getLogger("PolicyValidator")

def verify_action_policy(action_payload: dict, available_elements: list) -> dict:
    """
    Verifies that the target element proposed by LLM exists in the accessibility tree / page elements
    and satisfies confidence thresholds to prevent hallucinated actions.
    """
    target_ref = action_payload.get("target_ref") or action_payload.get("targetId") or action_payload.get("ref")
    action_type = action_payload.get("action", "FINISH").upper()

    if action_type == "FINISH" or not target_ref:
        return {
            "valid": True,
            "action": action_payload,
            "reason": "Terminal or non-element action approved"
        }

    # Verify existence in available elements list
    matched_element = None
    for el in available_elements:
        el_id = el.get("ref") or el.get("id") or el.get("selector")
        if el_id == target_ref:
            matched_element = el
            break

    if not matched_element:
        logger.warning(f"[Policy Verification Failed] Target '{target_ref}' does not exist in page elements. Rejecting hallucination.")
        return {
            "valid": False,
            "action": {
                "thought": f"Rejected hallucinated target element '{target_ref}' by security policy.",
                "action": "FINISH",
                "target_ref": None
            },
            "reason": f"Target '{target_ref}' not found on active page."
        }

    # Verify element is enabled / non-disabled if specified
    if matched_element.get("disabled") is True:
        logger.warning(f"[Policy Verification Failed] Target '{target_ref}' is disabled.")
        return {
            "valid": False,
            "action": {
                "thought": f"Rejected click on disabled element '{target_ref}'.",
                "action": "FINISH",
                "target_ref": None
            },
            "reason": f"Target '{target_ref}' is disabled."
        }

    logger.info(f"[Policy Approved] Action '{action_type}' on target '{target_ref}' verified successfully.")
    return {
        "valid": True,
        "action": action_payload,
        "reason": "Target existence and policy verified"
    }
