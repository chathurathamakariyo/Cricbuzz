import axios from "axios";
import cheerio from "cheerio";

const BASE_URL = "https://www.cricbuzz.com";

export default async function handler(req, res) {
  try {
    const { live } = req.query;

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    };

    // =========================
    // 1️⃣ Get Live Matches List
    // =========================
    const response = await axios.get(BASE_URL, { headers });
    const $ = cheerio.load(response.data);

    let matches = [];

    $("a[href*='/live-cricket-scores/']").each((i, el) => {
      const href = $(el).attr("href");
      const title = $(el).attr("title");

      if (href && title && title.includes(" vs ")) {
        matches.push({
          number: matches.length + 1,
          match_name: title,
          match_url: BASE_URL + href,
        });
      }
    });

    if (!matches.length) {
      return res.status(200).json({
        creator: "chathura hansaka",
        status: false,
        result: "No live matches found",
      });
    }

    // =========================
    // 2️⃣ If ?live=number given
    // =========================
    if (live) {
      const index = parseInt(live) - 1;

      if (!matches[index]) {
        return res.status(200).json({
          creator: "chathura hansaka",
          status: false,
          result: "Invalid match number",
        });
      }

      const selectedMatch = matches[index];

      const matchPage = await axios.get(selectedMatch.match_url, { headers });
      const $$ = cheerio.load(matchPage.data);

      // Meta description වලින් score ගන්න
      const metaDesc = $$("meta[name='description']").attr("content");

      let score = "Score not found";

      if (metaDesc && metaDesc.includes("Follow")) {
        const match = metaDesc.match(/Follow (.*? \d+\/\d+ \(\d+\))/);
        if (match) score = match[1];
      }

      return res.status(200).json({
        creator: "chathura hansaka",
        status: true,
        result: {
          match_number: live,
          match_name: selectedMatch.match_name,
          live_score: score,
          url: selectedMatch.match_url,
        },
      });
    }

    // =========================
    // 3️⃣ Default → Match List
    // =========================
    return res.status(200).json({
      creator: "chathura hansaka",
      status: true,
      result: matches,
    });
  } catch (error) {
    return res.status(200).json({
      creator: "chathura hansaka",
      status: false,
      result: error.message,
    });
  }
}