"use strict";
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs/wants & a computer with an operating system for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for 
 *    my bb Curve 9360 to work
 */
const DEBUG			= true;
const DEBUGTOLOGFILE= false;
const LOGFILE 		= 'thelogfile';
const LOCALE 		= process.env.LOCALE || 'POSIX';
const PLAYLISTFILE 	= '/home/ian/monday.pls';
const DEFAULTROUTE 	= '192.168.50.1';
const WSPORT 		= 6502;
const ICECASTCONFIGFILE	 = '/usr/local/etc/icecast.xml';
const ICECASTLINKINTERAL = 'http://winamp:8000/winamp.m3u';
const ICECASTLINKEXTERNAL= 'http://crcw.mb.ca:8000/winamp.m3u';
const DARKICECONFIGFILE  = '/home/ian/.darksnow/darkice.cfg';

const { execFile, execFileSync, spawn } = require('child_process');
const createError= require('http-errors');
const Express 	= require('express');
const Http 		= require('http');
const WSServer 	= require('websocket').server;
const NodeID3 	= require('node-id3');
const fs 		= require("fs");
const app 		= Express();
const express 	= require('express');
const path 		= require('path');

let songLog 	= [];
let playList 	= [];
let playListPath= [];
let clients 	= [];
let state		= {
    duration: 0,
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40,
    listenersTotal: 0,
    listenersCurrent: 0
};

Number.prototype.toMMSS = function() {
    let minutes = parseInt(this / 60);
    let seconds = parseInt(this % 60);

    if (minutes < 10) 
        minutes = `0${ minutes }`;
    
    if (seconds < 10)
        seconds = `0${ seconds }`;

    return `${ minutes }:${ seconds }`;
} // Integer.prototype.toMMSS = function() {

// here we go...
init(); // thats it
// all done

async function init() {
	await getPlayList('init()');
	await shellCommand('AUDACIOUSVANISHED', 'audacious', [ PLAYLISTFILE ]);//.then(() => {

	setVolume('init()', state.volume);
	connectXmmsToDarkice('init()');	
	setupExpress('init()');
	setupWebsocket('init()');
};

fs.watchFile(PLAYLISTFILE, () => { 
	try {
		 getPlayList('watchFile').then(() => {
			let logMsg 	= "PLAYLISTFILE changed -> " + playList.length + " songs. resetting log";

			songLog 		= [];
			state.playList 	= playList;

			sendState('BROADCAST', logMsg);
		}); // getPlayList('watchFile').then(() => {
	} catch (_err) { log("fs.watchFile error -> " + _err); }
}); // fs.watchFile(PLAYLISTFILE, () => {    

function setupExpress(_logMsg) {
	log(`${ _logMsg } setupExpress()`);

	app.engine('Pug', require('pug').__express);

	//app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'pug');

	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));
//	app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')))

	app.get('*', (_request, _response, _next) => {
		log(`${ _request.socket.remoteAddress } --------------------- incoming request  -> ${ _request.url }`);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		if (_request.socket.remoteAddress.includes(DEFAULTROUTE))
			_response.render('index', { icecastlink: ICECASTLINKEXTERNAL });
				else
					_response.render('index', { icecastlink: ICECASTLINKINTERAL });					
	});

	app.get('/:arg1/:arg2?',  (_request, _response) => {
		processRequest(_request, _response);//.then((_whatsthisthen) => {
//		log(`in here now! ffs -> ${ _whatsthisthen }`);
		//log(`${ _request.socket.remoteAddress } all done...`);
		//});
	});
}

