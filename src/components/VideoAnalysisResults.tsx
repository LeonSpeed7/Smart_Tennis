import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { VideoAnalysisResult, JointRating } from '@/lib/videoAnalysis';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface VideoAnalysisResultsProps {
  results: VideoAnalysisResult;
}

export function VideoAnalysisResults({ results }: VideoAnalysisResultsProps) {
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

  const joints = Object.entries(results.averageRatings).filter(
    ([, rating]) => (rating as JointRating).totalFrames > 0
  ) as [string, JointRating][];

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle>Rally Analysis Results</CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Overall Score:</span>
          <Badge variant="outline" className="text-lg">
            {Math.round(results.overallScore)}/100
          </Badge>
          <span className="text-xs">({results.totalFrames} frames analyzed)</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
            
            <Progress value={rating.rating} className="h-2" />
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Average Angle:</span>
                <span className="text-lg font-bold text-primary">{rating.averageAngle.toFixed(1)}°</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Avg Difference: ±{rating.averageDifference.toFixed(1)}°</div>
                <div>Frames Within Range: {rating.goodFrames}/{rating.totalFrames}</div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Accuracy Rate:</span>{' '}
                {((rating.goodFrames / rating.totalFrames) * 100).toFixed(0)}%
                <span className="text-muted-foreground/70"> (frames within ±20° of reference)</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
