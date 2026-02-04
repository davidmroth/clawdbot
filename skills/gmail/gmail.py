#!/usr/bin/env python3

import os
import sys
import pickle
import json
import base64
import re
import argparse
from datetime import datetime
# from bs4 import BeautifulSoup
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from email.mime.text import MIMEText
from dateutil import parser as date_parser

# --- Logging ---
def log(message):
    sys.stderr.write(f"[{datetime.now().isoformat()}] {message}\n")

# --- Configuration ---
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
SKILL_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Helpers ---
def get_service():
    # 1. PRIORITY: Env Vars for Refresh Token (Headless/Docker)
    env_client_id = os.environ.get('GMAIL_CLIENT_ID')
    env_client_secret = os.environ.get('GMAIL_CLIENT_SECRET')
    env_refresh_token = os.environ.get('GMAIL_REFRESH_TOKEN')

    if env_client_id and env_client_secret and env_refresh_token:
        # log("Using credentials from environment variables.") # Reduce verbosity
        creds = Credentials(
            None, # No access token yet, refresh will get it
            refresh_token=env_refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=env_client_id,
            client_secret=env_client_secret,
            scopes=SCOPES
        )
    else:
        log("Error: Missing Environment Variables.")
        print("Error: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN must be set.")
        sys.exit(1)
            
    # If there are no (valid) credentials available, refresh them.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                log(f"Refresh failed: {e}")
                print(f"Auth Refresh Failed: {e}")
                sys.exit(1)
    try:
        service = build('gmail', 'v1', credentials=creds)
        return service
    except HttpError as error:
        log(f"An error occurred building service: {error}")
        sys.exit(1)

def get_header(headers, name):
    if not headers: return "N/A"
    for h in headers:
        if h['name'].lower() == name.lower():
            return h['value']
    return "N/A"

def parse_body(payload):
    body = ""
    if 'body' in payload and 'data' in payload['body']:
        return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
    
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                 if 'data' in part['body']:
                    body += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            elif part['mimeType'] == 'text/html':
                 # Fallback/Append? Let's prefer plain text if found, else html text
                 pass
    return body

# --- Commands ---

def list_messages(query, limit=10):
    service = get_service()
    try:
        log(f"Searching: {query}")
        results = service.users().messages().list(userId='me', q=query, maxResults=limit).execute()
        messages = results.get('messages', [])

        if not messages:
            print("No messages found.")
            return

        log(f"Found {len(messages)} messages. Fetching details...")
        
        for msg in messages:
            msg_detail = service.users().messages().get(userId='me', id=msg['id'], format='metadata', metadataHeaders=['From', 'To', 'Subject', 'Date']).execute()
            headers = msg_detail.get('payload', {}).get('headers', [])
            
            print(f"ID: {msg['id']}")
            print(f"From: {get_header(headers, 'From')}")
            print(f"To: {get_header(headers, 'To')}")
            print(f"Subject: {get_header(headers, 'Subject')}")
            print(f"Date: {get_header(headers, 'Date')}")
            print("---")

    except HttpError as error:
        log(f"An error occurred: {error}")
        print(f"An error occurred: {error}")

def read_message(uid, attachment=None):
    service = get_service()
    try:
        log(f"Reading message: {uid}")
        message = service.users().messages().get(userId='me', id=uid, format='full').execute()
        headers = message.get('payload', {}).get('headers', [])
        
        print(f"From: {get_header(headers, 'From')}")
        print(f"To: {get_header(headers, 'To')}")
        print(f"Subject: {get_header(headers, 'Subject')}")
        print(f"Date: {get_header(headers, 'Date')}")
        
        snippet = message.get('snippet', '')
        print(f"Snippet: {snippet}\n")
        
        print("Attachments:")
        payload = message['payload']
        if 'parts' in payload:
            for part in payload['parts']:
                filename = part.get('filename', 'unnamed')
                mime = part['mimeType']
                size = part['body'].get('size', 0)
                print(f"  - {filename} ({mime}, {size}B)")
        elif 'filename' in payload:
            filename = payload['filename']
            mime = payload['mimeType']
            size = payload['body'].get('size', 0)
            print(f"  - {filename} ({mime}, {size}B)")
        print("")
        
        if attachment:
            print(f"Reading attachment: {attachment}")
            payload = message['payload']
            found = False
            if 'parts' in payload:
                for part in payload['parts']:
                    if part.get('filename') == attachment:
                        att_id = part['body']['attachmentId']
                        att = service.users().messages().attachments().get(userId='me', messageId=uid, id=att_id).execute()
                        data = base64.urlsafe_b64decode(att['data'])
                        filename = attachment
                        tmp_file = f'/tmp/{filename}'
                        with open(tmp_file, 'wb') as f:
                            f.write(data)
                        print(f"Saved {tmp_file}")
                        if filename.lower().endswith('.pdf'):
                            import pdfplumber
                            with pdfplumber.open(tmp_file) as pdf:
                                text = ''
                                for page in pdf.pages:
                                    text += page.extract_text() or ''
                                print("PDF Text Preview:")
                                print(text[:3000] + ('...' if len(text) > 3000 else ''))
                                amounts = re.findall(r'\\$([0-9,]+\\.?[0-9]*)', text)
                                print(f"Amounts: {list(set(amounts))}")
                        else:
                            print("Text content:")
                            with open(tmp_file, 'r') as f:
                                print(f.read()[:2000])
                        found = True
                        break
            if not found:
                print(f"Attachment '{attachment}' not found.")
        
        # Parse full body - simple recursive finder for text/plain
        def get_text_part(part):
            if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                 return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            if 'parts' in part:
                for sub in part['parts']:
                    res = get_text_part(sub)
                    if res: return res
            return None

        body = get_text_part(message['payload'])
        
        # If no plain text, try HTML and strip tags
        if not body:
             def get_html_part(part):
                if part['mimeType'] == 'text/html' and 'data' in part['body']:
                     return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                if 'parts' in part:
                    for sub in part['parts']:
                        res = get_html_part(sub)
                        if res: return res
                return None
             html_content = get_html_part(message['payload'])
             if html_content:
                 from bs4 import BeautifulSoup
                 soup = BeautifulSoup(html_content, 'html.parser')
                 body = soup.get_text()
        
        print("Body:")
        if body:
            print(body[:2000] + ("..." if len(body) > 2000 else ""))
        else:
            print("[No text body found]")

    except HttpError as error:
        log(f"An error occurred: {error}")
        print(f"Error reading message: {error}")

