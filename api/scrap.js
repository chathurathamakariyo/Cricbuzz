const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = "https://www.cricbuzz.com";

async function getLiveMatches() {
    try {
        const { data } = await axios.get(BASE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const matches = [];
        const seenUrls = new Set();

        $('a[href*="/live-cricket-scores/"]').each((_, element) => {
            const href = $(element).attr('href');
            const title = $(element).attr('title') || $(element).text().trim();
            
            if (href && title && title.includes(' vs ')) {
                const matchUrl = BASE_URL + href;
                
                if (!seenUrls.has(matchUrl)) {
                    seenUrls.add(matchUrl);
                    
                    // LIVE status එක check කරන්න
                    const parent = $(element).closest('div');
                    const isLive = parent.text().includes('LIVE') || $(element).text().includes('LIVE');
                    
                    matches.push({
                        name: title.replace(/\s+/g, ' ').trim(),
                        url: matchUrl,
                        isLive: isLive
                    });
                }
            }
        });

        return matches;
    } catch (error) {
        console.error("Error fetching matches:", error.message);
        return [];
    }
}

async function getDetailedMatchScore(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        
        // 1️⃣ Basic match info
        const matchTitle = $('h1').first().text().trim();
        const status = $('.text-cbLive, .cb-text-live, .cb-text-complete, .cb-text-preview').first().text().trim() || 
                      $('div:contains("opt to")').first().text().trim();
        
        // 2️⃣ Score (team, runs, wickets, overs)
        let battingTeam = "", bowlingTeam = "", score = "", overs = "", crr = "";
        
        // Try to find score from meta description first
        const metaDesc = $('meta[name="description"]').attr('content');
        if (metaDesc && metaDesc.includes('Follow')) {
            const scoreMatch = metaDesc.match(/Follow (.*? \d+\/\d+ \(\d+\))/);
            if (scoreMatch) {
                const fullScore = scoreMatch[1];
                const teamMatch = fullScore.match(/(\w+) (\d+)\/(\d+) \((\d+)\)/);
                if (teamMatch) {
                    battingTeam = teamMatch[1];
                    score = `${teamMatch[2]}/${teamMatch[3]}`;
                    overs = teamMatch[4];
                }
            }
        }
        
        // 3️⃣ Current batsmen
        const batsmen = [];
        $('.cb-col-50:contains("(r)"):contains("(b)")').each((_, element) => {
            const text = $(element).text().trim();
            const nameMatch = text.match(/([A-Za-z\s\.]+?)\s*\(r\)/);
            const runsMatch = text.match(/\(r\)\s*(\d+)/);
            const ballsMatch = text.match(/\(b\)\s*(\d+)/);
            const foursMatch = text.match(/\(4s\)\s*(\d+)/);
            const sixesMatch = text.match(/\(6s\)\s*(\d+)/);
            
            if (nameMatch && runsMatch) {
                batsmen.push({
                    name: nameMatch[1].trim(),
                    runs: runsMatch[1],
                    balls: ballsMatch ? ballsMatch[1] : "0",
                    fours: foursMatch ? foursMatch[1] : "0",
                    sixes: sixesMatch ? sixesMatch[1] : "0",
                    striker: $(element).text().includes('*') ? true : false
                });
            }
        });
        
        // 4️⃣ Current bowler
        const bowlers = [];
        $('.cb-col-50:contains("(O)"):contains("(R)")').each((_, element) => {
            const text = $(element).text().trim();
            const nameMatch = text.match(/([A-Za-z\s\.]+?)\s*\(O\)/);
            const oversMatch = text.match(/\(O\)\s*(\d+\.?\d*)/);
            const runsMatch = text.match(/\(R\)\s*(\d+)/);
            const wicketsMatch = text.match(/\(W\)\s*(\d+)/);
            const econMatch = text.match(/\(Econ\)\s*(\d+\.?\d*)/);
            
            if (nameMatch) {
                bowlers.push({
                    name: nameMatch[1].trim(),
                    overs: oversMatch ? oversMatch[1] : "0",
                    runs: runsMatch ? runsMatch[1] : "0",
                    wickets: wicketsMatch ? wicketsMatch[1] : "0",
                    economy: econMatch ? econMatch[1] : "0"
                });
            }
        });
        
        // 5️⃣ Partnership
        let partnership = "0(0)";
        $('div:contains("P\'SHIP")').each((_, element) => {
            const text = $(element).text();
            const pMatch = text.match(/P'SHIP\s*(\d+)\s*\((\d+)\)/);
            if (pMatch) {
                partnership = `${pMatch[1]}(${pMatch[2]})`;
            }
        });
        
        // 6️⃣ Recent balls
        let recentBalls = "";
        $('p:contains("Recent :")').each((_, element) => {
            recentBalls = $(element).text().replace('Recent :', '').trim();
        });
        
        // 7️⃣ CRR / RRR
        $('div:contains("CRR")').each((_, element) => {
            const text = $(element).text();
            const crrMatch = text.match(/CRR:\s*(\d+\.?\d*)/);
            if (crrMatch) {
                crr = crrMatch[1];
            }
        });
        
        // 8️⃣ Win probability
        let winProbability = { team1: "", team2: "" };
        $('div[title="ENG"], div[title="SL"]').each((_, element) => {
            const title = $(element).attr('title');
            const percent = $(element).find('.font-semibold').text().replace('%', '');
            if (title && percent) {
                if (title === "England") winProbability.team1 = percent + "%";
                if (title === "Sri Lanka") winProbability.team2 = percent + "%";
            }
        });
        
        // 9️⃣ Last wicket
        let lastWicket = "";
        $('div:contains("Last Wkt:")').each((_, element) => {
            lastWicket = $(element).text().replace('Last Wkt:', '').trim();
        });

        return {
            matchTitle,
            status,
            battingTeam,
            score,
            overs,
            crr,
            batsmen,
            bowlers,
            partnership,
            recentBalls,
            winProbability,
            lastWicket
        };
        
    } catch (error) {
        console.error("Error fetching score:", error.message);
        return null;
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const liveIndex = req.query.live;
        const matches = await getLiveMatches();

        if (liveIndex) {
            const index = parseInt(liveIndex) - 1;
            
            if (index >= 0 && index < matches.length) {
                const selectedMatch = matches[index];
                const details = await getDetailedMatchScore(selectedMatch.url);
                
                const response = {
                    status: "success",
                    match: {
                        ...selectedMatch,
                        details: details || "Details not available"
                    }
                };
                
                // Pretty print JSON
                return res.status(200).send(JSON.stringify(response, null, 2));
            } else {
                const error = {
                    status: "error",
                    message: "Match not found"
                };
                return res.status(404).send(JSON.stringify(error, null, 2));
            }
        } else {
            const matchList = matches.map((match, idx) => ({
                number: idx + 1,
                name: match.name,
                url: match.url,
                isLive: match.isLive
            }));

            const response = {
                status: "success",
                total: matchList.length,
                matches: matchList
            };
            
            // Pretty print JSON
            return res.status(200).send(JSON.stringify(response, null, 2));
        }
    } catch (error) {
        console.error("API Error:", error);
        const errorResponse = {
            status: "error",
            message: "Internal server error"
        };
        return res.status(500).send(JSON.stringify(errorResponse, null, 2));
    }
};