# Tennis Instant Feedback
2025 May to 2026 January

## Project info

**URL**: https://smart7tennis.vercel.app/


remixxed original project due to technical issues with updating it and the link to that is: https://tennisfeedback.lovable.app/

Tennis shot analysis is critical for consistently improving. Specifically, a single shot can determine the result of an entire match which is why it is important to analyze every shot. Automatic tennis feedback is currently still in development and the most advanced technologies are only used by professional tennis players. However, post shot analysis can help players of all skill levels improve and my goal is to make this more accessible to a larger audience. The goal of this project is to eventually create a tennis system that provides post shot feedback for tennis players. While the prominent competitor SwingVision uses advanced technology to provide feedback, their feedback is more about ball placement and is a short video replay. The bigger problem is that a player can only view this feedback once they finish a practice session or a game. In a match it is insignificant to view the feedback after you finished the match because you cannot change what already occurred in the past. Rather, receiving the feedback during play or during break times allows for improvement on the spot. 



## What technologies are used for this project?

AI tools:
- Gemini 2.5 Flash for chatbot to provide users with feedback
- Saiwa AI for pose estimation( uses OpenPose)

Front End:
- Lovable to prototype

Backend:
- python to store math functions(Eclidean etc.)

## video analysis

### Ready Position:
These are the accurate angles for ready position which is what I use to determine how good a tennis stroke is.
Knees bent (90-120°)
Hips slightly bent (150-170°)
Elbows bent (80-120°)
Shoulders neutral (140-180°)

### Groundstroke:
Hip rotation (120-180°)
Knee extension (130-170°)
Elbow extension (140-180°)
Shoulder rotation (100-170°)

### Serve:
Full knee extension (160-180°)
Full hip extension (170-180°)
Full elbow extension (160-180°)
Shoulder overhead position (60-120°)


<iframe>Screen Recording 2025-11-08 at 3.01.44 PM.mp4