async function processRequest(_request, _response) {
		const remoteAddress = _request.socket.remoteAddress; 
		let arg1, arg2;

		if (_request.hasOwnProperty('params')) {
			arg1 = _request.params.arg1;
			arg2 = _request.params.arg2;
		}

		log(`${ remoteAddress } processing request -> ${ _request.url } arg1 -> ${ arg1 } arg2 -> ${ arg2 }`);

		// get duration and progress from xmms
		//await execFile('qxmms', ['-lnS'], (_err, _stdout, _stderr) => {
		//let command = spawn('qxmms', { args: '-lnS' }, (_err, _stdout, _stderr) => {
		//log(`${ remoteAddress } qxmms stdout -> ${ _stdout } stderr -> ${ _stderr } err -> ${ _err }`);

		try {
			//execFile('audtool', ['--current-song-length-seconds', '--current-song-output-length-seconds'],  async (_err, _stdout, _stderr) => {
//await shellCommand(remoteAddress, 'audtool',  ['--current-song-length-seconds', '--current-song-output-length-seconds']).then(async (_data)=>{
			await getState(remoteAddress).then(_data) => {
				log(`${ remoteAddress } getState() returned _data -> ${ _data }`);
//});
				if (state.hasOwnProperty('duration')) { //} && state.hasOwnProperty('progress')) {
					state.duration = parseInt(_data.split("\n")[0]);
					state.progress = parseInt(_data.split("\n")[1]);
				}

				switch (arg1) {
					case "areyathere":
						_response.send({ reply: 'yup' });
					break;

					case "darkice":
						connectXmmsToDarkice(remoteAddress);
					break;

					case "getstate":
						state.songLog = songLog;
						state.playList = playList;
						_response.send(state);
					break;

					case "newsong":
						newSong(remoteAddress, arg2);
					break;

					case "next":
						shellCommand(remoteAddress, 'audacious', ['-f']);
					break;

					case "pause":
						shellCommand(remoteAddress, 'audacious', ['-t']);
						state.pause = !state.pause;
						sendState(remoteAddress, arg1); // send state to all except remoteAddress
					break;
					
					case "playsong":
						shellCommand(remoteAddress, 'audtool', ['playlist-jump', parseInt(arg2 + 1)]);
					break;

					case "prev":
						shellCommand(remoteAddress, 'audacious', ['-r']);
					break;

					case "queuesong": 	// * really hurt *  ...still hz
						log(`${ remoteAddress } queuesong -> ${ playList[arg2] } song path -> ${ playListPath[arg2] }`);
						
						execFile('audacious', ['-Q', playListPath[parseInt(arg2)]]);
						//shellCommand(remoteAddress, ['-Q', playListPath[arg2]]);
						state.queueSong = parseInt(arg2);
						sendState(remoteAddress, arg1 + '/' + (arg2 + 1)); // send state to all except remoteAddress
					break;

					case "seek":
						let seekTo = parseInt(state.duration * (arg2 / 100));

						log(`${ remoteAddress } seekTo -> ${ seekTo } seekTo.toMMSS -> ${ seekTo.toMMSS() }`);
/*
						execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
							state.progress = seekTo;
							sendState("BROADCAST", 'seek/' + arg2)
						});
*/
					break;

					case "setvolume":
						if (!remoteAddress.includes(DEFAULTROUTE)) {
						//	_response.end();

							setVolume(remoteAddress, arg2);
							_response.end();
							sendState(remoteAddress, `setvolume(${ state.volume })`); // send state to all except remoteAddress						
						}
					break;

					case "shuffle" || "shuffleenabled":
						shellCommand(remoteAddress, 'audtool', ['--playlist-shuffle-toggle']);
						state.shuffle = !state.shuffle;
						sendState(remoteAddress, arg1); // send state to all except remoteAddress
					break;

					default:
						log(`${ remoteAddress } ** error case option missing ** -> ${ arg1 }`);
				} // switch (arg1) { 

				if (state.hasOwnProperty('playList')) {
					log(`${ _response.socket.remoteAddress } processRequest() removing playList from state`);
					delete state.playList;
				}

				if (state.hasOwnProperty('songLog')) {
					log(`${ _response.socket.remoteAddress } processRequest() removing songLog from state`);
					delete state.songLog
				}

			_response.end();

			log(`${ remoteAddress } ************************ promise resolved`);
			}); // await getState(remoteAddress).then(_data) => {
		} catch (_err) { 
			log(`${ _response.socket.remoteAddress } processRequest() caught error -> ${ _err }`);	
		}
} // function processRequest(_request, _response) {

function newSong(_remoteAddress, _index) {
	_index--;

    if (_index > playList.length - 1)  { // queued mp3 at end of playlist
		log(`${ _remoteAddress } This is a queued song`);

		execFile('qxmms',['-f'], (_err,_stdout,_stderr) => {
			for (let i = 0; i < playList.length; i++) {
				if (playListPath[i] == _stdout.split('\n')[0]) { // remove cr from _stdout
					log(`${ _remoteAddress } queued song path -> ${ playListPath[i] }`);

					songLog.push(parseInt(_index));
					execFile('qxmms',['jump', parseInt(i) + 1]);
				}
			}
		}); // await execFile('qxmms',['-f'], (_err,_stdout,_stderr) => {
	} else {
			NodeID3.read(playListPath[_index], (_err, _tags) => {
				let artist, album, songTitle, year;

				connectXmmsToDarkice(_remoteAddress);

				if (_err)
					log(`${ _remoteAddress } no id3 tag for you -> ${ _err }`);
				
				songLog.push(parseInt(_index));
				state.songLog 	= songLog;
				state.pause 	= false;

				if (_tags.hasOwnProperty('raw')) {
					console.dir(_tags);

					if (_tags.raw.hasOwnProperty('TIT2')) 
						songTitle = _tags.raw.TIT2;
							else
								album = playList[songLog[songLog.length - 1]];

					if (_tags.raw.hasOwnProperty('TYER')) 
						year = _tags.raw.TYER;

					if (_tags.raw.hasOwnProperty('TPE1')) 
						artist = _tags.raw.TPE1;

					if (_tags.raw.hasOwnProperty('TALB')) 
						album = _tags.raw.TALB;

		            state.songTitle = (year ? `${ year } - ` : "") + artist + " - " + album + " - " + songTitle + " (" + state.duration.toMMSS() + ")";
					} else // if (_tags.hasOwnProperty('raw')) {
						state.songTitle = (year ? `${ year } - ` : "") + playList[songLog[songLog.length - 1]] + " (" + state.duration.toMMSS() + ")";

					sendState('BROADCAST', `newsong/${ _index }`);
				});	// NodeID3.read(playListPath[_index], (_err, _tags) => {				
			} // } else {
} // function newSong(_remoteAddress, _index) {

