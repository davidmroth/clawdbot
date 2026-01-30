// skills/limitless/index.js
import https from 'node:https';

// Load config
let config = {};
try {
  // In a real environment, this might be passed differently, 
  // but standard Clawdbot skills can read process.env.LIMITLESS_API_KEY
  // or fall back to checking the config file passed via env if applicable.
  // For now, we stick to environment variable as primary, but will add logic to read from config if we can.
} catch (e) {}

const API_BASE = 'https://api.limitless.ai/v1';
// Try environment variable first, then check if we can parse arguments for config overrides
// But since the tool definition uses specific args, we rely on ENV.
// However, the user wants UI configuration.
// Clawdbot injects `CLAWDBOT_CONFIG` or similar if configured? No.
// Usually, Clawdbot sets environment variables based on the `skills.entries.limitless.env` config.
// So if the user uses the UI to set `skills.entries.limitless.apiKey`, the system should inject it.

// Let's check how the system injects the apiKey.
// In `skills.entries.[id].apiKey`, it's often injected as `[SKILL_NAME]_API_KEY`.
// So `LIMITLESS_API_KEY` should work if the system maps `apiKey` to that.
// Let's verify if I need to update the SKILL.md to say "apiKey" is mapped to "LIMITLESS_API_KEY".

const API_KEY = process.env.LIMITLESS_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  console.error('Error: LIMITLESS_API_KEY environment variable is not set.');
  process.exit(1);
}

async function request(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  console.log('Debug URL: ' + url.toString());
  console.log('Debug API_KEY len: ' + (API_KEY ? API_KEY.length : 0));
  console.log('Params: ' + JSON.stringify(params));
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      url.searchParams.append(key, params[key]);
    }
  });
  console.log('Query string: ' + Array.from(url.searchParams.entries()).map(([k,v]) => `${k}=${v}`).join('&'));

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Full Response (status ${res.statusCode}): ${data}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`API Request failed: ${res.statusCode} ${res.statusMessage} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function search(query, date, limit) {
  try {
    const params = {
      q: query,
      limit: limit || 3
    };
    if (date) params.date = date;

    const result = await request('/lifelogs', params);
    
    if (!result.data || !result.data.lifelogs) {
      console.log("No results found.");
      return;
    }

    const summaries = result.data.lifelogs.map(log => ({
      id: log.id,
      title: log.title,
      date: log.startTime,
      summary: log.markdown ? log.markdown.substring(0, 200) + "..." : "No summary"
    }));

    console.log(JSON.stringify(summaries, null, 2));
  } catch (error) {
    console.error("Search failed:", error.message);
    process.exit(1);
  }
}

async function get(id) {
  try {
    const result = await request(`/lifelogs/${id}`);
    console.log(JSON.stringify(result.data?.lifelog || result, null, 2));
  } catch (error) {
    console.error("Get failed:", error.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'search') {
  const query = args[1];
  let date;
  let limitStr = args[3] || '3';
  const limit = parseInt(limitStr, 10);
  if (args[2] && !args[2].startsWith('--')) {
    date = args[2];
  }
  search(query, date, limit);
} else if (command === 'get') {
  const id = args[1];
  get(id);
} else {
  console.error("Usage: node index.js [search|get] ...");
  process.exit(1);
}
