"use strict";
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to bash -c 'curl -G winamp:3000/newsong/%f'
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const DEBUG    	   = true;
const { execFile } = require('child_process');
const playListFile = "/home/ian/monday.pls";
const Express 	   = require('express');
const FileSystem   = require("fs");
const Http     = require('http');
const WSServer = require('websocket').server;
const app      = Express();
const TEXT     = true;
const DIR      = false;
const port     = 3000; // 80;

var createError = require('http-errors');
var express 	= require('express');
var path 		= require('path');

let songLog  = [];
let playList = [];
let clients  = [];
let state    = {
    duration: 0,
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40
};

Number.prototype.toMMSS = function() {
    var minutes = parseInt(this / 60);
    var seconds = this % 60;

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    if (seconds < 0)
    	seconds = 0;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

setVolume(state.volume);
setupExpress();
setupWebsocket();
getPlayList();

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

FileSystem.watchFile(playListFile, async() => { 
	try {
		await getPlayList().then(async() => {
			var logMsg = "playListFile changed -> " + playList.length + " songs. resetting log";

			songLog = [];
			state.playList = [];

			for (let i = 0;i < playList.length; i++) 
			state.playList.push(playList[i].split(/\/[a-z]\//i)[1].slice(0,-4));

			log(TEXT, logMsg);
		}).then(sendState('BROADCAST', logMsg));
	} catch (_err) { log(TEXT,"FileSystem.watchFile error -> " + _err); }
}); // FileSystem.watchFile(playListFile, async() => { 

function setupExpress() {
	log(TEXT, "setupExpress()");

	app.engine('Pug', require('pug').__express);

	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'pug');

	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));

	app.get('*', (_request, _response, _next) => {
		log(TEXT,_request.socket.remoteAddress + " -> GET " + _request.url);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		_response.render('index', state);
	});

    app.get('/:arg1/:arg2?', async (_request, _response) => {
        const remoteAddress = _request.socket.remoteAddress; 
        const arg1 = _request.params.arg1;
        var arg2 = parseInt(_request.params.arg2);
  
  		try {
			execFile("lynx",["-auth=admin:adminjam","--dump","http://winamp:8000/admin/stats.xsl"], async (_err,_stdio,_stderr) => {
				state.listeners = parseInt(_stdio.split('listener_connections')[1]);
				state.currentlisteners = parseInt(_stdio.split('listeners')[1])

		        await execFile('qxmms', ['-lnS'], async(_err, _stdio, _stderr) => {
		            state.duration = parseInt(_stdio.split(" ")[0]);
		            state.progress = parseInt(_stdio.split(" ")[1]);

		            log(TEXT, "state.duration -> " + state.duration + " state.progress -> " + state.progress);

			        switch (arg1) { 
			            case "prev":
			                xmmsCmd('-r');
			            break;

			            case "pause":
			            	xmmsCmd('-t');
			                state.pause = !state.pause;
			                await sendState(remoteAddress, arg1); // send state to all except remoteAddress
			            break;

			            case "next":
			                xmmsCmd('-f');
			                _response.send(state); 
			            break;

			            case "shuffle":
			            case "shuffleenabled":
			            	xmmsCmd('-S');
			                state.shuffle = !state.shuffle;
			                await sendState(remoteAddress, arg1); // send state to all except remoteAddress
			            break;

			            case "getstate":
			            	log(TEXT, "sending state");
			            	log(DIR,state);
			            	await sendState('BROADCAST', arg1);
//			            	_response.send(state); 			// send state to remoteAddress 
			        //    	await sendState(remoteAddress, arg1); // send state to all except remoteAddress
			            break;

			            case "getplaylist":
			                state.playList = [];

							try {
								await getPlayList().then(() => {
					            	state.songLog = songLog;
					            	state.playList = playList;
					            	
					            	log(TEXT,playList.length + " songs in playlist");
									_response.send(state);			// send state to remoteAddress 
									});
							} catch (_err) { log(TEXT, "damnit -> " + _err); }
			            break;

			            case "setvolume":
							if (!remoteAddress.includes('192.168.50.1'))
								if (_request.params.arg2 == 'mute')
									setVolume('mute');
										else
											setVolume(arg2);

							await sendState(remoteAddress, arg1 + '/' + _request.params.arg2); // send state to all except remoteAddress
			            break;

			            case "queuesong": 	// * really hurt *
			                execFile('xmms', ['-Q', playList[arg2]]);
			                state.popupDialog = playList[arg2].split(/\/[a-z]\//i)[1].slice(0,-4) + " queued";
			                await sendState(remoteAddress, arg1 + '/' + arg2); // send state to all except remoteAddress
			            break;
			        
			            case "playsong":
			                execFile('qxmms',['jump', parseInt(arg2) + 1]);
			            break;

			            case "newsong":
				            state.pause = false;		          
				            arg2--;

				            if (arg2 > playList.length - 1)  { // queued mp3 at end of playlist
				                execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
				                    for (let i = 0; i < playList.length; i++)
				                        if (playList[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
				                            songLog.push(i);
				                            log(TEXT, remoteAddress + " -> Queued song index -> " + i + " " + _stdio);
				                            execFile('qxmms',['jump', parseInt(i) + 1]);
				                        }
				                }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
				            } else { // if (arg2 > playList.length)  {
				                    songLog.push(arg2);
									state.songLog = songLog;
									
				                    await sendState('BROADCAST', arg1 + '/' + arg2);
				                    }

				        	connectXmmsToDarkice();
			            break;

			            case "seek":
			                var seekTo = parseInt(state.duration * (arg2 / 100));

			                log(TEXT,"seekTo -> " + seekTo);
			                log(TEXT,"seekTo.toMMSS -> " + seekTo.toMMSS());
			              
							try {
				                await execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
							        execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
							            state.duration = parseInt(_stdio.split(" ")[0]);
							            state.progress = parseInt(_stdio.split(" ")[1]);

							            log(TEXT, "state.duration -> " + state.duration);
							            log(TEXT, "state.progress -> " + state.progress);
							        //    sendState("BROADCAST", arg1 + '/' + seekTo);
							        })//.then(sendState("BROADCAST", arg1 + '/' + seekTo));
			            	    }).then(sendState("BROADCAST", arg1 + '/' + arg2)); // execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
					          //      }); // execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
				           //});
							} catch (_err) {
								log(TEXT,"214 err -> " + _err);
							}
			            break;

			            default:
			                log(TEXT, remoteAddress + " -> error case option missing -> " + arg1);
			        } // switch (arg1) { 

			    if (state.hasOwnProperty('playList'))
					delete state.playList;

				log(TEXT, remoteAddress + " -> _response.end()");
				_response.end();
			    }); // execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
  	     	});
      	} catch (_err) { log(TEXT,"FileSystem.watchFile error -> " + _err); }
    }); // App.get('/:arg1/:arg2?', (_request, _response) => {

	// catch 404 and forward to error handler
	app.use(function(_request, _response, _next) {
		next(createError(404));
	});

	app.use(function(_error, _request, _response, _next) {
		// set locals, only providing error in development
		_response.locals.message = _error.message;
		_response.locals.error = _request.app.get('env') === 'development' ? _error : {};

		_response.status(_error.status || 500);
		_response.render('error');
	});
}

