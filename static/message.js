const MESSAGE = {
	ERROR: 0,
	CONNECT: 1,
	GET_LOBBIES: 2,
	SENT_LOBBIES: 3,
	CREATE_LOBBY: 4,
	PLAYER_SETTINGS: 5,
	LEAVE_LOBBY: 6,
	PLAYER_CONTROLS: 7,
	WORLD_DATA: 8,
	CHAT: 9,
	PLAY_SOUND: 10,
	GAME_DATA: 11,
	LOBBY_STATE: 12,
	PLAYER_CONNECTED: 13,
	SCORES: 14,
	toString: function(val) {
		var res = Object.keys(this)[val];
		return res !== undefined ? res : "UNKNOW";
	}
},
ERROR = {
	NO_LOBBY: 0,
	NO_SLOT: 1,
	NAME_TAKEN: 2
};

if (typeof module !== "undefined" && typeof module.exports !== "undefined") module.exports = { MESSAGE: MESSAGE, ERROR: ERROR };
