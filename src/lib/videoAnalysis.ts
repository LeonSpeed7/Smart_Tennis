import { estimatePoseFromImage } from './poseEstimation';
import { calculateJointAngles, generateFeedback, JointAngles, FeedbackResult } from './poseAnalysis';

export interface FrameAnalysis {
  frameNumber: number;
  timestamp: number;
  angles: JointAngles;
  feedback: FeedbackResult[];
  imageSrc?: string;
}

export interface VideoAnalysisResult {
  frames: FrameAnalysis[];
  averageRatings: JointRatings;
  overallScore: number;
  totalFrames: number;
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
  rating: number;
  status: 'excellent' | 'good' | 'needs-improvement' | 'poor';
}

export async function extractFramesFromVideo(
  videoFile: File,
  framesPerSecond: number = 2
): Promise<HTMLImageElement[]> {
  return new Promise((resolve, reject) => {
    if (!videoFile || videoFile.size === 0) {
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
      reject(new Error('Failed to create video URL'));
      return;
    }
    
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    const loadTimeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Video loading timeout - file may be too large or corrupted'));
    }, 30000);
    
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
    
    video.addEventListener('error', () => {
      clearTimeout(loadTimeout);
      URL.revokeObjectURL(objectUrl);
      const errorMessage = video.error?.message || 'Unknown video error';
      reject(new Error(`Error loading video: ${errorMessage}`));
    });
  });
}

/**
 * Analyze all frames from a rally video against reference angles.
 * No movement classification — just holistic frame-by-frame analysis.
 */
export async function analyzeVideoFrames(
  frames: HTMLImageElement[],
  referenceAngles: JointAngles,
  onProgress?: (current: number, total: number) => void
): Promise<VideoAnalysisResult> {
  const frameAnalyses: FrameAnalysis[] = [];

  console.log(`Analyzing ${frames.length} rally frames...`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const keypoints = await estimatePoseFromImage(frames[i]);
      
      if (keypoints) {
        const angles = calculateJointAngles(keypoints, true);
        const feedback = generateFeedback(angles, referenceAngles, 10, true);

        frameAnalyses.push({
          frameNumber: i + 1,
          timestamp: i / 2, // 2 FPS
          angles,
          feedback,
          imageSrc: frames[i].src,
        });
      }
      
      if (onProgress) {
        onProgress(i + 1, frames.length);
      }
    } catch (error) {
      console.error(`Error analyzing frame ${i}:`, error);
    }
  }

  console.log(`Analysis complete: ${frameAnalyses.length} frames with poses detected`);

  const averageRatings = calculateAverageRatings(frameAnalyses, referenceAngles);
  
  const ratingValues = Object.values(averageRatings).filter(r => r.totalFrames > 0);
  const overallScore = ratingValues.length > 0
    ? ratingValues.reduce((sum, r) => sum + r.rating, 0) / ratingValues.length
    : 0;
  
  return {
    frames: frameAnalyses,
    averageRatings,
    overallScore,
    totalFrames: frameAnalyses.length,
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
      if (angle === undefined) return;
      
      validFrames++;
      const refAngle = referenceAngles[joint] || 0;
      const difference = Math.abs(angle - refAngle);
      
      totalAngle += angle;
      totalDifference += difference;
      
      if (difference <= 20) goodFrames++;
    });
    
    if (validFrames === 0) {
      ratings[joint] = {
        averageAngle: 0,
        averageDifference: 0,
        goodFrames: 0,
        totalFrames: 0,
        rating: 0,
        status: 'poor' as const,
      };
      return;
    }
    
    const avgAngle = totalAngle / validFrames;
    const avgDifference = totalDifference / validFrames;
    
    let rating = 100;
    if (avgDifference > 15) {
      rating = Math.max(40, 100 - (avgDifference - 15) * 2);
    }
    
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
