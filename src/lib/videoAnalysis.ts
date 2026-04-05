import { estimatePoseFromImage } from './poseEstimation';
import { calculateJointAngles, generateFeedback, JointAngles, FeedbackResult } from './poseAnalysis';
import { classifyTennisMovement, TennisMovement, MovementClassification } from './tennisMovementClassifier';

export interface FrameAnalysis {
  frameNumber: number;
  timestamp: number;
  angles: JointAngles;
  feedback: FeedbackResult[];
  movement: MovementClassification;
}

export interface ClassifiedFrame {
  frameIndex: number;
  image: HTMLImageElement;
  angles: JointAngles;
  movement: TennisMovement;
  confidence: number;
}

export interface ClassifiedFramesByMovement {
  'ready-position': ClassifiedFrame[];
  'serve-ready': ClassifiedFrame[];
  'groundstroke': ClassifiedFrame[];
  'serve': ClassifiedFrame[];
  'unknown': ClassifiedFrame[];
}

export interface VideoAnalysisResult {
  frames: FrameAnalysis[];
  averageRatings: JointRatings;
  overallScore: number;
  totalFrames: number;
  movementBreakdown: MovementBreakdown;
  referenceClassifiedFrames?: ClassifiedFramesByMovement;
}

export interface MovementBreakdown {
  'ready-position': MovementStats;
  'serve-ready': MovementStats;
  'groundstroke': MovementStats;
  'serve': MovementStats;
  'unknown': MovementStats;
}

export interface MovementStats {
  frameCount: number;
  averageRatings: JointRatings;
  overallScore: number;
}

export interface JointRatings {
  knee: JointRating;
  hip: JointRating;
  elbow: JointRating;
  ankle: JointRating;
  shoulder: JointRating;
  wrist: JointRating;
}

export interface JointRating {
  averageAngle: number;
  averageDifference: number;
  goodFrames: number;
  totalFrames: number;
  rating: number; // 0-100 score
  status: 'excellent' | 'good' | 'needs-improvement' | 'poor';
}

export async function extractFramesFromVideo(
  videoFile: File,
  framesPerSecond: number = 2
): Promise<HTMLImageElement[]> {
  return new Promise((resolve, reject) => {
    // Validate file first
    if (!videoFile || videoFile.size === 0) {
      console.error('Invalid video file provided');
      reject(new Error('Invalid video file'));
      return;
    }

    console.log(`Extracting frames from video: ${videoFile.name}, size: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`);

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const frames: HTMLImageElement[] = [];
    let objectUrl: string;
    
    try {
      objectUrl = URL.createObjectURL(videoFile);
    } catch (error) {
      console.error('Failed to create object URL:', error);
      reject(new Error('Failed to create video URL'));
      return;
    }
    
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    // Timeout for video loading
    const loadTimeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Video loading timeout - file may be too large or corrupted'));
    }, 30000); // 30 second timeout
    
    video.addEventListener('loadedmetadata', () => {
      clearTimeout(loadTimeout);
      console.log(`Video loaded: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`);
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const duration = video.duration;
      const interval = 1 / framesPerSecond;
      const totalFrames = Math.floor(duration * framesPerSecond);
      
      console.log(`Extracting ${totalFrames} frames at ${framesPerSecond} FPS...`);
      
      let currentFrame = 0;
      
      const captureFrame = () => {
        if (currentFrame >= totalFrames) {
          URL.revokeObjectURL(objectUrl);
          console.log(`Frame extraction complete: ${frames.length} frames`);
          resolve(frames);
          return;
        }
        
        const timestamp = currentFrame * interval;
        video.currentTime = timestamp;
      };
      
      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0);
        
        const img = new Image();
        img.src = canvas.toDataURL('image/jpeg', 0.9);
        img.onload = () => {
          frames.push(img);
          currentFrame++;
          captureFrame();
        };
        img.onerror = () => {
          console.warn(`Failed to create image for frame ${currentFrame}, skipping...`);
          currentFrame++;
          captureFrame();
        };
      });
      
      captureFrame();
    });
    
    video.addEventListener('error', (e) => {
      clearTimeout(loadTimeout);
      URL.revokeObjectURL(objectUrl);
      const errorMessage = video.error?.message || 'Unknown video error';
      console.error('Video loading error:', video.error, errorMessage);
      reject(new Error(`Error loading video: ${errorMessage}`));
    });
  });
}

/**
 * Step 1: Classify all frames by movement type using angle-based rules
 * This groups frames into ready-position, groundstroke, serve, or unknown
 */
