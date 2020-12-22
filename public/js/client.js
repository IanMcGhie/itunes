"use strict";
// bb doesnt like the let, includes, const keyword, async functions, promises, ()=> syntax
// ... i dont either
// ooo...neat https://en.wikipedia.org/wiki/Trie
let DEBUG      = true;
let itsTheBB   = true;
let showPlayed = true;
let TEXT       = true;
let newSelect  = false;
let chart;
let userAdjustingProgressBar = false;
let serverUrl  = "winamp:6502";
let playList   = [];
let songLog    = [];
let songLogLength = 0;
let state      = {  volume: 40,
                    duration: 1,
                    progress: 0 };

Number.prototype.toMMSS = function() {    
    let minutes = parseInt(Math.abs(this) / 60);
    let seconds = parseInt(Math.abs(this) % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

$(document).ready(function() {
    let itsFirefox = typeof InstallTrigger !== 'undefined';
    let itsChrome  = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

    document.body.style.color = "#0d0"; // set chart bar default color 
      
    setupKBEvents();
    setupMouseEvents();
    setupClock();

    if (itsFirefox || itsChrome)
        setupWebSocket(); // this sets itsTheBB to false
            else 
                sendMsg("getstatewithplaylist");

    setupTitleTicker();
    setupVolumeControl();   
    // window.onresize = drawChart;
}); // $(document).ready(function() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function drawChart(_logMsg) {
    log(TEXT, "drawChart(" + _logMsg + ")");

    let barColors  = [];
    let chartData  = [];
    let lastLetter = "";
    let lastIndex  = -50;
    let yMax       = 0;
    let currentSongIndex = -1;

    let customTooltips = function(_ttModel) {
        let chartToolTip = document.getElementById('charttooltip');
        let innerHTML = "<table>";
        let chartPopupIndex = -1;

        // Hide if no tooltip
        if (this._active.length == 0 || !songLog.includes(this._active[0]._index) && showPlayed) {
            $("#charttooltip").remove();
            chartPopupIndex = -1;
            return;
        }

        if (!chartToolTip) {
            log(TEXT, "drawChart() -> creating tooltip div")
            chartToolTip = document.createElement('div');
            chartToolTip.id = 'charttooltip';
            chartToolTip.innerHTML = innerHTML;
            this._chart.canvas.parentNode.appendChild(chartToolTip);
        }

        chartPopupIndex = this._active[0]._index;

        $("#chart").unbind();
        $("#chart").contextmenu(function() { // right click
            $("#charttooltip").remove();
            showPlayed = !showPlayed;
            drawChart("contextmenu");
        });
       
        $("#chart").click(function() {
            if (chartPopupIndex != -1)
                sendMsg("playsong/" + chartPopupIndex);
        });

        // highlight currently playing song
        if (chartPopupIndex == songLog[songLog.length - 1]) { 
            chartToolTip.style.color = "#fd1";
            chartToolTip.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    chartToolTip.style.color = "#0d0";
                    chartToolTip.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
                    }

        innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs ' + (showPlayed ? "not" : "") + ' played.</td></tr></tbody></table>';

        chartToolTip.querySelector('table').innerHTML = innerHTML;
        chartToolTip.style.opacity = 1;
        chartToolTip.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // let customTooltips = function(_ttModel) {

    $("#chartcontainer").css("display","inline-block");
    
    currentSongIndex = songLog[songLog.length - 1];
    chartData.length = barColors.length = playList.length;
    chartData.fill(0);
    barColors.fill(document.body.style.color);

    for (let i = 0; i < songLog.length;i++) {
        barColors[songLog[i]] = document.body.style.color;
        chartData[songLog[i]]++;

        if (chartData[songLog[i]] > yMax)
            yMax = chartData[songLog[i]] + 1;
    }

    chartData[currentSongIndex] = yMax;

    if (!showPlayed) { 
        for (let i = 0; i < chartData.length;i++) {
            if (chartData[i] > 0) {
                barColors[i] = "#000";
                chartData[i] = 0;
            } else {
                    barColors[i] = document.body.style.color;
                    chartData[i] = 1;
                    }
        
        chartData[currentSongIndex] = 2;
        }
    }

    barColors[currentSongIndex] = "#fd1"; // highlight currently playing

    if (chart)
        chart.destroy();
    
    chart = new Chart($("#chart"), {
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
    }); //  chart = new Chart($("#chart"), {
} // function drawChart() {

function getSearchInputSongIndex() {
    let index = playList.indexOf($("#searchinput").val());
    
    log(TEXT, "getSearchInputSongIndex() -> " + index);

    return index;
}

function log(_type, _msg) {
    if (DEBUG) {
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
    }
}

function sendMsg(_command) {
    log(TEXT, "sendMsg(" + _command + ")");
 
    let request  = new XMLHttpRequest();

    request.open('GET', '/' + _command, false);
    log(TEXT, "sendMsg(" + _command + ") command sent");
    request.send();

    if (request.response) {
        log(TEXT, "sendMsg(" + _command + ") message received");

        state = JSON.parse(request.response);

        log(!TEXT, state);
    } else if (_command.split("/")[0] == "queuesong") { // // if (request.response) { 
                log(TEXT, "sendMsg(" + _command + ") already updated UI... returning");
                alert("q dialog goes here...");
                return;
            }

    // these are the commands that we dont wait for a reply from the server
    // and just update the ui right away...
    switch (_command) {
        case 'shuffle':
        case 'shuffleenabled':
            state.shuffle = !state.shuffle;
            $("#shuffleenabled").css("visibility", state.shuffle ? "visible" : "hidden");
        break;

        case 'mute':
            state.mute = !state.mute;
            $("#mutedialog").css("display", state.mute ? "inline-block" : "none");
        break;

        case 'pause':
            state.pause = !state.pause;
            $("#paused").attr("src", state.pause ? "/images/paused.png" : "/images/playing.png");
        break;

        case 'next':
        case 'prev':
        break;
         
        default:
           updateUI("sendMsg(" + _command + ")");
    }
} // function sendMsg(_command) {

function setupClock() {
    log(TEXT, "setupClock()");

    setInterval(function() {
        if (!state.pause && state.progress < state.duration) 
            state.progress++;
        
        $("#progressbarhandle").css("padding-left", (state.progress / state.duration) * 375);
        $("#clock").text("-" + (state.progress - state.duration).toMMSS());
    }, 1000); 
} // function setupClock() {

function setupKBEvents() {
    log(TEXT, "setupKBEvents()");
    
    $("body").keyup((_event) => {
        log(TEXT, "body keyup -> " + _event.which);
        
        switch (_event.which) {
            case 90: // Z z
                sendMsg("prev");
            break;

            case 66: // B b
                sendMsg("next");
            break;

            case 77: // M m
                sendMsg("mute");
            break;

            case 67: // c
                sendMsg("pause");
            break;

            case 83: // S s
                sendMsg("shuffle");
            break;

            case 81: // Q q
                sendMsg("queuesong/" + getSearchInputSongIndex());
            break;

            case 79: // O o
                $("#volume").slider("value", parseInt($("#volume").slider("value") + 1));
            break;

            case 73: // I i
                $("#volume").slider("value", parseInt($("#volume").slider("value") - 1));
            break;

            case 74: // J j
                $("#searchinput").focus();
            break;
        } // switch (_event.which) {
    }); // $("body").keyup((_event) => {

    $("#playlist").focusin(function() {
        $("body").off("keyup");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup((_event) => {
            log(TEXT, "key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    sendMsg("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT, "Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup((_event) => {
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #888");
        setupKBEvents();
    });
} // function bodyKBEvents(_event) {

function setupMouseEvents() {
    log(TEXT, "setupMouseEvents()");

    // this will cause slidechange jquery cb to fire
    $("#winampspan").on("wheel", (_event) => {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#winampspan").click(function() {
// dont do this here....you hit pause...and you get TWO calls back...one for pause...and one for the winampspan
//        if (itsTheBB)
        //    sendMsg("getstate/withplaylist");
    });

     $("#playsong, #queuesong").click(function() {
        sendMsg((this).id + "/" + getSearchInputSongIndex());
     });

    $("#shuffle, #shuffleenabled, #pause, #prev, #next, #pause, #mutedialog").click(function() {
        sendMsg((this).id);
    });

    $("#progressbarhandle").draggable({
       containment: "parent",
       start: function() {
            userAdjustingProgressBar = true;
        },
        stop: function(_event, _ui) {
            sendMsg("seek/" + parseInt((_event.target.offsetLeft / 375) * 100));
            userAdjustingProgressBar = false;
        }  
    });

    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });

    $("#playlist").dblclick(function() {
        sendMsg("playsong/" + getSearchInputSongIndex());
    });
} // function setupMouseEvents() {

function setupPlayList() {
    log(TEXT, "setupPlayList()");

    playList = state.playList;

    $("#playlist").attr("size", playList.length < 20 ? playList.length : 20);
    $("#playlist").empty();

    for (let i = 0; i < playList.length; i++) {
        let select = document.getElementById("playlist");
        let option = document.createElement("option");
                 
        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } 

    log(TEXT, "setupPlaylist() " + playList.length + " songs in playList. removing playList from state");

    delete state.playList;
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT, "setupSearch()");

    $("#searchinput").focusin(function() {
        $("body").off("keyup");
        $("#searchinput").css("border", "1px solid #0d0");
          
        if (!newSelect) 
            $("#searchinput").val("");
                else
                    newSelect = false;
        
        $("#searchinput").keyup(function(_event) {      
            if (_event.which == 13) {
                sendMsg("playsong/" + getSearchInputSongIndex());
              $("#searchinput").blur();
                newSelect = false;
            }

            if (_event.which == 27)
                $("#searchinput").blur();
        }); // $("#searchinput").keyup(function(_event) {      
    }); // $("#searchinput").focusin(function() {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").val());
        setupKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        className: 'autocomplete-customizations',
        minLength: 2, //debounceWaitMs: 50,
        emptymessage: "MP3 not found",
        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            $("#searchinput").val(_item.label);
        },
        fetch: function(_match, _callback) {
            let match   = _match.toLowerCase();
            let items   = playList.map(function(_n) {
                return { label: _n, group: "Results" }
            });
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) {
                    return _n.label.toLowerCase().indexOf(match) !== -1;
                }
            }));
        },
        render: function(_item, _value) {  //  log(LOG,"onrender ****")
            let itemElement = document.createElement("div");
            itemElement.id  = "resultrow_";

            if (charsAllowed(_value)) {
                let regex = new RegExp(_value, 'gi');
                let inner = _item.label.replace(regex, function(_match) {
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
        if (($("#pagetitle").text().length > 0))
            $("#pagetitle").text($("#pagetitle").text().slice(1));
                else
                    $("#pagetitle").text(playList[songLog[songLog.length - 1]]);
    }, 250);
} // function setupTitleTicker() {

function setupVolumeControl() {
    $("#volume").slider({
        create: function(_event, _ui) {
            log(TEXT, 'slider created');
        },
        change: function(_event, _ui) {
            log(TEXT, "slidechange cb fired state.volume -> " + state.volume);

            // vol 0% -> 40 153 28  vol 100% -> 225 31 38
            //           28  99 1c               e1 1f 26 
            let r = toHex(_ui.value * 1.85 + 40);
            let g = toHex(153 - _ui.value);
            let b = toHex(_ui.value * 0.1 + 28);

            $("#volume").css("background-color","#" + r + g + b);            

            log(TEXT, "volumeControl CB() sending new value -> " +  _ui.value + " color -> #" + r + g + b);

            if (state.hasOwnProperty('volume')) {
                log(TEXT, "not sending volume back to server...removing state.volume");
                delete state.volume;
                return;
            }

            $.get("setvolume/" + _ui.value);
        },
        animate: false,
        min: 1,
        max: 100,
        value: state.volume
    });
} // function setupVolumeControl() {

function setupWebSocket() {
    log(TEXT, "setupWebSocket()");
    
    let client = new WebSocket("ws://" + serverUrl, "winamp");
    
    itsTheBB = false;

    client.onmessage = function(_message) {
        log(TEXT, "WS onmessage CB()recieved ->");

        state = JSON.parse(_message.data).state;

        log(!TEXT, state);
        
        updateUI("WS onmessage CB()");
    } // client.onmessage = function(_message) {
} // function setupWebSocket() 

function toHex(_n) {
    let h = parseInt(_n).toString(16);
    return h.length < 2 ? "0" + h : h;;
}

function updateUI(_logMsg) {
    log(TEXT, "updateUI(" + _logMsg + ")");

    if (state.hasOwnProperty('songLog')) 
        songLog = state.songLog;


    if (state.hasOwnProperty('playList')) {
        setupPlayList();
        setupSearch();
    }

    if (songLog.length != songLogLength) {
        songLogLength = songLog.length;
        $("#pagetitle").text("");
        drawChart("updateUI");
    }

    let currentlyPlaying = playList[songLog[songLog.length - 1]];

    $("#shuffleenabled").css("visibility", state.shuffle ? "visible" : "hidden");
    $("#mutedialog").css("display", state.mute ? "inline-block" : "none");
    $("#paused").attr("src", state.pause ? "/images/paused.png" : "/images/playing.png");
    $("#searchinput").css("width", parseInt($("#playlist").css("width")) - 150);
    $("#songtitle").text(currentlyPlaying + " (" + state.duration.toMMSS() + ")");
    $("#searchinput").val(currentlyPlaying); 
    $("#playlist>option:eq(" + songLog[songLog.length - 1] + ")").prop("selected", true);
    $("#connections").text(" (" + state.totalListeners + "/" + state.currentListeners + "/" + songLog.length + ")");

    if (itsTheBB) {
        $("body").css("text-align","left");
        $("#songtitle").css("width","45%");
        $("#shuffleenabled").css("margin-left", "-190px");
        $("#mutedialog").css("left","5%");
        $("#mutedialog").css("top","35%");
        $("#popupdialog").css("top","30%");
        $("#popupdialog").css("left","0px");
        $("#popupdialog").css("width","40%");
    }
  
    if (state.hasOwnProperty('volume'))
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire

    if (state.hasOwnProperty('popupdialog')) {
        log(TEXT, "updateUI(" + _logMsg + ") removing popupdialog from state");

        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").text(state.popupdialog);
        $("#popupdialog").delay(5000).hide(0);  
        
      //  delete state.popupdialog;
    } 
} // function updateUI(_logMsg) {
