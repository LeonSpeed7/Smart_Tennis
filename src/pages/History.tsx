import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Activity, ArrowLeft, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";

interface PoseAnalysis {
  id: string;
  reference_angles: any;
  user_angles: any;
  feedback: any;
  ai_coaching: string | null;
  created_at: string;
}

const History = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<PoseAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    fetchHistory();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('pose_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setAnalyses(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load history",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteAnalysis = async (id: string) => {
    try {
      const { error } = await supabase
        .from('pose_analyses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAnalyses(analyses.filter(a => a.id !== id));
      toast({
        title: "Deleted",
        description: "Analysis deleted successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      'good': 'bg-green-500',
      'too-narrow': 'bg-yellow-500',
      'too-wide': 'bg-orange-500',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-8 w-8 text-primary" />
              Pose Analysis History
            </h1>
            <p className="text-muted-foreground">
              {user ? "Your saved analyses" : "Guest mode - analyses saved locally"}
            </p>
          </div>
        </div>

        {!user && (
          <Card className="mb-6 border-primary/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-3">
                💡 Sign in to access your history from any device
              </p>
              <Button onClick={() => navigate("/auth")} variant="outline" size="sm">
                Sign In / Sign Up
              </Button>
            </CardContent>
          </Card>
        )}

        {analyses.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No analyses yet. Start by analyzing your pose!</p>
              <Button onClick={() => navigate("/")} className="mt-4">
                Analyze Pose
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {analyses.map((analysis) => (
              <Card key={analysis.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {format(new Date(analysis.created_at), 'PPpp')}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Joint Angles Analysis
                      </CardDescription>
                    </div>
                    {user && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAnalysis(analysis.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {analysis.feedback.map((f: any, idx: number) => (
                      <div key={idx} className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium capitalize">{f.joint}</p>
                        <p className="text-2xl font-bold">{f.angle.toFixed(0)}°</p>
                        <Badge
                          className={`${getStatusBadge(f.status)} text-white text-xs mt-1`}
                        >
                          {f.status}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {analysis.ai_coaching && (
                    <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        AI Coach Feedback
                      </h4>
                      <div className="text-sm text-foreground whitespace-pre-wrap">
                        {analysis.ai_coaching}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
