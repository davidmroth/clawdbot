#!/usr/bin/env python3

import os
import sys
import argparse
import tweepy
import json
from datetime import datetime

# --- Logging ---
def log(message):
    sys.stderr.write(f"[{datetime.now().isoformat()}] {message}\n")

# --- Helpers ---
def get_client():
    consumer_key = os.environ.get('X_KEY')
    consumer_secret = os.environ.get('X_SECRET')
    bearer_token = os.environ.get('X_BEARER_TOKEN')
    access_token = os.environ.get('X_OAUTH_ID')
    access_token_secret = os.environ.get('X_OAUTH_SECRET')

    if not consumer_key or not consumer_secret:
        log("Error: Missing Consumer Keys (X_KEY, X_SECRET)")
        print("Error: X_KEY and X_SECRET must be set.")
        sys.exit(1)

    try:
        # Initialize Client with both Bearer Token (for higher rate limits on some endpoints)
        # and User Context keys (for home_timeline, posting, etc.)
        client = tweepy.Client(
            bearer_token=bearer_token,
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            access_token=access_token,
            access_token_secret=access_token_secret,
            wait_on_rate_limit=True
        )
        return client
    except Exception as e:
        log(f"Error initializing Tweepy Client: {e}")
        sys.exit(1)

def print_tweet(tweet, users_dict):
    author_id = tweet.author_id
    author = users_dict.get(author_id)
    username = author.username if author else "unknown"
    name = author.name if author else "Unknown"
    
    print(f"ID: {tweet.id}")
    print(f"Author: {name} (@{username})")
    print(f"Date: {tweet.created_at}")
    print(f"Text: {tweet.text}")
    print("---")

# --- Commands ---

def get_home_timeline(limit=10):
    client = get_client()
    try:
        log(f"Fetching home timeline (limit={limit})...")
        response = client.get_home_timeline(
            max_results=limit,
            tweet_fields=['created_at', 'author_id'],
            expansions=['author_id']
        )
        
        if not response.data:
            print("No tweets found in home timeline.")
            return

        users = {u.id: u for u in response.includes['users']} if 'users' in response.includes else {}
        
        for tweet in response.data:
            print_tweet(tweet, users)
            
    except tweepy.TweepyException as e:
        log(f"Tweepy Error: {e}")
        print(f"Error fetching timeline: {e}")

def get_user_tweets(username, limit=10):
    client = get_client()
    try:
        log(f"Fetching tweets for @{username} (limit={limit})...")
        
        # First get user ID
        user_response = client.get_user(username=username)
        if not user_response.data:
            print(f"User @{username} not found.")
            return
            
        user_id = user_response.data.id
        
        response = client.get_users_tweets(
            id=user_id,
            max_results=limit,
            tweet_fields=['created_at', 'author_id'],
            expansions=['author_id']
        )
        
        if not response.data:
            print(f"No tweets found for @{username}.")
            return
            
        users = {u.id: u for u in response.includes['users']} if 'users' in response.includes else {}
        
        for tweet in response.data:
            print_tweet(tweet, users)

    except tweepy.TweepyException as e:
        log(f"Tweepy Error: {e}")
        print(f"Error fetching user tweets: {e}")

def search_tweets(query, limit=10):
    client = get_client()
    try:
        log(f"Searching tweets: '{query}' (limit={limit})...")
        response = client.search_recent_tweets(
            query=query,
            max_results=limit,
            tweet_fields=['created_at', 'author_id'],
            expansions=['author_id']
        )
        
        if not response.data:
            print(f"No tweets found for query: {query}")
            return
            
        users = {u.id: u for u in response.includes['users']} if 'users' in response.includes else {}
        
        for tweet in response.data:
            print_tweet(tweet, users)

    except tweepy.TweepyException as e:
        log(f"Tweepy Error: {e}")
        print(f"Error searching tweets: {e}")

def post_tweet(text):
    client = get_client()
    try:
        log("Posting tweet...")
        response = client.create_tweet(text=text)
        print(f"Tweet posted successfully! ID: {response.data['id']}")
        log(f"Tweet posted. ID: {response.data['id']}")
    except tweepy.TweepyException as e:
        log(f"Tweepy Error: {e}")
        print(f"Error posting tweet: {e}")

