import logger from './logger.js';

import * as engine from '<@engine@>';
import Planet from '<@Planet@>';
import Enemy from '<@Enemy@>';
import * as message from '../shared/message.js';
const vinage = require('vinage');

const MAX_LOBBY_COUNT = 5; //TODO: add it to the settings
const DEFAULT_PLAYER_AMOUNT = 2; //TODO: see above

const TIME_ROUND_LENGTH = 60 * 60 * 1000; //1h
const TIME_DISPLAY_LENGTH = 5000;	//5 seconds
const TIME_SCORE_FREQ = 1000;		//1Hz
const TIME_GAME_FREQ = 16;			//60Hz

class NullArray {
	constructor(maxLength) {
		this.array = new Array(maxLength);
		this.__defineGetter__('length', () => {
			let length = 0;
			for (let player of this.array) if (player) ++length;
			return length;
		});
	}
	add(item) {
		let index;
		for (index = 0; index != this.array.length; ++index) {
			if (!this.array[index]) break;
		}
		if (index === this.array.length) return -1;
		this.array[index] = item;
		return index;
	}
	del(index) {
		delete this.array[index];
	}
	get(index) {
		return this.array[index];
	}
	iterate(callback) {
		this.array.forEach((element, index, array) => {
			if (element) callback(element, index, array);
		});
	}
}

export let lobbies = new NullArray(MAX_LOBBY_COUNT);

export function newLobby(maxPlayers) {
	let lobby = new Lobby(maxPlayers || DEFAULT_PLAYER_AMOUNT);
	let id = lobbies.add(lobby);
	return lobby.lobbyId = id; //this is on purpose
}
export function deleteLobby(index) {
	lobbies.get(index).close();
	lobbies.del(index);
}

class Lobby {
	constructor(maxPlayers) {
		function univSize() {
			// (1 << 16) - 1 is the max size allowed by the protocol
			let max = 8000,
				min = 6000;

			return Math.floor(Math.random() * (max - min + 1)) + min;
		}

		this.maxPlayers = maxPlayers;
		this.players = new NullArray(maxPlayers);
		this.planets = [];
		this.enemies = [];
		this.shots = [];

		this.processTime = 2; //wut, why is it 2?
		this.lobbyState = 'warmup';
		this.lobbyId = -1;
		this.universe = new vinage.Rectangle(new vinage.Point(0, 0), univSize(), univSize());
		this.resetWorld();
		this.gameCycleId = setInterval(this.updateGame.bind(this), 16);
		this.cycleId = 0;
	}

	changeState(newState) {
		this.lobbyState = newState;
		logger(logger.DEV, 'Lobby state change: ' + newState.bold);
	}
	warmupToPlaying() {
		this.changeState('playing');
		for (let planet of this.planets) {
			planet.resetProgress();
		}

		this.updateScores();
		this.scoreCycleId = setInterval(this.updateScores.bind(this), TIME_SCORE_FREQ);
		this.cycleId = setTimeout(this.playingToDisplaying.bind(this), TIME_ROUND_LENGTH);
	}
	playingToDisplaying() {
		this.changeState('displaying_scores');

		clearInterval(this.gameCycleId);
		clearInterval(this.scoreCycleId);
		this.broadcast(message.displayScores.serialize(this.getScores()));

		this.cycleId = setTimeout(this.displayingToWarmup.bind(this), TIME_DISPLAY_LENGTH);
	}
	displayingToWarmup() {
		this.changeState('warmup');

		this.resetWorld();
		let thisLobbyId = lobbies.array.indexOf(this);
		this.players.iterate(player => {
			player.send(message.warmup.serialize(this.getScores(), thisLobbyId, player.pid, this.universe.width, this.universe.height, this.planets, this.enemies, this.shots, this.players.array));
		});
		this.gameCycleId = setInterval(this.updateGame.bind(this), TIME_GAME_FREQ);
	}

