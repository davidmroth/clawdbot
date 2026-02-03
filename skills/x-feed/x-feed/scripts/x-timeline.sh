#!/bin/bash
query=\"${1:-}\"
limit=${2:-20}
if [ -z \"$X_BEARER_TOKEN\" ]; then
  echo \"Missing X_BEARER_TOKEN\"
  exit 1
fi
curl -s -H \"Authorization: Bearer $X_BEARER_TOKEN\" \\
  \"https://api.twitter.com/2/tweets/search/recent?query=$query&max_results=$limit&tweet.fields=created_at,author_id,text,public_metrics\" | \\
jq -r '.data[] | \"• \\(.author_id): \\(.text) (\\(.created_at)) likes:\\(.public_metrics.like_count)\"' || echo \"No tweets (jq/API error)\""
</xai:function_call ><xai:function_call name="exec">
<parameter name="command">chmod +x /home/node/clawd/skills/x-feed/x-feed/scripts/x-timeline.sh