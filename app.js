"use strict";
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const DEBUG			= true;
const DEBUGTOLOGFILE= false;
const LOGFILE		= 'thelogfile';
const LOCALE 	 	= process.env.LOCALE || 'POSIX';
const PLAYLISTFILE 	= "/home/ian/monday.pls";
const WEBSOCKETPORT = 6502;

const { execFile, spawn }	= require('child_process');
const Express 	   	= require('express');
const fs 			= require("fs");
const Http 			= require('http');
const WSServer 		= require('websocket').server;
const NodeID3 		= require('node-id3')
const app 			= Express();

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

setVolume(state.volume, 'LOCAL');
getPlayList('LOCAL');
setupExpress();
setupWebsocket();

xmmsCmd('LOCAL', '-p'); // starts playing...then...crashes...20 secs

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
//execFile('xmms', ['-Son','-pf']);

fs.watchFile(PLAYLISTFILE, () => { 
	//try {
		getPlayList('LOCAL');//.then(() => {
			let logMsg 	= "PLAYLISTFILE changed -> " + playList.length + " songs. resetting log";

			songLog = [];
			state.playList = [];

			for (let i = 0;i < playList.length; i++) 
				state.playList.push(playList[i]).split(/\/[a-z]\//i)[1].slice(0,-4);

			log(logMsg);
			sendState('BROADCAST', logMsg);
	//	})// await getPlayList().then(() => {
	//} catch (_err) { log("fs.watchFile error -> " + _err); }
}); // fs.watchFile(PLAYLISTFILE, async() => { 

setTimeout(() => {
	execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
		state.total_listeners = parseInt(_stdio.split('listener_connections')[1]);
		state.current_listeners = parseInt(_stdio.split('listeners')[1])
	});
}, 60000);    

function setupExpress() {
	log("LOCAL setupExpress()");

	app.engine('Pug', require('pug').__express);

	//app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'pug');

	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));
//	app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')))

	app.get('*', (_request, _response, _next) => {
		log(`${ _request.socket.remoteAddress } incoming request -> ${ _request.url }`);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		_response.render('index', state);
	});

	app.get('/:arg1/:arg2?', (_request, _response) => {
		const remoteAddress = _request.socket.remoteAddress; 
		const arg1			= _request.params.arg1;
		let arg2			= _request.params.arg2;

		log(`${ remoteAddress } processing request -> ${ _request.url } arg1 -> ${ arg1 } arg2 -> ${ arg2 }`);

		execFile('qxmms', ['-lnS'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(" ")[0]);
			state.progress = parseInt(_stdio.split(" ")[1]);

			switch (arg1) {
				case "prev":
					xmmsCmd(remoteAddress, '-r');
				break;

				case "pause":
					xmmsCmd(remoteAddress, '-t');
					state.pause = !state.pause;
					sendState(remoteAddress, arg1); // send state to all except remoteAddress
				break;

				case "next":
					xmmsCmd(remoteAddress, '-f');
				break;

				case "shuffle" || "shuffleenabled":
					xmmsCmd(remoteAddress, '-S');
					state.shuffle = !state.shuffle;
					sendState(remoteAddress, arg1); // send state to all except remoteAddress
				break;

				case "getstate":
					state.songLog = songLog;
					console.dir(state);
					_response.send(state);
					delete state.songLog;
				break;

				case "getbbplaylist":
					state.songLog = songLog;
					state.playList = [];

					for (let i = 0;i < playList.length; i++) 
						state.playList.push(playList[i]);

					log(playList.length + " songs in playlist.");
					_response.send(state);
					delete state.playList;
					delete state.songLog;
				break;

				case "setvolume":
					if (!remoteAddress.includes('192.168.50.1'))
						setVolume(arg2 ,remoteAddress);

					sendState(remoteAddress, `setvolume(${ arg2 })`); // send state to all except remoteAddress
				break;

				case "queuesong": 	// * really hurt *  ...still hz
					log("playList song -> " + playList[arg2]);
					log("song path -> " + playListPath[arg2]);
					//execFile('xmms', ['-Q', playListPath[arg2]]);
					xmmsCmd(_remoteAddress, '-Q ' + playListPath[arg2]);
					state.queueSong = parseInt(arg2);
					sendState(remoteAddress, arg1 + '/' + arg2); // send state to all except remoteAddress
				break;

				case "playsong":
					// execFile('qxmms',['jump', parseInt(arg2) + 1]);
					xmmsCmd(_remoteAddress, ['jump', parseInt(arg2) + 1]);
				break;

				case "newsong":
					arg2--;

		            if (arg2 > playList.length - 1)  { // queued mp3 at end of playlist
		            		log("This is a queued song");
			                execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
			                    for (let i = 0; i < playList.length; i++) {
			                        if (playListPath[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
			                            songLog.push(i);
			                            log("queued song path -> " + playListPath[i]);
			                            execFile('qxmms',['jump', parseInt(i) + 1]);
			                        }
			                    }
			                }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
			            } else {
								songLog.push(arg2);
								state.songLog = songLog;
								sendState('BROADCAST', arg1 + '/' + arg2);
								
								if (clients.length > 0)
									connectXmmsToDarkice(remoteAddress);
							}
				break;

				case "seek":
					let seekTo = parseInt(state.duration * (arg2 / 100));

					log(`seekTo -> ${ seekTo }`);
					log(`seekTo.toMMSS -> ${ seekTo.toMMSS() }`);

					execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
						state.progress = seekTo;
						sendState("BROADCAST", arg1 + '/' + arg2)
					});
				break;

				default:
					log(`${ remoteAddress } ** error case option missing ** -> ${ arg1 }`);
			} // switch (arg1) { 

		log(`${ remoteAddress } _response.end()`);
		_response.end();
		}); // execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
	}); // App.get('/:arg1/:arg2?', (_request, _response) => {
}

