# Connoisseur check
This script processes voting results for a given match, displaying individual votes and calculating total votes for each team.

It saves fetched connoisseur history to reduce time waiting for api calls.

## Usage
```sh
node connoisseur-check.js <matchId (required)> [game (defaults to "vail")] [fetch (fetches new data from VRML)]
```