export async function classifyFramesByMovement(
  frames: HTMLImageElement[],
  onProgress?: (current: number, total: number) => void
): Promise<ClassifiedFramesByMovement> {
  const classified: ClassifiedFramesByMovement = {
    'ready-position': [],
    'serve-ready': [],
    'groundstroke': [],
    'serve': [],
    'unknown': [],
  };

  console.log(`Classifying ${frames.length} frames by movement type...`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const keypoints = await estimatePoseFromImage(frames[i]);
      
      if (keypoints) {
        const angles = calculateJointAngles(keypoints, true);
        const classification = classifyTennisMovement(angles);
        
        classified[classification.movement].push({
          frameIndex: i,
          image: frames[i],
          angles,
          movement: classification.movement,
          confidence: classification.confidence,
        });
      }
      
      if (onProgress) {
        onProgress(i + 1, frames.length);
      }
    } catch (error) {
      console.error(`Error classifying frame ${i}:`, error);
    }
  }

  console.log(`Classification complete:
    Ready Position: ${classified['ready-position'].length} frames
    Serve Ready: ${classified['serve-ready'].length} frames
    Groundstroke: ${classified['groundstroke'].length} frames
    Serve: ${classified['serve'].length} frames
    Unknown: ${classified['unknown'].length} frames`);

  return classified;
}

/**
 * Step 2: Analyze grouped frames - compare user's classified frames against reference
 */
export async function analyzeVideoFrames(
  frames: HTMLImageElement[],
  referenceAngles: JointAngles,
  onProgress?: (current: number, total: number) => void,
  referenceFrames?: HTMLImageElement[] | null
): Promise<VideoAnalysisResult> {
  // Step 1: Classify user frames by movement
  const userClassified = await classifyFramesByMovement(frames, (current, total) => {
    if (onProgress) onProgress(current, total * 2); // First half of progress
  });

  // Step 2: Classify reference frames if provided
  let refAnglesByMovement: Record<TennisMovement, JointAngles> = {
    'ready-position': referenceAngles,
    'serve-ready': referenceAngles,
    'groundstroke': referenceAngles,
    'serve': referenceAngles,
    'unknown': referenceAngles,
  };

  let refClassified: ClassifiedFramesByMovement | undefined;
  
  if (referenceFrames && referenceFrames.length > 0) {
    console.log(`Classifying ${referenceFrames.length} reference video frames by movement...`);
    refClassified = await classifyFramesByMovement(referenceFrames);
    
    console.log('Reference frames classified:', {
      'ready-position': refClassified['ready-position'].length,
      'groundstroke': refClassified['groundstroke'].length,
      'serve': refClassified['serve'].length,
      'unknown': refClassified['unknown'].length,
    });
    
    // Calculate average angles per movement type from reference
    for (const movement of Object.keys(refClassified) as TennisMovement[]) {
      const movementFrames = refClassified[movement];
      if (movementFrames.length > 0) {
        refAnglesByMovement[movement] = averageAngles(movementFrames.map(f => f.angles));
        console.log(`Reference ${movement}: averaged angles from ${movementFrames.length} frames`, refAnglesByMovement[movement]);
      }
    }
  }

  // Step 3: Generate feedback for each user frame using movement-specific reference
  const frameAnalyses: FrameAnalysis[] = [];
  const allClassifiedFrames = [
    ...userClassified['ready-position'],
    ...userClassified['groundstroke'],
    ...userClassified['serve'],
    ...userClassified['unknown'],
  ].sort((a, b) => a.frameIndex - b.frameIndex);

  for (let i = 0; i < allClassifiedFrames.length; i++) {
    const frame = allClassifiedFrames[i];
    const refAngles = refAnglesByMovement[frame.movement];
    const feedback = generateFeedback(frame.angles, refAngles, 10, true);

    frameAnalyses.push({
      frameNumber: frame.frameIndex + 1,
      timestamp: frame.frameIndex / 2,
      angles: frame.angles,
      feedback,
      movement: {
        movement: frame.movement,
        confidence: frame.confidence,
        matchedRules: [],
      },
    });

    if (onProgress) {
      onProgress(frames.length + i + 1, frames.length * 2);
    }
  }

  // Calculate average ratings for each joint
  const averageRatings = calculateAverageRatings(frameAnalyses, referenceAngles);
  
  // Calculate overall score
  const overallScore = Object.values(averageRatings).reduce(
    (sum, rating) => sum + rating.rating,
    0
  ) / Object.keys(averageRatings).length;
  
  // Calculate movement breakdown
  const movementBreakdown = calculateMovementBreakdown(frameAnalyses, refAnglesByMovement);
  
  return {
    frames: frameAnalyses,
    averageRatings,
    overallScore,
    totalFrames: frameAnalyses.length,
    movementBreakdown,
    referenceClassifiedFrames: refClassified,
  };
}

