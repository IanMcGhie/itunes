'use strict';
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const { execFile } 	= require('child_process');
const FileSystem 	= require('fs');
const Express 	   	= require('express');
const Http 			= require('http');
const WSServer 		= require('websocket').server;
//const NodeID3 		= require('node-id3');
const { gateway } 	= require('default-gateway').v4.sync();
const Path 			= require('path');
const App 			= Express();
const DEBUG 		= true;
const TEXT 			= true;
const WSPort		= 6502;
const playListFile 	= '/home/ian/monday.pls';

let mp3Path 		= '';
let songLog 		= [];
let playList 		= [];
let clients 		= [];

let state = {
	duration: 0,
	mute: false,
	pause: false,
	progress: 0,
	shuffle: true,
	volume:  40
};

Number.prototype.toMMSS = function() {
    let minutes = parseInt(this / 60);
    let seconds = parseInt(this % 60);

    if (minutes < 10) 
        minutes = '0' + minutes;
    
    if (seconds < 10)
        seconds = '0' + seconds;

    return minutes + ':' + seconds;
} // Number.prototype.toMMSS = function() {
//setVolume(state.volume);

getPlayList();
watchPlayList();
setupExpress();
setupWebsocket();

// turn shuffle on & start playing
// xmms will send /newsong/# http 
// request & setup the initial state
execFile('xmms', ['-Son','-pf']);

/* 
 The word “async” before a function means one
 simple thing: a function always returns a 
 promise. Other values are wrapped in a resolved
 promise automatically.*/
async function getXmmsState() {
	return new Promise((_resolve, _reject) => {
		execFile('qxmms', ['-lnSp'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(' ')[0]);
			state.progress = parseInt(_stdio.split(' ')[1]) + 2;  // ouch
		});

		execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
			state.totalListeners = parseInt(_stdio.split('listener_connections')[1]);
			state.currentListeners = parseInt(_stdio.split('listeners')[1]);
			_resolve();
		});
	}); // 	return new Promise((_resolve, _reject) => {
} // function getXmmsState() {

function log(_type, _msg) {
    if (DEBUG) {
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
    }
}

function newSong(_index, _dontSendTo) {
	if (_index > playList.length - 1)  { // queued mp3 at end of playlist
		log(TEXT,'This is a queued song');
		execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
			for (let i = 0; i < playList.length; i++) 
				if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
					songLog.push(i);
					log(TEXT, 'queued song path -> ' + mp3Path[i]);
					execFile('qxmms',['jump', parseInt(i) + 1]);
				}// if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
		});
	} else {
			log(TEXT, 'newSong(' + _index + ') ' + playList[_index]);

			songLog.push(_index);

			log(TEXT, 'newSong(' + _index + ') songLog');
			log(!TEXT, songLog);

	        if (clients.length > 0)
	        	sendState(clients, _dontSendTo); // send new state to clients
		} // } else {
} // function newSong(_index) {

function sendState(_clients, _dontSendTo) {
    log(TEXT, 'sendState() connections -> ' + _clients.length);
    log(TEXT, 'sendState() _dontSendTo -> ' + _dontSendTo);

    if (_clients.length == 0)
        log(TEXT, 'sendState() no connections... returning');
    
        for (let i = 0; i < _clients.length; i++) {
            if (_clients[i].remoteAddress != _dontSendTo) {
                log(TEXT, 'sendState() sending state to -> ' + _clients[i].remoteAddress);
                clients[i].send(JSON.stringify({state: state}));
            }
    } // sendState(_clients) {
}

async function processRequest(_request, _response) {
			const remoteAddress = _request.socket.remoteAddress; 
			const arg1			= _request.params.arg1;
			const arg2 			= _request.params.arg2;

			log(TEXT, remoteAddress + ' processRequest()');
			log(!TEXT, _request.params);

			switch (arg1) {
				case 'prev':
				case 'pause':
				case 'next':
				case 'shuffle':
				case 'shuffleenabled':
					xmmsCmd(arg1);
					sendState(clients, remoteAddress);
				break;

				case 'getstate':
					await getXmmsState().then(() => {

						if (arg2 == 'withplaylist') 
							state.playList = playList;

						state.songLog  = songLog;
						_response.send(state);
					});
				break;

				case 'setvolume':
					if (!remoteAddress.includes(gateway)) {
						setVolume(arg2);
						sendState(clients, remoteAddress);
					} else
						log(TEXT, remoteAddress + ' processRequest() ignoring request from gateway');
				break;

				case 'queuesong': 	// * really hurt *
					execFile('xmms', ['-Q', mp3Path[arg2]]);
					state.queueSong = parseInt(arg2);
					state.popupDialog = playList[state.queueSong] + ' queued';
					sendState(clients, remoteAddress);
				break;

				case 'playsong':
					execFile('qxmms',['jump', parseInt(arg2) + 1]);
				break;

				case 'newsong':
					newSong(parseInt(arg2) - 1, remoteAddress);
				break;

				case 'seek':
					let seekTo = parseInt(state.duration * (arg2 / 100));
					
					execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
						state.progress = seekTo;
						sendState(clients, remoteAddress);
					});
				break;

				default:
					log(TEXT,remoteAddress + ' processRequest()  ** error case option missing ** -> ' + arg1);
			} // switch (arg1) {

		log(TEXT,remoteAddress + ' processRequest() state');
		log(!TEXT, state);

		if (state.hasOwnProperty('playList')) {
			log(TEXT,remoteAddress + ' processRequest() delete state.playlist');
			delete state.playList;
		}

	_response.end();
} // function processRequest(_request) {

