import { JointAngles } from './poseAnalysis';

export type TennisMovement = 'ready-position' | 'serve-ready' | 'groundstroke' | 'serve' | 'unknown';

export interface MovementClassification {
  movement: TennisMovement;
  confidence: number; // 0-100
  matchedRules: string[];
}

interface MovementRule {
  name: string;
  check: (angles: JointAngles) => boolean;
}

// Regular ready position - lower stance with significant knee bend for groundstrokes
const READY_POSITION_RULES: MovementRule[] = [
  {
    name: 'Knees significantly bent (90-130°)',
    check: (a) => a.knee >= 90 && a.knee <= 130,
  },
  {
    name: 'Hips bent forward (140-165°)',
    check: (a) => a.hip >= 140 && a.hip <= 165,
  },
  {
    name: 'Elbows bent (80-120°)',
    check: (a) => a.elbow >= 80 && a.elbow <= 120,
  },
  {
    name: 'Shoulders neutral (140-180°)',
    check: (a) => a.shoulder !== undefined && a.shoulder >= 140 && a.shoulder <= 180,
  },
];

// Serve ready position - more upright stance with less knee bend before serve
const SERVE_READY_RULES: MovementRule[] = [
  {
    name: 'Knees slightly bent (130-160°)',
    check: (a) => a.knee >= 130 && a.knee <= 160,
  },
  {
    name: 'Hips more upright (160-175°)',
    check: (a) => a.hip >= 160 && a.hip <= 175,
  },
  {
    name: 'Elbows bent holding racket (70-130°)',
    check: (a) => a.elbow >= 70 && a.elbow <= 130,
  },
  {
    name: 'Shoulders neutral to raised (120-180°)',
    check: (a) => a.shoulder !== undefined && a.shoulder >= 120 && a.shoulder <= 180,
  },
];

const GROUNDSTROKE_RULES: MovementRule[] = [
  {
    name: 'Hip rotation (120-180°)',
    check: (a) => a.hip >= 120 && a.hip <= 180,
  },
  {
    name: 'Knee extension (130-170°)',
    check: (a) => a.knee >= 130 && a.knee <= 170,
  },
  {
    name: 'Elbow extension (140-180°)',
    check: (a) => a.elbow >= 140 && a.elbow <= 180,
  },
  {
    name: 'Shoulder rotation (100-170°)',
    check: (a) => a.shoulder !== undefined && a.shoulder >= 100 && a.shoulder <= 170,
  },
];

const SERVE_RULES: MovementRule[] = [
  {
    name: 'Full knee extension (160-180°)',
    check: (a) => a.knee >= 160 && a.knee <= 180,
  },
  {
    name: 'Full hip extension (170-180°)',
    check: (a) => a.hip >= 170 && a.hip <= 180,
  },
  {
    name: 'Full elbow extension (160-180°)',
    check: (a) => a.elbow >= 160 && a.elbow <= 180,
  },
  {
    name: 'Shoulder overhead position (60-120°)',
    check: (a) => a.shoulder !== undefined && a.shoulder >= 60 && a.shoulder <= 120,
  },
];

export function classifyTennisMovement(angles: JointAngles): MovementClassification {
  const classifications: { movement: TennisMovement; score: number; matched: string[] }[] = [
    checkMovement('ready-position', READY_POSITION_RULES, angles),
    checkMovement('serve-ready', SERVE_READY_RULES, angles),
    checkMovement('groundstroke', GROUNDSTROKE_RULES, angles),
    checkMovement('serve', SERVE_RULES, angles),
  ];

  // Find the classification with highest score
  const best = classifications.reduce((prev, current) =>
    current.score > prev.score ? current : prev
  );

  // Lower threshold to 40% for better classification (was 50%)
  const confidence = best.score >= 40 ? best.score : 0;
  const movement = confidence >= 40 ? best.movement : 'unknown';

  return {
    movement,
    confidence: Math.round(confidence),
    matchedRules: best.matched,
  };
}

function checkMovement(
  movement: TennisMovement,
  rules: MovementRule[],
  angles: JointAngles
): { movement: TennisMovement; score: number; matched: string[] } {
  let matchedCount = 0;
  const matched: string[] = [];

  for (const rule of rules) {
    if (rule.check(angles)) {
      matchedCount++;
      matched.push(rule.name);
    }
  }

  const score = (matchedCount / rules.length) * 100;

  return { movement, score, matched };
}

export function getMovementLabel(movement: TennisMovement): string {
  switch (movement) {
    case 'ready-position':
      return 'Ready Position';
    case 'serve-ready':
      return 'Serve Ready';
    case 'groundstroke':
      return 'Groundstroke';
    case 'serve':
      return 'Serve';
    case 'unknown':
      return 'Unknown';
  }
}

export function getMovementColor(movement: TennisMovement): string {
  switch (movement) {
    case 'ready-position':
      return 'bg-blue-500';
    case 'serve-ready':
      return 'bg-indigo-500';
    case 'groundstroke':
      return 'bg-green-500';
    case 'serve':
      return 'bg-purple-500';
    case 'unknown':
      return 'bg-gray-500';
  }
}
