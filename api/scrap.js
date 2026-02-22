const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const matchNumber = req.query.live;
        
        // Cricbuzz homepage එක
        const { data } = await axios.get('https://www.cricbuzz.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(data);
        const matches = [];
        
        // Live matches හොයා ගන්නවා
        $('a[href*="/live-cricket-scores/"]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            const parent = $(el).closest('div').text();
            
            if (href && text && text.includes(' vs ')) {
                const isLive = parent.includes('LIVE') || text.includes('LIVE');
                
                matches.push({
                    number: matches.length + 1,
                    name: text,
                    url: 'https://www.cricbuzz.com' + href,
                    live: isLive
                });
            }
        });

        // ?live=1 තියෙනවා නම් details ගන්නවා
        if (matchNumber) {
            const index = parseInt(matchNumber) - 1;
            
            if (index >= 0 && index < matches.length) {
                const match = matches[index];
                
                // Match page එක
                const matchPage = await axios.get(match.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                const $$ = cheerio.load(matchPage.data);
                
                // 1️⃣ Match title
                const title = $$('h1').first().text().trim();
                
                // 2️⃣ Score (meta description එකෙන්)
                const metaDesc = $$('meta[name="description"]').attr('content') || '';
                let fullScore = '';
                const scoreMatch = metaDesc.match(/Follow (.*? \d+\/\d+ \(\d+\))/);
                if (scoreMatch) fullScore = scoreMatch[1];
                
                // 3️⃣ Parse score (ENG 135/9 (19))
                const scoreParts = fullScore.match(/(\w+) (\d+)\/(\d+) \((\d+)\)/);
                const score = {
                    battingTeam: scoreParts ? scoreParts[1] : '',
                    runs: scoreParts ? scoreParts[2] : '',
                    wickets: scoreParts ? scoreParts[3] : '',
                    overs: scoreParts ? scoreParts[4] : ''
                };
                
                // 4️⃣ Current batsmen (striker & non-striker)
                const batsmen = [];
                
                // Method 1: Find batsmen from scorecard table
                $$('.cb-col.cb-col-50').each((i, el) => {
                    const text = $$(el).text().trim();
                    
                    // Check if this is a batsman row
                    if (text.includes('(r)') && text.includes('(b)')) {
                        // Extract name
                        let name = text.split('(r)')[0].trim();
                        
                        // Extract runs
                        const runsMatch = text.match(/\(r\)\s*(\d+)/);
                        const runs = runsMatch ? runsMatch[1] : '0';
                        
                        // Extract balls
                        const ballsMatch = text.match(/\(b\)\s*(\d+)/);
                        const balls = ballsMatch ? ballsMatch[1] : '0';
                        
                        // Extract 4s
                        const foursMatch = text.match(/\(4s\)\s*(\d+)/);
                        const fours = foursMatch ? foursMatch[1] : '0';
                        
                        // Extract 6s
                        const sixesMatch = text.match(/\(6s\)\s*(\d+)/);
                        const sixes = sixesMatch ? sixesMatch[1] : '0';
                        
                        // Check if striker (has * next to name)
                        const isStriker = text.includes('*');
                        
                        batsmen.push({
                            name: name.replace(/\*/g, '').trim(),
                            runs: runs,
                            balls: balls,
                            fours: fours,
                            sixes: sixes,
                            striker: isStriker
                        });
                    }
                });
                
                // Method 2: If no batsmen found, try alternative selector
                if (batsmen.length === 0) {
                    $$('.cb-min-inf tbody tr').each((i, el) => {
                        const name = $$(el).find('a').text().trim();
                        const stats = $$(el).find('td').map((i, td) => $$(td).text().trim()).get();
                        
                        if (name && stats.length >= 4) {
                            batsmen.push({
                                name: name,
                                runs: stats[0] || '0',
                                balls: stats[1] || '0',
                                fours: stats[2] || '0',
                                sixes: stats[3] || '0',
                                striker: stats[0].includes('*') ? true : false
                            });
                        }
                    });
                }
                
                // 5️⃣ Current bowler
                const bowlers = [];
                $$('.cb-col.cb-col-50:contains("(O)")').each((i, el) => {
                    const text = $$(el).text().trim();
                    
                    const name = text.split('(O)')[0].trim();
                    const oversMatch = text.match(/\(O\)\s*(\d+\.?\d*)/);
                    const runsMatch = text.match(/\(R\)\s*(\d+)/);
                    const wicketsMatch = text.match(/\(W\)\s*(\d+)/);
                    const econMatch = text.match(/Econ\s*(\d+\.?\d*)/);
                    
                    if (name) {
                        bowlers.push({
                            name: name,
                            overs: oversMatch ? oversMatch[1] : '0',
                            runs: runsMatch ? runsMatch[1] : '0',
                            wickets: wicketsMatch ? wicketsMatch[1] : '0',
                            economy: econMatch ? econMatch[1] : '0'
                        });
                    }
                });
                
                // 6️⃣ Partnership
                let partnership = '0(0)';
                $$('div:contains("P\'SHIP")').each((i, el) => {
                    const text = $$(el).text();
                    const match = text.match(/P'SHIP\s*(\d+)\s*\((\d+)\)/);
                    if (match) {
                        partnership = `${match[1]}(${match[2]})`;
                    }
                });
                
                // 7️⃣ Recent balls
                let recentBalls = '';
                $$('p:contains("Recent :")').each((i, el) => {
                    recentBalls = $$(el).text().replace('Recent :', '').trim();
                });
                
                // 8️⃣ Last wicket
                let lastWicket = '';
                $$('div:contains("Last Wkt:")').each((i, el) => {
                    lastWicket = $$(el).text().replace('Last Wkt:', '').trim();
                });
                
                // 9️⃣ Win probability
                let winProb = { team1: '0%', team2: '0%' };
                $$('.cb-min-inf div[style*="width"]').each((i, el) => {
                    const style = $$(el).attr('style') || '';
                    const title = $$(el).attr('title') || '';
                    const width = style.match(/width:(\d+)%/);
                    
                    if (width) {
                        if (title.includes('England')) winProb.team1 = width[1] + '%';
                        if (title.includes('Sri Lanka')) winProb.team2 = width[1] + '%';
                        if (title.includes('India')) winProb.team1 = width[1] + '%';
                        if (title.includes('South Africa')) winProb.team2 = width[1] + '%';
                    }
                });
                
                // Result එක හදන්නවා
                const result = {
                    status: 'success',
                    match: {
                        number: match.number,
                        name: match.name,
                        url: match.url,
                        title: title,
                        score: {
                            full: fullScore,
                            batting: score.battingTeam,
                            runs: score.runs,
                            wickets: score.wickets,
                            overs: score.overs
                        },
                        batsmen: batsmen,
                        bowler: bowlers.length > 0 ? bowlers[0] : null,
                        partnership: partnership,
                        recentBalls: recentBalls,
                        lastWicket: lastWicket,
                        winProbability: winProb
                    }
                };
                
                return res.status(200).json(result);
            } else {
                return res.status(404).json({
                    status: 'error',
                    message: 'Match not found'
                });
            }
        }
        
        // Match list එක return කරන්නවා
        return res.status(200).json({
            status: 'success',
            total: matches.length,
            matches: matches
        });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: error.message
        });
    }
};