	enoughPlayers(amount) {
		return amount === undefined ? this.players.length !== 0 : amount >= this.maxPlayers * 0.5;
	}
	connectPlayer(player) {
		switch(this.lobbyState) {
			case 'warmup':
				this.assignPlayerTeam(player);
				player.send(message.warmup.serialize(this.getScores(), player.lobby.lobbyId, player.pid, this.universe.width, this.universe.height, this.planets, this.enemies, this.shots, this.players.array));
				this.broadcast(message.addEntity.serialize(undefined, undefined, undefined, [player]), player);
				break;
			case 'playing':
				this.assignPlayerTeam(player);
				player.send(message.warmup.serialize(this.getScores(), player.lobby.lobbyId, player.pid, this.universe.width, this.universe.height, this.planets, this.enemies, this.shots, this.players.array));
				player.send(message.scores.serialize(this.getScores()));
				this.broadcast(message.addEntity.serialize(undefined, undefined, undefined, [player]), player);
				break;
			case 'displaying_scores':
				player.send(message.displayScores.serialize(this.getScores()));
				break;
		}
	}
	disconnectPlayer(player, to) {
		logger(logger.INFO, 'Player \'{0}\' {1}', player.name, to ? 'timed out' : 'disconnected');
		let pid = player.pid;
		this.players.del(pid);
		this.broadcast(message.removeEntity.serialize([], [], [], [pid]));

		return this.players.length === 0;
	}
	broadcast(message, exclude) {
		this.players.iterate(player => {
			if (player !== exclude) player.send(message);
		});
	}
	close() {
		logger(logger.INFO, 'Lobby #{0} will be closed', this.lobbyId);
		clearTimeout(this.cycleId);
		clearInterval(this.gameCycleId);
		clearInterval(this.scoreCycleId);
	}

