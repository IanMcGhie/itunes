"use strict";

// bb doesnt like the let, includes, const keyword, async functions, promises, ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var DEBUG      = true;
var itsTheBB   = true;
var TEXT       = true;
var newSelect  = false;
var userIsAdjustingTheProgressBar = false;
var serverUrl  = "winamp:6502";
var playList   = [];
var songLog    = [];
var oldSongLogLength = 0;
var state      = { duration: 1,
progress: 20
//pause: false 
};

Number.prototype.toMMSS = function() {    
    var minutes = parseInt(Math.abs(this) / 60);
    var seconds = parseInt(Math.abs(this) % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

Number.prototype.toHex = function () {
    var h = parseInt(this).toString(16);
    return h.length < 2 ? "0" + h : h;;
}

window.onresize = drawChart;

window.onload = function() { 
    log(TEXT, "window.onload event");

    const itsFirefox = typeof InstallTrigger !== 'undefined';
    const itsChrome  = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);
    
    setupClock();
    setupTitleTicker();
    setupKBEvents();
    setupMouseEvents();

    if (itsFirefox || itsChrome)
        setupWebSocket(); // this sets itsTheBB to false
            else 
                sendMsg("getstatewithplaylist"); 
};

function newPopup(_type) {
    log(TEXT, "newPopup(" + _type + ")");
/*
if (_type == "queuesong") {
    document.body.insertBefore(newDiv, currentDiv);

    setTimeout(function() {
       const currentDiv = document.getElementById(_type);
       
       document.body.removeChild(currentDiv);
    }, 4000);    
}
*/
    var dialog_msg;

    switch (_type) {
        case 'mute':
            dialog_msg = 'Muted';
        break;

        case 'pause':
            dialog_msg = 'Paused';
        break;

        case 'queuesong':
            dialog_msg = 'queued...';

            setTimeout(function() {
               const currentDiv = document.getElementById(_type);
               
               document.body.removeChild(currentDiv);
            }, 4000);  
        break;
    } // switch (_type) {

   if (document.getElementById('dialog_' + _type) == undefined) {
        const newDiv = document.createElement("div");
        const newContent = document.createTextNode(dialog_msg);

        newDiv.appendChild(newContent);
        newDiv.setAttribute('id', 'dialog_' + _type);

        var currentDiv = document.getElementById("winampspan");
        document.body.insertBefore(newDiv, currentDiv);
    } else {
            var currentDiv = document.getElementById("winampspan");
            currentDiv = document.getElementById('dialog_' + _type);
            document.body.removeChild(currentDiv);
    }
}
/*} else {
            if (!document.getElementById("popupid_" + (popupID))) {
                const currentDiv = document.getElementById("popupid_" + (popupID));
  //              alert(currentDiv);
                document.body.removeChild(currentDiv);            
            }
}*/
 /*
if (document.getElementById("popupid_" + (popupID - 1)) == null) {
    // create a new div element
    const newDiv = document.createElement("div");

    // and give it some content
    const newContent = document.createTextNode(_msg);
    // add the text node to the newly created div

    newDiv.appendChild(newContent);
    newDiv.setAttribute('id', 'popupid_' + popupID);
    //newDiv.setAttribute('top', '400px');
    newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
    
    const currentDiv = document.getElementById("winampspan");
    document.body.insertBefore(newDiv, currentDiv);
    } else {
//        if () {
        
    if (_delay > 0)  {
        setTimeout(function() {
           const currentDiv = document.getElementById("popup");
            document.body.removeChild(currentDiv);
        }, _delay);
    } else {
//            newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
  //      } else {
           const newDiv = document.getElementById("popupid_" + (popupID - 1));
            newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
            document.body.removeChild(newDiv);

         }

    }
}
*/

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function drawChart(_logMsg) {
    log(TEXT, "drawChart(" + _logMsg + ")");

    var chart;
    var barColors  = [];
    var chartData  = [];
    var lastLetter = "";
    var lastIndex  = -50;
    var showPlayed = true;

    chartData.length = playList.length;
    chartData.fill(0);

    for (var i = 0; i < playList.length - 1;i++) {
        chartData[songLog[i]]++;

        if (showPlayed && (chartData[i] > 0)) 
            barColors[i] = "#0d0";
                else if (chartData[i] == 0) 
                    barColors[i] = "#0d0";
    }
    
    // highlight currently playing
    chartData[songLog[songLog.length - 1]] = Math.max(...chartData) + 1;
    barColors[songLog[songLog.length - 1]] = "#fd1"; 

    if (chart)
        chart.destroy();   
    
    var customTooltips = function(_ttModel) {
        var chartToolTip    = getAttribs('charttooltip');
        var chartPopupIndex = -1;
        
        if (!chartToolTip) {
            chartToolTip                = document.createElement('div');
            chartPopupIndex             = this._active[0]._index;
            chartToolTip.id             = 'charttooltip';
            chartToolTip.innerHTML      = playList[chartPopupIndex] + '<br><br>Right click for songs ' + (showPlayed ? "not" : "") + ' played.';
            chartToolTip.style.left     = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
            chartToolTip.style.opacity  = 1;
            getAttribs("chartcontainer").appendChild(chartToolTip); 
        }

        // Hide if no tooltip
        if (songLog.includes(this._active[0]._index) && showPlayed)
            return;        

        if (this._active.length == 0) {
            getAttribs("chartcontainer").removeChild(chartToolTip);
            return;
        }

/*
        getAttribs("chart").rightclick(function() { // right click
            getAttribs("charttooltip").remove();
            showPlayed = !showPlayed;
            drawChart("onrightclick");
        });
  */     
        getAttribs("chart").click(function() {
            if (chartPopupIndex != -1)
                sendMsg("playsong/" + chartPopupIndex);
        });

        chartToolTip.style.color = "#0d0";
        chartToolTip.style.border = "1px solid #0d0";

        if (chartPopupIndex == songLog[songLog.length - 1]) { 
            chartToolTip.style.color = "#fd1"; // highlight currently playing song
            chartToolTip.style.border = "1px solid #fd1";
            }
    };  // var customTooltips = function(_ttModel) {

    chart = new Chart(getAttribs("chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },               
            responsive: true,
            aspectRatio: 14,
            title: { display: false },            
            tooltips: {
                enabled: false, // disable on-canvas tooltips
                mode: 'nearest', //index point dataset nearest x
                position: 'nearest',
                intersect: false,
                custom: customTooltips
            },
            scales: {
                xAxes: [{ 
                        beginAtZero: true,
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) {
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || songLog.includes(_index))) {
                                        lastLetter = playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                }
                            }  // callback: function(_value, _index, _values) { 
                        } // ticks: {
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(getAttribs("chart"), {
} // function drawChart() {

function getAttribs(_id) {
    return document.getElementById(_id);
}

function log(_type, _msg) {
    if (DEBUG) 
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
}

function processMessage(_command) {
    log(TEXT, "processMessage(" + _command + ")");

    if (state.hasOwnProperty('playList')) {
        setupPlayList();
        setupSearch();
    } 

    if (state.hasOwnProperty('songLog')) 
        songLog = state.songLog;

    if (_command == 'mute' || _command == 'pause' || _command.split("/")[0] == 'queuesong') 
        newPopup(_command);

    if (_command == "shuffle")
        state.shuffle = !state.shuffle;

    if (_command == "pause") 
        state.pause = !state.pause;

    if (_command == 'volup')
        state.volume++;

    if (_command == 'voldown')
        state.volume--;
} // function processMessage(_command) {

function sendMsg(_command) {
    log(TEXT, "sendMsg(" + _command + ")");
 
    var request  = new XMLHttpRequest();

    request.open('GET', '/' + _command, true); // true for asynchronous request
    request.send(null);  
    processMessage(_command);
    updateUI("sendMsg(" + _command + ")");
} // function sendMsg(_command) {

function setupClock() {
    log(TEXT, "setupClock()");

    setInterval(function() {
        if (state && !state.pause && state.progress < state.duration) 
            state.progress++;
 
        getAttribs('clock').innerHTML = "-" + (state.progress - state.duration).toMMSS();
        getAttribs('progress').value  = parseInt(state.progress / state.duration * 100);
    }, 1000); 
} // function setupClock() {

function setupKBEvents() {
    log(TEXT, "setupKBEvents()");

    document.addEventListener('keyup', (_event) => {
        log(TEXT, "keyup -> " + _event.keyCode);
        
        switch (_event.keyCode) {
            case 13: // CR
                sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
            break;

            case 90: // Z z
                sendMsg("prev");
            break;

            case 66: // B b
                sendMsg("next");
            break;

            case 77: // M m
                sendMsg("mute");
            break;

            case 67: // C c
                sendMsg("pause");
            break;

            case 83: // S s
                sendMsg("shuffle");
            break;
/*
you cant do this....maybe
            case 81: // Q q
                sendMsg("queuesong/" + playList.indexOf(getAttribs("searchinput").value));
            break;
*/
            case 79: // O o
                sendMsg("volup");
            break;

            case 73: // I i
                sendMsg("voldown");
            break;

            case 74: // J j
                getAttribs('searchinput').focus();
            break;
        } // switch (_event.which) {
    }); // document.addEventListener('keyup', (_event) => {

/*
const listener = function(e) {
  console.log('focused!'); // do anything here
} 

// Add event listener 
document.getElementById("txttaskdateDeploy").addEventListener("focus", listener);

// When you want to remove the event listener 
document.getElementById("txttaskdateDeploy").removeEventListener("focus", listener);
*/
/*
setTimeout(function() {
//log(TEXT, "setting focus event")
//    getAttribs("playlist").focusin(function() {
getAttribs("playlist").addEventListener('focus', (_event) => {    

        getAttribs("body").off("keyup");
        getAttribs("playlist").css("border", "1px solid #0d0");

        getAttribs("playlist").keyup(function(_event) {
            log(TEXT, "key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT, "Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // getAttribs("#playlist").keyup(function(_event) {
    }); // getAttribs("#playlist").focusin(function() {


    //getAttribs("playlist").focusout(function() {
    getAttribs("playlist").addEventListener('blur', (_event) => {
//        getAttribs("playlist").off("keyup");
  //      getAttribs("playlist").css("border", "1px solid #888");
    //    setupKBEvents();
    });
});
}, 1000);
*/
} // function bodyKBEvents(_event) {

function setupMouseEvents() {
    log(TEXT, "setupMouseEvents()");

    var clickEvents = ['prev', 'pause', 'next', 'shuffle'];

    clickEvents.forEach(function(_event) {
        getAttribs(_event).addEventListener('click', function() {
           sendMsg(_event);
        });
    });
    
    getAttribs('winampdiv').addEventListener("wheel", function(_event) {
        if ((state.volume >= 0) && (state.volume <= 100))
            if (_event.deltaY > 0) 
                state.volume--;
                    else
                        state.volume++;

        sendMsg("setvolume/" + state.volume);
    });

    getAttribs('playlist').addEventListener("dblclick", function(_event) {
        sendMsg("playsong/" + getAttribs("playlist").selectedIndex);
    });

    getAttribs('playlist').addEventListener("change", function(_event) {
        getAttribs("searchinput").value = getAttribs("playlist").value;
    }); 
  /*
    getAttribs("progress").draggable({
       containment: "parent",
       start: function() {
            userIsAdjustingTheProgressBar = true;
        },
        stop: function(_event, _ui) {
            sendMsg("seek/" + (state.progress / state.duration) * 100);

            userIsAdjustingTheProgressBar = false;
        }  
    });
    */
} // function setupMouseEvents() {

function setupPlayList() {
    log(TEXT, "setupPlayList()");

    playList = state.playList;

    if (playList.length < 20)
        getAttribs("playlist").size = playList.length;
    
    for (var i = 0; i < playList.length; i++) {
        var select = getAttribs("playlist");
        var option = document.createElement("option");
                 
        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } 

    log(TEXT, "setupPlayList() " + playList.length + " songs in playList. removing playList from state");

    delete state.playList;    
} // function setupPlayList() {

function setupSearch() {
    log(TEXT, "setupSearch()");

    getAttribs('searchinput').addEventListener('focusin', function() {
document.removeEventListener('keyup', []);
        getAttribs("searchinput").style.border = "1px solid #0d0";

        if (!newSelect) 
            getAttribs("searchinput").value = "";
                else
                    newSelect = false;
        
        document.addEventListener('keyup', (_event) => {
            if (_event.which == 13) {
                sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
                getAttribs("searchinput").blur();
                newSelect = false;
            }

            if (_event.which == 27)
                getAttribs("searchinput").blur();
        }); // document.addEventListener('keyup', (_event) => { 
    }); // getAttribs('searchinput').addEventListener('focusin', function() {

    getAttribs('searchinput').addEventListener('focusout', function() {
        getAttribs("searchinput").style.border  = "1px solid #888";
        getAttribs("searchinput").value         = getAttribs("playlist").value;
        setupKBEvents();
    }); // getAttribs("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        className: 'autocomplete-customizations',
        minLength: 2, //debounceWaitMs: 50,
        emptymessage: "MP3 not found",
        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            getAttribs("#searchinput").val(_item.label);
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = playList.map(function(_n) {
                return { label: _n, group: "Results" }
            });
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) {
                    return _n.label.toLowerCase().indexOf(match) !== -1;
                }
            }));
        },
        render: function(_item, _value) {  //  log(LOG,"onrender ****")
            var itemElement = document.createElement("div");
            itemElement.id  = "resultrow_";

            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>";
                });
                itemElement.innerHTML = inner;
            } else 
                    itemElement.textContent = _item.label;
  
            return itemElement;
        },
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearch() {

function setupTitleTicker() {
    log(TEXT, "setupTitleTicker()");

    setInterval(function() {
        var pageTitle = getAttribs('pagetitle');

        if (pageTitle.text.length > 0)
            pageTitle.innerHTML = pageTitle.innerHTML.slice(1);
                else
                    pageTitle.innerHTML =  playList[songLog[songLog.length - 1]];
    }, 250);
} // function setupTitleTicker() {

function setupWebSocket() {
    log(TEXT, "setupWebSocket()");

    var client = new WebSocket("ws://" + serverUrl, "winamp");
    
    itsTheBB = false; 

    client.onmessage = function(_message) {
        log(TEXT, "WS message from server");
        state = _message.data.state;
        log(!TEXT, state);
        processMessage("WS message from server");
        updateUI("WS message from server");
    } // client.onmessage = function(_message) {
} // function setupWebSocket() 

function updateUI(_logMsg) {
    log(TEXT, "updateUI(" + _logMsg + ")");

    var songTitle = playList[songLog[songLog.length - 1]];
    // vol 0% -> 40 153 28  vol 100% -> 225 31 38
    //           28  99 1c               e1 1f 26 
    var r = (state.volume * 1.85 + 40).toHex();
    var g = (153 - state.volume).toHex();
    var b = (state.volume * 0.1 + 28).toHex();

    if (songLog.length != oldSongLogLength && !itsTheBB) {
        oldSongLogLength = songLog.length;
        getAttribs("pagetitle").innerHTML = "";
        drawChart("updateUI(" + _logMsg + ")");
    }

    if (state.hasOwnProperty('id3Artist')) 
        songTitle = state.id3Artist + " - " + state.id3Title;

    if (state.pause)
        getAttribs("paused").src = "images/paused.png";
            else
                getAttribs("paused").src = "images/playing.png";
    
    if (state.shuffle)
        getAttribs("shuffleenabled").style.display = "inline";
            else
                getAttribs("shuffleenabled").style.display = "none";

    if (itsTheBB) {
/*        getAttribs("body").css("text-align","left");
        getAttribs("songtitle").css("width","45%");
        getAttribs("shuffle").css("margin-left", "-190px");
        getAttribs("mutedialog").css("left","5%");
        getAttribs("mutedialog").css("top","35%");
        getAttribs("popupdialog").css("top","30%");
        getAttribs("popupdialog").css("left","0px");
        getAttribs("popupdialog").css("width","40%"); */
    }

    getAttribs("songtitle").innerHTML           = songTitle + " (" + state.duration.toMMSS() + ")";
    getAttribs('volume').value                  = state.volume;
    getAttribs("volume").style.backgroundColor  = "#" + r + g + b;
    getAttribs("playlist").selectedIndex        = songLog[songLog.length - 1];
   // getAttribs("searchinput").size          = 124; // ???
    getAttribs("searchinput").value             = playList[getAttribs("playlist").selectedIndex];
    getAttribs("connections").innerHTML         = "Played-" + songLog.length + "&nbsp;&nbsp;Current-" + state.currentListeners + "&nbsp;&nbsp;Total-" + state.totalListeners;
} // function updateUI(_logMsg) {