def handle_auth(pin=None):
    consumer_key = os.environ.get('X_KEY')
    consumer_secret = os.environ.get('X_SECRET')
    
    if not consumer_key or not consumer_secret:
        log("Error: Missing Consumer Keys (X_KEY, X_SECRET)")
        print("Error: X_KEY and X_SECRET must be set to start authentication.")
        sys.exit(1)

    oauth_file = '.twitter_oauth_token'

    if pin:
        # Complete Auth
        if not os.path.exists(oauth_file):
            print("Error: No pending authentication found. Run 'auth' without --pin first.")
            sys.exit(1)
            
        try:
            with open(oauth_file, 'r') as f:
                request_token = json.load(f)
        except Exception as e:
             print(f"Error reading pending auth data: {e}")
             sys.exit(1)

        try:
            auth = tweepy.OAuth1UserHandler(
                consumer_key, consumer_secret
            )
            auth.request_token = request_token
            
            access_token, access_token_secret = auth.get_access_token(pin)
            
            print("Authentication Successful!")
            print("Add these to your environment variables:")
            print(f"X_OAUTH_ID={access_token}")
            print(f"X_OAUTH_SECRET={access_token_secret}")
            
            os.remove(oauth_file)
            
        except tweepy.TweepyException as e:
            print(f"Authentication failed: {e}")
            sys.exit(1)

    else:
        # Start Auth
        try:
            auth = tweepy.OAuth1UserHandler(consumer_key, consumer_secret)
            try:
                url = auth.get_authorization_url()
            except tweepy.TweepyException as e:
                print(f"Error getting authorization URL: {e}")
                sys.exit(1)
                
            # Save request_token
            with open(oauth_file, 'w') as f:
                json.dump(auth.request_token, f)
                
            print("Please visit this URL to authorize the app:")
            print(url)
            print("\nAfter authorizing, run this command with the PIN you receive:")
            print("python3 skills/twitter/twitter.py auth --pin <PIN_CODE>")
            
        except Exception as e:
            log(f"Error starting auth: {e}")
            print(f"Error: {e}")
            sys.exit(1)

# --- Main ---
def main():
    parser = argparse.ArgumentParser(description="Twitter CLI Skill (Tweepy)")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # timeline
    parser_timeline = subparsers.add_parser("timeline", help="Fetch home timeline")
    parser_timeline.add_argument("--limit", type=int, default=10, help="Number of tweets")

    # tweets
    parser_tweets = subparsers.add_parser("tweets", help="Fetch user tweets")
    parser_tweets.add_argument("username", type=str, nargs="?", help="Username (optional, default: authenticated user)")
    parser_tweets.add_argument("--limit", type=int, default=10, help="Number of tweets")

    # search
    parser_search = subparsers.add_parser("search", help="Search tweets")
    parser_search.add_argument("query", type=str, help="Search query")
    parser_search.add_argument("--limit", type=int, default=10, help="Number of tweets")

    # post
    parser_post = subparsers.add_parser("post", help="Post a tweet")
    parser_post.add_argument("text", type=str, help="Tweet text")

    # auth
    parser_auth = subparsers.add_parser("auth", help="Authenticate with Twitter")
    parser_auth.add_argument("--pin", type=str, help="PIN from authorization URL")

    args = parser.parse_args()

    if args.command == "timeline":
        get_home_timeline(args.limit)
    elif args.command == "tweets":
        if args.username:
            get_user_tweets(args.username, args.limit)
        else:
            # If no username, fetch "me" api call to get username or just use get_users_tweets with me
             client = get_client()
             me = client.get_me()
             if me.data:
                 get_user_tweets(me.data.username, args.limit)
             else:
                 print("Could not determine authenticated user.")
    elif args.command == "search":
        search_tweets(args.query, args.limit)
    elif args.command == "post":
        post_tweet(args.text)
    elif args.command == "auth":
        handle_auth(args.pin)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
