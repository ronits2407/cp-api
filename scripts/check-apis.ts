import { cp } from '../src/index';

async function checkCodeforces() {
  console.log("Checking Codeforces API...");
  try {
    const users = await cp.codeforces.getUser("tourist");
    const user = users[0];
    if (!user || user.handle !== "tourist") {
      throw new Error("Codeforces getUser failed or returned invalid data.");
    }
    
    // Also perform a fetch of the API help page to see if it's reachable and hasn't changed dramatically
    // A simple sanity check on the length or presence of expected text could serve as a proxy for changes.
    const axios = require('axios');
    const res = await axios.get("https://codeforces.com/apiHelp", {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.status !== 200) throw new Error("Codeforces API Help page is unreachable.");
    
    const text = res.data;
    if (!text.includes("user.info") || !text.includes("contest.list")) {
      throw new Error("Codeforces API Help page has fundamentally changed.");
    }
    
    console.log("✅ Codeforces API looks good.");
  } catch (error) {
    console.error("❌ Codeforces API check failed:", error);
    process.exit(1);
  }
}

async function checkLeetCode() {
  console.log("Checking LeetCode API...");
  try {
    // Leetcode uses GraphQL, check if query still works
    const user = await cp.leetcode.getUser("tourist");
    // "tourist" might not exist on LeetCode, but let's test a known user like "lee215" or just see if the request succeeds (doesn't throw a schema error)
    if (user !== undefined) {
      console.log("✅ LeetCode API looks good.");
    } else {
       console.log("✅ LeetCode API returned empty (could be non-existent user), but no schema error.");
    }
  } catch (error) {
    console.error("❌ LeetCode API check failed:", error);
    process.exit(1);
  }
}

async function checkCodeChef() {
  console.log("Checking CodeChef API...");
  try {
    const contests = await cp.codechef.getUpcomingContests();
    if (Array.isArray(contests)) {
      console.log("✅ CodeChef API looks good.");
    } else {
      console.log("✅ CodeChef API returned empty, but no error.");
    }
  } catch (error) {
    console.error("❌ CodeChef API check failed:", error);
    process.exit(1);
  }
}

async function checkAtCoder() {
  console.log("Checking AtCoder API...");
  try {
    const user = await cp.atcoder.getUser("tourist");
    if (user !== undefined) {
      console.log("✅ AtCoder API looks good.");
    } else {
      console.log("✅ AtCoder API returned empty, but no error.");
    }
  } catch (error) {
    console.error("❌ AtCoder API check failed:", error);
    process.exit(1);
  }
}

async function main() {
  console.log("Starting API documentation and usage checks...");
  await checkCodeforces();
  await checkLeetCode();
  await checkCodeChef();
  await checkAtCoder();
  console.log("All API checks passed successfully!");
}

main().catch((err) => {
  console.error("API checks failed with an unexpected error:", err);
  process.exit(1);
});
