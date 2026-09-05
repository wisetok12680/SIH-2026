/**
 * Local Agent Planner Engine & Heuristic Rules
 * Analyzes Accessibility Tree snapshots (@e1, @e2...) and outputs Ref-based JSON action commands.
 */

export class AgentPlannerClient {
  constructor(apiUrl = 'http://localhost:11434/api/generate', model = 'llama3') {
    this.apiUrl = apiUrl;
    this.model = model;
  }

  async planNextStep(userGoal, layoutData, actionHistory = [], options = {}) {
    const { useLocalLlm = false, serverUrl } = options;

    if (useLocalLlm) {
      try {
        return await this.callLocalLlm(userGoal, layoutData, actionHistory, serverUrl || this.apiUrl);
      } catch (err) {
        console.warn('[Planner] Local LLM unreachable, using local heuristic Ref engine:', err.message);
      }
    }

    // Heuristic Ref-based Decision Engine
    return this.runHeuristicRefPlanner(userGoal, layoutData, actionHistory);
  }

  async callLocalLlm(userGoal, layoutData, actionHistory, endpoint) {
    const axNodes = layoutData.axTree?.nodes || [];
    const compactAxTree = axNodes.map((n) => ({
      ref: n.ref,
      role: n.role,
      name: n.name,
      value: n.value
    })).slice(0, 35);

    const prompt = `You are an autonomous browser agent.
User Goal: "${userGoal}"
Page Title: "${layoutData.title}"
Accessibility Tree Snapshot:
${JSON.stringify(compactAxTree, null, 2)}

Action History: ${JSON.stringify(actionHistory)}

Select the SINGLE best action to take right now to achieve the goal.
Respond ONLY with valid JSON in this exact structure:
{
  "thought": "explanation of choice",
  "action": "CLICK" | "TYPE" | "SCROLL" | "FINISH",
  "ref": "@e1",
  "value": "text value if typing or direction if scrolling"
}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false
      })
    });

    if (!res.ok) throw new Error(`LLM API returned status ${res.status}`);
    const data = await res.json();

    try {
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[Planner] Failed to parse LLM JSON:', data.response);
    }

    throw new Error('LLM response did not return valid action JSON');
  }

  runHeuristicRefPlanner(userGoal, layoutData, actionHistory) {
    const goalLower = userGoal.toLowerCase();
    const axNodes = layoutData.axTree?.nodes || [];

    if (actionHistory.length >= 8) {
      return {
        thought: 'Completed maximum trajectory steps',
        action: 'FINISH',
        value: 'Max step limit reached.'
      };
    }

    // 1. Target Text Input / Search
    if (goalLower.includes('search') || goalLower.includes('find') || goalLower.includes('fill') || goalLower.includes('type')) {
      const targetInput = axNodes.find((n) => n.role === 'textbox' || n.role === 'searchbox' || n.tagName === 'input');
      const alreadyTyped = actionHistory.some((a) => a.action === 'TYPE' && a.targetRef === targetInput?.ref);

      if (targetInput && !alreadyTyped) {
        const valMatch = userGoal.match(/(?:for|with|enter|search|type)\s+["']?([^"']+)["']?/i);
        const queryVal = valMatch ? valMatch[1].trim() : 'Search Query';

        return {
          thought: `Identified input target [${targetInput.role}] ${targetInput.ref} ("${targetInput.name}")`,
          action: 'TYPE',
          ref: targetInput.ref,
          targetRef: targetInput.ref,
          value: queryVal
        };
      }
    }

    // 2. Target Button / Link Click
    const targetButton = axNodes.find((n) => {
      const nameLower = (n.name || '').toLowerCase();
      if (goalLower.includes('submit') || goalLower.includes('search') || goalLower.includes('click') || goalLower.includes('login')) {
        return (n.role === 'button' || n.role === 'link') && (nameLower.includes('submit') || nameLower.includes('search') || nameLower.includes('click') || nameLower.includes('go') || nameLower.includes('login'));
      }
      return false;
    });

    if (targetButton) {
      const alreadyClicked = actionHistory.some((a) => a.action === 'CLICK' && a.targetRef === targetButton.ref);
      if (!alreadyClicked) {
        return {
          thought: `Identified action button [${targetButton.role}] ${targetButton.ref} ("${targetButton.name}")`,
          action: 'CLICK',
          ref: targetButton.ref,
          targetRef: targetButton.ref
        };
      }
    }

    // 3. Fallback: First clickable node
    const firstClickable = axNodes.find((n) => n.role === 'button' || n.role === 'link');
    if (firstClickable && actionHistory.length === 0) {
      return {
        thought: `Executing action on primary interactive node ${firstClickable.ref} ("${firstClickable.name}")`,
        action: 'CLICK',
        ref: firstClickable.ref,
        targetRef: firstClickable.ref
      };
    }

    return {
      thought: 'All goal actions executed on current Accessibility Tree',
      action: 'FINISH',
      value: 'Task execution complete.'
    };
  }
}
