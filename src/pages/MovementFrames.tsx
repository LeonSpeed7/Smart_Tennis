import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { getMovementLabel, getMovementColor } from '@/lib/tennisMovementClassifier';
import { TennisMovement } from '@/lib/tennisMovementClassifier';

interface FrameData {
  frameIndex: number;
  imageSrc: string;
  angles: Record<string, number>;
  confidence: number;
}

interface LocationState {
  movement: TennisMovement;
  frames: FrameData[];
}

export default function MovementFrames() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  if (!state || !state.frames) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">No frame data available</p>
            <Button onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Analysis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { movement, frames } = state;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{getMovementLabel(movement)} Frames</h1>
            <Badge className={`${getMovementColor(movement)} text-white`}>
              {frames.length} frames
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {frames.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No frames detected for {getMovementLabel(movement)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {frames.map((frame, index) => (
              <Card key={index} className="overflow-hidden">
                <div className="aspect-video relative">
                  <img
                    src={frame.imageSrc}
                    alt={`Frame ${frame.frameIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <Badge className="absolute top-2 left-2 bg-background/80 text-foreground">
                    #{frame.frameIndex + 1}
                  </Badge>
                  <Badge className="absolute top-2 right-2 bg-primary/80 text-primary-foreground">
                    {frame.confidence}%
                  </Badge>
                </div>
                <CardContent className="p-3">
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(frame.angles).map(([joint, angle]) => (
                      <div key={joint} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{joint}:</span>
                        <span className="font-medium">{typeof angle === 'number' ? angle.toFixed(0) : angle}°</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
