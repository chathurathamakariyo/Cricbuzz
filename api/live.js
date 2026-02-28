import axios from "axios";

function extractRunsOvers(score = "") {
  const runsMatch = score.match(/(\d+)\/(\d+)/);
  const oversMatch = score.match(/\(([\d.]+)/);

  return {
    runs: runsMatch ? parseInt(runsMatch[1]) : 0,
    wickets: runsMatch ? parseInt(runsMatch[2]) : 0,
    overs: oversMatch ? parseFloat(oversMatch[1]) : 0
  };
}

function oversToBalls(overs) {
  const full = Math.floor(overs);
  const balls = Math.round((overs - full) * 10);
  return full * 6 + balls;
}

function calculateCRR(runs, overs) {
  if (!overs) return 0;
  return Number((runs / overs).toFixed(2));
}

function calculateRRR(target, runs, overs, totalOvers = 20) {
  const totalBalls = totalOvers * 6;
  const usedBalls = oversToBalls(overs);
  const remainingBalls = totalBalls - usedBalls;

  if (remainingBalls <= 0) return null;

  const runsNeeded = target - runs;

  return {
    target,
    runsNeeded,
    ballsRemaining: remainingBalls,
    requiredRunRate: Number((runsNeeded / (remainingBalls / 6)).toFixed(2))
  };
}

export default async function handler(req, res) {

  try {

    const response = await axios.get(
      "https://site.api.espn.com/apis/personalized/v2/scoreboard/header"
    );

    const data = response.data;

    const liveMatches = [];

    if (!data?.sports) {
      return res.status(200).json({
        status: false,
        message: "No sports data found"
      });
    }

    for (const sport of data.sports) {

      if (sport?.id !== "200") continue; // Cricket only

      for (const league of sport.leagues || []) {
        for (const event of league.events || []) {

          if (!event?.status) continue;

          // ESPN live status usually: "in"
          if (event.status !== "in") continue;

          const competitors = event.competitors || [];
          if (competitors.length < 2) continue;

          const teams = competitors.map(team => {

            const score = team.score || "";
            const { runs, overs } = extractRunsOvers(score);

            return {
              id: team.id,
              name: team.displayName,
              score,
              currentRunRate: calculateCRR(runs, overs)
            };
          });

          let chaseInfo = null;

          const first = extractRunsOvers(teams[1].score);
          const second = extractRunsOvers(teams[0].score);

          if (first.runs && second.overs) {
            chaseInfo = calculateRRR(
              first.runs + 1,
              second.runs,
              second.overs
            );
          }

          liveMatches.push({
            matchId: event.id,
            matchName: event.name || "Unknown",
            venue: event.location || "N/A",
            status: event.fullStatus?.longSummary || "",
            teams,
            chaseInfo
          });
        }
      }
    }

    return res.status(200).json({
      status: true,
      totalLiveMatches: liveMatches.length,
      matches: liveMatches
    });

  } catch (error) {

    console.error("LIVE API ERROR:", error.message);

    return res.status(500).json({
      status: false,
      error: error.message
    });
  }
}