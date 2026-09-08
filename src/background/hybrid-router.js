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

    // Rule 2: Form Autofill and Routine UI Tasks -> Local Agent
    const isFormTask = /job|apply|application|form|fill|search|scroll|click|type|dismiss|close/i.test(taskLower);
    const isHeavyAnalyticalTask = /analyze|compare|contract|compliance|risk|procurement|vendor|audit|synthesis|multi-attribute|financial|recommend/i.test(taskLower);

    if (isFormTask && !isHeavyAnalyticalTask) {
      return {
        route: 'LOCAL_AGENT',
        reason: 'On-Device Fast Execution (Form Autofill Task)'
      };
    }

    // Rule 3: Heavy Analytical Synthesis & Multi-Attribute Trade-off Reasoning -> External Cloud LLM
    if (isHeavyAnalyticalTask) {
      return {
        route: 'CLOUD_AGENT',
        reason: 'Heavy Analytical Synthesis & Contract Risk Evaluation (Exceeds Local On-Device Agent Capacity -> Dispatching Payload JSON to External LLM)'
      };
    }

    return {
      route: 'LOCAL_AGENT',
      reason: 'Local First Execution'
    };
  }
}
