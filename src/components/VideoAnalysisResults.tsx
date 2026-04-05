import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoAnalysisResult, MovementStats, ClassifiedFramesByMovement } from '@/lib/videoAnalysis';
import { getMovementLabel, TennisMovement } from '@/lib/tennisMovementClassifier';
import { TrendingUp, TrendingDown, Minus, ExternalLink, Eye } from 'lucide-react';
import { ReferenceFramesDialog } from './ReferenceFramesDialog';

interface VideoAnalysisResultsProps {
  results: VideoAnalysisResult;
  classifiedFrames?: ClassifiedFramesByMovement | null;
}

export function VideoAnalysisResults({ results, classifiedFrames }: VideoAnalysisResultsProps) {
  const navigate = useNavigate();
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400';
      case 'good':
        return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400';
      case 'needs-improvement':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'poor':
        return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleViewFrames = (movement: TennisMovement) => {
    if (!classifiedFrames) return;
    
    const frames = classifiedFrames[movement].map(f => ({
      frameIndex: f.frameIndex,
      imageSrc: f.image.src,
      angles: f.angles,
      confidence: f.confidence,
    }));

    navigate('/movement-frames', {
      state: { movement, frames },
    });
  };

  const renderMovementStats = (stats: MovementStats, movement: string) => {
    if (stats.frameCount === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No {getMovementLabel(movement as any)} frames detected
        </div>
      );
    }

    const joints = Object.entries(stats.averageRatings);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Movement Score:</span>
            <Badge variant="outline" className="text-lg">
              {Math.round(stats.overallScore)}/100
            </Badge>
            <span className="text-xs">({stats.frameCount} frames)</span>
          </div>
          {classifiedFrames && stats.frameCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewFrames(movement as TennisMovement)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Frames
            </Button>
          )}
        </div>

        {joints.map(([jointName, rating]) => (
          <div key={jointName} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold capitalize">{jointName}</h4>
                <Badge className={getStatusColor(rating.status)}>
                  {rating.status.replace('-', ' ')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {rating.rating >= 90 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : rating.rating >= 75 ? (
                  <Minus className="h-4 w-4 text-blue-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className="text-lg font-bold">{rating.rating}/100</span>
              </div>
            </div>
            
            <Progress 
              value={rating.rating} 
              className="h-2"
            />
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Average Angle:</span>
                <span className="text-lg font-bold text-primary">{rating.averageAngle.toFixed(1)}°</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  Avg Difference: ±{rating.averageDifference.toFixed(1)}°
                </div>
                <div>
                  Frames Within Range: {rating.goodFrames}/{rating.totalFrames}
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Accuracy Rate:</span> {((rating.goodFrames / rating.totalFrames) * 100).toFixed(0)}% 
                <span className="text-muted-foreground/70"> (frames within ±10° of reference)</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const hasReferenceFrames = results.referenceClassifiedFrames && 
    Object.values(results.referenceClassifiedFrames).some(arr => arr.length > 0);

  return (
    <>
      <Card className="border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Video Analysis Results</CardTitle>
            {hasReferenceFrames && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReferenceDialog(true)}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Reference Frames
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Overall Score:</span>
            <Badge variant="outline" className="text-lg">
              {Math.round(results.overallScore)}/100
            </Badge>
            <span className="text-xs">({results.totalFrames} frames analyzed)</span>
          </div>
        </CardHeader>
        <CardContent>
        <Tabs defaultValue="ready-position" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ready-position" className="text-xs">
              Ready ({results.movementBreakdown['ready-position'].frameCount})
            </TabsTrigger>
            <TabsTrigger value="serve-ready" className="text-xs">
              Serve Ready ({results.movementBreakdown['serve-ready'].frameCount})
            </TabsTrigger>
            <TabsTrigger value="groundstroke" className="text-xs">
              Groundstroke ({results.movementBreakdown['groundstroke'].frameCount})
            </TabsTrigger>
            <TabsTrigger value="serve" className="text-xs">
              Serve ({results.movementBreakdown['serve'].frameCount})
            </TabsTrigger>
            <TabsTrigger value="unknown" className="text-xs">
              Unknown ({results.movementBreakdown['unknown'].frameCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready-position" className="space-y-4 mt-4">
            {renderMovementStats(results.movementBreakdown['ready-position'], 'ready-position')}
          </TabsContent>

          <TabsContent value="serve-ready" className="space-y-4 mt-4">
            {renderMovementStats(results.movementBreakdown['serve-ready'], 'serve-ready')}
          </TabsContent>

          <TabsContent value="groundstroke" className="space-y-4 mt-4">
            {renderMovementStats(results.movementBreakdown['groundstroke'], 'groundstroke')}
          </TabsContent>

          <TabsContent value="serve" className="space-y-4 mt-4">
            {renderMovementStats(results.movementBreakdown['serve'], 'serve')}
          </TabsContent>

          <TabsContent value="unknown" className="space-y-4 mt-4">
            {renderMovementStats(results.movementBreakdown['unknown'], 'unknown')}
          </TabsContent>
        </Tabs>
        </CardContent>
      </Card>

      <ReferenceFramesDialog
        open={showReferenceDialog}
        onOpenChange={setShowReferenceDialog}
        classifiedFrames={results.referenceClassifiedFrames || null}
      />
    </>
  );
}
