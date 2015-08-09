//Game engine to be shared between the client and server
"use strict";

var resPaths = [
	"background.png",
	"meteorBig1.svg", "meteorBig2.svg", "meteorBig3.svg", "meteorBig4.svg", "meteorMed1.svg", "meteorMed2.svg", "meteorSmall1.svg", "meteorSmall2.svg", "meteorTiny1.svg", "meteorTiny2.svg",
	"laserBeam.svg", "laserBeamDead.svg", "jetpack.svg", "jetpackFire.svg",
	"heartFilled.svg", "heartHalfFilled.svg", "heartNotFilled.svg",
	"goldCoin.svg", "silverCoin.svg", "bronzeCoin.svg",
	"alienBlue_badge.svg", "alienBlue_duck.svg", "alienBlue_hurt.svg", "alienBlue_jump.svg", "alienBlue_stand.svg", "alienBlue_walk1.svg", "alienBlue_walk2.svg",
	"alienBeige_badge.svg", "alienBeige_duck.svg", "alienBeige_hurt.svg", "alienBeige_jump.svg", "alienBeige_stand.svg", "alienBeige_walk1.svg", "alienBeige_walk2.svg",
	"alienGreen_badge.svg", "alienGreen_duck.svg", "alienGreen_hurt.svg", "alienGreen_jump.svg", "alienGreen_stand.svg", "alienGreen_walk1.svg", "alienGreen_walk2.svg",
	"alienPink_badge.svg", "alienPink_duck.svg", "alienPink_hurt.svg", "alienPink_jump.svg", "alienPink_stand.svg", "alienPink_walk1.svg", "alienPink_walk2.svg",
	"alienYellow_badge.svg", "alienYellow_duck.svg", "alienYellow_hurt.svg", "alienYellow_jump.svg", "alienYellow_stand.svg", "alienYellow_walk1.svg", "alienYellow_walk2.svg",
	"enemyBlack1.svg", "enemyBlack2.svg", "enemyBlack3.svg", "enemyBlack4.svg", "enemyBlack5.svg",
	"enemyBlue1.svg", "enemyBlue2.svg", "enemyBlue3.svg", "enemyBlue4.svg", "enemyBlue5.svg",
	"enemyGreen1.svg", "enemyGreen2.svg", "enemyGreen3.svg", "enemyGreen4.svg", "enemyGreen5.svg",
	"enemyRed1.svg", "enemyRed2.svg", "enemyRed3.svg", "enemyRed4.svg", "enemyRed5.svg"
	],
	resources = {};

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	var collisions = require("./collisions.js"),
		Point = collisions.Point,
		Rectangle = collisions.Rectangle,
		Circle = collisions.Circle,
		Vector = collisions.Vector,
		sizeOf = require("image-size");
		resPaths.forEach(function(path) {
			resources[path.slice(0, path.lastIndexOf("."))] = sizeOf("./static/assets/images/" + path);
		});
}