function connectXmmsToDarkice(_remoteAddress) {
    log(`${ _remoteAddress } connectXmmsToDarkice()`);
    
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

function xmmsCmd(_remoteAddress, _cmd) {
	const ls = spawn("xmms", [_cmd]);
	const remoteAddress = _remoteAddress;

	ls.stdout.on("data", _data => {
			log(`${ remoteAddress } xmmsCmd(${ _cmd }) stdout -> ${ _data }`);
		});

		ls.stderr.on("data", _data => {
			// ** print jack msgs **
			//console.log(`stderr: ${ _data }`);
		});	

		ls.on('error', _error => {
			log(`error: ${ _error.message }`);
		});

		ls.on("close", _code => {
			log(`${ remoteAddress } xmmsCmd(${ _cmd }) stdout -> ${ _code }`);
		});
}

function setVolume(_params, _remoteAddress) {
    if (_params == 'volup')
        state.volume++;
            else if (_params == 'voldown')
                state.volume--;
                    else if (_params == 'mute') 
                        state.mute = !state.mute; 
                    		else
                        		state.volume = parseInt(_params);

    log(`${ _remoteAddress } setVolume(${ _params })`);

    execFile("amixer", ['-c', '0', '--', 'sset', 'Master', state.volume + "%"]);
    execFile("amixer", ['-c', '0', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupWebsocket() {
    log("LOCAL setupWebsocket()");

    const wsHttp = Http.createServer((_request, _response) => {
        log(`${ _request.socket.remoteAddress } recieved websocket request -> ${ _request.url }`);
        _response.writeHead(404);
        _response.end();
    }).listen(WEBSOCKETPORT);

    const wsServer = new WSServer({
        url: "ws://localhost:" + WEBSOCKETPORT,
        httpServer: wsHttp
    }); 

	wsServer.on('connect', _connection => {
		log(`${ _connection.socket.remoteAddress } new websocket connection`);

		clients.push(_connection);
		getPlayList(_connection.socket.remoteAddress);

		execFile('qxmms', ['-lnS'], (_err, _stdio, _stderr) => {
            state.duration = parseInt(_stdio.split(" ")[0]);
            state.progress = parseInt(_stdio.split(" ")[1]);
			state.playList = playList;
			state.songLog  = songLog; 

			_connection.sendUTF(JSON.stringify({ state: state }));
			console.dir(state);

			delete state.playList;
			delete state.songLog;

			log(`${ _connection.socket.remoteAddress } removing playList and songLog from state`);
			});
	});

	wsServer.on('request', _request => { 
		log(`${ _request.socket.remoteAddress } processing request -> ${ _request.resource }`);
		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', _connection => {
	    log(`${ _connection.remoteAddress } websocket disconnected -> ${ _connection.remoteAddress }`);

    	clients = clients.filter((_el, _idx, _ar) => {
            return _el.connected;
        });
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

/* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList(_remoteAddress) {

	log(`${ _remoteAddress } getPlayList() -> ${ PLAYLISTFILE }`);

	fs.readFile(PLAYLISTFILE, function(_err, _data) {
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
		
	    log(`${_remoteAddress} getPlayList() -> ${ playList.length } songs in playlist`);
	});
} // function getPlayList() {

function sendState(_sendTo, _logMsg) {
    if (clients.length == 0) {
    	log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg  }) -> NO connections... returning`)
    	return;
    }

    log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg  }) state -> `);
    console.dir(state);

    for (let i = 0; i < clients.length; i++) 
        if ((_sendTo == 'BROADCAST') || (clients[i].remoteAddress != _sendTo)) {
            log(`sendState(${ _sendTo }, ${ _logMsg  }) sending state to -> ${ clients[i].remoteAddress }`);
            clients[i].sendUTF(JSON.stringify({ state: state }));
        } else 
            log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg }) NOT sending state`);

        if (state.hasOwnProperty("queueSong")) 
        	delete state.queueSong;

        if (state.hasOwnProperty("songLog")) 
        	delete state.songLog;
} // function sendState(_sendTo, _logMsg) {

function log(_msg) {
	let logString = Date().split('GMT')[0] + `${ _msg }`;

	if (DEBUG) 
		console.log(logString);

	if (DEBUGTOLOGFILE)
		fs.open(LOGFILE, 'a', (_err, _fd) => {
			fs.write(_fd, Buffer.from(`${ logString }\n`, null), () => {
				console.log('writing log data to LOGFILE');
			});
		});
}

module.exports = app;
