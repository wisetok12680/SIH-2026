/**
 * Hybrid Dynamic Router & Local Unified Trajectory Memory
 * Routes execution between Local GUI Agent (on-device) and High-Capacity Cloud Agent.
 */

export class HybridDynamicRouter {
  constructor() {
    this.unifiedTrajectoryMemory = [];
  }

  resetMemory() {
    this.unifiedTrajectoryMemory = [];
  }

  recordStep(stepData) {
    this.unifiedTrajectoryMemory.push({
      ...stepData,
      timestamp: new Date().toISOString()
    });
  }

  getUnifiedMemory() {
    return this.unifiedTrajectoryMemory;
  }

  /**
   * Dynamic Routing Logic: Determines if step is handled locally or sent to cloud.
   */
  evaluateRouting(task, layoutData, currentStep) {
    const taskLower = task.toLowerCase();

    // Rule 1: High Sensitivity tasks MUST remain local
    const containsSensitiveKeywords = /password|ssn|credit card|pan|aadhaar|secret|tax|login/i.test(taskLower);
    if (containsSensitiveKeywords) {
      return {
        route: 'LOCAL_AGENT',
        reason: 'Privacy-Preserving Local Enforcement (Sensitive Task)'
      };
    }

    // Rule 2: Routine Form Autofill & Browser Interaction -> Pure In-Browser Local AI
    const isFormOrRoutineTask = /job|apply|application|form|fill|search|scroll|click|type|dismiss|close/i.test(taskLower);
    const isComplexAnalyticalTask = /analyze|compare|contract|compliance|risk|procurement|vendor|audit|synthesis|multi-attribute|financial|recommend/i.test(taskLower);

    if (isFormOrRoutineTask && !isComplexAnalyticalTask) {
      return {
        route: 'LOCAL_AGENT',
        reason: 'Pure In-Browser WebGPU/WASM Fast Execution'
      };
    }

    // Rule 3: Complex Synthesis & Advanced Reasoning -> Swappable External LLM (Ollama Qwen 4B / FastAPI)
    if (isComplexAnalyticalTask) {
      return {
        route: 'EXTERNAL_LLM',
        reason: 'Complex Reasoning & Synthesis Task (Dispatched to Swappable Local/Cloud LLM Server)'
      };
    }

    return {
      route: 'LOCAL_AGENT',
      reason: 'In-Browser Local Execution First'
    };
  }
}