Math.map = function(x, in_min, in_max, out_min, out_max) {
	//mapping a value x from a range to another range to allow scaling or moving values easily
	return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
function Player(name, appearance, startx, starty, ws){
	this._walkCounter = 0;
	this.name = name;
	this.appearance = appearance;
	this.ws = ws;
	this.box = new Rectangle(new Point(startx, starty), resources[this.appearance + "_stand"].width, resources[this.appearance + "_stand"].height);
	this.lastBox = new Rectangle(new Point(startx, starty), 0, 0);
	this.predictedBox = new Rectangle(new Point(startx, starty), 0, 0);
	this.timestamps = {_old: null, _new: null};
	this.controls = {jump: 0, crouch: 0, jetpack: 0, moveLeft: 0, moveRight: 0, run: 0};
	this.velocity = new Vector(0, 0);
	this.setWalkframe = function(){
		if (this.attachedPlanet === -1){
			this.walkFrame = "_jump";
		} else {
			var leftOrRight = (this.controls["moveLeft"] || this.controls["moveRight"]);
			if (!leftOrRight) this.walkFrame = (this.controls["crouch"]) ? "_duck" : "_stand";
			else if (this._walkCounter++ >= (this.controls["run"] > 0 ? 6 : 10)){
				this._walkCounter = 0;
				this.walkFrame = (this.walkFrame === "_walk1") ? "_walk2" : "_walk1";
			}
			this.box.width = resources[this.appearance + this.walkFrame].width;
			this.box.height = resources[this.appearance + this.walkFrame].height;
		}
	}
	this.walkFrame = "_stand";
	this.health = 8;
	this.fuel = 400;
	this.attachedPlanet = -1;
	this.planet = 0;
	this.lastlyAimedAt = Date.now();
}

function Planet(x, y, radius) {
	this.box = new Circle(new Point(x, y), radius);
	this.atmosBox = new Circle(this.box.center, Math.floor(radius * (1.5 + Math.random()/2)));
	this.progress = {team: "neutral", value: 0, color: "rgb(80,80,80)"};
}
Planet.prototype.teamColours = {"alienBeige": "#e5d9be", "alienBlue": "#a2c2ea", "alienGreen": "#8aceb9", "alienPink": "#f19cb7", "alienYellow": "#fed532" };
Planet.prototype.names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-Ray", "Yankee", "Zulu"];


function Enemy(x, y) {
	this.box = new Rectangle(new Point(x, y), 0, 0);
	this.appearance = "enemy" + this.resources[Math.floor(Math.random() * this.resources.length)];
	this.aggroBox = new Circle(new Point(x, y), 350);
	this.fireRate = 0;
	this.shots = [];
}
Enemy.prototype.resources = ["Black1", "Black2", "Black3", "Black4", "Black5", "Blue1", "Blue2", "Blue3", "Green1", "Green2", "Red1", "Red2", "Red3"];

function doPhysics(players, planets, enemies, isClient) {
	var playersOnPlanets = new Array(planets.length);
	enemies.forEach(function(enemy) {
		var playerToHit = null;
		players.forEach(function(player) {
			enemy.shots.forEach(function(shot, si) {
				shot.box.center.x += (shot.lt <= 0) ? 0 : Math.sin(shot.box.angle) * 11;
				shot.box.center.y += (shot.lt <= 0) ? 0 : -Math.cos(shot.box.angle) * 11;
				if(--shot.lt <= -20) enemy.shots.splice(si, 1);
				else if (shot.box.collision(player.box)) {
					player.health -= (player.health = 0) ? 0 : 1;
					enemy.shots.splice(si, 1);
				}
			});
			if(enemy.aggroBox.collision(player.box) && (playerToHit === null || player.lastlyAimedAt < playerToHit.lastlyAimedAt)) {
				playerToHit = player;
			}
		});
		if(playerToHit === null) {
			enemy.fireRate = 0;
			enemy.box.angle += Math.PI/150;
		} else {
			enemy.box.angle = Math.PI - Math.atan2(enemy.box.center.x - playerToHit.box.center.x, enemy.box.center.y - playerToHit.box.center.y);
				if (++enemy.fireRate >= 20) {
					playerToHit.lastlyAimedAt = Date.now();
					enemy.fireRate = 0;
					enemy.shots.push({box: new Rectangle(new Point(enemy.box.center.x, enemy.box.center.y), resources["laserBeam"].width, resources["laserBeam"].height, enemy.box.angle - Math.PI), lt: 200});
				}
		}
	});
	players.forEach(function(player) {
		if (player.attachedPlanet >= 0) {
			if (typeof playersOnPlanets[player.attachedPlanet] === "undefined") playersOnPlanets[player.attachedPlanet] = {"alienBeige": 0, "alienBlue": 0, "alienGreen": 0, "alienPink": 0, "alienYellow": 0};
			playersOnPlanets[player.attachedPlanet][player.appearance]++;					

			var stepSize = Math.PI * 0.007 * (150 / planets[player.attachedPlanet].box.radius);
			if (player.controls["moveLeft"] > 0){
				stepSize = stepSize * player.controls["moveLeft"];
				player.planet += (player.controls["run"]) ? 1.7 * stepSize : 1 * stepSize;
				player.looksLeft = true;
			}
			if (player.controls["moveRight"] > 0){
				stepSize = stepSize * player.controls["moveRight"];
				player.planet -= (player.controls["run"]) ? 1.7 * stepSize : 1 * stepSize;
				player.looksLeft = false;
			}
		
			player.box.center.x = planets[player.attachedPlanet].box.center.x + Math.sin(player.planet) * (planets[player.attachedPlanet].box.radius + player.box.height / 2);
			player.box.center.y = planets[player.attachedPlanet].box.center.y + Math.cos(player.planet) * (planets[player.attachedPlanet].box.radius + player.box.height / 2)
			player.box.angle = Math.PI - player.planet;
			player.velocity.x = 0;
			player.velocity.y = 0;
			player.fuel = 300;
			if (player.controls["jump"] > 0) {
				player.attachedPlanet = -1;				
				player.velocity.x = Math.sin(player.box.angle) * 6;
				player.velocity.y = -Math.cos(player.box.angle) * 6;
				player.box.center.x += player.velocity.x;
				player.box.center.y += player.velocity.y;
			}
		} else {	
			for (var j = 0; j < planets.length; j++){
				var deltaX = planets[j].box.center.x - player.box.center.x,
					deltaY = planets[j].box.center.y - player.box.center.y,
					distPowFour = Math.pow(Math.pow(deltaX, 2) + Math.pow(deltaY, 2), 2);

				player.velocity.x += 9000 * planets[j].box.radius * deltaX / distPowFour;
				player.velocity.y += 9000 * planets[j].box.radius * deltaY / distPowFour;
				if (planets[j].box.collision(player.box)) {
					player.attachedPlanet = j;
					player.planet = Math.atan2(deltaX, deltaY) + Math.PI;
				}
			}
			if (player.controls["jetpack"] > 0 && player.fuel > 0 && player.controls["crouch"] < 1){
				player.fuel -= player.controls["jetpack"];
				player.velocity.x += (Math.sin(player.box.angle) / 10) * player.controls["jetpack"];
				player.velocity.y += (-Math.cos(player.box.angle) / 10) * player.controls["jetpack"];
			} else if (player.controls["crouch"] > 0){
				player.velocity.x = player.velocity.x * 0.987;
				player.velocity.y = player.velocity.y * 0.987;
			}
			var runMultiplicator = player.controls["run"] ? 1.7 : 1;
			if (player.controls["moveLeft"] > 0) player.box.angle -= (Math.PI / 140) * player.controls["moveLeft"] * runMultiplicator;
			if (player.controls["moveRight"] > 0) player.box.angle += (Math.PI / 140) * player.controls["moveRight"] * runMultiplicator;

			player.box.center.x += player.velocity.x;
			player.box.center.y += player.velocity.y;
		}
		player.setWalkframe();
	});
	if (isClient) return;
	for (var i = 0; i < playersOnPlanets.length; i++){
		if (typeof playersOnPlanets[i] === "undefined") continue;
		var toArray = Object.keys(playersOnPlanets[i]).map(function (key){return playersOnPlanets[i][key];}),
			max = Math.max.apply(null, toArray),
			teams = ["alienBeige", "alienBlue", "alienGreen", "alienPink", "alienYellow"];

		if (max > 0){
			var team, a, b = 0;
			while (toArray.indexOf(max) !== -1){
				a = toArray.indexOf(max);
				b++;
				toArray.splice(a, 1);
			}
			if (b >= 2) return; 
			team = teams[a];
			if (team === planets[i].progress.team) planets[i].progress.value = (planets[i].progress.value + (max / 3) > 100) ? 100 : planets[i].progress.value + (max / 3);
			else {
				planets[i].progress.value -= max / 3;
				if (planets[i].progress.value <= 0) planets[i].progress = {value: 0, team: team};
			}
			var fadeRGB = [];   
			for (var j = 0; j <= 2; j++) fadeRGB[j] = Math.floor(planets[i].progress.value / 100 * (parseInt(Planet.prototype.teamColours[planets[i].progress.team].substr(1 + j * 2, 2), 16) - 80) + 80);

			planets[i].progress.color = "rgb(" + fadeRGB[0] + "," + fadeRGB[1] + "," + fadeRGB[2] + ")";
		}
	}
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") module.exports = module.exports = {
	doPhysics: doPhysics,
	Player: Player,
	Planet: Planet,
	Enemy: Enemy
}