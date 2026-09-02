export type ActionType =
  | 'click'
  | 'fill'
  | 'select'
  | 'hover'
  | 'press'
  | 'scroll'
  | 'navigate'
  | 'wait'
  | 'assert'
  | 'finish';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocatorFingerprint {
  role: string;
  name: string;
  tagName: string;
  testId?: string;
  text?: string;
  placeholder?: string;
  cssSelector: string;
  xpath?: string;
  surroundingText?: string;
  parentRole?: string;
  position?: { xRatio: number; yRatio: number };
}

export interface InteractiveElement {
  index: number;
  role: string;
  name: string;
  text?: string;
  value?: string;
  placeholder?: string;
  selector: string;
  testId?: string;
  tagName: string;
  type?: string;
  href?: string;
  disabled: boolean;
  focused: boolean;
  checked?: boolean;
  expanded?: boolean;
  boundingBox: BoundingBox;
  locatorFingerprint: LocatorFingerprint;
}

export interface TelemetryLog {
  type: 'console-error' | 'console-warn' | 'console-log' | 'page-error' | 'network-error' | 'network-request';
  timestamp: number;
  text: string;
  url?: string;
  status?: number;
  duration?: number;
}

export interface Observation {
  stepIndex: number;
  url: string;
  title: string;
  a11yTreeText: string;
  interactiveElements: InteractiveElement[];
  screenshotPath?: string;
  screenshotBase64?: string;
  telemetry: TelemetryLog[];
  domMetrics: {
    elementCount: number;
    formCount: number;
    headingCount: number;
  };
}

export interface UIAction {
  action: ActionType;
  targetIndex?: number;
  targetSelector?: string;
  value?: string;
  key?: string;
  direction?: 'up' | 'down';
  rationale: string;
  expectedOutcome?: string;
  isGoalComplete?: boolean;
  confidence?: number;
}

export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'functionality' | 'usability' | 'interaction';
  message: string;
  elementIndex?: number;
  recommendation?: string;
}

export interface CriticScore {
  functionality: number; // 0-100
  usability: number;     // 0-100
  interaction: number;   // 0-100
  overall: number;       // 0-100
  findings: Finding[];
  transitionFeedback: string;
}

export interface StateNode {
  id: string;
  url: string;
  title: string;
  visitedCount: number;
  unexploredElements: number[];
  exploredElements: number[];
  screenshotPath?: string;
  createdAt: number;
}

export interface TransitionEdge {
  fromNodeId: string;
  toNodeId: string;
  action: UIAction;
  success: boolean;
  duration: number;
  error?: string;
}

export interface JourneyGoal {
  goal: string;
  startUrl: string;
  maxSteps?: number;
  userPersona?: string;
  customInstructions?: string;
}

export interface StepRecord {
  stepIndex: number;
  timestamp: number;
  action: UIAction;
  observationBefore: Observation;
  observationAfter?: Observation;
  score?: CriticScore;
  success: boolean;
  error?: string;
  healed?: boolean;
  selfHealingPatch?: SelfHealingPatch;
}

export interface SelfHealingPatch {
  originalSelector: string;
  originalFingerprint: LocatorFingerprint;
  healedSelector: string;
  healedFingerprint: LocatorFingerprint;
  similarityScore: number;
  timestamp: number;
  stepIndex: number;
  reason: string;
}

export interface FrameworkConfig {
  provider: 'gemini' | 'anthropic' | 'openai' | 'mock';
  apiKey?: string;
  model?: string;
  headless: boolean;
  slowMo: number;
  viewport: { width: number; height: number };
  artifactsDir: string;
  maxSteps: number;
  enableAxeCore: boolean;
  captureScreenshots: boolean;
}
