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

        // Live match links හොයා ගන්නවා
        $('a[href*="/live-cricket-scores/"]').each((_, element) => {
            const href = $(element).attr('href');
            const title = $(element).attr('title') || $(element).text().trim();
            
            if (href && title && title.includes(' vs ')) {
                const matchUrl = BASE_URL + href;
                
                if (!seenUrls.has(matchUrl)) {
                    seenUrls.add(matchUrl);
                    matches.push({
                        name: title.replace(/\s+/g, ' ').trim(),
                        url: matchUrl
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

async function getMatchScore(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);

        // Meta description එකෙන් score එක හොයන්න
        const metaDesc = $('meta[name="description"]').attr('content');
        if (metaDesc && metaDesc.includes('Follow')) {
            const scoreMatch = metaDesc.match(/Follow (.*? \d+\/\d+ \(\d+\))/);
            if (scoreMatch) {
                return scoreMatch[1];
            }
        }

        // Title එකෙන් හොයන්න (backup)
        const title = $('title').text();
        const titleMatch = title.match(/(\w+ \d+\/\d+ \(\d+\))/);
        if (titleMatch) {
            return titleMatch[1];
        }

        return "Score not found";
    } catch (error) {
        console.error("Error fetching score:", error.message);
        return "Error fetching score";
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ?live=1 query parameter එක check කරන්න
        const liveIndex = req.query.live;
        
        // Live matches list එක ගන්න
        const matches = await getLiveMatches();

        if (liveIndex) {
            // Specific match එකක් request කරලා තියෙනවා
            const index = parseInt(liveIndex) - 1;
            
            if (index >= 0 && index < matches.length) {
                const selectedMatch = matches[index];
                const score = await getMatchScore(selectedMatch.url);
                
                return res.status(200).json({
                    status: "success",
                    match: {
                        name: selectedMatch.name,
                        url: selectedMatch.url,
                        score: score
                    }
                });
            } else {
                return res.status(404).json({
                    status: "error",
                    message: "Match not found"
                });
            }
        } else {
            // Match list එක return කරන්න (formatted)
            const matchList = matches.map((match, idx) => ({
                number: idx + 1,
                name: match.name,
                url: match.url
            }));

            return res.status(200).json({
                status: "success",
                total: matchList.length,
                matches: matchList
            });
        }
    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
};