function setupWebsocket() {
	log(TEXT,'setupWebsocket()');

	const wsHttp = Http.createServer((_request, _response) => {
		_response.writeHead(404);
		_response.end();
	}).listen(WSPort);

	const wsServer = new WSServer({
		url: 'ws://localhost:' + WSPort,
		httpServer: wsHttp
	});

	wsServer.on('connect', (_connection) => {
		log(TEXT, _connection.socket.remoteAddress + " WS new connection. connections -> " + (clients.length + 1));
		clients.push(_connection);
		log(!TEXT, _connection.remoteAddress);
	});

	wsServer.on('request', (_request) => { 
		log(TEXT,_request.socket.remoteAddress + ' WSGET ' + _request.resource);
		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', (_connection) => {
        clients = clients.filter((el, idx, ar) => {
            return el.connected;
        });

	    log(TEXT,_connection.remoteAddress + " WS disconnected.  clients -> " + clients.length);
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function connectXmmsToDarkice() {
    log(TEXT,'connectXmmsToDarkice()');
    
    execFile('jack_lsp',(_err, _stdio, _stderr) => {
        const lines            = _stdio.split('\n');
        const xmmsJackPorts    = [];
        const darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes('darkice'))
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
	let file 	= FileSystem.readFileSync(playListFile);
	let lines 	= file.toString().split('\n');

	playList 	= [];
	mp3Path 	= [];

	lines.forEach ((_line) => {
		if (_line.toLowerCase().includes('.mp3') && _line.toLowerCase().includes('.mp3')) {
			playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
			mp3Path.push(_line.split('//')[1]);
		}
	}); // lines.forEach (_line => {

	log(TEXT,'getPlayList() ' + playList.length + ' songs in playlist');
} // function getPlayList() {

function setupExpress() {
	log(TEXT,'setupExpress()');

	App.engine('Pug', require('pug').__express);
	App.set('view engine', 'pug');

	App.use(Express.json());
	App.use(Express.urlencoded({ extended: false }));
	App.use(Express.static(Path.join(__dirname, 'public')));
///	App.use(Favicons(Path.join(__dirname, 'images', 'favicon.ico')))

	App.get('*', (_request, _response, _next) => {
		log(TEXT,_request.socket.remoteAddress + ' GET ' + _request.url);
		_next();
	});

	App.get('/', (_request, _response, _next) => {
		_response.render('index', state);
		_next();
	});

	App.get('/:arg1/:arg2?', (_request, _response) => {
		processRequest(_request, _response);//.then(_response.end());
	}); 
} // function setupExpress() {

function setVolume(_params) {
	if (_params == 'volup')
		state.volume++;
			else if (_params == 'voldown')
				state.volume--;
					else if (_params == 'mute') 
						state.mute = !state.mute; 
							else
								state.volume = parseInt(_params);

	log(TEXT,'setVolume(' + _params + ') -> ' + state.volume + '%');
	
	execFile('amixer', ['-c', '1', '--', 'sset', 'Master', state.volume + '%']);
	execFile('amixer', ['-c', '1', '--', 'sset', 'Master', state.mute ? 'mute' : 'unmute']);
}

function watchPlayList()  {
	log(TEXT,'watchPlayList() ' + playListFile);

	 FileSystem.watchFile(playListFile, (_curr, _prev) => {
		log(TEXT,'watchPlayList() playlist changed *** we need to send this to the clients **');
		getPlayList();
		state.playList = playList;
		state.songLog = [];
		state.popupDialog = "new playlist. " + playList.length + ' songs';
		sendState(JSON.stringify({ state: state }));
	});
}; // function watchPlatList()  {

function xmmsCmd(_command) {
	var args = [];

	log(TEXT, "xmmsCmd(" + _command + ")");

	switch (_command) {
		case 'prev':
			args.push('-r');
		break;
		
		case 'next':
			args.push('-f');
		break;
		
		case 'pause':
			state.pause = !state.pause;
			args.push('-t');
		break;
		
		case 'shuffle':
			state.shuffle = !state.shuffle;
			args.push('-S');
		break;
	}

    execFile('xmms', args);
} // function xmmsCmd(_command) {

module.exports = App;
