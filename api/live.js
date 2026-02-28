import axios from "axios";

// ---------------- Utility ----------------

function extractRunsOvers(score) {
  const runsMatch = score?.match(/(\d+)\/(\d+)/);
  const oversMatch = score?.match(/\(([\d.]+)/);

  const runs = runsMatch ? parseInt(runsMatch[1]) : 0;
  const wickets = runsMatch ? parseInt(runsMatch[2]) : 0;
  const overs = oversMatch ? parseFloat(oversMatch[1]) : 0;

  return { runs, wickets, overs };
}

function oversToBalls(overs) {
  const fullOvers = Math.floor(overs);
  const balls = Math.round((overs - fullOvers) * 10);
  return (fullOvers * 6) + balls;
}

function calculateCRR(runs, overs) {
  if (!overs || overs === 0) return 0;
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

// ---------------- API ----------------

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    const response = await axios.get(
      "https://site.api.espn.com/apis/personalized/v2/scoreboard/header"
    );

    const data = response.data;

    let liveMatches = [];

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
                  shortName: team.shortDisplayName,
                  score,
                  currentRunRate: calculateCRR(runs, overs)
                };
              });

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
                matchId: event.id,
                matchName: event.name,
                shortName: event.shortName,
                venue: event.location || "N/A",
                status: event.fullStatus?.longSummary || "",
                teams,
                chaseInfo
              });

            }
          }
        }
      }
    }

    return res.status(200).json({
      status: true,
      totalLiveMatches: liveMatches.length,
      matches: liveMatches
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
}