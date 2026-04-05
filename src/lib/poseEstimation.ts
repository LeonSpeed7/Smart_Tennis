import { PoseLandmarker, FilesetResolver, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { PoseKeypoints, Point3D } from './poseAnalysis';

let poseLandmarker: PoseLandmarker | null = null;

export async function initializePoseEstimation() {
  if (poseLandmarker) return poseLandmarker;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
    });

    return poseLandmarker;
  } catch (error) {
    console.error('Error initializing pose estimation:', error);
    throw error;
  }
}

export async function estimatePoseFromImage(imageElement: HTMLImageElement): Promise<PoseKeypoints | null> {
  try {
    const landmarker = await initializePoseEstimation();
    if (!landmarker) throw new Error('Pose landmarker not initialized');

    const result: PoseLandmarkerResult = landmarker.detect(imageElement);

    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0] || landmarks;

    // MediaPipe landmark indices
    const indices = {
      right_shoulder: 12,
      right_hip: 24,
      right_knee: 26,
      right_ankle: 28,
      right_elbow: 14,
      right_wrist: 16,
      right_foot_index: 32,
    };

    const keypoints: PoseKeypoints = {
      right_shoulder: createPoint3D(worldLandmarks[indices.right_shoulder], landmarks[indices.right_shoulder]),
      right_hip: createPoint3D(worldLandmarks[indices.right_hip], landmarks[indices.right_hip]),
      right_knee: createPoint3D(worldLandmarks[indices.right_knee], landmarks[indices.right_knee]),
      right_ankle: createPoint3D(worldLandmarks[indices.right_ankle], landmarks[indices.right_ankle]),
      right_elbow: createPoint3D(worldLandmarks[indices.right_elbow], landmarks[indices.right_elbow]),
      right_wrist: createPoint3D(worldLandmarks[indices.right_wrist], landmarks[indices.right_wrist]),
      right_foot_index: createPoint3D(worldLandmarks[indices.right_foot_index], landmarks[indices.right_foot_index]),
    };

    return keypoints;
  } catch (error) {
    console.error('Error estimating pose:', error);
    throw error;
  }
}

function createPoint3D(worldLandmark: any, normalizedLandmark: any): Point3D {
  return {
    x: worldLandmark.x || normalizedLandmark.x,
    y: worldLandmark.y || normalizedLandmark.y,
    z: worldLandmark.z || normalizedLandmark.z || 0,
    confidence: normalizedLandmark.visibility || 1,
  };
}

export function drawPoseOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  keypoints: PoseKeypoints
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  // Draw connections
  const connections: [keyof PoseKeypoints, keyof PoseKeypoints][] = [
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['right_shoulder', 'right_hip'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle'],
    ['right_ankle', 'right_foot_index'],
  ];

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;

  connections.forEach(([start, end]) => {
    const startPoint = keypoints[start];
    const endPoint = keypoints[end];
    
    ctx.beginPath();
    ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
    ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
    ctx.stroke();
  });

  // Draw keypoints
  ctx.fillStyle = '#ff0000';
  Object.values(keypoints).forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, 2 * Math.PI);
    ctx.fill();
  });
}
