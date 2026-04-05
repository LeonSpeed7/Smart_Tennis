// Pose analysis utilities - converted from Python algorithm

export interface Point3D {
  x: number;
  y: number;
  z: number;
  confidence: number;
}

export interface PoseKeypoints {
  right_shoulder: Point3D;
  right_hip: Point3D;
  right_knee: Point3D;
  right_ankle: Point3D;
  right_elbow: Point3D;
  right_wrist: Point3D;
  right_foot_index: Point3D;
}

export interface JointAngles {
  knee: number;
  hip: number;
  elbow: number;
  ankle: number;
  shoulder?: number;
  wrist?: number;
}

export interface FeedbackResult {
  joint: string;
  angle: number;
  difference: number;
  status: 'good' | 'too-narrow' | 'too-wide';
  message: string;
}

// Calculate Euclidean distance between two 3D points
export function calculateDistance(point1: Point3D, point2: Point3D): number {
  return Math.sqrt(
    Math.pow(point1.x - point2.x, 2) +
    Math.pow(point1.y - point2.y, 2) +
    Math.pow(point1.z - point2.z, 2)
  );
}

// Calculate angle using law of cosines
export function calculateAngle(a: number, b: number, c: number): number {
  const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
  const clampedCos = Math.max(-1, Math.min(1, cosAngle)); // Clamp to avoid NaN
  return (Math.acos(clampedCos) * 180) / Math.PI;
}

// Calculate all joint angles from pose keypoints
export function calculateJointAngles(keypoints: PoseKeypoints, includeExtended: boolean = false): JointAngles {
  // Knee Joint
  const distHipKnee = calculateDistance(keypoints.right_hip, keypoints.right_knee);
  const distKneeAnkle = calculateDistance(keypoints.right_knee, keypoints.right_ankle);
  const distHipAnkle = calculateDistance(keypoints.right_hip, keypoints.right_ankle);
  const kneeAngle = calculateAngle(distHipKnee, distKneeAnkle, distHipAnkle);

  // Hip Joint
  const distShoulderHip = calculateDistance(keypoints.right_shoulder, keypoints.right_hip);
  const distShoulderKnee = calculateDistance(keypoints.right_shoulder, keypoints.right_knee);
  const hipAngle = calculateAngle(distShoulderHip, distHipKnee, distShoulderKnee);

  // Elbow Joint
  const distShoulderElbow = calculateDistance(keypoints.right_shoulder, keypoints.right_elbow);
  const distElbowWrist = calculateDistance(keypoints.right_elbow, keypoints.right_wrist);
  const distShoulderWrist = calculateDistance(keypoints.right_shoulder, keypoints.right_wrist);
  const elbowAngle = calculateAngle(distShoulderElbow, distElbowWrist, distShoulderWrist);

  // Ankle Joint
  const distAnkleFoot = calculateDistance(keypoints.right_ankle, keypoints.right_foot_index);
  const distKneeFoot = calculateDistance(keypoints.right_knee, keypoints.right_foot_index);
  const ankleAngle = calculateAngle(distKneeAnkle, distAnkleFoot, distKneeFoot);

  const baseAngles = {
    knee: kneeAngle,
    hip: hipAngle,
    elbow: elbowAngle,
    ankle: ankleAngle,
  };

  // Only calculate shoulder and wrist for video analysis
  if (includeExtended) {
    // Shoulder angle - using a simplified torso-based measurement
    // Calculate angle formed by hip-shoulder-elbow
    const shoulderAngle = calculateAngle(distShoulderHip, distShoulderElbow, 
      calculateDistance(keypoints.right_hip, keypoints.right_elbow));

    // Wrist angle - angle at the wrist joint
    // Using elbow-wrist-hand approximation
    const distWristFoot = calculateDistance(keypoints.right_wrist, keypoints.right_foot_index);
    const wristAngle = calculateAngle(distElbowWrist, distWristFoot, 
      calculateDistance(keypoints.right_elbow, keypoints.right_foot_index));

    return {
      ...baseAngles,
      shoulder: shoulderAngle,
      wrist: wristAngle,
    };
  }

  return baseAngles;
}

// Compare user pose with reference pose and generate feedback
// More lenient threshold of 15° (was 10°) for better ratings
export function generateFeedback(
  userAngles: JointAngles,
  referenceAngles: JointAngles,
  threshold: number = 15,
  includeExtended: boolean = false
): FeedbackResult[] {
  const feedback: FeedbackResult[] = [];

  const baseJoints: (keyof JointAngles)[] = ['knee', 'hip', 'elbow', 'ankle'];
  const joints = includeExtended 
    ? [...baseJoints, 'shoulder', 'wrist'] 
    : baseJoints;

  joints.forEach((joint) => {
    if (!userAngles[joint] || !referenceAngles[joint]) return;
    const difference = userAngles[joint] - referenceAngles[joint];
    let status: 'good' | 'too-narrow' | 'too-wide' = 'good';
    let message = `Your ${joint} angle is within the acceptable range.`;

    if (difference < -threshold) {
      status = 'too-narrow';
      message = `Your ${joint} angle is slightly narrow. Consider extending your ${joint} a bit more.`;
    } else if (difference > threshold) {
      status = 'too-wide';
      message = `Your ${joint} angle is slightly wide. Consider bending your ${joint} a bit more.`;
    }

    feedback.push({
      joint,
      angle: userAngles[joint],
      difference,
      status,
      message,
    });
  });

  return feedback;
}

// Default reference pose angles (can be overridden by uploading a reference image)
export const DEFAULT_REFERENCE_ANGLES: JointAngles = {
  knee: 150,
  hip: 160,
  elbow: 140,
  ankle: 100,
};