function connectXmmsToDarkice(_remoteAddress) {
 //   return new Promise(async (_yourWelcome, _noThanks) => {
    	log(`${ _remoteAddress } connectXmmsToDarkice()`);
    
	    execFile('jack_lsp', (_err, _stdout, _stderr) => {
	        const lines            = _stdout.split('\n');
	        const xmmsJackPorts    = [];
	        const darkiceJackPorts = [];

	        lines.forEach (_line => {
	            if (_line.includes('audacious')) 
	                xmmsJackPorts.push(_line);

	            if (_line.includes("darkice"))
	                darkiceJackPorts.push(_line)
	        });

	        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
	        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
		
			log(`${ _remoteAddress } Xmms connected To Darkice()`);
	    }); // execFile('jack_lsp', (_err, _stdout, _stderr) => {
} // function connectXmmsToDarkice() {

function shellCommand(_remoteAddress, _cmd, _args) {
	return new Promise( (_yourWelcome, _noThanks) => {
		const remoteAddress = _remoteAddress;

		let command = spawn(_cmd, _args);
		let data;

		command.stdout.on("data", (_data) => {
//		command.stdout.on("data", async (_data) => {
			data = _data;

			if (_data.includes('fault') || _data.includes('FATAL')) 
				log(`${ XMMSVANISHED } shellCommand(${ _cmd } ${ _args }) data ->\n${ _data }`);
		}); // command.stdout.on("data", async (_data) => {

		command.stderr.on("data", _data => {
		// ** print jack msgs **
		//log(`${ remoteAddress } shellCommand(${ _cmd }) ${ _args } stderr ->\nstderr: ${ _data }`);
		});	

		command.on('error', _code => {
			log(`${ remoteAddress } shellCommand(${ _cmd }) ${ _args } stderr ->\n${ _code.message }`);
		});

		command.on("close", _code => {
			log(`${ remoteAddress } shellCommand(${ _cmd }) ${ _args } close ->\n${ _code.message }`);
		});

		_yourWelcome(data);
	}); // return new Promise( (_yourWelcome, _noThanks) => {
}