function averageAngles(anglesArray: JointAngles[]): JointAngles {
  if (anglesArray.length === 0) {
    return { knee: 0, hip: 0, elbow: 0, ankle: 0 };
  }

  const sum = anglesArray.reduce((acc, angles) => ({
    knee: acc.knee + angles.knee,
    hip: acc.hip + angles.hip,
    elbow: acc.elbow + angles.elbow,
    ankle: acc.ankle + angles.ankle,
    shoulder: (acc.shoulder || 0) + (angles.shoulder || 0),
    wrist: (acc.wrist || 0) + (angles.wrist || 0),
  }), { knee: 0, hip: 0, elbow: 0, ankle: 0, shoulder: 0, wrist: 0 });

  const count = anglesArray.length;
  return {
    knee: sum.knee / count,
    hip: sum.hip / count,
    elbow: sum.elbow / count,
    ankle: sum.ankle / count,
    shoulder: sum.shoulder / count,
    wrist: sum.wrist / count,
  };
}

function calculateAverageRatings(
  frames: FrameAnalysis[],
  referenceAngles: JointAngles
): JointRatings {
  const joints: (keyof JointAngles)[] = ['knee', 'hip', 'elbow', 'ankle', 'shoulder', 'wrist'];
  const ratings: any = {};
  
  joints.forEach((joint) => {
    let totalAngle = 0;
    let totalDifference = 0;
    let goodFrames = 0;
    let validFrames = 0;
    
    frames.forEach((frame) => {
      const angle = frame.angles[joint];
      if (angle === undefined) return; // Skip if joint not tracked
      
      validFrames++;
      const refAngle = referenceAngles[joint] || 0;
      const difference = Math.abs(angle - refAngle);
      
      totalAngle += angle;
      totalDifference += difference;
      
      // More lenient: good frames within ±20° of reference (was ±10°)
      if (difference <= 20) goodFrames++;
    });
    
    if (validFrames === 0) return; // Skip if no valid frames
    
    const avgAngle = totalAngle / validFrames;
    const avgDifference = totalDifference / validFrames;
    
    // More lenient rating calculation:
    // - Start deducting only after 15° difference (was 5°)
    // - Use multiplier of 2 instead of 4
    // - Minimum rating of 40 instead of 0
    let rating = 100;
    if (avgDifference > 15) {
      rating = Math.max(40, 100 - (avgDifference - 15) * 2);
    }
    
    // More lenient status thresholds
    let status: 'excellent' | 'good' | 'needs-improvement' | 'poor';
    if (rating >= 85) status = 'excellent';
    else if (rating >= 70) status = 'good';
    else if (rating >= 50) status = 'needs-improvement';
    else status = 'poor';
    
    ratings[joint] = {
      averageAngle: avgAngle,
      averageDifference: avgDifference,
      goodFrames,
      totalFrames: validFrames,
      rating: Math.round(rating),
      status,
    };
  });
  
  return ratings as JointRatings;
}

function calculateMovementBreakdown(
  frames: FrameAnalysis[],
  refAnglesByMovement: Record<TennisMovement, JointAngles>
): MovementBreakdown {
  const movements: TennisMovement[] = ['ready-position', 'serve-ready', 'groundstroke', 'serve', 'unknown'];
  const breakdown: any = {};

  movements.forEach((movement) => {
    const movementFrames = frames.filter((f) => f.movement.movement === movement);
    
    if (movementFrames.length === 0) {
      breakdown[movement] = {
        frameCount: 0,
        averageRatings: {} as JointRatings,
        overallScore: 0,
      };
      return;
    }

    // Use movement-specific reference angles
    const averageRatings = calculateAverageRatings(movementFrames, refAnglesByMovement[movement]);
    const overallScore = Object.values(averageRatings).reduce(
      (sum, rating) => sum + rating.rating,
      0
    ) / Object.keys(averageRatings).length;

    breakdown[movement] = {
      frameCount: movementFrames.length,
      averageRatings,
      overallScore,
    };
  });

  return breakdown as MovementBreakdown;
}
