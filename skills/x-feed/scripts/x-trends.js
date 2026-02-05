// x-trends.js
const woeid = process.argv[2] || '1'; // 1 world, 23424977 US
const token = process.env.X_BEARER_TOKEN;
if (!token) {
  console.error('Missing token');
  process.exit(1);
}
const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`;
fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(data => {
  if (data[0]) {
    console.log(`Trends (${woeid}):`);
    data[0].trends.slice(0, 10).forEach((t, i) => {
      console.log(`${i+1}. ${t.name} (${t.tweet_volume || 'N/A'})`);
    });
  }
}).catch(e => console.error(e));