function setVolume(_remoteAddress, _params) {
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

function getState(_remoteAddress) {
	return new Promise(async (_yourWelcome, _noThanks) => {
		await execFile('audtool', ['--current-song-length-seconds', '--current-song-output-length-seconds'], (_err, _stdout, _stderr) => {
			log(`${ _remoteAddress } audtool stdout -> ${ _stdout }stderr -> ${ _stderr }\nerr -> ${ _err }`);
			//let command = spawn('qxmms', { args: '-lnS' }, (_err, _stdout, _stderr) => {
			//log(`${ remoteAddress } qxmms stdout -> ${ _stdout } stderr -> ${ _stderr } err -> ${ _err }`);
			state.duration = parseInt(_stdout.split("\n")[0]);
			state.progress = parseInt(_stdout.split("\n")[1]);
		}); // 	execFile('audtool', ['--current-song-length-seconds', '--current-song-output-length-seconds'], async (_err, _stdout, _stderr) => {

		await execFile('lynx', ['-auth=admin:adminjam', '--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdout, _stderr) => {
			state.listenersTotal 	= parseInt(_stdout.split('listener_connections')[1]);
			state.listenersCurrent 	= parseInt(_stdout.split('listeners')[1]);
			state.songLog 			= songLog;
			state.playList 			= playList;

		log(`${ _remoteAddress } getState() state retrieved`);
		console.dir(state);

		_yourWelcome(_remoteAddress);
		}); // let command = execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdout, _stderr) => {
	}); // return new Promise((_yourWelcome, _noThanks) => {
}

function setupWebsocket(_logMsg) {
	return new Promise((_yourWelcome, _noThanks) => {
	    log(`${ _logMsg } setupWebsocket()`);

	    const wsHttp = Http.createServer((_request, _response) => {
	        log(`${ _request.socket.remoteAddress } received websocket request -> ${ _request.url }`);
	        
	        _response.writeHead(404);
	        _response.end();
	    }).listen(WSPORT);

	    const wsServer = new WSServer({
	        url: "ws://localhost:" + WSPORT,
	        httpServer: wsHttp
	    }); 

		wsServer.on('connect', async (_connection) => {
			await log(`${ _connection.socket.remoteAddress } new websocket connection from ${ _connection.remoteAddress }`);
			await clients.push(_connection);
			await getState(_connection.remoteAddress);//.then(async () => {
			await execFile('audtool', ['--current-song-length-seconds', '--current-song-output-length-seconds'], async (_err, _stdout, _stderr) => {
				state.duration = parseInt(_stdout.split("\n")[0]);
				state.progress = parseInt(_stdout.split("\n")[1]);		
				state.playList = playList;
				state.songLog  = songLog;

				await _connection.sendUTF(JSON.stringify({ state: state }));//.then(() => {

				if (state.hasOwnProperty('playList')) {
					log(`${ _connection.remoteAddress } processRequest() removing playList from state`);
					delete state.playList;
				}

				if (state.hasOwnProperty('songLog')) {
					log(`${ _connection.remoteAddress } processRequest() removing songLog from state`);
					delete state.songLog
				}
			}); // await execFile('audtool', ['--current-song-length-seconds', '--current-song-output-length-seconds'], async (_err, _stdout, _stderr) => {
		}); // wsServer.on('connect', async (_connection) => {

		wsServer.on('request', _request => { 
			log(`${ _request.socket.remoteAddress } websocket request -> ${ _request.resource }`);

			_request.accept('winamp', _request.origin);
		});

	    wsServer.on('close', _connection => {
		    log(`${ _connection.remoteAddress } websocket disconnected -> ${ _connection.remoteAddress }`);

	    	clients = clients.filter((_el, _idx, _ar) => {
	            return _el.connected;
	        });
	    }); //  connection.on('close', (_connection) => {

	_yourWelcome();
	});
} // function setupWebsocket() {

/* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList(_logMsg) {
	return new Promise(async (_yourWelcome, _noThanks) => {
		log(`${ _logMsg } getPlayList() -> ${ PLAYLISTFILE }`);

		await fs.readFile(PLAYLISTFILE, async (_err, _data) => {
			let lines = _data.toString().split("\n");

			playList 	 = [];
			playListPath = [];

			await lines.forEach (_line => { // --------------------------------------------VVVVV---- ... i dont think so
				if (_line.toLowerCase().includes(".flac") || _line.toLowerCase().includes(".m4a")) 
					throw `!! Found non mp3 file in playlist !!\n\n ${ _line }\n\n`;

				if (_line.includes('File') && _line.toLowerCase().includes(".mp3")) {
					playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
					playListPath.push(_line.split("//")[1]);
					}
			});

		log(`${_logMsg} getPlayList() -> ${ playList.length } songs in playlist`);
		
		_yourWelcome();
		});//.then(() => { // lines.forEach (_line => {
	}); // // 	return new Promise(async (_yourWelcome, _noThanks) => {
} // function getPlayList() {

function sendState(_sendTo, _logMsg) {
	return new Promise((_yourWelcome, _noThanks) => {
	    if (clients.length == 0) {
	    	log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg  }) -> NO connections... returning`);
	    	return;
	    }

  	log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg  }) state ->`);
	console.dir(state);

	for (let i = 0; i < clients.length; i++) 
	    if ((_sendTo == 'BROADCAST') || (clients[i].remoteAddress != _sendTo)) {        															
	        log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg })     sending state to -> ${ clients[i].remoteAddress }`);
	        clients[i].sendUTF(JSON.stringify({ state: state }));
	    } else 
	          log(`${ _sendTo } sendState(${ _sendTo }, ${ _logMsg }) NOT sending state to -> ${ clients[i].remoteAddress }`);

	if (state.hasOwnProperty("queueSong")) 
	    delete state.queueSong;

    if (state.hasOwnProperty("playList")) 
    	delete state.playList;

	_yourWelcome();
	}); // return new Promise((_yourWelcome, _noThanks) => {
} // function sendState(_sendTo, _logMsg) {

function log(_msg) {
	return new Promise((_yourWelcome, _noThanks) => {
		let logString = Date().split('GMT')[0] + `${ _msg }`;

		if (DEBUG) 
			console.log(logString);

		if (DEBUGTOLOGFILE)
			fs.open(LOGFILE, 'a', (_err, _fd) => {
				fs.write(_fd, Buffer.from(`${ logString }\n`, null), () => {
					console.log(`writing log data to -> ${ LOGFILE }`);
				});
			}); // fs.open(LOGFILE, 'a', (_err, _fd) => {

	_yourWelcome();
	}); // return new Promise((_yourWelcome, _noThanks) => {
} // function log(_msg) {

module.exports = app;
