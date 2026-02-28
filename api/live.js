import fetch from "node-fetch";

// -------- Utility Functions --------

// Extract runs & overs
function extractRunsOvers(score) {
  const runsMatch = score?.match(/(\d+)\/(\d+)/);
  const oversMatch = score?.match(/\(([\d.]+)/);

  const runs = runsMatch ? parseInt(runsMatch[1]) : 0;
  const wickets = runsMatch ? parseInt(runsMatch[2]) : 0;
  const overs = oversMatch ? parseFloat(oversMatch[1]) : 0;

  return { runs, wickets, overs };
}

// Convert overs (15.3 → balls)
function oversToBalls(overs) {
  const fullOvers = Math.floor(overs);
  const balls = Math.round((overs - fullOvers) * 10);
  return fullOvers * 6 + balls;
}

// Current Run Rate
function calculateCRR(runs, overs) {
  if (!overs || overs === 0) return 0;
  return Number((runs / overs).toFixed(2));
}

// Required Run Rate
function calculateRRR(target, runs, overs, totalOvers = 20) {
  const totalBalls = totalOvers * 6;
  const usedBalls = oversToBalls(overs);
  const remainingBalls = totalBalls - usedBalls;

  if (remainingBalls <= 0) return null;

  const runsNeeded = target - runs;

  return {
    runsNeeded,
    ballsRemaining: remainingBalls,
    requiredRR: Number((runsNeeded / (remainingBalls / 6)).toFixed(2))
  };
}

// -------- API Handler --------

export default async function handler(req, res) {
  try {
    const url = "https://site.api.espn.com/apis/personalized/v2/scoreboard/header";

    const response = await fetch(url);
    const data = await response.json();

    const liveMatches = [];

    for (const sport of data.sports || []) {
      if (sport.id === "200") { // Cricket
        for (const league of sport.leagues || []) {
          for (const event of league.events || []) {

            if (event.status === "in") {

              const competitors = event.competitors || [];

              const teams = competitors.map(team => {
                const score = team.score || "";
                const { runs, overs } = extractRunsOvers(score);

                return {
                  id: team.id,
                  name: team.displayName,
                  score,
                  runRate: calculateCRR(runs, overs)
                };
              });

              // Target calculation (first innings score)
              let chaseInfo = null;

              if (teams.length === 2) {
                const firstInnings = extractRunsOvers(teams[1].score);
                const secondInnings = extractRunsOvers(teams[0].score);

                if (firstInnings.runs && secondInnings.overs) {
                  chaseInfo = calculateRRR(
                    firstInnings.runs + 1,
                    secondInnings.runs,
                    secondInnings.overs
                  );
                }
              }

              liveMatches.push({
                id: event.id,
                name: event.name,
                summary: event.summary,
                venue: event.location || "N/A",
                teams,
                chaseInfo,
                status: event.fullStatus?.longSummary || ""
              });
            }
          }
        }
      }
    }

    return res.status(200).json({
      creator: "Chathura Hansaka",
      status: true,
      total: liveMatches.length,
      matches: liveMatches
    });

  } catch (error) {
    return res.status(500).json({
      creator: "Chathura Hansaka",
      status: false,
      error: error.message
    });
  }
}