import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";

interface AICoachingDisplayProps {
  coaching: string | null;
  loading?: boolean;
  quotaInfo?: { remaining: number; total: number } | null;
}

const AICoachingDisplay = ({ coaching, loading, quotaInfo }: AICoachingDisplayProps) => {
  if (loading) {
    return (
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            AI Coach Analyzing...
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!coaching) return null;

  return (
    <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          AI Coach Feedback
        </CardTitle>
        {quotaInfo && (
          <CardDescription>
            Daily usage: {quotaInfo.total - quotaInfo.remaining} / {quotaInfo.total} requests
            {quotaInfo.remaining > 0 && ` (${quotaInfo.remaining} remaining)`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-foreground">{coaching}</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AICoachingDisplay;
