# Requests from the website, the app and itch.io

inbox.json holds the newest 300 requests players sent with the Ask button outside Claude. Each one is locked with the owner's public key, so only the owner (through Claude) can read it. GitHub refreshes this branch every two hours (.github/workflows/web-asks.yml).
