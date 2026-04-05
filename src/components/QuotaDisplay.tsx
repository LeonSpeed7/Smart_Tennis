import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface QuotaDisplayProps {
  quotaInfo: { remaining: number; total: number } | null;
  user: any;
}

const QuotaDisplay = ({ quotaInfo, user }: QuotaDisplayProps) => {
  if (!user) return null;
  
  if (!quotaInfo) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">AI Coaching: 10 requests per day</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const used = quotaInfo.total - quotaInfo.remaining;
  const percentage = (used / quotaInfo.total) * 100;
  
  return (
    <Card className="bg-muted/50">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-medium">AI Coaching Today:</span>
            <span className="text-muted-foreground">
              {used} / {quotaInfo.total} used
            </span>
          </div>
          {quotaInfo.remaining === 0 ? (
            <span className="text-xs text-destructive font-medium">Limit reached</span>
          ) : quotaInfo.remaining <= 2 ? (
            <span className="text-xs text-orange-500 font-medium">{quotaInfo.remaining} left</span>
          ) : (
            <span className="text-xs text-muted-foreground">{quotaInfo.remaining} remaining</span>
          )}
        </div>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              percentage >= 100 ? 'bg-destructive' : 
              percentage >= 80 ? 'bg-orange-500' : 
              'bg-primary'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default QuotaDisplay;
