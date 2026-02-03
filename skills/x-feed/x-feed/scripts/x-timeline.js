// x-feed timeline
const username = process.argv[2] || '';
const max_results = parseInt(process.argv[3]) || 20;
const format = process.argv[4] || 'bullet';
const token = process.env.X_BEARER_TOKEN;
if (!token) {
  console.error('X_BEARER_TOKEN missing');
  process.exit(1);
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
  let url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=${max_results}&tweet.fields=created_at,text,public_metrics,author_id`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.data) {
    console.log('No tweets');
    return;
  }
  data.data.forEach((t, i) => {
    const likes = t.public_metrics.like_count;
    const date = t.created_at.slice(0, 16);
    const text = t.text.length > 100 ? t.text.slice(0, 100) + '...' : t.text;
    if (format === 'plain') {
      console.log(`${i+1}. ${text} - @${t.author_id} (${date}) likes: ${likes}`);
    } else if (format === 'json') {
      console.log(JSON.stringify({text, author_id: t.author_id, date, likes}));
    } else {
      console.log(`• ${text} (${date}) likes: ${likes}`);
    }
  });
  if (data.meta.next_token) console.log(`Next token: ${data.meta.next_token}`);
}
main().catch(e => console.error(e.message));