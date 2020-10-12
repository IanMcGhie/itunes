"use strict";
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const DEBUG 		= true;
const playListFile 	= "/home/ian/monday.pls";
const { execFile } 	= require('child_process');
const FileSystem 	= require('fs');
const Express 	   	= require('express');
const Http 			= require('http');
const WSServer 		= require('websocket').server;
const NodeID3 		= require('node-id3');
const defaultGateway = require('default-gateway');
const { gateway }	= defaultGateway.v4.sync();
const app 			= Express();
const TEXT 			= true;
const DIR 			= false;
const port 			= 3000;
const webSocketPort	= 6502;

let createError 	= require('http-errors');
let express 		= require('express');
let path 			= require('path');

let songLog 		= [];
let playList 		= [];
let playListPath	= [];
let clients 		= [];
let state 			= {
    duration: 0,
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40,
    totallisteners: 0,
    currentlisteners: 0
};

Number.prototype.toMMSS = function() {
    let minutes = parseInt(this / 60);
    let seconds = parseInt(this % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Number.prototype.toMMSS = function() {

getPlayList();
watchPlayList();
setVolume(state.volume);
setupExpress();
setupWebsocket();

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

/* 
 The word “async” before a function means one
 simple thing: a function always returns a 
 promise. Other values are wrapped in a resolved
 promise automatically.*/
async function getDarkIceStats() {
	return new Promise((_resolve, _reject) => {
		execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
			state.totallisteners = parseInt(_stdio.split('listener_connections')[1]);
			state.currentlisteners = parseInt(_stdio.split('listeners')[1])
			log(TEXT,"getDarkIceStats() current listeners -> " + state.currentlisteners + " total listeners -> " + state.totallisteners);
			_resolve();
		});
	}); // return new Promise((_resolve, _reject) => {
} // async function getDarkIceStats() {

async function xmmsCmd(_command) {
	var args;
	
	if (_command == "prev")
		args = "-p";
		else if (_command == "next")
			args = "-f";
			else if (_command == "pause") {
				state.pause = !state.pause;
				args = "-t";
				} else if (_command == "shuffle") {
					state.shuffle = !state.shuffle;
					args = "-S";
				}
			
	return new Promise(async (_resolve, _reject) => {
	    await execFile('xmms',[args], (_err,_stdio,_stderr) => { 
		    _resolve();
    	}); 
	}); // return new Promise(async (_resolve, _reject) => {
} // async function xmmsCmd(_command) {

async function getProgress() {
	return new Promise((_resolve, _reject) => {
		execFile('qxmms', ['-lnS'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(" ")[0]);
			state.progress = parseInt(_stdio.split(" ")[1]);
			log(TEXT,"getProgress() duration -> " + state.duration + " state.progress -> " + state.progress);
			_resolve();
		});
	}); // 	return new Promise((_resolve, _reject) => {
} // async function getProgress() {

async function processRequest(_request, _response) {
	return new Promise(async (_resolve, _reject) => {
		const remoteAddress = _request.socket.remoteAddress; 
		const arg1	= _request.params.arg1;
		let arg2	= _request.params.arg2;

		log(TEXT,"processRequest() arg1 -> " + arg1 + " arg2 -> " + arg2);

		switch (arg1) {
			case "prev":
				await xmmsCmd(arg1).then(() => { _response.send(state); });
			break;

			case "pause":
				await xmmsCmd(arg1).then(() => { 
					_response.send(state);
					sendState(state); 
				});
			break;

			case "next":
				await xmmsCmd(arg1).then(() => { sendState(state); });
			break;

			case "shuffle" || "shuffleenabled":
				await xmmsCmd(arg1).then(() => { sendState(state); });
			break;

			case "getstate":
				state.songlog = songLog;

				if (arg2 == "withplaylist")
					state.playlist = playList;					

				log(DIR,state);
				_response.send(state);

				if (arg2 == "withplaylist") {
					log(TEXT, "removing playlist from state");
					delete state.playlist;					
				}

				log(TEXT, "removing playlist and songlog from state");
				delete state.songlog;
			break;

			case "setvolume":
				if (!remoteAddress.includes(gateway))
					setVolume(arg2);

				if (arg2 == "mute")
					_response.send(state);

				for (let i = 0; i < clients.length; i++) {
					if (remoteAddress != clients[i].remoteAddress) {
						log(TEXT, "sendState() sending state to -> " + clients[i].remoteAddress);
						clients[i].sendUTF(JSON.stringify({ state: state }));
					} else {
							log(TEXT, "sendState() not sending state to -> " + clients[i].remoteAddress);
							}
				}
			break;

			case "queuesong": 	// * really hurt *
				execFile('xmms', ['-Q', playListPath[arg2]]);
				state.queueSong = parseInt(arg2);
				state.popupdialog = playList[state.queueSong] + " queued";
				sendState(arg1 + '/' + arg2); 
			break;

			case "playsong":
				execFile('qxmms',['jump', parseInt(arg2) + 1]);
			break;

			case "newsong":
				arg2--;

				if (arg2 > playList.length - 1)  { // queued mp3 at end of playlist
					log(TEXT, "This is a queued song");
					execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
						for (let i = 0; i < playList.length; i++) {
							if (playListPath[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
								songLog.push(i);
								log(TEXT, "queued song path -> " + playListPath[i]);
								execFile('qxmms',['jump', parseInt(i) + 1]);
							}// if (playListPath[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
						} // for (let i = 0; i < playList.length; i++) {
					}); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
				} else {
					songLog.push(arg2);
					state.songlog = songLog;
					sendState(arg1 + '/' + arg2);
					connectXmmsToDarkice();
				}
			break;

			case "seek":
				let seekTo = parseInt(state.duration * (arg2 / 100));
				log(TEXT,"seekTo -> " + seekTo + "seekTo.toMMSS -> " + seekTo.toMMSS());

				execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
					state.progress = seekTo;
					sendState(arg1 + '/' + arg2)
				});
			break;

			default:
			log(TEXT, remoteAddress + " ** error case option missing ** -> " + arg1);
		} // switch (arg1) {
		_response.end();
	}); // return new Promise(async (_resolve, _reject) => {
} // function processRequest(_request) {

