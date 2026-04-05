import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { CameraCapture } from '@/components/CameraCapture';
import { ImageUpload } from '@/components/ImageUpload';
import { VideoUpload } from '@/components/VideoUpload';
import { FeedbackDisplay } from '@/components/FeedbackDisplay';
import { VideoAnalysisResults } from '@/components/VideoAnalysisResults';
import { ReferencePoseUpload } from '@/components/ReferencePoseUpload';
import AICoachingDisplay from '@/components/AICoachingDisplay';
import QuotaDisplay from '@/components/QuotaDisplay';
import AuthStatus from '@/components/AuthStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Camera, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { estimatePoseFromImage, drawPoseOnCanvas } from '@/lib/poseEstimation';
import { calculateJointAngles, generateFeedback, DEFAULT_REFERENCE_ANGLES, FeedbackResult, JointAngles } from '@/lib/poseAnalysis';
import { extractFramesFromVideo, analyzeVideoFrames, VideoAnalysisResult } from '@/lib/videoAnalysis';
export default function Index() {
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceAngles, setReferenceAngles] = useState<JointAngles | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackResult[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [poseCanvas, setPoseCanvas] = useState<string | null>(null);
  const [aiCoaching, setAiCoaching] = useState<string | null>(null);
  const [isLoadingCoaching, setIsLoadingCoaching] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userAngles, setUserAngles] = useState<JointAngles | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<{
    remaining: number;
    total: number;
  } | null>(null);
  const [videoAnalysisResult, setVideoAnalysisResult] = useState<VideoAnalysisResult | null>(null);
  const [classifiedFrames, setClassifiedFrames] = useState<any>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState({
    current: 0,
    total: 0
  });
  const {
    toast
  } = useToast();
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchQuotaInfo(session.user.id);
      }
    });

    // Listen for auth changes
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchQuotaInfo(session.user.id);
      } else {
        setQuotaInfo(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  const fetchQuotaInfo = async (userId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const {
        data,
        error
      } = await supabase.from('ai_usage_tracking').select('request_count').eq('user_id', userId).eq('usage_date', today).single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching quota:', error);
        return;
      }
      const used = data?.request_count || 0;
      const dailyQuota = 10;
      setQuotaInfo({
        remaining: dailyQuota - used,
        total: dailyQuota
      });
    } catch (error) {
      console.error('Error fetching quota:', error);
    }
  };
  const handleReferenceSet = async (data: string, _angles: JointAngles, videoFile?: File) => {
    if (!data) {
      // Reset reference
      setReferenceImage(null);
      setReferenceAngles(null);
      setReferenceVideo(null);
      return;
    }
    setIsAnalyzing(true);
    try {
      const img = new Image();
      img.src = data;
      await new Promise(resolve => {
        img.onload = resolve;
      });
      const keypoints = await estimatePoseFromImage(img);
      if (!keypoints) {
        toast({
          title: 'No Pose Detected',
          description: 'Could not detect a person in the reference image. Please try again.',
          variant: 'destructive'
        });
        setIsAnalyzing(false);
        return;
      }

      // Draw pose on canvas for reference
      const canvas = document.createElement('canvas');
      drawPoseOnCanvas(canvas, img, keypoints);
      const referenceCanvas = canvas.toDataURL();

      // Calculate reference angles using your algorithm
      const angles = calculateJointAngles(keypoints);
      setReferenceImage(referenceCanvas);
      setReferenceAngles(angles);
      setReferenceVideo(videoFile || null);
      toast({
        title: 'Reference Pose Set',
        description: videoFile ? 'Reference video loaded for frame-by-frame comparison.' : 'Your reference angles have been calculated.'
      });
    } catch (error) {
      console.error('Error analyzing reference pose:', error);
      toast({
        title: 'Analysis Error',
        description: 'Failed to analyze reference pose. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  const handleImageCapture = async (data: string) => {
    if (!referenceAngles) {
      toast({
        title: 'Set Reference First',
        description: 'Please set a reference pose before analyzing your pose.',
        variant: 'destructive'
      });
      return;
    }
    setImageData(data);
    setFeedback(null);
    setPoseCanvas(null);
    setAiCoaching(null); // Clear previous AI coaching
    setVideoAnalysisResult(null); // Clear video results
    await analyzePose(data);
  };
  const analyzePose = async (data: string) => {
    setIsAnalyzing(true);
    try {
      const img = new Image();
      img.src = data;
      await new Promise(resolve => {
        img.onload = resolve;
      });
      const keypoints = await estimatePoseFromImage(img);
      if (!keypoints) {
        toast({
          title: 'No Pose Detected',
          description: 'Could not detect a person in the image. Please try again with a clearer photo.',
          variant: 'destructive'
        });
        return;
      }

      // Draw pose on canvas
      const canvas = document.createElement('canvas');
      drawPoseOnCanvas(canvas, img, keypoints);
      setPoseCanvas(canvas.toDataURL());

      // Calculate angles and generate feedback using your algorithm
      const userAngles = calculateJointAngles(keypoints);
      const results = generateFeedback(userAngles, referenceAngles || DEFAULT_REFERENCE_ANGLES);
      setFeedback(results);
      setUserAngles(userAngles);

      // Get AI coaching
      await getAICoaching(results, userAngles, referenceAngles || DEFAULT_REFERENCE_ANGLES);

      // Save to database
      await savePoseAnalysis(referenceAngles || DEFAULT_REFERENCE_ANGLES, userAngles, results, canvas.toDataURL());
      toast({
        title: 'Analysis Complete',
        description: 'Your tennis ready position has been analyzed.'
      });
    } catch (error) {
      console.error('Error analyzing pose:', error);
      toast({
        title: 'Analysis Error',
        description: 'Failed to analyze pose. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  const getAICoaching = async (feedback: FeedbackResult[], userAngles: JointAngles, referenceAngles: JointAngles, videoAnalysis?: VideoAnalysisResult) => {
    // Require authentication for AI coaching
    if (!user?.id) {
      toast({
        title: 'Sign In Required',
        description: 'Please sign in to access AI coaching features.',
        variant: 'destructive'
      });
      return null;
    }
    setIsLoadingCoaching(true);
    setAiCoaching(null);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('ai-pose-coach', {
        body: {
          feedback,
          userAngles,
          referenceAngles,
          videoAnalysis: videoAnalysis ? {
            averageRatings: videoAnalysis.averageRatings,
            overallScore: videoAnalysis.overallScore,
            totalFrames: videoAnalysis.totalFrames
          } : undefined
        }
      });
      if (error) {
        console.error('AI coaching error:', error);
        // Check for quota exceeded error
        if (error.message?.includes('Daily AI coaching limit reached') || error.message?.includes('quota')) {
          toast({
            title: 'Daily Limit Reached',
            description: 'You\'ve used all 10 AI coaching requests for today. Try again tomorrow!',
            variant: 'destructive'
          });
          return null;
        }
        throw error;
      }
      setAiCoaching(data.coaching);

      // Update quota info from response
      if (data.remainingQuota !== undefined && data.dailyQuota !== undefined) {
        setQuotaInfo({
          remaining: data.remainingQuota,
          total: data.dailyQuota
        });
      }
      return data.coaching;
    } catch (error: any) {
      console.error("Error getting AI coaching:", error);
      toast({
        title: 'AI Coaching Error',
        description: error.message || 'Could not generate coaching feedback',
        variant: 'destructive'
      });
      return null;
    } finally {
      setIsLoadingCoaching(false);
    }
  };
  const savePoseAnalysis = async (referenceAngles: JointAngles, userAngles: JointAngles, feedback: FeedbackResult[], imageData: string) => {
    // Only authenticated users can save to database
    if (!user?.id) {
      // Store guest data in localStorage instead
      const guestData = {
        reference_angles: referenceAngles,
        user_angles: userAngles,
        feedback: feedback,
        ai_coaching: aiCoaching,
        image_data: imageData,
        created_at: new Date().toISOString()
      };
      localStorage.setItem('guest_pose_analysis', JSON.stringify(guestData));
      toast({
        title: 'Analysis Saved Locally',
        description: 'Sign in to save your analysis history permanently.'
      });
      return;
    }
    try {
      const insertData: Database['public']['Tables']['pose_analyses']['Insert'] = {
        user_id: user.id,
        reference_angles: referenceAngles as unknown as Database['public']['Tables']['pose_analyses']['Insert']['reference_angles'],
        user_angles: userAngles as unknown as Database['public']['Tables']['pose_analyses']['Insert']['user_angles'],
        feedback: feedback as unknown as Database['public']['Tables']['pose_analyses']['Insert']['feedback'],
        ai_coaching: aiCoaching,
        image_data: imageData
      };
      const {
        error
      } = await supabase.from('pose_analyses').insert(insertData);
      if (error) throw error;
      toast({
        title: 'Analysis Saved',
        description: 'Your pose analysis has been saved to your history.'
      });
    } catch (error: any) {
      console.error("Error saving analysis:", error);
      toast({
        title: 'Save Failed',
        description: 'Could not save your analysis. Please try again.',
        variant: 'destructive'
      });
    }
  };
  const resetAnalysis = () => {
    setImageData(null);
    setFeedback(null);
    setPoseCanvas(null);
    setAiCoaching(null);
    setUserAngles(null);
    setVideoAnalysisResult(null);
    setClassifiedFrames(null);
  };
  const handleVideoSelect = async (videoFile: File) => {
    if (!referenceAngles) {
      toast({
        title: 'Reference Pose Required',
        description: 'Please set a reference pose first before analyzing video.',
        variant: 'destructive'
      });
      return;
    }
    setIsProcessingVideo(true);
    setVideoAnalysisResult(null);
    setClassifiedFrames(null);
    setFeedback(null);
    setAiCoaching(null);
    try {
      toast({
        title: 'Processing Rally Video',
        description: 'Extracting frames from your rally video...'
      });

      const userFrames = await extractFramesFromVideo(videoFile, 2);
      if (userFrames.length === 0) {
        throw new Error('No frames could be extracted from the video');
      }
      console.log(`Rally video: extracted ${userFrames.length} frames`);

      toast({
        title: 'Analyzing Frames',
        description: `Analyzing ${userFrames.length} frames against reference pose...`
      });

      const results = await analyzeVideoFrames(userFrames, referenceAngles, (current, total) => {
        setVideoProgress({ current, total });
      });
      setVideoAnalysisResult(results);

      if (results.frames.length > 0) {
        setFeedback(results.frames[0].feedback);
        setUserAngles(results.frames[0].angles);
      }

      await getAICoaching(
        results.frames[0]?.feedback || [],
        results.frames[0]?.angles || referenceAngles,
        referenceAngles,
        results
      );
      toast({
        title: 'Rally Analysis Complete',
        description: `Analyzed ${results.totalFrames} frames from your rally.`
      });
    } catch (error) {
      console.error('Error processing video:', error);
      toast({
        title: 'Video Processing Error',
        description: 'Failed to process video. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessingVideo(false);
      setVideoProgress({ current: 0, total: 0 });
    }
  };
  return <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1" />
            <div className="text-center">
              <h1 className="font-bold mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent text-3xl">SmartTennis: Nearly-Instant Tennis Feedback</h1>
              <p className="text-muted-foreground">
                Get instant feedback on your tennis ready position using AI pose estimation
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <AuthStatus />
            </div>
          </div>
        </header>

        <QuotaDisplay quotaInfo={quotaInfo} user={user} />

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ReferencePoseUpload onReferenceSet={handleReferenceSet} referenceImage={referenceImage} referenceAngles={referenceAngles} />

            {referenceAngles && <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5" />
                    Image 2 - Your Pose
                  </CardTitle>
                  <CardDescription>
                    Upload or capture the second image to compare joint angles against Image 1
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="camera" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="camera">Camera</TabsTrigger>
                      <TabsTrigger value="upload">Upload</TabsTrigger>
                      <TabsTrigger value="video">Video</TabsTrigger>
                    </TabsList>
                    <TabsContent value="camera" className="mt-4">
                      <CameraCapture onCapture={handleImageCapture} />
                    </TabsContent>
                    <TabsContent value="upload" className="mt-4">
                      <ImageUpload onImageSelect={handleImageCapture} />
                    </TabsContent>
                    <TabsContent value="video" className="mt-4">
                      <VideoUpload onVideoSelect={handleVideoSelect} isProcessing={isProcessingVideo} />
                      {isProcessingVideo && videoProgress.total > 0 && <div className="mt-4 p-4 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground mb-2">
                            Analyzing frame {videoProgress.current} of {videoProgress.total}
                          </p>
                          <div className="w-full bg-background rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{
                        width: `${videoProgress.current / videoProgress.total * 100}%`
                      }} />
                          </div>
                        </div>}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>}

            {(imageData || poseCanvas) && <Card>
                <CardHeader>
                  <CardTitle>Your Pose</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <img src={poseCanvas || imageData || ''} alt="Captured pose" className="w-full rounded-lg border" />
                    {isAnalyzing && <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Analyzing your pose...</span>
                      </div>}
                    <Button onClick={resetAnalysis} variant="outline" className="w-full">
                      Try Again
                    </Button>
                  </div>
                </CardContent>
              </Card>}
          </div>

          <div>
            {videoAnalysisResult ? <div className="space-y-6">
                <VideoAnalysisResults results={videoAnalysisResult} classifiedFrames={classifiedFrames} />
                <AICoachingDisplay coaching={aiCoaching} loading={isLoadingCoaching} quotaInfo={quotaInfo} />
                {!user && !isLoadingCoaching && !aiCoaching && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-4">
                      <p className="text-sm text-muted-foreground text-center">
                        <strong>Sign in</strong> to get personalized AI coaching feedback
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div> : feedback ? <div className="space-y-6">
                <FeedbackDisplay feedback={feedback} />
                <AICoachingDisplay coaching={aiCoaching} loading={isLoadingCoaching} quotaInfo={quotaInfo} />
                {!user && !isLoadingCoaching && !aiCoaching && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-4">
                      <p className="text-sm text-muted-foreground text-center">
                        <strong>Sign in</strong> to get personalized AI coaching feedback
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div> : <Card>
                <CardHeader>
                  <CardTitle>How It Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">Two-Step Process:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>
                        <strong className="text-foreground">Set Reference Pose:</strong> Upload or capture
                        an image of your ideal tennis ready position (or a professional's form)
                      </li>
                      <li>
                        <strong className="text-foreground">Analyze Your Pose:</strong> Take a photo of yourself
                        and get instant feedback comparing your joint angles to the reference
                      </li>
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">Algorithm Details:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Calculates Euclidean distances between joint keypoints</li>
                      <li>Uses law of cosines to determine joint angles</li>
                      <li>Analyzes knee, hip, elbow, and ankle angles</li>
                      <li>Acceptable range: ±10° from reference angles</li>
                    </ul>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm">
                      <strong>Tip:</strong> Ensure your full body is visible in the frame
                      with good lighting and a clear background for best results.
                    </p>
                  </div>
                </CardContent>
              </Card>}
          </div>
        </div>
      </div>
    </div>;
}