def send_email(to, subject, body):
    service = get_service()
    try:
        log(f"Sending email to {to}")
        message = MIMEText(body)
        message['to'] = to
        message['from'] = 'me' # Special 'me' value
        message['subject'] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {'raw': raw}
        
        send_message = service.users().messages().send(userId='me', body=create_message).execute()
        print(f"Message Sent. Id: {send_message['id']}")
        log(f"Message Sent. Id: {send_message['id']}")
    except HttpError as error:
        log(f"An error occurred: {error}")
        print(f"Error sending email: {error}")

def scrape_latest():
    service = get_service()
    try:
        # Search for all messages, get latest
        results = service.users().messages().list(userId='me', maxResults=1).execute()
        messages = results.get('messages', [])
        
        if not messages:
            print("No messages found.")
            return
            
        latest_id = messages[0]['id']
        message = service.users().messages().get(userId='me', id=latest_id, format='full').execute()
        headers = message.get('payload', {}).get('headers', [])
        
        print(f"From: {get_header(headers, 'From')}")
        print(f"Subject: {get_header(headers, 'Subject')}")
        
        # Get content for scraping
        def get_all_text(part):
            text = ""
            if 'data' in part['body']:
                 text += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            if 'parts' in part:
                for sub in part['parts']:
                     text += get_all_text(sub)
            return text

        full_text = get_all_text(message['payload'])
        
        # If HTML, parse it
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(full_text, 'html.parser')
        clean_text = soup.get_text()
        
        amounts = re.findall(r'\$[0-9,]+\.?[0-9]*', clean_text)
        unique_amounts = sorted(list(set(amounts)))
        print("Amounts:", unique_amounts)
        log(f"Scrape complete. Found {len(unique_amounts)} amounts.")
        
    except HttpError as error:
         log(f"An error occurred: {error}")
         print(f"Error: {error}")

# --- Main ---
def main():
    parser = argparse.ArgumentParser(description="Gmail CLI Skill (Official API)")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # unread
    parser_unread = subparsers.add_parser("unread", help="List unread emails")
    parser_unread.add_argument("--limit", type=int, default=10, help="Limit number of emails")

    # search
    parser_search = subparsers.add_parser("search", help="Search emails")
    parser_search.add_argument("query", type=str, help="Search query")
    parser_search.add_argument("--limit", type=int, default=10, help="Limit number of emails")
    
    # read
    parser_read = subparsers.add_parser("read", help="Read email by ID")
    parser_read.add_argument("uid", type=str, help="Message ID")
    parser_read.add_argument("--attachment", nargs="?", help="Attachment filename to read")
    
    # send
    parser_send = subparsers.add_parser("send", help="Send email")
    parser_send.add_argument("to", type=str, help="Recipient")
    parser_send.add_argument("subject", type=str, help="Subject")
    parser_send.add_argument("body", type=str, nargs="?", default="", help="Body content")

    parser_daily = subparsers.add_parser("daily", help="Daily unread (today)")
    parser_daily.add_argument("--limit", type=int, default=20, help="Limit")

    args = parser.parse_args()
    
    # Default behavior: scrape
    if args.command is None:
        scrape_latest()
        return

    if args.command == "unread":
        list_messages("is:unread", args.limit)
    elif args.command == "search":
        list_messages(args.query, args.limit)
    elif args.command == "daily":
        list_messages("newer_than:1d is:unread", args.limit)
    elif args.command == "read":
        read_message(args.uid, args.attachment)
    elif args.command == "send":
        send_email(args.to, args.subject, args.body)

if __name__ == "__main__":
    main()
