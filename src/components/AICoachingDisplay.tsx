import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2, TrendingUp, Eye, Target, ThumbsUp } from "lucide-react";
import { useMemo } from "react";

interface AICoachingDisplayProps {
  coaching: string | null;
  loading?: boolean;
  quotaInfo?: { remaining: number; total: number } | null;
}

interface CoachingSection {
  title: string;
  icon: React.ReactNode;
  items: string[];
}

function parseCoaching(raw: string): CoachingSection[] {
  const sections: CoachingSection[] = [];
  const lines = raw.split("\n");

  let currentTitle = "";
  let currentItems: string[] = [];

  const iconMap: Record<string, React.ReactNode> = {
    "overall": <Activity className="h-4 w-4 text-primary" />,
    "noticed": <Eye className="h-4 w-4 text-amber-500" />,
    "improvement": <Target className="h-4 w-4 text-red-500" />,
    "keep": <ThumbsUp className="h-4 w-4 text-emerald-500" />,
  };

  function getIcon(title: string) {
    const lower = title.toLowerCase();
    if (lower.includes("overall")) return iconMap["overall"];
    if (lower.includes("noticed")) return iconMap["noticed"];
    if (lower.includes("improvement") || lower.includes("top")) return iconMap["improvement"];
    if (lower.includes("keep")) return iconMap["keep"];
    return <TrendingUp className="h-4 w-4 text-primary" />;
  }

  function flush() {
    if (currentTitle && currentItems.length > 0) {
      sections.push({
        title: currentTitle,
        icon: getIcon(currentTitle),
        items: [...currentItems],
      });
    }
    currentItems = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers: lines ending with ":" or starting with "##"
    const headerMatch = trimmed.match(/^(?:#{1,3}\s*)?(.+?):?\s*$/);
    const isHeader =
      headerMatch &&
      !trimmed.startsWith("-") &&
      !trimmed.match(/^\d+\./) &&
      (trimmed.endsWith(":") || trimmed.startsWith("#"));

    if (isHeader) {
      flush();
      currentTitle = headerMatch[1]
        .replace(/\*\*/g, "")
        .replace(/^#+\s*/, "")
        .replace(/:$/, "")
        .trim();
      continue;
    }

    // Clean up bullet/numbered items
    let cleaned = trimmed
      .replace(/^[-•]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/\*\*/g, "")
      .trim();

    if (cleaned) {
      currentItems.push(cleaned);
    }
  }

  flush();
  return sections;
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

  const sections = useMemo(() => parseCoaching(coaching), [coaching]);

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
        <div className="space-y-4">
          {sections.map((section, i) => (
            <div key={i} className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {section.icon}
                {section.title}
              </h4>
              <ul className="space-y-1.5 pl-6">
                {section.items.map((item, j) => (
                  <li key={j} className="text-sm text-muted-foreground leading-relaxed list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AICoachingDisplay;