async function setupWebsocket() {
	log(TEXT,"setupWebsocket()");

	const wsHttp = Http.createServer((_request, _response) => {
		log(TEXT,_request.socket.remoteAddress + ' recieved websocket request -> ' + _request.url);
		_response.writeHead(404);
		_response.end();
	}).listen(webSocketPort); // const wsHttp = Http.createServer((_request, _response) => {

	const wsServer = new WSServer({
		url: "ws://localhost:" + webSocketPort,
		httpServer: wsHttp
	}); // const wsServer = new WSServer({

	wsServer.on('connect', (_connection) => {
		log(TEXT, _connection.socket.remoteAddress + " new websocket connection");
		clients.push(_connection);
	}); // wsServer.on('connect', (_connection) => {

	wsServer.on('request', (_request) => { 
		log(TEXT, _request.socket.remoteAddress + " websocket request -> " + _request.resource);
		_request.accept('winamp', _request.origin);
	}); // wsServer.on('request', (_request) => { 

	wsServer.on('close', (_connection) => {
		clients = clients.filter((el, idx, ar) => {
			return el.connected;
		});

	    log(TEXT,_connection.remoteAddress + " -> websocket disconnected");
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function connectXmmsToDarkice() {
    log(TEXT,"connectXmmsToDarkice()");
    
    execFile('jack_lsp',(_err, _stdio, _stderr) => {
        const lines            = _stdio.split('\n');
        const xmmsJackPorts    = [];
        const darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes("darkice"))
                darkiceJackPorts.push(_line)
        });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    }); // execFile('jack_lsp',(_err,_stdio,_stderr) => {
} // function connectXmmsToDarkice() {

 /* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList() {
	log(TEXT,"getPlayList()");

	let file 	= FileSystem.readFileSync(playListFile);
	let lines 	= file.toString().split("\n");

	playList 	= [];
	playListPath= [];

	lines.forEach ((_line) => {
		if (_line.toLowerCase().includes(".flac") || _line.toLowerCase().includes(".m4a")) 
			throw "!! Found non mp3 file in playlist !!\n" + _line;

		if (_line.includes('File') && _line.toLowerCase().includes(".mp3")) {
			playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
			playListPath.push(_line.split("//")[1]);
		}
	}); // lines.forEach (_line => {
	
    log(TEXT, "getPlayList() " + playList.length + " songs in playlist");
} // function getPlayList() {

function log(_type, _msg) {
	if (DEBUG)
		if (_type == TEXT)
			console.log(Date().split('GMT')[0] + _msg);
				else 
					console.dir(_msg);
} // function log(_type, _msg) {

function sendState(_logMsg) {
	log(TEXT,"sendState(" + _logMsg + ")");

	if (clients.length == 0) {
		log(TEXT, "sendState() -> no clients connected. returning");
		return;
	}

	log(DIR, state);

	for (let i = 0; i < clients.length; i++) {
		log(TEXT, "sendState() sending state to -> " + clients[i].remoteAddress);
		clients[i].sendUTF(JSON.stringify({ state: state }));
	}

	if (state.hasOwnProperty("queuesong")) {
		log(TEXT, "sendState() removing queuesong from state");
		delete state.queuesong;
	}

	if (state.hasOwnProperty("songlog")) {
		log(TEXT, "sendState() removing songlog from state");
		delete state.songlog;
	}

	if (state.hasOwnProperty("playlist")) {
		log(TEXT, "sendState() removing playlist from state");
		delete state.playlist;
	}

	if (state.hasOwnProperty("popupdialog")) { 
		log(TEXT, "sendState() -> removing popupdialog from state");
		delete state.popupdialog;
	}
} // function sendState( _logMsg) {

function setVolume(_params) {
    if (_params == 'volup')
        state.volume++;
            else if (_params == 'voldown')
                state.volume--;
                    else if (_params == 'mute') 
						state.mute = !state.mute; 
							else
								state.volume = parseInt(_params);

    log(TEXT,"setVolume(" + _params + ") state.volume -> " + state.volume + "%");
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + "%"]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupExpress() {
	log(TEXT, "setupExpress()");

	app.engine('Pug', require('pug').__express);
	app.set('view engine', 'pug');

	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));
//	app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')))

	app.get('*', (_request, _response, _next) => {
		log(TEXT,"---------------------------\n");
		log(TEXT, _request.socket.remoteAddress + " http get request -> " + _request.url);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		_response.render('index', state);
	});

	app.get('/:arg1/:arg2?', (_request, _response) => {
		getDarkIceStats().then(() => { 
			getProgress().then(() => { 
				processRequest(_request, _response).then(() => {
					_response.send(state);
					_response.end();
				}); // processRequest(_request, _response).then(() => {
			}); // getProgress().then(() => { 
		}); // getDarkIceStats().then(() => { 
	}); // App.get('/:arg1/:arg2?', (_request, _response) => {
}

function watchPlayList()  {
	log(TEXT,"watching playlist -> " + playListFile);

	 FileSystem.watchFile(playListFile, (_curr, _prev) => {
		log(TEXT, "playlist changed");
		getPlayList();
		log(TEXT, "sending state to clients");
		state.playlist = playList;
		state.songlog = [];
		state.popupdialog = "Playlist changed";
		sendState("playlist changed");
	});
}; // function watchPlatList()  {

module.exports = app;