	updateGame() {
		if (this.lobbyState === 'warmup' && this.enoughPlayers()) this.warmupToPlaying();

		let oldDate = Date.now(),
			entitiesDelta = engine.doPhysics(this.universe, this.players.array, this.planets, this.enemies, this.shots, this.teamScores, this.lobbyState);

		//if a shot is added and removed at the same moment, don't send it to clients
		entitiesDelta.addedShots.forEach(function(shot, iAdd) { // dat apple fanboy tho
			let iRm = entitiesDelta.removedShots.indexOf(shot);
			if (iRm !== -1) {
				entitiesDelta.addedShots.splice(iAdd, 1);
				entitiesDelta.removedShots.splice(iRm, 1);
			}
		});
		if (entitiesDelta.addedShots.length != 0) this.broadcast(message.addEntity.serialize([], [], entitiesDelta.addedShots, []));
		//if (entitiesDelta.removedShots.length != 0) this.broadcast(message.removeEntity.serialize([], [], entitiesDelta.removedShots, [])); // Why is this disabled?

		this.players.iterate((player => {
			let now = Date.now();
			if (now - player.lastMessage > 7000) {
				this.disconnectPlayer(player, true);
			} else if (now - player.lastUpdate > 50) {
				player.send(message.gameState.serialize(player.health, player.stamina, this.planets, this.enemies, this.players.array));
				player.lastUpdate = now;
			}
		}).bind(this));
		this.processTime = Date.now() - oldDate;
	}
	updateScores() {
		this.planets.forEach((function(planet) {
			if (planet.progress >= 80) this.teamScores[planet.team]++;
		}), this);
		this.broadcast(message.scores.serialize(this.teamScores));
	}
	getScores() {
		let i = {}, a;
		for (a in this.teamScores) if (a.indexOf('alien') !== -1) i[a] = this.teamScores[a];
		return i;
	}
	getNextHomographId(playerName) {
		let homographId = 0;
		this.players.iterate(function(player) {
			if (player.name === playerName && player.homographId === homographId) ++homographId;
		});
		return homographId;
	}
	resetWorld() {//generate world
		this.planets.length = 0;
		this.enemies.length = 0;

		let planetDensity = Math.pow(6400, 2) / 26,
			planetAmount = Math.round((this.universe.width*this.universe.height) / planetDensity),
			enemyDensity = Math.pow(6400, 2) / 15,
			enemyAmount = Math.round((this.universe.width*this.universe.height) / enemyDensity);
		if (planetAmount > 254) planetAmount = 254;//these limits are set
		if (enemyAmount > 255) enemyAmount = 255;//by the protocol
		//the ID of the planets and the enemies is stored on a single byte
		//however, the planet ID value 255 (aka a wrapped -1) is reserved to be used when the player is not attached to a planet (player.attachedPlanet = -1)
		function distanceBetween(box1, box2) {
			let var1 = box2.center.x - box1.center.x, var2 = box2.center.y - box1.center.y;
			return Math.sqrt(var1 * var1 + var2 * var2);
		}
		let maxIterations = planetAmount * 4;
		for (let i = 0, iterations = 0; i !== planetAmount, iterations !== maxIterations; ++i, ++iterations) {
			let newPlanet = new Planet(Math.random()*this.universe.width, Math.random()*this.universe.height, 100 + Math.random()*300);
			if (this.planets.every(function(planet) { return !this.universe.collide(planet.atmosBox, newPlanet.atmosBox); }.bind(this)) &&
				newPlanet.box.center.x - newPlanet.box.radius > 50 && newPlanet.box.center.x + newPlanet.box.radius < this.universe.width - 50 &&
				newPlanet.box.center.y - newPlanet.box.radius > 50 && newPlanet.box.center.y + newPlanet.box.radius < this.universe.height - 50) this.planets.push(newPlanet);
			else --i;//failed to add it, do it again so we have the correct amount
		}
		maxIterations = enemyAmount * 4;
		for (let i = 0, iterations = 0; i !== enemyAmount, iterations !== maxIterations; ++i, ++iterations) {
			let newEnemy = new Enemy(Math.random()*this.universe.width, Math.random()*this.universe.height);
			if (this.planets.every(function(planet) {
				return distanceBetween(planet.box, newEnemy.box) > planet.box.radius + 420;
			}.bind(this)) && this.enemies.every(function(enemy) {
				return distanceBetween(enemy.box, newEnemy.box) > 700;
			}.bind(this))) this.enemies.push(newEnemy);
			else --i;//failed to add it, do it again so we have the correct amount
		}

		this.teams = {};
		this.teamScores = {};
		let _teams = ['alienBeige', 'alienBlue', 'alienGreen', 'alienPink', 'alienYellow'];

		for (let teamNumber = 0; teamNumber !== 2; ++teamNumber) {
			let teamIndex = Math.floor(Math.random() * _teams.length);
			this.teams[_teams[teamIndex]] = [];
			this.teamScores[_teams[teamIndex]] = 0;
			_teams.splice(teamIndex, 1);
		}
		this.enabledTeams = Object.keys(this.teamScores);

		for (let player of this.players.array) {
			if (!player) continue;
			player.controls = {};
			player.health = 8;
			player.fillStamina();
			player.velocity = new vinage.Vector(0, 0);
			player.attachedPlanet = -1;
			this.assignPlayerTeam(player);
		}
	}
	assignPlayerTeam(player) {
		let teamsPlaying = Object.keys(this.teams);
		if (this.teams[teamsPlaying[0]].length === this.teams[teamsPlaying[1]].length) player.appearance = teamsPlaying[Math.round(Math.random())];
		else player.appearance = teamsPlaying[this.teams[teamsPlaying[0]].length > this.teams[teamsPlaying[1]].length ? 1 : 0];
		this.teams[player.appearance].push(player.pid);
		player.box = new vinage.Rectangle(new vinage.Point(0, 0), 0, 0);
		player.box.angle = Math.random() * Math.PI;
		player.attachedPlanet = this.planets.findIndex(function(planet) {
			return planet.team === player.appearance && planet.progress > 80;
		});
	}
	sendEntityDelta(delta, excludedPlayer) {
		if (delta !== undefined) {
			if (delta.addedEnemies !== undefined || delta.addedPlanet !== undefined || delta.addedPlayer !== undefined || delta.addedShots !== undefined) {
				this.broadcast(message.addEntity.serialize(delta.addedPlanet, delta.addedEnemies, delta.addedShots, delta.addedPlayer),
					excludedPlayer);
			}
			if (delta.removedEnemies !== undefined || delta.removedPlanet !== undefined || delta.removedPlayer !== undefined || delta.removedShots !== undefined) {
				this.broadcast(message.removeEntity.serialize(delta.removedPlanet, delta.removedEnemies, delta.removedShots, delta.removedPlayer),
					excludedPlayer);
			}
		}
	}
}
