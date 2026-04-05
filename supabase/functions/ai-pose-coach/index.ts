import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_QUOTA = 10;
const JOINTS = ["knee", "hip", "elbow", "ankle", "shoulder", "wrist"] as const;

type AngleMap = Record<string, unknown>;
type FeedbackItem = {
  joint?: string;
  message?: string;
  difference?: number;
  angle?: number;
  status?: string;
};

type RatingItem = {
  rating?: number;
  status?: string;
  averageAngle?: number;
  averageDifference?: number;
  goodFrames?: number;
  totalFrames?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatSigned = (value: number | null) =>
  value === null ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(1)}°`;

const formatNumber = (value: number | null) =>
  value === null ? "n/a" : `${value.toFixed(1)}°`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required. Please sign in to use AI coaching." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !lovableApiKey) {
      throw new Error("Required backend secrets are not configured");
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;

    if (claimsError || !userId) {
      console.error("JWT validation failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Authentication failed. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    if (!isRecord(payload) || !isRecord(payload.userAngles) || !isRecord(payload.referenceAngles)) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const feedback = Array.isArray(payload.feedback) ? (payload.feedback as FeedbackItem[]) : [];
    const userAngles = payload.userAngles as AngleMap;
    const referenceAngles = payload.referenceAngles as AngleMap;
    const videoAnalysis = isRecord(payload.videoAnalysis) ? payload.videoAnalysis : null;

    console.log("Received coaching request:", {
      userId,
      feedbackCount: feedback.length,
      hasVideoAnalysis: Boolean(videoAnalysis),
    });

    const today = new Date().toISOString().split("T")[0];
    const { data: usageData, error: usageError } = await adminClient
      .from("ai_usage_tracking")
      .select("request_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    if (usageError) {
      console.error("Usage check error:", usageError);
    }

    const currentCount = usageData?.request_count || 0;
    if (currentCount >= DAILY_QUOTA) {
      return new Response(
        JSON.stringify({
          error: `Daily AI coaching limit reached (${DAILY_QUOTA} requests per day). Please try again tomorrow.`,
          quotaExceeded: true,
          currentUsage: currentCount,
          dailyQuota: DAILY_QUOTA,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const observedAngleLines = JOINTS
      .filter((joint) => userAngles[joint] !== undefined || referenceAngles[joint] !== undefined)
      .map((joint) => {
        const userAngle = asNumber(userAngles[joint]);
        const referenceAngle = asNumber(referenceAngles[joint]);
        const difference = userAngle !== null && referenceAngle !== null ? userAngle - referenceAngle : null;

        return `- ${joint.toUpperCase()}: player ${formatNumber(userAngle)}, target ${formatNumber(referenceAngle)}, difference ${formatSigned(difference)}`;
      })
      .join("\n");

    const observedFeedbackLines = feedback.length
      ? feedback
          .map((item) => {
            const difference = asNumber(item.difference);
            return `- ${item.joint ?? "joint"}: ${item.message ?? "No message"}${difference !== null ? ` (difference ${formatSigned(difference)})` : ""}`;
          })
          .join("\n")
      : "- No direct rule-based issues were provided.";

    let prompt = "";

    if (videoAnalysis) {
      const ratings = Object.entries(videoAnalysis.averageRatings ?? {})
        .filter(([, value]) => isRecord(value) && typeof value.rating === "number")
        .map(([joint, value]) => ({ joint, ...(value as RatingItem) }))
        .sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));

      const weakestJoints = ratings.slice(0, 3);
      const strongestJoint = ratings.at(-1);

      const ratingLines = ratings.length
        ? ratings
            .map(
              (rating) =>
                `- ${rating.joint.toUpperCase()}: ${rating.rating}/100 (${rating.status ?? "unknown"}), avg angle ${formatNumber(asNumber(rating.averageAngle))}, avg difference ${formatNumber(asNumber(rating.averageDifference))}, consistency ${rating.goodFrames ?? 0}/${rating.totalFrames ?? 0}`
            )
            .join("\n")
        : "- No per-joint ratings were available.";

      prompt = `You are an expert tennis coach reviewing a player's rally video.

Use ONLY the measured observations below. Do not give generic tennis advice. Every coaching point must reference something that was actually observed in the player's data.

RALLY SUMMARY
- Frames analyzed: ${videoAnalysis.totalFrames ?? 0}
- Overall score: ${typeof videoAnalysis.overallScore === "number" ? videoAnalysis.overallScore.toFixed(1) : "n/a"}/100

OBSERVED JOINT RATINGS
${ratingLines}

WEAKEST AREAS DETECTED
${weakestJoints.length ? weakestJoints.map((joint) => `- ${joint.joint}: ${joint.rating}/100`).join("\n") : "- No weak areas were available."}

STRONGEST AREA DETECTED
${strongestJoint ? `- ${strongestJoint.joint}: ${strongestJoint.rating}/100` : "- No strongest area was available."}

REFERENCE COMPARISON SNAPSHOT
${observedAngleLines}

Respond in this exact format:
Overall assessment:
- 2-3 sentences summarizing what you noticed across the rally.

What I noticed:
- List 3 specific observations from the data.

Top improvements:
1. Name the body part/joint, what was wrong, why it matters, and one drill/cue.
2. Name the body part/joint, what was wrong, why it matters, and one drill/cue.
3. Name the body part/joint, what was wrong, why it matters, and one drill/cue.

What to keep doing:
- Mention the player's strongest area and why it is a positive.

Be concise, specific, and encouraging.`;
    } else {
      prompt = `You are an expert tennis coach reviewing a player's pose.

Use ONLY the measured observations below. Do not give generic advice. Every coaching point must reference something that was actually observed in the player's pose data.

REFERENCE COMPARISON
${observedAngleLines}

RULE-BASED OBSERVATIONS
${observedFeedbackLines}

Respond in this exact format:
Overall assessment:
- 2-3 sentences summarizing what you noticed.

What I noticed:
- List 2-3 specific observations from the pose data.

Top improvements:
1. Name the body part/joint, what was wrong, why it matters, and one correction cue.
2. Name the body part/joint, what was wrong, why it matters, and one correction cue.
3. If needed, add one more improvement.

What to keep doing:
- Mention one thing the player is doing well.

Be concise, specific, and encouraging.`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a tennis coach who gives precise, evidence-based feedback from pose and rally measurements. Never be generic. Always mention the specific joints and issues you observed.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const data = await aiResponse.json();
    const coaching = data?.choices?.[0]?.message?.content;

    if (!coaching || typeof coaching !== "string") {
      throw new Error("AI coaching response was empty");
    }

    const { error: updateError } = await adminClient.from("ai_usage_tracking").upsert(
      {
        user_id: userId,
        usage_date: today,
        request_count: currentCount + 1,
      },
      {
        onConflict: "user_id,usage_date",
      }
    );

    if (updateError) {
      console.error("Failed to update usage tracking:", updateError);
    }

    return new Response(
      JSON.stringify({
        coaching,
        remainingQuota: DAILY_QUOTA - (currentCount + 1),
        dailyQuota: DAILY_QUOTA,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-pose-coach function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});