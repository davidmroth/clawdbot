// x-home-timeline.js (user tweets paginated ~ home)
const username = process.argv[2] || 'elonmusk';
const max_results = parseInt(process.argv[3]) || 20;
const next_token = process.argv[4] || '';
const token = process.env.X_BEARER_TOKEN;
if (!token) {
  console.error('Missing X_BEARER_TOKEN');
  process.exit(1);
}
async function getUserTweets(userId, token, max_results, next_token) {
  let url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=${max_results}&tweet.fields=created_at,text,public_metrics,author_id`;
  if (next_token) url += `&pagination_token=${next_token}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data;
}
async function main() {
  const userUrl = `https://api.twitter.com/2/users/by/username/${username}`;
  const userRes = await fetch(userUrl, { headers: { Authorization: `Bearer ${token}` } });
  const userData = await userRes.json();
  if (userData.errors) {
    console.error(userData.errors);
    return;
  }
  const userId = userData.data.id;
  const tweets = await getUserTweets(userId, token, max_results, next_token);
  if (tweets.data) {
    tweets.data.forEach(t => {
      console.log(`• ${t.text.substring(0, 100)}... (${t.created_at}) likes: ${t.public_metrics.like_count}`);
    });
  }
  if (tweets.meta.next_token) console.log(`Next: ${tweets.meta.next_token}`);
}
main().catch(console.error);