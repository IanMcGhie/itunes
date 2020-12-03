'use strict';
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const Queue 		= require('./public/js/Queue');
const Logger		= require('./public/js/Logger');
const { execFile } 	= require('child_process');
const FileSystem 	= require('fs');
const Express 	   	= require('express');
const Http 			= require('http');
const WSServer 		= require('websocket').server;
//const NodeID3 		= require('node-id3');
const gateway 		= require('default-gateway').v4.sync();
const Path 			= require('path');
const App 			= Express();
const DEBUG 		= true;
const WSPort		= 6502;
const playListFile 	= '/home/ian/monday.pls';

let mp3Path 		= '';
let outQueue		= new Queue(DEBUG);
let log 			= new Logger(DEBUG);
let songLog 		= [];
let playList 		= [];

let mState = {
	volume:  40,
	shuffle: true,
	duration: 0,
	mute: false,
	pause: false,
	progress: 0,
	shuffle: true,
	totalListeners: 0,
	currentListeners: 0
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

getPlayList();
watchPlayList();
setVolume(mState.volume);
setupExpress();
setupWebsocket();

// turn shuffle on & start playing
// xmms will send /newsong/# http 
// request & setup the initial state
//execFile('xmms', ['-Son','-pf']);

/* 
 The word “async” before a function means one
 simple thing: a function always returns a 
 promise. Other values are wrapped in a resolved
 promise automatically.*/
async function getXmmsState() {
	return new Promise((_resolve, _reject) => {
		execFile('qxmms', ['-lnSp'], (_err, _stdio, _stderr) => {
			mState.duration = parseInt(_stdio.split(' ')[0]);
			mState.progress = parseInt(_stdio.split(' ')[1]) + 1;
			mState.currentlyPlaying = parseInt(_stdio.split(' ')[2]) - 1;
		});

		execFile('lynx', ['-auth=admin:adminjam','--dump','http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
			mState.totalListeners = parseInt(_stdio.split('listener_connections')[1]);
			mState.currentListeners = parseInt(_stdio.split('listeners')[1]);
			_resolve();
		});
	}); // 	return new Promise((_resolve, _reject) => {
} // function getXmmsState() {

async function xmmsCmd(_command) {
	return new Promise((_resolve, _reject) => {
		var args = [];

		if (_command == 'prev')
			args.push('-r');
				else if (_command == 'next')
					args.push('-f');
						else if (_command == 'pause') {
								mState.pause = !mState.pause;
								args.push('-t');
							} else if (_command == 'shuffle') {
									mState.shuffle = !mState.shuffle;
									args.push('-S');
							}

	    execFile('xmms', args);
	    _resolve();
	}); // return new Promise((_resolve, _reject) => {
} // function xmmsCmd(_command) {

async function newSong(_index) {
	return new Promise(async (_resolve, _reject) => {
		try {
			if (_index > playList.length - 1)  { // queued mp3 at end of playlist
				log.text('This is a queued song');
				execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
					for (let i = 0; i < playList.length; i++) 
						if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
							songLog.push(i);
							log.text('queued song path -> ' + mp3Path[i]);
							execFile('qxmms',['jump', parseInt(i) + 1]);
						}// if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
				});
			} else {
					log.text('newSong(' + _index + ') ->  ' + playList[_index]);

					songLog.push(_index);
					mState.currentlyPlaying = _index;
					connectXmmsToDarkice();
					
					try {
						await getXmmsState().then(async () => {
							mState.songLog = songLog;
						});
					} catch (_error) {
						log.text('newSong(' + _index + ') error 2 -> ' + _error);
					}
				} // } else {
			} catch (_error) {
				log.text('newSong(' + _index + ') error 1 -> ' + _error);
			}
	_resolve();
	});
} // function newSong(_index) {

