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

    // Rule 2: Basic routine actions (scroll, click simple button, search field) -> Local Agent
    const isRoutineTask = /search|scroll|click|fill|type|dismiss|close/i.test(taskLower);
    if (isRoutineTask && currentStep <= 3) {
      return {
        route: 'LOCAL_AGENT',
        reason: 'On-Device Fast Execution (Routine Action)'
      };
    }

    // Rule 3: Complex multi-step reasoning or high step count -> Cloud Agent Fallback
    if (currentStep > 4 || /analyze|compare|extract summary|semantic plan/i.test(taskLower)) {
      return {
        route: 'CLOUD_AGENT',
        reason: 'Complex Semantic Reasoning / Multi-step Fallback'
      };
    }

    return {
      route: 'LOCAL_AGENT',
      reason: 'Local First Execution'
    };
  }
}
