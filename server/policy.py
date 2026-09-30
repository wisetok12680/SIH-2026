def validate_action(action, request):
    """
    Sanity-checks an Action returned by the planner BEFORE it's sent
    back to the browser extension. This is the "don't trust the brain
    blindly" layer -- important now, and critical later when the
    planner is an LLM instead of hard-coded rules.
    """

    element_ids = [
        element.id
        for element in request.page.elements
    ]

    # If the action targets an element, that element must actually
    # exist on the page the browser sent us.
    if action.target_id is not None:
        if action.target_id not in element_ids:
            return False, "Target element does not exist."

    # If the planner wasn't confident enough, don't let it act.
    # "ask_user" is the planner's own "I'm not sure" signal, so it's
    # allowed through even at low confidence -- that's the whole point
    # of that action existing.
    if action.action != "ask_user" and action.confidence < 0.5:
        return False, "Confidence too low."

    return True, "Allowed."
