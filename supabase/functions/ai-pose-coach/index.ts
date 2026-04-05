import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DAILY_QUOTA = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedback, userAngles, referenceAngles, videoAnalysis } = await req.json();
    console.log('Received coaching request:', { feedback, userAngles, referenceAngles, hasVideoAnalysis: !!videoAnalysis });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Please sign in to use AI coaching.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed. Please sign in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: usageData, error: usageError } = await supabase
      .from('ai_usage_tracking')
      .select('request_count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .single();

    if (usageError && usageError.code !== 'PGRST116') {
      console.error('Usage check error:', usageError);
    }

    const currentCount = usageData?.request_count || 0;

    if (currentCount >= DAILY_QUOTA) {
      return new Response(
        JSON.stringify({ 
          error: `Daily AI coaching limit reached (${DAILY_QUOTA} requests per day). Please try again tomorrow.`,
          quotaExceeded: true,
          currentUsage: currentCount,
          dailyQuota: DAILY_QUOTA
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    let prompt = '';

    if (videoAnalysis) {
      prompt = `You are an expert tennis coach analyzing a player's rally video. The video has been broken into ${videoAnalysis.totalFrames} frames and each frame's joint angles were analyzed.

Overall Score: ${videoAnalysis.overallScore.toFixed(1)}/100

Per-Joint Ratings:
${Object.entries(videoAnalysis.averageRatings).map(([joint, rating]: [string, any]) => 
  `- ${joint.toUpperCase()}: ${rating.rating}/100 (${rating.status})
    • Avg Angle: ${rating.averageAngle.toFixed(1)}°
    • Avg Difference from reference: ±${rating.averageDifference.toFixed(1)}°
    • Consistency: ${rating.goodFrames}/${rating.totalFrames} frames within range (${((rating.goodFrames/rating.totalFrames)*100).toFixed(0)}%)`
).join('\n')}

Please provide a holistic analysis of this rally:
1. Overall assessment of the player's form throughout the rally (2-3 sentences)
2. The strongest aspect of their technique (which joint/body part is most consistent)
3. The weakest aspect that needs the most work, with specific drills to improve
4. 2-3 actionable corrections ranked by priority
5. A brief progressive training recommendation

Keep the response concise, encouraging, and focused on actionable improvements. Use a friendly coaching tone.`;
    } else {
      prompt = `You are an expert tennis coach analyzing a player's pose.

Reference (ideal) angles:
- Knee: ${referenceAngles.knee}°
- Hip: ${referenceAngles.hip}°
- Elbow: ${referenceAngles.elbow}°
- Ankle: ${referenceAngles.ankle}°

User's current angles:
- Knee: ${userAngles.knee}° (difference: ${(userAngles.knee - referenceAngles.knee).toFixed(1)}°)
- Hip: ${userAngles.hip}° (difference: ${(userAngles.hip - referenceAngles.hip).toFixed(1)}°)
- Elbow: ${userAngles.elbow}° (difference: ${(userAngles.elbow - referenceAngles.elbow).toFixed(1)}°)
- Ankle: ${userAngles.ankle}° (difference: ${(userAngles.ankle - referenceAngles.ankle).toFixed(1)}°)

Current feedback:
${feedback.map((f: any) => `- ${f.joint}: ${f.message}`).join('\n')}

Please provide:
1. A brief overall assessment (2-3 sentences)
2. Top 2-3 specific corrections needed with actionable tips
3. One positive reinforcement about what they're doing well

Keep the response concise, encouraging, and focused on actionable improvements. Use a friendly, coaching tone.`;
    }

    console.log('Calling Lovable AI Gateway...');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert tennis coach providing personalized feedback on player technique during rallies and poses. Be encouraging but specific in your corrections.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const coaching = data.choices[0].message.content;
    
    console.log('Generated coaching successfully');

    const { error: updateError } = await supabaseAdmin
      .from('ai_usage_tracking')
      .upsert({
        user_id: user.id,
        usage_date: today,
        request_count: currentCount + 1,
      }, {
        onConflict: 'user_id,usage_date'
      });

    if (updateError) {
      console.error('Failed to update usage tracking:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        coaching,
        remainingQuota: DAILY_QUOTA - (currentCount + 1),
        dailyQuota: DAILY_QUOTA
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-pose-coach function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
