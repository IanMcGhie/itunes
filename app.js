"use strict";
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const DEBUG			= true;
const { execFile } 	= require('child_process');
const FileSystem 	= require('fs');
const playListFile 	= "/home/ian/monday.pls";
const Express 	   	= require('express');
//const FileSystem   	= require("fs");
const Http 			= require('http');
const WSServer 		= require('websocket').server;
const NodeID3 		= require('node-id3');
const defaultGateway = require('default-gateway');
const { gateway }   = defaultGateway.v4.sync();
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
let state			= {
    duration: 0,
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40,
    total_listeners: 0,
    current_listeners: 0
};

Number.prototype.toMMSS = function() {
    let minutes = parseInt(this / 60);
    let seconds = parseInt(this % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

FileSystem.watchFile(playListFile, async () => { 
	try {
		await getPlayList().then(() => { 
			state.songLog = songLog;
			state.playList = playList;
			sendState('BROADCAST', "playlist changed");
		});
	} catch (_err) {
		log(TEXT,"watchFile error -> " + _err);
	} /*finally {
		sendState('BROADCAST', "playlist changed");
	}*/
}); // FileSystem.watchFile(playListFile, () => { 

setVolume(state.volume);
getPlayList();
setupExpress();
setupWebsocket();

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

setTimeout(function() {
	execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
		state.total_listeners = parseInt(_stdio.split('listener_connections')[1]);
		state.current_listeners = parseInt(_stdio.split('listeners')[1])
	});
}, 60000);    

function setupExpress() {
	log(TEXT, "setupExpress()");

	app.engine('Pug', require('pug').__express);
	app.set('view engine', 'pug');

	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));
//	app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')))

	app.get('*', (_request, _response, _next) => {
		log(TEXT,_request.socket.remoteAddress + " -> GET " + _request.url);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		_response.render('index', state);
	});

	app.get('/:arg1/:arg2?', (_request, _response) => {
		const dontSendTo	= _request.socket.remoteAddress; 
		const arg1			= _request.params.arg1;
		let arg2			= _request.params.arg2;

		log(TEXT,"arg1 -> " + arg1 + " arg2 -> " + arg2);

		execFile('qxmms', ['-lnS'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(" ")[0]);
			state.progress = parseInt(_stdio.split(" ")[1]);

			switch (arg1) {
				case "prev":
					xmmsCmd('-r');
				break;

				case "pause":
					xmmsCmd('-t');
					state.pause = !state.pause;
					sendState(dontSendTo, arg1);
				break;

				case "next":
					xmmsCmd('-f');
				break;

				case "shuffle" || "shuffleenabled":
					xmmsCmd('-S');
					state.shuffle = !state.shuffle;
					sendState(dontSendTo, arg1);
				break;

				case "getstate":
					state.songLog = songLog;
					log(DIR,state);
					_response.send(state);
					delete state.songLog;
				break;

				case "getbbplaylist":
					state.songLog = songLog;
					state.playList = [];

					for (let i = 0;i < playList.length; i++) 
						state.playList.push(playList[i]);

					log(TEXT, playList.length + " songs in playlist.");
					_response.send(state);
					delete state.playList;
					delete state.songLog;
				break;

				case "setvolume":
					if (!dontSendTo.includes(gateway))
						setVolume(arg2);

					sendState(dontSendTo, "setvolume -> " + arg2);
				break;

				case "queuesong": 	// * really hurt *
					log(TEXT, "playList song -> " + playList[arg2]);
					log(TEXT, "song path -> " + playListPath[arg2]);
					execFile('xmms', ['-Q', playListPath[arg2]]);
					state.queueSong = parseInt(arg2);
					sendState(dontSendTo, arg1 + '/' + arg2); 
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
		                        }
		                    }
		                }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
		            } else {
							songLog.push(arg2);
							state.songLog = songLog;
							sendState('BROADCAST', arg1 + '/' + arg2);
							connectXmmsToDarkice();
							}
				break;

				case "seek":
					let seekTo = parseInt(state.duration * (arg2 / 100));

					log(TEXT,"seekTo -> " + seekTo);
					log(TEXT,"seekTo.toMMSS -> " + seekTo.toMMSS());

					execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
						state.progress = seekTo;
						sendState("BROADCAST", arg1 + '/' + arg2)
					});
				break;

				default:
					log(TEXT, dontSendTo + " ** error case option missing ** -> " + arg1);
			} // switch (arg1) { 

		log(TEXT, dontSendTo + " -> _response.end()");
		_response.end();
		}); // execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
	}); // App.get('/:arg1/:arg2?', (_request, _response) => {
}

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
}

