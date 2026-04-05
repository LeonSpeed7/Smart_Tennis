import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/components/ImageUpload';
import { CameraCapture } from '@/components/CameraCapture';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, Image, Video } from 'lucide-react';
import { JointAngles } from '@/lib/poseAnalysis';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import defaultReferenceImage from '@/assets/default-reference-pose.png';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

// To add a default reference video:
// 1. Add your video file to src/assets/ (e.g., default-reference-pose.mp4)
// 2. Uncomment the line below and update the filename:
// import defaultReferenceVideo from '@/assets/default-reference-pose.mp4';

// Set to null if no default video is available
const defaultReferenceVideo = null;

type DefaultReferenceType = 'image' | 'video' | 'none';

interface ReferencePoseUploadProps {
  onReferenceSet: (imageData: string, angles: JointAngles, videoFile?: File) => void;
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
  const [defaultReferenceType, setDefaultReferenceType] = useState<DefaultReferenceType>(
    defaultReferenceVideo ? 'video' : 'image'
  );
  const [hasLoadedDefault, setHasLoadedDefault] = useState(false);
  const { toast } = useToast();

  // Load default reference only on initial mount
  useEffect(() => {
    if (!hasLoadedDefault && !referenceImage && !referenceAngles && defaultReferenceType !== 'none') {
      loadDefaultReference(defaultReferenceType);
      setHasLoadedDefault(true);
    }
  }, []); // Only run once on mount

  const loadDefaultReference = async (type: DefaultReferenceType) => {
    if (type === 'video' && defaultReferenceVideo) {
      // Load default video and extract first frame
      try {
        const videoBlob = await fetch(defaultReferenceVideo).then(res => res.blob());
        const videoFile = new File([videoBlob], 'default-reference-video.mp4', { type: 'video/mp4' });
        await handleVideoSelect(videoFile);
      } catch (error) {
        console.error('Error loading default video:', error);
        toast({
          title: 'Error',
          description: 'Failed to load default video. Please select manually.',
          variant: 'destructive',
        });
      }
    } else if (type === 'image') {
      // Load default image
      try {
        const blob = await fetch(defaultReferenceImage).then(res => res.blob());
        const reader = new FileReader();
        reader.onloadend = () => {
          onReferenceSet(reader.result as string, {} as JointAngles);
        };
        reader.readAsDataURL(blob);
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
    
    // Set video preview
    setSelectedVideo(URL.createObjectURL(videoFile));
    
    try {
      // Extract first frame from video
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      const objectUrl = URL.createObjectURL(videoFile);
      video.src = objectUrl;
      video.muted = true;
      
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          video.currentTime = 0.5; // Get frame at 0.5 seconds
        });
        
        video.addEventListener('seeked', () => {
          ctx.drawImage(video, 0, 0);
          URL.revokeObjectURL(objectUrl);
          
          const imageData = canvas.toDataURL('image/jpeg', 0.9);
          onReferenceSet(imageData, {} as JointAngles, videoFile);
          resolve(null);
        });
        
        video.addEventListener('error', () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Error loading video'));
        });
      });

      toast({
        title: 'Video Processed',
        description: 'Reference video loaded for frame-by-frame comparison',
      });
    } catch (error) {
      console.error('Error processing video:', error);
      toast({
        title: 'Video Processing Error',
        description: 'Failed to extract frame from video. Please try again.',
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
                First frame will be used as reference
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
