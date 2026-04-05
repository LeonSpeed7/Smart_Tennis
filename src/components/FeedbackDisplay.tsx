import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { FeedbackResult } from '@/lib/poseAnalysis';

interface FeedbackDisplayProps {
  feedback: FeedbackResult[];
}

export function FeedbackDisplay({ feedback }: FeedbackDisplayProps) {
  const getStatusIcon = (status: FeedbackResult['status']) => {
    switch (status) {
      case 'good':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'too-narrow':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'too-wide':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: FeedbackResult['status']) => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'too-narrow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'too-wide':
        return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pose Analysis Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback.map((item) => (
          <div
            key={item.joint}
            className="flex items-start gap-3 p-4 rounded-lg border bg-card"
          >
            <div className="mt-0.5">{getStatusIcon(item.status)}</div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold capitalize">{item.joint} Joint</h4>
                <Badge className={getStatusColor(item.status)}>
                  {item.angle.toFixed(1)}°
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{item.message}</p>
              <p className="text-xs text-muted-foreground">
                Difference: {item.difference > 0 ? '+' : ''}
                {item.difference.toFixed(1)}°
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