async function processRequest(_request, _response) {
	return new Promise(async (_resolve, _reject) => {
		try {
			const remoteAddress = _request.socket.remoteAddress; 
			const command	= _request.params.arg1;
			const arg2	= _request.params.arg2;

			log.text('processRequest() from -> ' + remoteAddress);
			log.text('processRequest() request:');
			log.obj(_request.params);

			switch (command) {
				case 'prev':
				case 'pause':
				case 'next':
				case 'shuffle':
				case 'shuffleenabled':
					xmmsCmd(command);
				break;
	/*
	 				case 'favicon':
						_response.render('/public/images/favicon.ico');
					break;
	*/
				case 'getstate':
					await getXmmsState().then(() => {

						if (arg2) {
							mState.playList = playList;
							mState.songLog  = songLog;
						} 
					});

					_response.send(mState);
				break;

				case 'setvolume':
					if (!remoteAddress.includes(gateway)) {
						setVolume(arg2);
						outQueue.enQueue({'command': 'setvolume', 'connection': _request});
					} else
						log.text('processRequest() not setting volume. gateway -> ' + gateway);
				break;

				case 'queuesong': 	// * really hurt *
					execFile('xmms', ['-Q', mp3Path[arg2]]);
					mState.queueSong = parseInt(arg2);
					mState.popupdialog = playList[mState.queueSong] + ' queued';
					outQueue.sendState(remoteAddress, command + '/' + arg2); 
				break;

				case 'playsong':
					execFile('qxmms',['jump', parseInt(arg2) + 1]);
				break;

				case 'newsong':
					newSong(parseInt(arg2) - 1);
				break;

				case 'seek':
					let seekTo = parseInt(mState.duration * (arg2 / 100));
					
					execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
						mState.progress = seekTo;
						outQueue.sendState(BROADCAST, command + '/' + arg2)
					});
				break;

				default:
					log.text("processRequest() " + remoteAddress + ' ** error case option missing ** -> ' + command);
			} // switch (arg1) {

		if (mState.hasOwnProperty('playList')) {
			log.text('processRequest() removing playlist from state. ' + mState.playList.length + " songs");
			delete mState.playList;
		}

		if (mState.hasOwnProperty('songLog')) {
			log.text('processRequest() removing  songLog from state. ' + mState.songLog.length + " song(s)");
			delete mState.songLog;
		}

		log.text('processRequest() current state:');
		log.obj(mState);

		_response.end();
		_resolve();
		} catch (_error) {
			log.text('processRequest() function processRequest error -> ' + _error);
		}
	});
} // function processRequest(_request) {

function setupWebsocket() {
	log.text('setupWebsocket()');

	const wsHttp = Http.createServer((_request, _response) => {
		_response.writeHead(404);
		_response.end();
	}).listen(WSPort);

	const wsServer = new WSServer({
		url: 'ws://localhost:' + WSPort,
		httpServer: wsHttp
	});

	wsServer.on('connect', (_connection) => {
		log.text('new websocket connection from -> ' + _connection.socket.remoteAddress);
	});

	wsServer.on('request', (_request) => { 
		log.text(_request.socket.remoteAddress + ' websocket request -> ' + _request.resource);
		_request.accept('winamp', _request.origin);
	});

	wsServer.on('close', (_connection) => {
		if (outQueue.front().hasOwnProperty('clients'))
			outQueue.front().clients = outQueue.front().clients.filter((_el, _idx, _ar) => {
				return _el.connected;
			});

	    log.text(_connection.remoteAddress + ' -> websocket disconnected');
    }); 
} // function setupWebsocket() {

function connectXmmsToDarkice() {
    log.text('connectXmmsToDarkice()');
    
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

	log.text('getPlayList() -> ' + playList.length + ' songs in playlist');
} // function getPlayList() {

function setVolume(_params) {
	if (_params == 'volup')
		mState.volume++;
			else if (_params == 'voldown')
				mState.volume--;
					else if (_params == 'mute') 
						mState.mute = !mState.mute; 
							else
								mState.volume = parseInt(_params);

	log.text('setVolume(' + _params + ') -> ' + mState.volume + '%');
	
	execFile('amixer', ['-c', '1', '--', 'sset', 'Master', mState.volume + '%']);
	execFile('amixer', ['-c', '1', '--', 'sset', 'Master', mState.mute ? 'mute' : 'unmute']);
}

function setupExpress() {
	log.text('setupExpress()');

	App.engine('Pug', require('pug').__express);
	App.set('view engine', 'pug');

	App.use(Express.json());
	App.use(Express.urlencoded({ extended: false }));
	App.use(Express.static(Path.join(__dirname, 'public')));
//	App.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')))

	App.get('*', (_request, _response, _next) => {
		log.text('------------- New Request --------------');
		log.text(_request.socket.remoteAddress + ' http get request -> ' + _request.url);
		_next();
	});

	App.get('/', (_request, _response, _next) => {
		_response.render('index', mState);
		_next();
	});

	App.get('/:arg1/:arg2?', (_request, _response) => {
		processRequest(_request, _response);//.then(_response.end());
	}); 
} // function setupExpress() {

function watchPlayList()  {
	log.text('watchPlayList() -> ' + playListFile);

	 FileSystem.watchFile(playListFile, (_curr, _prev) => {
		log.text('watchPlayList() playlist changed');
		getPlayList();
		mState.playList = playList;
		mState.songLog = [];
		mState.popupdialog = playList.length + ' songs in playlist';
//		outQueue(JSON.stringify({'command': 'newplaylist'}));
		outQueue(JSON.stringify({ playList: playList, songLog: songLog }));
	});
}; // function watchPlatList()  {

module.exports = App;