function xmmsCmd(_cmd) {
    execFile('xmms',[_cmd], (_err,_stdio,_stderr) => { 
	    log(TEXT,"xmmsCmd(" + _cmd + ") stdio -> " + _stdio);
    }); 
}

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

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");

    const wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,_request.socket.remoteAddress + ' recieved websocket request -> ' + _request.url);
        _response.writeHead(404);
        _response.end();
    }).listen(webSocketPort);

    const wsServer = new WSServer({
        url: "ws://localhost:" + webSocketPort,
        httpServer: wsHttp
    }); 

	wsServer.on('connect', (_connection) => {
		log(TEXT, _connection.socket.remoteAddress + " -> new Websocket connection. Sending state");
		clients.push(_connection);

		execFile('qxmms', ['-lnS'], (_err, _stdio, _stderr) => {
            state.duration = parseInt(_stdio.split(" ")[0]);
            state.progress = parseInt(_stdio.split(" ")[1]);
			state.playList = playList;
			state.songLog  = songLog; 

			log(DIR, state);
			_connection.sendUTF(JSON.stringify({ state: state }));
			delete state.playList;
			delete state.songLog;
			log(TEXT, "removing playList and songLog from state");
			});
	});

	wsServer.on('request', (_request) => { 
		log(TEXT, _request.socket.remoteAddress + " request -> " + _request.resource);
		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', (_connection) => {
        clients = clients.filter((el, idx, ar) => {
            return el.connected;
        });
    log(TEXT,_connection.remoteAddress + " -> Websocket disconnected.");
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

/* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList() {
//	try {
		FileSystem.readFile(playListFile, function(_err, _data) {
			log(TEXT,"getPlayList()");
			let lines = _data.toString().split("\n");
		   	let index = 0;

			playList 	 = [];
			playListPath = [];
			
		    lines.forEach (_line => {
		    	if (_line.toLowerCase().includes(".flac") || _line.toLowerCase().includes(".m4a")) 
		    		throw "!! Found non mp3 file in playlist !!\n" + _line;

		        if (_line.includes('File') && _line.toLowerCase().includes(".mp3")) {
		            playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
		            playListPath.push(_line.split("//")[1]);
		        }
			}); // lines.forEach (_line => {
			
		    log(TEXT, "getPlayList() " + playList.length + " songs in playlist");
		    log(TEXT, "playList[0] -> " + playList[0]);
		});
//	} catch (_err) {
//		log(TEXT,"getPlayList() error -> " + _err);
//	}

} // function getPlayList() {

function sendState(_dontSendTo, _logMsg) {
    log(TEXT,"sendState(" + _dontSendTo + ", " + _logMsg + ")");
    log(DIR, state);

    for (let i = 0; i < clients.length; i++) 
        if (_dontSendTo == 'BROADCAST' || clients[i].remoteAddress != _dontSendTo) {
            log(TEXT, "sending state to " + clients[i].remoteAddress);
            clients[i].sendUTF(JSON.stringify({ state: state }));
        } else 
            log(TEXT, "Not sending state to " + clients[i].remoteAddress);

        if (state.hasOwnProperty("queueSong")) 
        	delete state.queueSong;

        if (state.hasOwnProperty("songLog")) 
        	delete state.songLog;
} // function sendState(_sendTo, _logMsg) {

function log(_type, _msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else 
	            	console.dir(_msg);
}

module.exports = app;
