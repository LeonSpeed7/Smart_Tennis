import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClassifiedFramesByMovement } from '@/lib/videoAnalysis';
import { getMovementLabel, getMovementColor, TennisMovement } from '@/lib/tennisMovementClassifier';

interface ReferenceFramesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classifiedFrames: ClassifiedFramesByMovement | null;
}

export function ReferenceFramesDialog({
  open,
  onOpenChange,
  classifiedFrames,
}: ReferenceFramesDialogProps) {
  if (!classifiedFrames) return null;

  const movements: TennisMovement[] = ['ready-position', 'serve-ready', 'groundstroke', 'serve', 'unknown'];
  const totalFrames = movements.reduce(
    (sum, m) => sum + classifiedFrames[m].length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Reference Video Frames</DialogTitle>
          <DialogDescription>
            {totalFrames} frames classified by movement type
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="ready-position" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            {movements.map((movement) => (
              <TabsTrigger key={movement} value={movement} className="text-xs">
                {getMovementLabel(movement)} ({classifiedFrames[movement].length})
              </TabsTrigger>
            ))}
          </TabsList>
          
          {movements.map((movement) => (
            <TabsContent key={movement} value={movement} className="mt-4">
              <ScrollArea className="h-[60vh]">
                {classifiedFrames[movement].length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No frames classified as {getMovementLabel(movement)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">
                    {classifiedFrames[movement].map((frame) => (
                      <div
                        key={frame.frameIndex}
                        className="rounded-lg border bg-card overflow-hidden"
                      >
                        <img
                          src={frame.image.src}
                          alt={`Frame ${frame.frameIndex + 1}`}
                          className="w-full h-auto"
                        />
                        <div className="p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">
                              Frame {frame.frameIndex + 1}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-xs ${getMovementColor(frame.movement)}`}
                            >
                              {Math.round(frame.confidence * 100)}%
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>Knee: {frame.angles.knee?.toFixed(0)}°</span>
                            <span>Hip: {frame.angles.hip?.toFixed(0)}°</span>
                            <span>Elbow: {frame.angles.elbow?.toFixed(0)}°</span>
                            <span>Ankle: {frame.angles.ankle?.toFixed(0)}°</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