function connectXmmsToDarkice() {
    log(TEXT,"connectXmmsToDarkice()");
    
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
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

//async function xmmsCmd(_cmd) {
function xmmsCmd(_cmd) {
    execFile('xmms',[_cmd], (_err,_stdio,_stderr) => { 
	    log(TEXT,"xmmsCmd(" + _cmd + ") stdio -> " + _stdio);
    //	return _stdio;
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
                     
    log(TEXT,"setVolume(" + _params + ") state.volume -> " + state.volume);

    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");

    const wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,_request.socket.remoteAddress + ' recieved websocket request -> ' + _request.url);
 
        _response.writeHead(404);
        _response.end();
    }).listen(6502);

    const wsServer = new WSServer({
        url: "ws://localhost:6502",
        httpServer: wsHttp
    }); 

	wsServer.on('connect',async (_connection) => {
		log(TEXT, _connection.socket.remoteAddress + " -> new Websocket connection");
		clients.push(_connection);
	});

	wsServer.on('request', async (_request) => { 
		log(TEXT, _request.socket.remoteAddress + " request -> " + _request.resource);
		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', async (_connection) => {
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
async function getPlayList() {
	FileSystem.readFile(playListFile, function(_err, _data) {
		var lines = _data.toString().split("\n");

		playList = [];
		
	    lines.forEach (_line => {
	    	if (_line.toLowerCase().includes(".flac") || _line.toLowerCase().includes(".m4a")) 
	    		throw "!! Found flac or m4a file in playlist !!\n" + _line;

	        if (_line.includes('File') && _line.toLowerCase().includes(".mp3"))
	            playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
		}); // lines.forEach (_line => {
		
	    log(TEXT, "getPlayList() " + playList.length + " songs in playlist");
	});
} // function getPlayList() {

async function sendState(_sendTo, _logMsg) {
    log(TEXT,"sendState(" + _sendTo + ", " + _logMsg + ")");
    log(DIR, state);

	try {
	    for (let i = 0; i < clients.length; i++) 
	        if ((_sendTo == 'BROADCAST') || (clients[i].remoteAddress != _sendTo)) {
	            log(TEXT, "sending state to " + clients[i].remoteAddress);
	            await clients[i].sendUTF(JSON.stringify({ state: state }));
	        } else 
	            log(TEXT, "Not sending state to " + clients[i].remoteAddress);

	    if (state.hasOwnProperty('songLog')) {
	        log(TEXT,"sendState() removing songLog from state");
	        delete state.songLog;
	    }

	    if (state.hasOwnProperty('playList')) {
	        log(TEXT,"sendState() removing playList from state");
	        delete state.playList;
	    }

	    if (state.hasOwnProperty('popupDialog')) {
	        log(TEXT,"sendState() removing popupDialog from state");
	        delete state.popupDialog;
	    }
	} catch (_error) { log(TEXT,"sendState error -> " + _error); }
} // function sendState(_sendTo, _logMsg) {

function log(_type, _msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else 
	            	console.dir(_msg);
}

module.exports = app;
