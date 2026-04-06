import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/components/ImageUpload';
import { CameraCapture } from '@/components/CameraCapture';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, Image, Video } from 'lucide-react';
import { JointAngles } from '@/lib/poseAnalysis';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { estimatePoseFromImage } from '@/lib/poseEstimation';
import defaultReferenceImage from '@/assets/default-reference-pose.png';
import defaultReferenceVideoFrame from '@/assets/default-reference-rally-frame.jpg';
const defaultReferenceVideo = '/default-reference-rally.mp4';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type DefaultReferenceType = 'image' | 'video' | 'none';

type VideoCropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const VIDEO_FRAME_SEARCH_REGIONS: VideoCropRegion[] = [
  { x: 0, y: 0, width: 1, height: 1 },
  { x: 0, y: 0, width: 0.62, height: 1 },
  { x: 0.38, y: 0, width: 0.62, height: 1 },
  { x: 0.18, y: 0, width: 0.64, height: 1 },
];

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load frame image'));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Could not read asset data'));
    };
    reader.onerror = () => reject(new Error('Could not read asset data'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAssetAsDataUrl(src: string): Promise<string> {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Failed to load asset: ${src}`);
  }

  return blobToDataUrl(await response.blob());
}

function getVideoSearchTimestamps(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0.6) {
    return [0];
  }

  const start = Math.min(0.35, duration * 0.1);
  const end = Math.max(start, duration - 0.35);
  const sampleCount = Math.min(8, Math.max(4, Math.floor(duration)));

  return Array.from({ length: sampleCount }, (_, index) => {
    if (sampleCount === 1) {
      return duration / 2;
    }

    return start + (index * (end - start)) / (sampleCount - 1);
  }).map((timestamp) => Number(timestamp.toFixed(2)));
}

function seekVideoToTimestamp(video: HTMLVideoElement, timestamp: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const boundedTimestamp = Math.min(Math.max(timestamp, 0), Math.max(video.duration - 0.05, 0));

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Failed to seek video frame'));
    };

    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = boundedTimestamp;
  });
}

async function findReferenceFrameFromVideo(videoFile: File): Promise<string> {
  const video = document.createElement('video');
  const sourceCanvas = document.createElement('canvas');
  const cropCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');
  const cropContext = cropCanvas.getContext('2d');

  if (!sourceContext || !cropContext) {
    throw new Error('Could not process video frames');
  }

  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Error loading video'));
      };

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleError);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      video.addEventListener('error', handleError, { once: true });
    });

    sourceCanvas.width = video.videoWidth;
    sourceCanvas.height = video.videoHeight;

    const timestamps = getVideoSearchTimestamps(video.duration);

    for (const timestamp of timestamps) {
      await seekVideoToTimestamp(video, timestamp);
      sourceContext.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

      for (const region of VIDEO_FRAME_SEARCH_REGIONS) {
        const cropX = Math.round(sourceCanvas.width * region.x);
        const cropY = Math.round(sourceCanvas.height * region.y);
        const cropWidth = Math.max(1, Math.round(sourceCanvas.width * region.width));
        const cropHeight = Math.max(1, Math.round(sourceCanvas.height * region.height));

        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        cropContext.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const imageData = cropCanvas.toDataURL('image/jpeg', 0.92);
        const frameImage = await loadImageElement(imageData);
        const keypoints = await estimatePoseFromImage(frameImage);

        if (keypoints) {
          return imageData;
        }
      }
    }

    throw new Error('Could not detect a player pose in the reference video');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface ReferencePoseUploadProps {
  onReferenceSet: (imageData: string, angles: JointAngles, videoFile?: File, skipPoseDetection?: boolean) => void;
  referenceImage: string | null;
  referenceAngles: JointAngles | null;
}

export function ReferencePoseUpload({
  onReferenceSet,
  referenceImage,
  referenceAngles,
}: ReferencePoseUploadProps) {
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [defaultReferenceType, setDefaultReferenceType] = useState<DefaultReferenceType>('image');
  const [hasLoadedDefault, setHasLoadedDefault] = useState(false);
  const { toast } = useToast();

  const updateSelectedVideo = (nextUrl: string | null) => {
    setSelectedVideo((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }

      return nextUrl;
    });
  };

  useEffect(() => {
    return () => {
      if (selectedVideo?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedVideo);
      }
    };
  }, [selectedVideo]);

  // Load default reference only on initial mount
  useEffect(() => {
    if (!hasLoadedDefault && !referenceImage && !referenceAngles && defaultReferenceType !== 'none') {
      loadDefaultReference(defaultReferenceType);
      setHasLoadedDefault(true);
    }
  }, []); // Only run once on mount

  const loadDefaultReference = async (type: DefaultReferenceType) => {
    if (type === 'video' && defaultReferenceVideo) {
      setIsProcessingVideo(true);

      try {
        updateSelectedVideo(defaultReferenceVideo);
        const imageData = await fetchAssetAsDataUrl(defaultReferenceVideoFrame);
        onReferenceSet(imageData, {} as JointAngles, undefined, true);
      } catch (error) {
        console.error('Error loading default video:', error);
        toast({
          title: 'Error',
          description: 'Failed to load the built-in rally reference. Please select manually.',
          variant: 'destructive',
        });
      } finally {
        setIsProcessingVideo(false);
      }
    } else if (type === 'image') {
      try {
        updateSelectedVideo(null);
        const imageData = await fetchAssetAsDataUrl(defaultReferenceImage);
        onReferenceSet(imageData, {} as JointAngles);
      } catch (error) {
        console.error('Error loading default image:', error);
        toast({
          title: 'Error',
          description: 'Failed to load default image. Please select manually.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleVideoSelect = async (videoFile: File) => {
    setIsProcessingVideo(true);

    const previewUrl = URL.createObjectURL(videoFile);
    updateSelectedVideo(previewUrl);
    
    try {
      const imageData = await findReferenceFrameFromVideo(videoFile);
      onReferenceSet(imageData, {} as JointAngles, videoFile);

      toast({
        title: 'Video Processed',
        description: 'Reference rally loaded with a detected player frame for comparison.',
      });
    } catch (error) {
      console.error('Error processing video:', error);
      toast({
        title: 'Video Processing Error',
        description: 'Could not detect a player in this rally video. Try a clearer side-view clip.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingVideo(false);
    }
  };
  if (referenceImage && referenceAngles) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Reference Pose Set
          </CardTitle>
          <CardDescription>Your reference pose has been analyzed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <img
            src={referenceImage}
            alt="Reference pose"
            className="w-full rounded-lg border"
          />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 rounded bg-muted">
              <div className="font-semibold">Knee</div>
              <div className="text-muted-foreground">{referenceAngles.knee.toFixed(1)}°</div>
            </div>
            <div className="p-2 rounded bg-muted">
              <div className="font-semibold">Hip</div>
              <div className="text-muted-foreground">{referenceAngles.hip.toFixed(1)}°</div>
            </div>
            <div className="p-2 rounded bg-muted">
              <div className="font-semibold">Elbow</div>
              <div className="text-muted-foreground">{referenceAngles.elbow.toFixed(1)}°</div>
            </div>
            <div className="p-2 rounded bg-muted">
              <div className="font-semibold">Ankle</div>
              <div className="text-muted-foreground">{referenceAngles.ankle.toFixed(1)}°</div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onReferenceSet('', {} as JointAngles)}
          >
            Change Reference Pose
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Image 1 - Reference Pose
        </CardTitle>
        <CardDescription>
          Upload any image or video to use as reference. Compare any two positions - just upload what you want to compare against.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Default Reference Selector */}
        {(defaultReferenceVideo || defaultReferenceImage) && (
          <div className="p-4 border rounded-lg bg-muted/30">
            <Label className="text-sm font-semibold mb-3 block">
              Load Default Reference
            </Label>
            <div className="flex gap-2">
              <RadioGroup
                value={defaultReferenceType}
                onValueChange={(value: DefaultReferenceType) => setDefaultReferenceType(value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="image" id="default-image" />
                  <Label htmlFor="default-image" className="flex items-center gap-2 cursor-pointer">
                    <Image className="w-4 h-4" />
                    Default Image
                  </Label>
                </div>
                {defaultReferenceVideo && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="video" id="default-video" />
                    <Label htmlFor="default-video" className="flex items-center gap-2 cursor-pointer">
                      <Video className="w-4 h-4" />
                      Default Video
                    </Label>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="no-default" />
                  <Label htmlFor="no-default" className="cursor-pointer">
                    None
                  </Label>
                </div>
              </RadioGroup>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (defaultReferenceType !== 'none') {
                    onReferenceSet('', {} as JointAngles);
                    setHasLoadedDefault(false);
                    loadDefaultReference(defaultReferenceType);
                    setHasLoadedDefault(true);
                  }
                }}
                disabled={defaultReferenceType === 'none'}
              >
                Load
              </Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Image</TabsTrigger>
            <TabsTrigger value="video">Video</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <ImageUpload onImageSelect={(data) => onReferenceSet(data, {} as JointAngles)} />
          </TabsContent>
          <TabsContent value="video" className="mt-4">
            <div className="space-y-4">
              {selectedVideo && (
                <div className="rounded-lg overflow-hidden bg-muted">
                  <video
                    src={selectedVideo}
                    controls
                    className="w-full h-auto"
                  />
                </div>
              )}
              
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVideoSelect(file);
                }}
                className="hidden"
                id="video-reference-upload"
              />
              <label htmlFor="video-reference-upload">
                <Button
                  variant="outline"
                  className="w-full cursor-pointer"
                  disabled={isProcessingVideo}
                  asChild
                >
                  <span>
                    {isProcessingVideo ? (
                      <>
                        <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
                        Processing Video...
                      </>
                    ) : (
                      <>
                        <Image className="mr-2 h-4 w-4" />
                        {selectedVideo ? 'Select Different Video' : 'Select Reference Video'}
                      </>
                    )}
                  </span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground text-center">
                We’ll scan the clip for a clear player frame to use as the reference
              </p>
            </div>
          </TabsContent>
          <TabsContent value="camera" className="mt-4">
            <CameraCapture onCapture={(data) => onReferenceSet(data, {} as JointAngles)} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
