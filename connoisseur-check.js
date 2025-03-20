const fs = require("node:fs");
const path = require("path");

const cachedDir = path.join(__dirname, "cached");

const args = process.argv.slice(2);

if (args.length < 1) {
	console.error("Error: You must provide a match ID.");
	process.exit(1);
}

const matchId = args[0];

const validGames = ["vail", "breachers", "onward", "pavlov"];
let game = "vail";
let fetchNew = false;

if (args[1]) {
	if (args[1] === "fetch") {
		fetchNew = true;
	} else if (validGames.includes(args[1])) {
		game = args[1];
	} else {
		console.error(`Error: Invalid game '${args[1]}'. Valid games are: ${validGames.join(", ")}`);
		process.exit(1);
	}
}

if ((args[2] && args[2] === "fetch")) {
	fetchNew = true;
}

const matchingFile = checkCachedFile(game);

if (!matchingFile && !fetchNew) {
	console.error(`Error: No cached file found for game '${game}'. Fetching new data...`);
	fetchNew = true;
}

function checkCachedFile(game) {
	if (!fs.existsSync(cachedDir)) {
		return false;
	}
	
	const files = fs.readdirSync(cachedDir);
	const matchingFile = files.find(file => file.startsWith(game));
	
	return matchingFile ? matchingFile : false;
}

async function getAllConnoisseurs(game) {
	console.log("Getting", game, "connoisseurs")
	const gameConnoisseurs = await fetch(`https://api.vrmasterleague.com/${game}/Connoisseurs`)
		.then(response => {
			if (!response.ok) throw new Error(`Failed to fetch connoisseurs, status: ${response.status}`);
			return response.json();
		})
		.then(async data => {
			const connoisseurs = data.connoisseurs;
			const pageCount = Math.floor(data.total / data.nbPerPage);
			let posMin = data.nbPerPage + 1;

			for (let i = 0; i < pageCount; i++) {
				try {
					const pageConnoisseurs = await fetch(`https://api.vrmasterleague.com/${game}/Connoisseurs?posMin=${posMin}`)
						.then(response => {
							if (!response.ok) throw new Error(`Failed to fetch page ${i + 1}, status: ${response.status}`);
							return response.json();
						})
						.then(data => data.connoisseurs);

					posMin += data.nbPerPage;
					connoisseurs.push(...pageConnoisseurs);
				} catch (error) {
					console.error(`Error fetching page ${i + 1}:`, error);
				}
			}
			return connoisseurs;
		})
		.catch(error => {
			console.error('Error fetching initial connoisseurs:', error);
			return [];
		});

	console.log(game, "connoisseurs found:", gameConnoisseurs.length);
	console.log("Fetching connoisseur history... (This will take a while)");

	const connoisseurHistories = {};

	for (const i of gameConnoisseurs) {
		try {
			const playerHistory = await fetch(`https://api.vrmasterleague.com/Players/${i.playerID}`)
				.then(response => {
						if (!response.ok) throw new Error(`Failed to fetch player ${i.playerID}, status: ${response.status}`);
						return response.json();
					})
				.then(data => data.connoisseurHistory);

			connoisseurHistories[i.userName] = playerHistory;

		} catch (error) {
			console.error(`Error fetching history for player ${i.playerID}:`, error);
		}
	}

	const currentDateTime = new Date();
	const currentDateTimeString = currentDateTime.getDate() + "-"
	 + (currentDateTime.getMonth() + 1) + "-"
		+ currentDateTime.getFullYear() + "_"
		 + currentDateTime.getHours() + "-"
			+ currentDateTime.getMinutes() + "-"
		 + currentDateTime.getSeconds();

	if (!fs.existsSync(cachedDir)) {
		console.log(`Creating missing directory: ${cachedDir}`);
		fs.mkdirSync(cachedDir, { recursive: true });
	}

	fs.writeFileSync(path.join(cachedDir, `${game}-${currentDateTimeString}.json`), JSON.stringify(connoisseurHistories, null, 2));

	return connoisseurHistories;
}

function processConnoisseurs(connoisseurHistories, matchId) {
	console.log("Checking", Object.keys(connoisseurHistories).length, "players for votes");

	const connoisseursResult = {};
	for (const [userName, playerHistory] of Object.entries(connoisseurHistories)) {
		const match = playerHistory.find(match => matchId === match.matchID);
		if (!match) continue;
		const voted = match.voteTeamID === match.homeTeam.teamID ? match.homeTeam.teamName : match.awayTeam.teamName;
		const right = match.voteTeamID === match.winningTeamID;
		connoisseursResult[userName] = { voted, right };
	}
	return connoisseursResult;
}


(async () => {
	try {
		let connoisseurHistories = {};
		if (fetchNew) {
			connoisseurHistories = await getAllConnoisseurs(game);
		} else {
			const cachedData = fs.readFileSync(path.join(cachedDir, matchingFile));
			connoisseurHistories = JSON.parse(cachedData);
		}

		const matchResults = processConnoisseurs(connoisseurHistories, matchId);
		if (Object.keys(connoisseurHistories).length === 0) {
			console.log("No votes found");
			return;
		}
		console.log("\nConnoisseur results:")

		const voteCounts = {};

		for (const [userName, result] of Object.entries(matchResults)) {
			console.log(`${userName}: ${result.voted}`);

			const team = result.voted;
  			voteCounts[team] = (voteCounts[team] || 0) + 1;
		}

		console.log("\nTotal votes per team:");
		for (const [team, count] of Object.entries(voteCounts)) {
			console.log(`${team}: ${count}`);
		}

	} catch (error) {
		console.error("Error processing connoisseurs", error);
	}
})();