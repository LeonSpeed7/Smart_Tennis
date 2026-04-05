import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_QUOTA = 10; // Maximum AI coaching requests per user per day

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedback, userAngles, referenceAngles, videoAnalysis } = await req.json();
    console.log('Received coaching request:', { feedback, userAngles, referenceAngles, hasVideoAnalysis: !!videoAnalysis });

    // Get authorization token to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Please sign in to use AI coaching.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with user's auth for reading
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Service role client for writing usage tracking (no client INSERT/UPDATE policy)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed. Please sign in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format

    // Check current usage for today
    const { data: usageData, error: usageError } = await supabase
      .from('ai_usage_tracking')
      .select('request_count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .single();

    if (usageError && usageError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Usage check error:', usageError);
    }

    const currentCount = usageData?.request_count || 0;

    // Check if quota exceeded
    if (currentCount >= DAILY_QUOTA) {
      console.log(`Quota exceeded for user ${user.id}: ${currentCount}/${DAILY_QUOTA}`);
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

    // Create detailed prompt for AI coach
    let prompt = `You are an expert tennis coach analyzing a player's ready position. 

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
${feedback.map((f: any) => `- ${f.joint}: ${f.message}`).join('\n')}`;

    if (videoAnalysis) {
      prompt += `

VIDEO ANALYSIS (${videoAnalysis.totalFrames} frames analyzed):
Overall Score: ${videoAnalysis.overallScore.toFixed(1)}/100

Per-Joint Ratings and Performance:
${Object.entries(videoAnalysis.averageRatings).map(([joint, rating]: [string, any]) => 
  `- ${joint.toUpperCase()}: ${rating.rating}/100 (${rating.status})
    • Avg Angle: ${rating.averageAngle.toFixed(1)}°
    • Avg Difference: ±${rating.averageDifference.toFixed(1)}°
    • Consistency: ${rating.goodFrames}/${rating.totalFrames} frames (${((rating.goodFrames/rating.totalFrames)*100).toFixed(0)}%)`
).join('\n')}

Based on this video analysis, please provide:
1. Overall assessment of form consistency across the video (2-3 sentences)
2. Identify which joint has the WORST rating and needs the most improvement with specific drills
3. Identify which joint has the BEST rating to reinforce good technique
4. Specific actionable corrections for the 2-3 joints with lowest ratings
5. Progressive training plan focusing on the weakest aspects`;
    } else {
      prompt += `

Please provide:
1. A brief overall assessment (2-3 sentences)
2. Top 2-3 specific corrections needed with actionable tips
3. One positive reinforcement about what they're doing well`;
    }

    prompt += `

Keep the response concise, encouraging, and focused on actionable improvements. Use a friendly, coaching tone.`;

    console.log('Calling Lovable AI Gateway...');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert tennis coach providing personalized feedback on player positioning. Be encouraging but specific in your corrections.'
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
    
    console.log('Generated coaching:', coaching);

    // Increment usage count (upsert: insert if not exists, update if exists)
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
      // Don't fail the request if tracking fails, just log it
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
