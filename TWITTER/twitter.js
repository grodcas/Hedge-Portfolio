process.env.Bearer_tk
process.env.Acces_tk
process.env.Acces_tk_sec 
process.env.API_key 
process.env.API_key_sec 

import axios from "axios";

const BEARER_TOKEN = Bearer_tk; // paste yours

// username = "elonmusk", "Reuters", "business", etc.
async function getLatestTweets(username) {
  try {
    // Step 1: get user ID from username
    const user = await axios.get(
      `https://api.x.com/2/users/by/username/${username}`,
      {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
      }
    );

    const userId = user.data.data.id;

    // Step 2: get tweets for that user ID
    const tweets = await axios.get(
      `https://api.x.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,public_metrics`,
      {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
      }
    );

    console.log(`Tweets from @${username}`);
    tweets.data.data.forEach(t => {
      console.log("\n---------------------");
      console.log(t.created_at);
      console.log(t.text);
    });

  } catch (err) {
    console.error("API error:", err.response?.data || err.message);
  }
}

// TEST
getLatestTweets("elonmusk");   // change to any user
