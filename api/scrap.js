import axios from "axios";
import cheerio from "cheerio";

const BASE_URL = "https://www.cricbuzz.com";

export default async function handler(req, res) {
  try {
    const { live } = req.query;

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    };

    // Fetch homepage
    const response = await axios.get(BASE_URL, {
      headers,
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    let matches = [];
    let seen = new Set();

    $("a[href*='/live-cricket-scores/']").each((i, el) => {
      const href = $(el).attr("href");
      const title = $(el).attr("title");

      if (href && title && title.includes(" vs ")) {
        const fullUrl = BASE_URL + href;

        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          matches.push({
            number: matches.length + 1,
            match_name: title.trim(),
            match_url: fullUrl
          });
        }
      }
    });

    if (!matches.length) {
      return res.status(200).json({
        creator: "chathura hansaka",
        status: false,
        result: "No live matches found or blocked by Cricbuzz"
      });
    }

    // ===============================
    // If specific match requested
    // ===============================
    if (live) {
      const index = parseInt(live) - 1;

      if (isNaN(index) || !matches[index]) {
        return res.status(200).json({
          creator: "chathura hansaka",
          status: false,
          result: "Invalid match number"
        });
      }

      try {
        const matchPage = await axios.get(matches[index].match_url, {
          headers,
          timeout: 10000
        });

        const $$ = cheerio.load(matchPage.data);

        const metaDesc = $$("meta[name='description']").attr("content");

        let score = "Score not found";

        if (metaDesc) {
          const match = metaDesc.match(/Follow (.*? \d+\/\d+ \(\d+\))/);
          if (match) score = match[1];
        }

        return res.status(200).json({
          creator: "chathura hansaka",
          status: true,
          result: {
            match_number: live,
            match_name: matches[index].match_name,
            live_score: score,
            url: matches[index].match_url
          }
        });
      } catch (err) {
        return res.status(200).json({
          creator: "chathura hansaka",
          status: false,
          result: "Failed to fetch match details"
        });
      }
    }

    // Default → return match list
    return res.status(200).json({
      creator: "chathura hansaka",
      status: true,
      result: matches
    });

  } catch (error) {
    return res.status(200).json({
      creator: "chathura hansaka",
      status: false,
      result: "Server error or Cricbuzz blocked request"
    });
  }
}