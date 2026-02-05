// x-feed search recent (filter likes)
const query = process.argv[2] || '';
const max_results = parseInt(process.argv[3]) || 20;
const min_likes = parseInt(process.argv[4]) || 0;
const token = process.env.X_BEARER_TOKEN;
if (!token) {
  console.error('X_BEARER_TOKEN missing');
  process.exit(1);
}
const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${max_results}&tweet.fields=created_at,text,public_metrics,author_id`;
fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(data => {
  if (!data.data) {
    console.log('No tweets');
    return;
  }
  const filtered = data.data.filter(t => t.public_metrics.like_count >= min_likes);
  filtered.forEach((t, i) => {
    const likes = t.public_metrics.like_count;
    const date = t.created_at.slice(0, 16);
    const text = t.text.length > 100 ? t.text.slice(0, 100) + '...' : t.text;
    console.log(`${i+1}. ${text} (${date}) likes: ${likes}`);
  });
  console.log(`Filtered ${filtered.length}/${data.data.length} (>= ${min_likes} likes)`);
}).catch(e => console.error(e.message));
